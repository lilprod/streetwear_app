import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type OrderActorType } from '@prisma/client';
import {
  allowedTransitions,
  canTransition,
  computeCartTotals,
  computeDepositXof,
  computeUnitPriceXof,
  getTransition,
  unmetPreconditions,
  type Cart,
  type CreateOrderInput,
  type DesignSpec,
  type Order,
  type OrderActor,
  type OrderStatus,
  type OrderSummary,
  type Page,
  type Precondition,
  type PreconditionFacts,
  type ReceptionInput,
  type ReceptionType,
} from '@streetwear/shared';
import { ApiException, notFound } from '../../common/api-exception';
import {
  EVENTS,
  type DesignOrderedEvent,
  type OrderCreatedEvent,
  type OrderExpiredEvent,
  type OrderStatusChangedEvent,
  type PendingEvent,
} from '../../common/events';
import { uuidv7 } from '../../common/uuid';
import { CatalogService } from '../../catalog/catalog.service';
import { PricingRulesService } from '../../catalog/pricing-rules.service';
import { DesignsService } from '../../designs/designs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService, emptyCart } from '../cart/cart.service';
import { DeliveryService, type Reservation } from '../delivery/delivery.service';
import { ZonesService } from '../delivery/zones.service';
import { SettingsService } from '../settings/settings.service';
import { StockService, outOfStock, stockKey } from '../stock/stock.service';
import {
  ORDER_INCLUDE,
  decodeCursor,
  encodeCursor,
  toOrder,
  toSummary,
  type OrderWithRelations,
} from './order-mapper';

type Tx = Prisma.TransactionClient;

/** Acteur d'une transition ; `id` = admin ou client à l'origine, tracé dans l'historique. */
export type TransitionActor = OrderActor & { id?: string };
export type PreconditionCheck = (orderId: string, tx: Tx) => Promise<boolean>;
export interface TransitionOptions {
  /** Faits établis par l'appelant (ex. code de remise vérifié par SP06). */
  facts?: PreconditionFacts;
}
export type PaymentResult =
  | { succeeded: true; kind: 'full' | 'deposit'; note?: string }
  | { succeeded: false; note?: string };

export const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 };

/** Statuts atteints après un paiement confirmé (reçu disponible). */
const PAID_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'paid',
  'deposit_paid',
  'in_production',
  'ready',
  'shipped',
  'ready_for_pickup',
  'delivered',
  'delivery_failed',
  'returned',
]);

export const invalidTransition = (
  from: OrderStatus,
  to: OrderStatus,
  unmet?: Precondition[],
): ApiException =>
  new ApiException(
    409,
    'INVALID_TRANSITION',
    unmet?.length
      ? 'Ce changement de statut n’est pas encore possible : des conditions manquent.'
      : 'Ce changement de statut n’est pas autorisé.',
    { from, to, ...(unmet?.length ? { unmet } : {}) },
  );

const idempotencyConflict = (): ApiException =>
  new ApiException(
    409,
    'IDEMPOTENCY_CONFLICT',
    'Cette clé d’idempotence a déjà été utilisée avec une requête différente.',
  );

const layersOf = (spec: DesignSpec) =>
  [spec.zones.front, spec.zones.back].flatMap((z) => z?.layers ?? []);

@Injectable()
export class OrdersService {
  private readonly checks = new Map<Precondition, PreconditionCheck>();
  private readonly deferred = new WeakMap<object, PendingEvent[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly designs: DesignsService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingRulesService,
    private readonly stock: StockService,
    private readonly delivery: DeliveryService,
    private readonly zones: ZonesService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
  ) {
    this.checks.set('requiresPrintFiles', (id, tx) => this.printFilesReady(id, tx));
    this.checks.set('requiresCourier', async (id, tx) => {
      const d = await tx.delivery.findUnique({
        where: { orderId: id },
        select: { courierId: true },
      });
      return !!d?.courierId;
    });
  }

  /** SP08 enregistre `requiresOperator` (et peut affiner `requiresPrintFiles`). Absent = non satisfait. */
  registerPreconditionCheck(precondition: Precondition, check: PreconditionCheck): void {
    this.checks.set(precondition, check);
  }

  /** Transaction dont les événements de commande ne sont émis qu'après validation (à utiliser par SP05). */
  async runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const events: PendingEvent[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      this.deferred.set(tx, events);
      return fn(tx);
    }, TX_OPTIONS);
    this.emit(events);
    return result;
  }

  private emit(events: readonly PendingEvent[]): void {
    for (const e of events) this.events.emit(e.name, e.payload);
  }

  // ---- Machine à états ----

  /**
   * Unique point de changement de statut : `canTransition` (rôle, type de réception), préconditions,
   * effets (stock, livraison), historique, événement `order.status_changed`.
   * Avec un `tx` externe hors `runInTransaction`, les événements sont émis avant la validation :
   * les consommateurs relisent la commande.
   */
  async transition(
    orderId: string,
    to: OrderStatus,
    actor: TransitionActor,
    note?: string,
    tx?: Tx,
    opts: TransitionOptions = {},
  ): Promise<OrderStatus> {
    if (!tx)
      return this.runInTransaction((t) => this.transition(orderId, to, actor, note, t, opts));
    const sink = this.deferred.get(tx);
    const events = sink ?? [];
    const status = await this.doTransition(orderId, to, actor, note, tx, opts, events);
    if (!sink) this.emit(events);
    return status;
  }

  private async doTransition(
    orderId: string,
    to: OrderStatus,
    actor: TransitionActor,
    note: string | undefined,
    tx: Tx,
    opts: TransitionOptions,
    events: PendingEvent[],
  ): Promise<OrderStatus> {
    const [row] = await tx.$queryRaw<
      { status: OrderStatus; reception_type: ReceptionType; user_id: string; number: string }[]
    >`SELECT status::text AS status, reception_type::text AS reception_type,
             user_id::text AS user_id, number
      FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!row) throw notFound('Commande');
    const from = row.status;
    if (!canTransition(from, to, actor, { receptionType: row.reception_type })) {
      throw invalidTransition(from, to);
    }
    const facts: PreconditionFacts = {};
    for (const p of getTransition(from, to)?.preconditions ?? []) {
      const given = opts.facts?.[p];
      const check = this.checks.get(p);
      facts[p] = given ?? (check ? await check(orderId, tx) : false);
    }
    const unmet = unmetPreconditions(from, to, facts);
    if (unmet.length > 0) throw invalidTransition(from, to, unmet);

    const adminId = actor.type === 'admin' ? actor.id : undefined;
    if (to === 'paid' || to === 'deposit_paid') {
      await this.stock.commitOrder(orderId, tx, events);
      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { id: true, designId: true },
      });
      for (const i of items) {
        const payload: DesignOrderedEvent = { orderId, orderItemId: i.id, designId: i.designId };
        events.push({ name: EVENTS.designOrdered, payload });
      }
    } else if (to === 'expired') {
      await this.stock.releaseOrder(orderId, tx, events);
      await this.delivery.release(orderId, tx);
    } else if (to === 'cancelled') {
      if (from === 'pending_payment') await this.stock.releaseOrder(orderId, tx, events);
      else await this.stock.restockOrder(orderId, tx, events, adminId);
      await this.delivery.release(orderId, tx);
    }

    const data: Prisma.OrderUpdateInput = { status: to };
    if (to === 'pending_payment') {
      const minutes = await this.settings.get('order_expiry_minutes');
      data.expiresAt = new Date(Date.now() + minutes * 60_000);
    } else if (from === 'pending_payment' && to !== 'expired') {
      data.expiresAt = null;
    }
    await tx.order.update({ where: { id: orderId }, data });
    await tx.orderStatusHistory.create({
      data: {
        id: uuidv7(),
        orderId,
        fromStatus: from,
        toStatus: to,
        actorType: actor.type as OrderActorType,
        actorId: actor.id ?? null,
        note: note ?? null,
      },
    });
    const changed: OrderStatusChangedEvent = {
      orderId,
      userId: row.user_id,
      number: row.number,
      from,
      to,
      actorType: actor.type,
      actorId: actor.id ?? null,
    };
    events.push({ name: EVENTS.orderStatusChanged, payload: changed });
    if (to === 'expired') {
      const expired: OrderExpiredEvent = { orderId, userId: row.user_id, number: row.number };
      events.push({ name: EVENTS.orderExpired, payload: expired });
    }
    return to;
  }

  private async printFilesReady(orderId: string, tx: Tx): Promise<boolean> {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    return items.every((i) => {
      const spec = i.designSnapshot as unknown as DesignSpec;
      const needFront = (spec.zones.front?.layers.length ?? 0) > 0;
      const needBack = (spec.zones.back?.layers.length ?? 0) > 0;
      return (!needFront || !!i.printFileFrontUrl) && (!needBack || !!i.printFileBackUrl);
    });
  }

  // ---- Paiement (appelé par SP05 dans sa transaction) ----

  /** Montant attendu pour la commande : acompte si paiement à la livraison, sinon total. */
  async paymentDue(
    orderId: string,
    db: Tx | PrismaService = this.prisma,
  ): Promise<{ kind: 'full' | 'deposit'; amountXof: number; status: OrderStatus }> {
    const o = await db.order.findUnique({ where: { id: orderId } });
    if (!o) throw notFound('Commande');
    return o.paymentMethod === 'cod'
      ? { kind: 'deposit', amountXof: o.depositXof ?? 0, status: o.status }
      : { kind: 'full', amountXof: o.totalXof, status: o.status };
  }

  /**
   * Résultat de paiement confirmé par webhook : succès → `paid` (ou `deposit_paid`) + stock
   * réservé → sorti ; échec → `payment_failed`. Même transaction que la mise à jour du paiement.
   */
  async applyPaymentResult(orderId: string, result: PaymentResult, tx: Tx): Promise<OrderStatus> {
    const provider: TransitionActor = { type: 'provider' };
    if (!result.succeeded) {
      return this.transition(orderId, 'payment_failed', provider, result.note, tx);
    }
    const due = await this.paymentDue(orderId, tx);
    const to: OrderStatus = result.kind === 'deposit' ? 'deposit_paid' : 'paid';
    if (due.kind !== result.kind) throw invalidTransition(due.status, to);
    return this.transition(orderId, to, provider, result.note, tx);
  }

  // ---- Expiration (file orders-expire) ----

  /** Expire les commandes non payées échues à `now` ; renvoie le nombre expiré. */
  async expireDue(now: Date = new Date(), limit = 200): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: { status: 'pending_payment', expiresAt: { lte: now } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    let expired = 0;
    for (const { id } of due) {
      try {
        await this.transition(id, 'expired', { type: 'system' }, 'Délai de paiement dépassé');
        expired++;
      } catch (e) {
        if (!(e instanceof ApiException && e.getStatus() === 409)) throw e;
      }
    }
    return expired;
  }

  // ---- Création ----

  async create(
    userId: string,
    input: CreateOrderInput,
    idempotencyKey: string,
    now: Date = new Date(),
  ): Promise<Order> {
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const replay = async (): Promise<Order | null> => {
      const found = await this.prisma.order.findUnique({ where: { idempotencyKey } });
      if (!found) return null;
      if (found.userId !== userId || found.idempotencyHash !== hash) throw idempotencyConflict();
      return this.get(userId, found.id);
    };
    const existing = await replay();
    if (existing) return existing;

    const enabled = await this.settings.get('payment_methods_enabled');
    if (!enabled.includes(input.paymentMethod)) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Ce moyen de paiement n’est pas disponible pour le moment.',
        { fieldErrors: { paymentMethod: ['Moyen de paiement indisponible.'] } },
      );
    }
    const rows = await this.cart.lines(userId);
    if (rows.length === 0) throw emptyCart();
    const specs: DesignSpec[] = [];
    for (const r of rows)
      specs.push(await this.designs.checkSpec(r.design.spec as unknown as DesignSpec));
    const patternIds = [
      ...new Set(
        specs.flatMap((s) =>
          layersOf(s).flatMap((l) => (l.type === 'pattern' ? [l.patternId] : [])),
        ),
      ),
    ];
    const [patterns, rules] = await Promise.all([
      this.catalog.getPatternsByIds(patternIds),
      this.pricing.current(),
    ]);
    const lines = rows.map((r, i) => {
      const spec = specs[i] as DesignSpec;
      return {
        row: r,
        spec,
        colorId: spec.colorId,
        unitPriceXof: computeUnitPriceXof(spec, rules, patterns),
      };
    });

    const quote = await this.delivery.quote(input.reception, userId, now);
    const [percent, expiryMinutes, receptionSnapshot] = await Promise.all([
      this.settings.get('cod_deposit_percent'),
      this.settings.get('order_expiry_minutes'),
      this.receptionSnapshot(input.reception, userId),
    ]);
    const amounts = (feeXof: number) => {
      const totals = computeCartTotals(
        lines.map((l) => ({ unitPriceXof: l.unitPriceXof, quantity: l.row.quantity })),
        feeXof,
      );
      const depositXof =
        input.paymentMethod === 'cod'
          ? percent > 0
            ? computeDepositXof(totals.totalXof, percent)
            : 0
          : null;
      return { totals, depositXof };
    };
    let { totals, depositXof } = amounts(quote.deliveryFeeXof);
    const codBalance = () =>
      depositXof !== null && input.reception.type === 'home' ? totals.totalXof - depositXof : null;

    const orderId = uuidv7();
    const events: PendingEvent[] = [];
    let reservation: Reservation;
    let number: string;
    try {
      ({ reservation, number } = await this.prisma.$transaction(async (tx) => {
        const [seq] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
        const num = `TG-${String(seq?.n ?? 0).padStart(6, '0')}`;
        await tx.order.create({
          data: {
            id: orderId,
            number: num,
            userId,
            status: 'pending_payment',
            subtotalXof: totals.subtotalXof,
            deliveryFeeXof: totals.deliveryFeeXof,
            totalXof: totals.totalXof,
            vatIncludedXof: totals.vatIncludedXof,
            paymentMethod: input.paymentMethod,
            depositXof,
            receptionType: input.reception.type,
            receptionSnapshot: receptionSnapshot as Prisma.InputJsonValue,
            expiresAt: new Date(now.getTime() + expiryMinutes * 60_000),
            idempotencyKey,
            idempotencyHash: hash,
            createdAt: now,
            items: {
              create: lines.map((l) => ({
                id: uuidv7(),
                designId: l.row.designId,
                designSnapshot: l.spec as unknown as Prisma.InputJsonValue,
                previewFrontUrl: l.row.design.previewFrontUrl,
                previewBackUrl: l.row.design.previewBackUrl,
                colorId: l.colorId,
                size: l.row.size,
                quantity: l.row.quantity,
                unitPriceXof: l.unitPriceXof,
              })),
            },
            history: {
              create: {
                id: uuidv7(),
                toStatus: 'pending_payment',
                actorType: 'customer',
                actorId: userId,
                createdAt: now,
              },
            },
          },
        });
        const res = await this.delivery.reserve(
          input.reception,
          { orderId, userId, codBalanceXof: codBalance(), now },
          tx,
        );
        if (res.type === 'home' && res.feeXof !== totals.deliveryFeeXof) {
          ({ totals, depositXof } = amounts(res.feeXof));
          await tx.order.update({
            where: { id: orderId },
            data: {
              deliveryFeeXof: totals.deliveryFeeXof,
              totalXof: totals.totalXof,
              vatIncludedXof: totals.vatIncludedXof,
              depositXof,
            },
          });
          await tx.delivery.update({
            where: { id: res.deliveryId },
            data: { codBalanceXof: codBalance() },
          });
        }
        const shortages = await this.stock.reserve(
          orderId,
          lines.map((l) => ({ colorId: l.colorId, size: l.row.size, quantity: l.row.quantity })),
          tx,
          events,
        );
        if (shortages.length > 0) {
          const short = new Map(shortages.map((s) => [stockKey(s.colorId, s.size), s]));
          throw outOfStock(
            lines.flatMap((l) => {
              const s = short.get(stockKey(l.colorId, l.row.size));
              return s
                ? [
                    {
                      cartItemId: l.row.id,
                      designId: l.row.designId,
                      colorId: l.colorId,
                      size: l.row.size,
                      requested: s.requested,
                      available: s.available,
                    },
                  ]
                : [];
            }),
          );
        }
        await tx.cartItem.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
        return { reservation: res, number: num };
      }, TX_OPTIONS));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const raced = await replay();
        if (raced) return raced;
      }
      throw e;
    }

    const created: OrderCreatedEvent = {
      orderId,
      userId,
      number,
      totalXof: totals.totalXof,
      receptionType: input.reception.type,
      ...(reservation.type === 'home'
        ? { handoverCode: reservation.handoverCode }
        : { pickupCode: reservation.pickupCode }),
    };
    this.emit([{ name: EVENTS.orderCreated, payload: created }, ...events]);
    return this.get(userId, orderId);
  }

  private async receptionSnapshot(reception: ReceptionInput, userId: string): Promise<object> {
    if (reception.type === 'home') {
      const a = await this.prisma.address.findFirst({ where: { id: reception.addressId, userId } });
      if (!a) throw notFound('Adresse');
      return {
        type: 'home',
        address: {
          id: a.id,
          label: a.label,
          lat: a.lat,
          lng: a.lng,
          district: a.district,
          landmark: a.landmark,
          recipientPhone: a.recipientPhone,
          zone: await this.zones.resolve(a.lat, a.lng),
        },
      };
    }
    const slot = await this.prisma.pickupSlot.findFirst({
      where: { id: reception.slotId, storeId: reception.storeId },
      include: { store: true },
    });
    if (!slot) throw notFound('Créneau');
    const s = slot.store;
    return {
      type: 'pickup',
      store: {
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        openingHours: s.openingHours,
      },
      slot: {
        id: slot.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        remaining: Math.max(slot.capacity - slot.booked, 0),
      },
    };
  }

  // ---- Lecture client ----

  private async load(where: Prisma.OrderWhereInput): Promise<OrderWithRelations> {
    const row = await this.prisma.order.findFirst({ where, include: ORDER_INCLUDE });
    if (!row) throw notFound('Commande');
    return row;
  }

  async get(userId: string, id: string): Promise<Order> {
    return toOrder(await this.load({ id, userId }));
  }

  async list(
    userId: string,
    query: { cursor?: string; limit: number },
  ): Promise<Page<OrderSummary>> {
    return this.page({ userId }, query, (rows) => rows.map(toSummary));
  }

  private async page<T>(
    where: Prisma.OrderWhereInput,
    query: { cursor?: string; limit: number },
    map: (
      rows: Prisma.OrderGetPayload<{
        include: {
          items: { select: { quantity: true } };
          user: { select: { id: true; name: true; phone: true } };
        };
      }>[],
    ) => T[],
  ): Promise<Page<T>> {
    const and: Prisma.OrderWhereInput[] = [where];
    if (query.cursor) {
      const c = decodeCursor(query.cursor);
      if (!c) throw new ApiException(400, 'VALIDATION_FAILED', 'Curseur de pagination invalide.');
      const [at, id] = c;
      and.push({ OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: id } }] });
    }
    const rows = await this.prisma.order.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        items: { select: { quantity: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: map(pageRows),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /** Commande payée (ou au-delà) du client, pour le reçu ; sinon 404. */
  async forReceipt(userId: string, id: string) {
    const row = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { ...ORDER_INCLUDE, user: true },
    });
    if (!row) throw notFound('Commande');
    const everPaid = row.history.some(
      (h) => h.toStatus === 'paid' || h.toStatus === 'deposit_paid',
    );
    if (!PAID_STATUSES.has(row.status) && !everPaid) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'Le reçu est disponible une fois la commande payée.',
      );
    }
    return row;
  }

  /** « Recommander » : remet les lignes au panier, aux prix actuels ; design modifié depuis → copie figée. */
  async reorder(userId: string, id: string): Promise<Cart> {
    const order = await this.load({ id, userId });
    const lines: { designId: string; size: string; quantity: number }[] = [];
    for (const item of order.items) {
      const current = item.designId
        ? await this.prisma.design.findFirst({ where: { id: item.designId, userId } })
        : null;
      let designId = current?.id;
      if (!current || JSON.stringify(current.spec) !== JSON.stringify(item.designSnapshot)) {
        const spec = item.designSnapshot as unknown as DesignSpec;
        const copy = await this.prisma.design.create({
          data: {
            userId,
            spec: spec as unknown as Prisma.InputJsonValue,
            specVersion: spec.version,
            name: `Commande ${order.number}`,
            previewFrontUrl: item.previewFrontUrl,
            previewBackUrl: item.previewBackUrl,
            isDraft: false,
          },
        });
        designId = copy.id;
      }
      lines.push({ designId: designId as string, size: item.size, quantity: item.quantity });
    }
    await this.cart.addLines(userId, lines, true);
    return this.cart.get(userId);
  }

  // ---- Back-office ----

  async adminList(query: {
    status?: OrderStatus;
    receptionType?: ReceptionType;
    paymentMethod?: CreateOrderInput['paymentMethod'];
    from?: string;
    to?: string;
    q?: string;
    cursor?: string;
    limit: number;
  }) {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.receptionType) where.receptionType = query.receptionType;
    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    const term = query.q?.trim();
    if (term) {
      const digits = term.replace(/\D/g, '');
      where.OR = [
        { number: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        ...(digits.length >= 4 ? [{ user: { phone: { contains: digits } } }] : []),
      ];
    }
    return this.page(where, query, (rows) =>
      rows.map((o) => ({
        ...toSummary(o),
        receptionType: o.receptionType,
        customer: { id: o.user.id, name: o.user.name, phone: o.user.phone },
      })),
    );
  }

  async adminGet(id: string, actor: TransitionActor) {
    const row = await this.prisma.order.findFirst({
      where: { id },
      include: { ...ORDER_INCLUDE, user: { select: { id: true, name: true, phone: true } } },
    });
    if (!row) throw notFound('Commande');
    return {
      ...toOrder(row),
      receptionType: row.receptionType,
      vatIncludedXof: row.vatIncludedXof,
      customer: row.user,
      statusHistory: row.history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        actorType: h.actorType,
        actorId: h.actorId,
        note: h.note,
        at: h.createdAt.toISOString(),
      })),
      allowedTransitions: allowedTransitions(row.status, actor, {
        receptionType: row.receptionType,
      }),
    };
  }

  /** Vue livreur (SP06). */
  async courierView(orderId: string) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { quantity: true } },
        user: { select: { name: true, phone: true } },
      },
    });
    if (!o) throw notFound('Commande');
    const snapshot = o.receptionSnapshot as { address?: { recipientPhone?: string } };
    return {
      orderNumber: o.number,
      customerName: o.user.name ?? 'Client',
      customerPhone: snapshot.address?.recipientPhone ?? o.user.phone ?? '',
      itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
    };
  }
}
