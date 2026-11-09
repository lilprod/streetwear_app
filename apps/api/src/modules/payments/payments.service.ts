import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type Payment as PaymentRow } from '@prisma/client';
import type {
  AdminPayment,
  AdminPaymentsQuery,
  CreatePaymentInput,
  NextAction,
  OrderStatus,
  Page,
  Payment,
  PaymentStatusResponse,
} from '@streetwear/shared';
import { ApiException, notFound } from '../../common/api-exception';
import { sha256 } from '../../common/crypto';
import {
  PAYMENT_EVENTS,
  type PaymentAmountMismatchEvent,
  type PaymentUnexpectedSuccessEvent,
  type PendingEvent,
} from '../../common/events';
import { maskTgPhone } from '../../common/redact';
import { uuidv7 } from '../../common/uuid';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../orders/order-mapper';
import { OrdersService } from '../orders/orders.service';
import {
  MalformedWebhookError,
  PAYMENT_PROVIDERS,
  type ParsedWebhook,
  type PaymentProvider,
  type PaymentProviders,
  type ProviderPaymentStatus,
  type WebhookHeaders,
} from './providers/payment-provider';

type Tx = Prisma.TransactionClient;

/** Interrogation de l'agrégateur si le paiement est toujours en attente après ce délai (webhook perdu). */
export const POLL_AFTER_MS = 60_000;
/** Intervalle minimal entre deux interrogations d'un même paiement. */
export const POLL_EVERY_MS = 15_000;
/** Un paiement en attente plus récent bloque un nouvel essai (évite le double débit). */
export const PENDING_LOCK_MS = 120_000;
const REPLAY_WAIT_MS = 10_000;

export type Outcome =
  | 'processed'
  | 'duplicate'
  | 'amount_mismatch'
  | 'unexpected_success'
  | 'unknown_payment'
  | 'ignored';

export interface ProviderOutcome {
  providerRef: string;
  paymentId?: string;
  status: ProviderPaymentStatus;
  amountXof: number;
}

const notPayable = (reason: string, details: Record<string, unknown> = {}) =>
  new ApiException(
    409,
    'ORDER_NOT_PAYABLE',
    reason === 'payment_pending'
      ? 'Un paiement est déjà en cours pour cette commande : valide-le sur ton téléphone ou patiente un instant.'
      : 'Cette commande ne peut plus être payée (expirée, déjà payée ou annulée).',
    { reason, ...details },
  );

const providerUnavailable = () =>
  new ApiException(
    502,
    'PROVIDER_UNAVAILABLE',
    'Le service de paiement est momentanément indisponible. Réessaie dans quelques instants.',
  );

const idempotencyConflict = () =>
  new ApiException(
    409,
    'IDEMPOTENCY_CONFLICT',
    'Cette clé d’idempotence a déjà été utilisée avec une requête différente.',
  );

const invalidMethod = (message: string) =>
  new ApiException(400, 'VALIDATION_FAILED', message, { fieldErrors: { method: [message] } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Postgres refuse `\u0000` dans text et jsonb. */
function storableText(body: Buffer): string {
  const text = body.toString('utf8');
  return text.includes('\u0000') ? `base64:${body.toString('base64')}` : text;
}

function storableJson(body: Buffer): Prisma.InputJsonValue | undefined {
  try {
    const v: unknown = JSON.parse(body.toString('utf8'));
    if (v === null || JSON.stringify(v).includes('\\u0000')) return undefined;
    return v as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProviders,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---- POST /orders/:id/payments ----

  async create(
    userId: string,
    orderId: string,
    input: CreatePaymentInput,
    idempotencyKey: string,
  ): Promise<Payment> {
    const payerPhone = input.method === 'card' ? null : (input.payerPhone ?? null);
    const hash = sha256(JSON.stringify({ orderId, method: input.method, payerPhone }));
    const replayed = await this.replay(userId, idempotencyKey, hash);
    if (replayed) return replayed;

    const owned = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
    if (!owned) throw notFound('Commande');
    const stale = await this.prisma.payment.findMany({
      where: {
        orderId,
        status: 'pending',
        createdAt: { lte: new Date(Date.now() - POLL_AFTER_MS) },
      },
      select: { id: true },
    });
    for (const s of stale) await this.refreshQuietly(s.id);

    const provider = this.providers.active;
    let payment: PaymentRow;
    try {
      const res = await this.orders.runInTransaction(async (tx) => {
        const now = new Date();
        const [order] = await tx.$queryRaw<
          { status: OrderStatus; expires_at: Date | null; payment_method: string; number: string }[]
        >`SELECT status::text AS status, expires_at, payment_method::text AS payment_method, number
          FROM orders WHERE id = ${orderId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
        if (!order) throw notFound('Commande');
        const dup = await tx.payment.findUnique({ where: { idempotencyKey } });
        if (dup) return { dup: true as const };

        const open = order.status === 'pending_payment' || order.status === 'payment_failed';
        if (!open || (order.expires_at && order.expires_at <= now)) {
          throw notPayable('not_payable', { status: order.status });
        }
        if (order.payment_method === 'cod') {
          if (input.method === 'card') {
            throw invalidMethod(
              'L’acompte du paiement à la livraison se règle en T-Money ou Flooz.',
            );
          }
        } else if (order.payment_method !== input.method) {
          throw invalidMethod('Le moyen de paiement ne correspond pas à celui de la commande.');
        }
        const pending = await tx.payment.findMany({ where: { orderId, status: 'pending' } });
        for (const p of pending) {
          if (now.getTime() - p.createdAt.getTime() < PENDING_LOCK_MS) {
            throw notPayable('payment_pending', { paymentId: p.id });
          }
          await tx.payment.update({
            where: { id: p.id },
            data: { status: 'expired', failureReason: 'superseded' },
          });
        }
        if (order.status === 'payment_failed') {
          await this.orders.transition(
            orderId,
            'pending_payment',
            { type: 'customer', id: userId },
            'Nouvel essai de paiement',
            tx,
          );
        }
        const due = await this.orders.paymentDue(orderId, tx);
        if (due.amountXof <= 0) throw notPayable('nothing_due');
        const row = await tx.payment.create({
          data: {
            id: uuidv7(),
            orderId,
            provider: provider.name,
            method: input.method,
            kind: due.kind,
            amountXof: due.amountXof,
            idempotencyKey,
            idempotencyHash: hash,
            payerPhone,
          },
        });
        return { dup: false as const, row, number: order.number };
      });
      if (res.dup) return (await this.replay(userId, idempotencyKey, hash)) as Payment;
      payment = res.row;

      try {
        const r = await provider.initiate({
          payment: { id: payment.id, amountXof: payment.amountXof, kind: payment.kind },
          order: { id: orderId, number: res.number },
          method: input.method,
          payerPhone,
          returnUrl: this.env.PAYMENT_RETURN_URL,
        });
        payment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: { providerRef: r.providerRef, nextAction: r.nextAction },
        });
      } catch {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'failed', failureReason: 'provider_unavailable' },
        });
        this.logger.error(`Initiation refusée par ${provider.name} (paiement ${payment.id})`);
        throw providerUnavailable();
      }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.replay(userId, idempotencyKey, hash);
        if (again) return again;
      }
      throw e;
    }
    this.logger.log(
      `Paiement ${payment.id} initié (${provider.name}, ${payment.method}, ${payment.kind}, ${maskTgPhone(payerPhone) ?? 'carte'})`,
    );
    return this.toResponse(payment);
  }

  private toResponse(p: PaymentRow): Payment {
    return {
      paymentId: p.id,
      status: 'pending',
      amountXof: p.amountXof,
      kind: p.kind,
      nextAction: p.nextAction as unknown as NextAction,
    };
  }

  /** Même clé + même corps = même réponse ; attend la fin d'une initiation concurrente. */
  private async replay(userId: string, key: string, hash: string): Promise<Payment | null> {
    const end = Date.now() + REPLAY_WAIT_MS;
    for (;;) {
      const p = await this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
      if (!p) return null;
      const owner = await this.prisma.order.findUnique({
        where: { id: p.orderId },
        select: { userId: true },
      });
      if (owner?.userId !== userId || p.idempotencyHash !== hash) throw idempotencyConflict();
      if (p.nextAction) return this.toResponse(p);
      if (p.status === 'failed' || Date.now() > end) throw providerUnavailable();
      await sleep(100);
    }
  }

  // ---- GET /payments/:id ----

  async status(
    userId: string,
    paymentId: string,
    now = new Date(),
  ): Promise<PaymentStatusResponse> {
    let p = await this.ownedPayment(userId, paymentId);
    const age = now.getTime() - p.createdAt.getTime();
    const lastCheck = p.lastCheckedAt ? now.getTime() - p.lastCheckedAt.getTime() : Infinity;
    if (p.status === 'pending' && age >= POLL_AFTER_MS && lastCheck >= POLL_EVERY_MS) {
      await this.refreshQuietly(p.id);
      p = await this.ownedPayment(userId, paymentId);
    }
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: p.orderId },
      select: { status: true },
    });
    return { paymentId: p.id, status: p.status, orderStatus: order.status };
  }

  private async ownedPayment(userId: string, paymentId: string): Promise<PaymentRow> {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    const owner = p
      ? await this.prisma.order.findUnique({ where: { id: p.orderId }, select: { userId: true } })
      : null;
    if (!p || owner?.userId !== userId) throw notFound('Paiement');
    return p;
  }

  /** Filet de sécurité (webhook perdu) : statut demandé à l'agrégateur. */
  async refresh(paymentId: string): Promise<Outcome | null> {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!p?.providerRef) return null;
    const provider = this.providers.get(p.provider);
    if (!provider) return null;
    await this.prisma.payment.update({ where: { id: p.id }, data: { lastCheckedAt: new Date() } });
    const s = await provider.getStatus(p.providerRef);
    if (s.status === 'pending') return null;
    return this.applyOutcome(provider.name, { ...s, paymentId: p.id }, 'interrogation');
  }

  private async refreshQuietly(paymentId: string): Promise<void> {
    try {
      await this.refresh(paymentId);
    } catch {
      this.logger.warn(`Interrogation de l'agrégateur en échec (paiement ${paymentId})`);
    }
  }

  // ---- POST /webhooks/payments/:provider ----

  async handleWebhook(providerName: string, headers: WebhookHeaders, body: unknown): Promise<void> {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    const provider = this.providers.get(providerName);
    let valid = false;
    try {
      valid = provider ? provider.verifyWebhook(headers, rawBody) : false;
    } catch {
      valid = false;
    }
    let parsed: ParsedWebhook | null = null;
    let malformed = false;
    try {
      parsed = provider ? provider.parseWebhook(rawBody) : null;
    } catch (e) {
      if (!(e instanceof MalformedWebhookError)) throw e;
      malformed = true;
    }
    const event = await this.prisma.paymentEvent.create({
      data: {
        id: uuidv7(),
        provider: providerName.slice(0, 64),
        providerRef: parsed?.providerRef.slice(0, 255) ?? null,
        rawBody: storableText(rawBody),
        raw: storableJson(rawBody),
        signatureValid: valid,
      },
    });
    const close = (outcome: string, paymentId?: string | null) =>
      this.prisma.paymentEvent.update({
        where: { id: event.id },
        data: { outcome, processedAt: new Date(), paymentId: paymentId ?? null },
      });

    if (!provider) {
      await close('rejected');
      throw notFound('Agrégateur');
    }
    if (!valid) {
      await close('rejected');
      this.logger.warn(
        `Webhook ${providerName} à signature invalide rejeté (événement ${event.id})`,
      );
      throw new ApiException(401, 'UNAUTHENTICATED', 'Signature du webhook invalide.');
    }
    if (!parsed || malformed) {
      await close('malformed');
      this.logger.warn(`Webhook ${providerName} illisible ignoré (événement ${event.id})`);
      return;
    }
    let paymentId: string | null = null;
    const outcome = await this.applyOutcome(provider.name, parsed, 'webhook', (id) => {
      paymentId = id;
    });
    await close(outcome, paymentId);
  }

  // ---- Application d'un résultat (webhook, interrogation, rapprochement) ----

  /**
   * Règle transactionnelle 2 : verrou commande puis paiement ; un paiement déjà traité ne change
   * plus (rejeu sans effet) ; montant dû recalculé (`paymentDue`) ; transition par SP04.
   */
  async applyOutcome(
    providerName: string,
    o: ProviderOutcome,
    source: string,
    onPayment?: (paymentId: string) => void,
  ): Promise<Outcome> {
    const alerts: PendingEvent[] = [];
    const outcome = await this.orders.runInTransaction(async (tx): Promise<Outcome> => {
      const found = await this.findPayment(tx, providerName, o);
      if (!found) return 'unknown_payment';
      onPayment?.(found.id);
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${found.orderId}::uuid FOR UPDATE`;
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM payments WHERE id = ${found.id}::uuid FOR UPDATE`;
      if (!locked || (locked.status !== 'pending' && locked.status !== 'expired')) {
        return 'duplicate';
      }
      if (o.status === 'pending') return 'ignored';
      const p = await tx.payment.findUniqueOrThrow({ where: { id: found.id } });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: p.orderId },
        select: { number: true, status: true },
      });
      const ref = p.providerRef ? {} : { providerRef: o.providerRef };
      const note = `Paiement ${p.id} (${providerName}, ${source})`;

      if (o.status === 'failed') {
        await tx.payment.update({
          where: { id: p.id },
          data: { ...ref, status: 'failed', failureReason: 'declined' },
        });
        if (locked.status === 'pending' && order.status === 'pending_payment') {
          await this.orders.applyPaymentResult(p.orderId, { succeeded: false, note }, tx);
        }
        return 'processed';
      }

      const due = await this.orders.paymentDue(p.orderId, tx);
      if (o.amountXof !== p.amountXof || p.amountXof !== due.amountXof || p.kind !== due.kind) {
        await tx.payment.update({
          where: { id: p.id },
          data: { ...ref, status: 'failed', failureReason: 'amount_mismatch' },
        });
        const payload: PaymentAmountMismatchEvent = {
          paymentId: p.id,
          orderId: p.orderId,
          orderNumber: order.number,
          provider: providerName,
          expectedXof: due.amountXof,
          receivedXof: o.amountXof,
        };
        alerts.push({ name: PAYMENT_EVENTS.amountMismatch, payload });
        return 'amount_mismatch';
      }
      const confirmed = { ...ref, status: 'succeeded' as const, confirmedAt: new Date() };
      if (order.status !== 'pending_payment') {
        await tx.payment.update({
          where: { id: p.id },
          data: { ...confirmed, failureReason: 'order_not_payable' },
        });
        const payload: PaymentUnexpectedSuccessEvent = {
          paymentId: p.id,
          orderId: p.orderId,
          orderNumber: order.number,
          provider: providerName,
          amountXof: p.amountXof,
          orderStatus: order.status,
        };
        alerts.push({ name: PAYMENT_EVENTS.unexpectedSuccess, payload });
        return 'unexpected_success';
      }
      await tx.payment.update({ where: { id: p.id }, data: confirmed });
      await this.orders.applyPaymentResult(
        p.orderId,
        { succeeded: true, kind: due.kind, note },
        tx,
      );
      return 'processed';
    });
    for (const a of alerts) {
      this.logger.warn(`Alerte paiement ${a.name}`);
      this.events.emit(a.name, a.payload);
    }
    return outcome;
  }

  private async findPayment(
    tx: Tx,
    providerName: string,
    o: ProviderOutcome,
  ): Promise<{ id: string; orderId: string } | null> {
    const byRef = await tx.payment.findUnique({
      where: { provider_providerRef: { provider: providerName, providerRef: o.providerRef } },
      select: { id: true, orderId: true },
    });
    if (byRef) return byRef;
    if (!o.paymentId || !/^[0-9a-f-]{36}$/i.test(o.paymentId)) return null;
    const byId = await tx.payment.findUnique({
      where: { id: o.paymentId },
      select: { id: true, orderId: true, provider: true, providerRef: true },
    });
    if (!byId || byId.provider !== providerName || byId.providerRef !== null) return null;
    return byId;
  }

  // ---- Back-office ----

  async adminList(q: AdminPaymentsQuery): Promise<Page<AdminPayment>> {
    const where: Prisma.PaymentWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!c) throw new ApiException(400, 'VALIDATION_FAILED', 'Curseur de pagination invalide.');
      where.OR = [{ createdAt: { lt: c[0] } }, { createdAt: c[0], id: { lt: c[1] } }];
    }
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const orders = await this.prisma.order.findMany({
      where: { id: { in: [...new Set(page.map((p) => p.orderId))] } },
      select: { id: true, number: true },
    });
    const number = new Map(orders.map((o) => [o.id, o.number]));
    const last = page[page.length - 1];
    return {
      items: page.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: number.get(p.orderId) ?? '',
        provider: p.provider,
        method: p.method,
        kind: p.kind,
        amountXof: p.amountXof,
        status: p.status,
        providerRef: p.providerRef,
        payerPhone: maskTgPhone(p.payerPhone),
        failureReason: p.failureReason,
        confirmedAt: p.confirmedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  providerFor(name: string): PaymentProvider | undefined {
    return this.providers.get(name);
  }
}
