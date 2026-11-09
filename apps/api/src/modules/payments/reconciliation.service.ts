import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Payment as PaymentRow, Prisma } from '@prisma/client';
import type { Page, Reconciliation, ReconciliationMismatch } from '@streetwear/shared';
import { ApiException } from '../../common/api-exception';
import { PAYMENT_EVENTS, type ReconciliationMismatchEvent } from '../../common/events';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeCursor, encodeCursor } from '../orders/order-mapper';
import { PaymentsService } from './payments.service';
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  type PaymentProviders,
  type ProviderPaymentStatus,
  type ProviderTransaction,
} from './providers/payment-provider';

const DAY_MS = 86_400_000;
const lomeDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Veille du jour `now` en Africa/Lome (`YYYY-MM-DD`). */
export function previousLomeDay(now: Date = new Date()): string {
  return lomeDay.format(new Date(now.getTime() - DAY_MS));
}

const SAME_STATUS: Record<ProviderPaymentStatus, readonly string[]> = {
  succeeded: ['succeeded', 'refunded'],
  failed: ['failed', 'expired'],
  pending: ['pending', 'expired'],
};

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly events: EventEmitter2,
    @Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProviders,
  ) {}

  /** Compare les transactions de l'agrégateur et nos paiements du jour `date` ; idempotent. */
  async reconcile(date: string): Promise<Reconciliation[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Date YYYY-MM-DD attendue');
    const out: Reconciliation[] = [];
    for (const provider of this.providers.all()) out.push(await this.reconcileOne(provider, date));
    return out;
  }

  private async reconcileOne(provider: PaymentProvider, date: string): Promise<Reconciliation> {
    const start = new Date(`${date}T00:00:00.000Z`);
    const txs = await provider.listTransactions(date);
    const where: Prisma.PaymentWhereInput = {
      provider: provider.name,
      createdAt: { gte: start, lt: new Date(start.getTime() + DAY_MS) },
    };
    const final = new Map(txs.filter((t) => t.status !== 'pending').map((t) => [t.providerRef, t]));
    const open = await this.prisma.payment.findMany({
      where: {
        ...where,
        status: { in: ['pending', 'expired'] },
        providerRef: { in: [...final.keys()] },
      },
      select: { id: true },
    });
    for (const p of open) {
      try {
        await this.payments.refresh(p.id);
      } catch {
        this.logger.warn(`Interrogation en échec pendant le rapprochement (paiement ${p.id})`);
      }
    }
    const rows = await this.prisma.payment.findMany({ where });
    const orders = await this.prisma.order.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.orderId))] } },
      select: { id: true, number: true },
    });
    const numbers = new Map(orders.map((o) => [o.id, o.number]));
    const { matched, mismatches } = compare(txs, rows, numbers);

    const dateValue = new Date(`${date}T00:00:00.000Z`);
    const data = { matched, mismatches: mismatches as unknown as Prisma.InputJsonValue };
    const saved = await this.prisma.reconciliation.upsert({
      where: { date_provider: { date: dateValue, provider: provider.name } },
      create: { id: uuidv7(), date: dateValue, provider: provider.name, ...data },
      update: data,
    });
    if (mismatches.length > 0) {
      const payload: ReconciliationMismatchEvent = {
        reconciliationId: saved.id,
        date,
        provider: provider.name,
        matched,
        mismatchCount: mismatches.length,
      };
      this.logger.warn(`Rapprochement ${provider.name} du ${date} : ${mismatches.length} écart(s)`);
      this.events.emit(PAYMENT_EVENTS.reconciliationMismatch, payload);
    }
    return toReconciliation(saved);
  }

  async list(q: { cursor?: string; limit: number }): Promise<Page<Reconciliation>> {
    let where: Prisma.ReconciliationWhereInput = {};
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (!c) throw new ApiException(400, 'VALIDATION_FAILED', 'Curseur de pagination invalide.');
      where = { OR: [{ date: { lt: c[0] } }, { date: c[0], id: { lt: c[1] } }] };
    }
    const rows = await this.prisma.reconciliation.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(toReconciliation),
      nextCursor: hasMore && last ? encodeCursor(last.date, last.id) : null,
    };
  }
}

function compare(
  txs: ProviderTransaction[],
  rows: PaymentRow[],
  numbers: Map<string, string>,
): { matched: number; mismatches: ReconciliationMismatch[] } {
  const byRef = new Map(rows.flatMap((r) => (r.providerRef ? [[r.providerRef, r] as const] : [])));
  const seen = new Set<string>();
  const mismatches: ReconciliationMismatch[] = [];
  let matched = 0;
  const entry = (
    type: ReconciliationMismatch['type'],
    ref: string,
    t: ProviderTransaction | undefined,
    p: PaymentRow | undefined,
  ): ReconciliationMismatch => ({
    type,
    providerRef: ref,
    paymentId: p?.id ?? null,
    orderNumber: p ? (numbers.get(p.orderId) ?? null) : null,
    providerStatus: t?.status ?? null,
    paymentStatus: p?.status ?? null,
    providerAmountXof: t?.amountXof ?? null,
    paymentAmountXof: p?.amountXof ?? null,
  });
  for (const t of txs) {
    seen.add(t.providerRef);
    const p = byRef.get(t.providerRef);
    if (!p) {
      if (t.status === 'succeeded') mismatches.push(entry('missing_payment', t.providerRef, t, p));
      else matched++;
    } else if (t.amountXof !== p.amountXof) {
      mismatches.push(entry('amount_mismatch', t.providerRef, t, p));
    } else if (!SAME_STATUS[t.status].includes(p.status)) {
      mismatches.push(entry('status_mismatch', t.providerRef, t, p));
    } else {
      matched++;
    }
  }
  for (const p of rows) {
    if (p.providerRef && !seen.has(p.providerRef) && p.status === 'succeeded') {
      mismatches.push(entry('missing_at_provider', p.providerRef, undefined, p));
    }
  }
  return { matched, mismatches };
}

function toReconciliation(r: {
  id: string;
  date: Date;
  provider: string;
  matched: number;
  mismatches: Prisma.JsonValue;
  createdAt: Date;
}): Reconciliation {
  const mismatches = (r.mismatches ?? []) as unknown as ReconciliationMismatch[];
  return {
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    provider: r.provider,
    matched: r.matched,
    mismatchCount: mismatches.length,
    mismatches,
    createdAt: r.createdAt.toISOString(),
  };
}
