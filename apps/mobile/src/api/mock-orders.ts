import {
  AddressInputSchema,
  CreateOrderInputSchema,
  CreatePaymentInputSchema,
  FIXTURE_STORE,
  FIXTURE_ZONES,
  computeCartTotals,
  computeDepositXof,
  uid,
  type Address,
  type Cart,
  type DeliveryZoneSummary,
  type Order,
  type OrderStatus,
  type Payment,
  type PaymentStatusResponse,
  type PickupSlot,
  type Size,
} from '@streetwear/shared';
import { t } from '../i18n/fr';
import { ApiError, type ApiClient } from './types';

export const MOCK_DEPOSIT_PERCENT = 30;
export const MOCK_PAY_DELAY_MS = 3000;
const LOME = { lat: 6.1725, lng: 1.2314 };

/** Zones simulées : anneaux autour du centre de Lomé ; au-delà de 0,2 degré, hors zone. */
export function mockZoneFor(lat: number, lng: number): DeliveryZoneSummary | null {
  const d = Math.max(Math.abs(lat - LOME.lat), Math.abs(lng - LOME.lng));
  if (d < 0.04) return FIXTURE_ZONES[0] ?? null;
  if (d < 0.1) return FIXTURE_ZONES[1] ?? null;
  if (d < 0.2) return FIXTURE_ZONES[2] ?? null;
  return null;
}

export type MockOrdersContext = {
  now: () => Date;
  wait: <T>(value: () => T) => Promise<T>;
  authed: <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => (...a: A) => Promise<R>;
  cart: () => Cart;
  clearCart: () => void;
  addToCart: (line: { designId: string; size: Size; quantity: number }) => void;
  invalid: () => ApiError;
};

export type MockOrdersOptions = {
  payDelayMs?: number;
  /** Créneaux « pris entre-temps » : la liste les montre encore, la commande répond SLOT_FULL. */
  slotRaced?: (slotId: string) => boolean;
};

type StoredPayment = {
  id: string;
  orderId: string;
  createdAt: number;
  kind: 'full' | 'deposit';
  amountXof: number;
  phone: string | null;
  settled: 'succeeded' | 'failed' | null;
};

const SLOT_HOURS = [10, 14, 17];

export type MockOrdersApi = Pick<
  ApiClient,
  | 'deleteMe'
  | 'listAddresses'
  | 'createAddress'
  | 'updateAddress'
  | 'deleteAddress'
  | 'registerPushToken'
  | 'resolveZone'
  | 'listStores'
  | 'listSlots'
  | 'createOrder'
  | 'listOrders'
  | 'getOrder'
  | 'getReceiptPdf'
  | 'reorder'
  | 'createPayment'
  | 'getPayment'
> & { addressById: (id: string) => Address | undefined };

export function createMockOrders(
  ctx: MockOrdersContext,
  options: MockOrdersOptions = {},
): MockOrdersApi {
  const payDelay = options.payDelayMs ?? MOCK_PAY_DELAY_MS;
  const addresses = new Map<string, Address>();
  const orders = new Map<string, { order: Order; designIds: string[] }>();
  const orderKeys = new Map<string, { body: string; orderId: string }>();
  const payments = new Map<string, StoredPayment>();
  const paymentKeys = new Map<string, { body: string; payment: Payment }>();
  const slotRemaining = new Map<string, number>();
  let addressSeq = 0;
  let orderSeq = 0;
  let paymentSeq = 0;

  const slotsFor = (date: string): PickupSlot[] => {
    const day = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
    return SLOT_HOURS.map((h, i) => {
      const id = uid(5000 + (day % 100_000) * 10 + i);
      if (!slotRemaining.has(id)) slotRemaining.set(id, 4 - i);
      const startsAt = new Date(`${date}T${String(h).padStart(2, '0')}:00:00Z`);
      return {
        id,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 3600_000).toISOString(),
        remaining: slotRemaining.get(id) ?? 0,
      };
    });
  };
  const findSlot = (slotId: string): PickupSlot | undefined => {
    for (let i = 0; i < 15; i += 1) {
      const date = new Date(ctx.now().getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const hit = slotsFor(date).find((s) => s.id === slotId);
      if (hit) return hit;
    }
    return undefined;
  };

  const notFound = () => new ApiError('NOT_FOUND', t('api.notFound'), 404);
  const addStatus = (order: Order, status: OrderStatus): Order => ({
    ...order,
    status,
    history: [...order.history, { status, at: ctx.now().toISOString() }],
  });

  const settle = (p: StoredPayment): StoredPayment => {
    if (p.settled) return p;
    const scenario = p.phone?.slice(-2);
    if (scenario === '03') return p;
    if (ctx.now().getTime() - p.createdAt < payDelay) return p;
    p.settled = scenario === '00' ? 'failed' : 'succeeded';
    const entry = orders.get(p.orderId);
    if (entry) {
      entry.order =
        p.settled === 'succeeded'
          ? {
              ...addStatus(entry.order, p.kind === 'deposit' ? 'deposit_paid' : 'paid'),
              expiresAt: null,
            }
          : addStatus(entry.order, 'payment_failed');
    }
    return p;
  };
  const settleAll = (orderId: string) => {
    for (const p of payments.values()) if (p.orderId === orderId) settle(p);
  };

  const ownOrder = (id: string) => {
    const entry = orders.get(id);
    if (!entry) throw notFound();
    return entry;
  };

  return {
    addressById: (id) => addresses.get(id),

    deleteMe: ctx.authed(() => ctx.wait(() => undefined)),
    listAddresses: ctx.authed(() => ctx.wait(() => [...addresses.values()])),
    createAddress: ctx.authed((input) =>
      ctx.wait(() => {
        const parsed = AddressInputSchema.safeParse(input);
        if (!parsed.success) throw ctx.invalid();
        addressSeq += 1;
        const address: Address = {
          ...parsed.data,
          id: uid(6000 + addressSeq),
          zone: mockZoneFor(parsed.data.lat, parsed.data.lng),
        };
        addresses.set(address.id, address);
        return address;
      }),
    ),
    updateAddress: ctx.authed((id, input) =>
      ctx.wait(() => {
        const current = addresses.get(id);
        if (!current) throw notFound();
        const parsed = AddressInputSchema.partial().safeParse(input);
        if (!parsed.success) throw ctx.invalid();
        const next = { ...current, ...parsed.data };
        next.zone = mockZoneFor(next.lat, next.lng);
        addresses.set(id, next);
        return next;
      }),
    ),
    deleteAddress: ctx.authed((id) =>
      ctx.wait(() => {
        if (!addresses.delete(id)) throw notFound();
      }),
    ),
    registerPushToken: ctx.authed(() => ctx.wait(() => undefined)),

    resolveZone: (lat, lng) => ctx.wait(() => mockZoneFor(lat, lng)),
    listStores: () => ctx.wait(() => [FIXTURE_STORE]),
    listSlots: (storeId, date) =>
      ctx.wait(() => {
        if (storeId !== FIXTURE_STORE.id) throw notFound();
        const nowMs = ctx.now().getTime();
        return slotsFor(date).filter(
          (s) => s.remaining > 0 && new Date(s.startsAt).getTime() > nowMs,
        );
      }),

    createOrder: ctx.authed((input, key) =>
      ctx.wait(() => {
        const parsed = CreateOrderInputSchema.safeParse(input);
        if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(key)) throw ctx.invalid();
        const body = JSON.stringify(parsed.data);
        const known = orderKeys.get(key);
        if (known) {
          if (known.body !== body) {
            throw new ApiError('IDEMPOTENCY_CONFLICT', t('api.idempotencyConflict'), 409);
          }
          return ownOrder(known.orderId).order;
        }
        const cart = ctx.cart();
        if (cart.items.length === 0) throw ctx.invalid();
        const unavailable = cart.items.filter((i) => !i.available);
        if (unavailable.length > 0) {
          throw new ApiError('OUT_OF_STOCK', t('api.outOfStock'), 409, {
            items: unavailable.map((i) => ({ itemId: i.id, size: i.size })),
          });
        }
        const { reception, paymentMethod } = parsed.data;
        let orderReception: Order['reception'];
        let fee = 0;
        if (reception.type === 'home') {
          const address = addresses.get(reception.addressId);
          if (!address) throw notFound();
          if (!address.zone) throw new ApiError('OUT_OF_ZONE', t('api.outOfZone'), 422);
          fee = address.zone.feeXof;
          orderReception = { type: 'home', address };
        } else {
          if (paymentMethod === 'cod') throw ctx.invalid();
          const slot = findSlot(reception.slotId);
          if (reception.storeId !== FIXTURE_STORE.id || !slot) throw notFound();
          if (slot.remaining <= 0 || options.slotRaced?.(slot.id)) {
            throw new ApiError('SLOT_FULL', t('api.slotFull'), 409);
          }
          slotRemaining.set(slot.id, slot.remaining - 1);
          orderReception = { type: 'pickup', store: FIXTURE_STORE, slot };
        }
        const totals = computeCartTotals(cart.items, fee);
        orderSeq += 1;
        const at = ctx.now().toISOString();
        const designIds: string[] = [];
        const order: Order = {
          id: uid(7000 + orderSeq),
          number: `TG-${String(100_000 + orderSeq)}`,
          status: 'pending_payment',
          items: cart.items.map((i) => {
            designIds.push(i.design.id);
            return {
              id: i.id,
              design: {
                spec: i.design.spec,
                previewFrontUrl: i.design.previewFrontUrl,
                previewBackUrl: i.design.previewBackUrl,
              },
              colorId: i.design.spec.colorId,
              size: i.size,
              quantity: i.quantity,
              unitPriceXof: i.unitPriceXof,
              lineTotalXof: i.lineTotalXof,
            };
          }),
          subtotalXof: totals.subtotalXof,
          deliveryFeeXof: totals.deliveryFeeXof,
          totalXof: totals.totalXof,
          depositXof:
            paymentMethod === 'cod'
              ? computeDepositXof(totals.totalXof, MOCK_DEPOSIT_PERCENT)
              : null,
          paymentMethod,
          reception: orderReception,
          history: [{ status: 'pending_payment', at }],
          expiresAt: new Date(ctx.now().getTime() + 30 * 60_000).toISOString(),
          estimatedReadyAt: new Date(ctx.now().getTime() + 48 * 3600_000).toISOString(),
          estimatedDeliveryAt:
            orderReception.type === 'home'
              ? new Date(ctx.now().getTime() + 72 * 3600_000).toISOString()
              : null,
          createdAt: at,
        };
        orders.set(order.id, { order, designIds });
        orderKeys.set(key, { body, orderId: order.id });
        ctx.clearCart();
        return order;
      }),
    ),
    listOrders: ctx.authed(() =>
      ctx.wait(() => {
        for (const id of orders.keys()) settleAll(id);
        return {
          items: [...orders.values()]
            .map(({ order: o }) => ({
              id: o.id,
              number: o.number,
              status: o.status,
              totalXof: o.totalXof,
              paymentMethod: o.paymentMethod,
              itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
              createdAt: o.createdAt,
            }))
            .reverse(),
          nextCursor: null,
        };
      }),
    ),
    getOrder: ctx.authed((id) =>
      ctx.wait(() => {
        settleAll(id);
        return ownOrder(id).order;
      }),
    ),
    getReceiptPdf: ctx.authed((id) =>
      ctx.wait(() => {
        settleAll(id);
        const { order } = ownOrder(id);
        if (order.status === 'pending_payment' || order.status === 'payment_failed') {
          throw new ApiError('ORDER_NOT_PAYABLE', t('api.notPayable'), 409);
        }
        return new TextEncoder().encode(`%PDF-1.4 recu ${order.number}`);
      }),
    ),
    reorder: ctx.authed((id) =>
      ctx.wait(() => {
        const entry = ownOrder(id);
        entry.order.items.forEach((item, i) => {
          const designId = entry.designIds[i];
          if (designId) ctx.addToCart({ designId, size: item.size, quantity: item.quantity });
        });
        return ctx.cart();
      }),
    ),

    createPayment: ctx.authed((orderId, input, key) =>
      ctx.wait(() => {
        const parsed = CreatePaymentInputSchema.safeParse(input);
        if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(key)) throw ctx.invalid();
        const body = JSON.stringify(parsed.data);
        const known = paymentKeys.get(key);
        if (known) {
          if (known.body !== body) {
            throw new ApiError('IDEMPOTENCY_CONFLICT', t('api.idempotencyConflict'), 409);
          }
          return known.payment;
        }
        const entry = ownOrder(orderId);
        settleAll(orderId);
        const order = entry.order;
        if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
          throw new ApiError('ORDER_NOT_PAYABLE', t('api.notPayable'), 409, {
            reason: 'not_payable',
            status: order.status,
          });
        }
        const open = [...payments.values()].find(
          (p) => p.orderId === orderId && !p.settled && ctx.now().getTime() - p.createdAt < 120_000,
        );
        if (open) {
          throw new ApiError('ORDER_NOT_PAYABLE', t('api.paymentPending'), 409, {
            reason: 'payment_pending',
            paymentId: open.id,
          });
        }
        const { method } = parsed.data;
        if (order.paymentMethod === 'cod' ? method === 'card' : method !== order.paymentMethod) {
          throw ctx.invalid();
        }
        const kind = order.paymentMethod === 'cod' ? 'deposit' : 'full';
        const amountXof = kind === 'deposit' ? (order.depositXof ?? 0) : order.totalXof;
        paymentSeq += 1;
        const id = uid(8000 + paymentSeq);
        payments.set(id, {
          id,
          orderId,
          createdAt: ctx.now().getTime(),
          kind,
          amountXof,
          phone: parsed.data.payerPhone ?? null,
          settled: null,
        });
        if (order.status === 'payment_failed') entry.order = addStatus(order, 'pending_payment');
        const payment: Payment = {
          paymentId: id,
          status: 'pending',
          amountXof,
          kind,
          nextAction:
            method === 'card'
              ? { type: 'redirect', url: `https://pay.example.test/card/${id}` }
              : { type: 'approve_on_phone', message: t('payment.waiting.title') },
        };
        paymentKeys.set(key, { body, payment });
        return payment;
      }),
    ),
    getPayment: ctx.authed((id) =>
      ctx.wait((): PaymentStatusResponse => {
        const p = payments.get(id);
        if (!p) throw notFound();
        settle(p);
        return {
          paymentId: id,
          status: p.settled ?? 'pending',
          orderStatus: ownOrder(p.orderId).order.status,
        };
      }),
    ),
  };
}
