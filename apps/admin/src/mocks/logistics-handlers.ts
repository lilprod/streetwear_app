import { http, HttpResponse } from 'msw';
import {
  FIXTURE_COLORS,
  FIXTURE_ORDERS,
  FIXTURE_STORE,
  FIXTURE_ZONES,
  SIZES,
  uid,
  type AdminRole,
  type AdminStockItem,
  type CourierDelivery,
  type ErrorCode,
  type Size,
} from '@streetwear/shared';
import { roleFromAuthHeader } from './handlers';
import { patchDemoOrder } from './orders-handlers';
import type {
  AdminCourier,
  AdminDelivery,
  AdminSlot,
  AdminStore,
  AdminZone,
} from '../lib/logistics-api';

/** Modèle interne du mock (forme riche) ; l'API publie `AdminDelivery` via `toAdminDelivery`. */
type MockDelivery = {
  id: string;
  orderId: string;
  status: 'to_assign' | 'assigned' | 'in_progress' | 'delivered' | 'failed';
  zoneId: string;
  feeXof: number;
  courierId: string | null;
  address: CourierDelivery['address'];
  codBalanceXof: number | null;
  codCollectedXof: number | null;
  handoverAttempts: number;
  scheduledFor: string;
  failReason: string | null;
  failNote: string | null;
};

export const DEMO_HANDOVER_CODE = '482913';
export const DEMO_COURIERS: AdminCourier[] = [
  { id: uid(980), name: 'Koffi Livreur', phone: '+22891000000' },
  { id: uid(981), name: 'Ama Livreuse', phone: '+22892000000' },
];
const MAX_ATTEMPTS = 5;

const square = (lng: number, lat: number, d = 0.02): AdminZone['polygon'] => ({
  type: 'Polygon',
  coordinates: [
    [
      [lng, lat],
      [lng + d, lat],
      [lng + d, lat + d],
      [lng, lat + d],
      [lng, lat],
    ],
  ],
});

const zonesInit = (): AdminZone[] =>
  FIXTURE_ZONES.map((z, i) => ({
    ...z,
    polygon: square(1.2 + i * 0.03, 6.12),
    active: true,
  }));

const address = (i: number, withCod: boolean): CourierDelivery['address'] => ({
  id: uid(870 + i),
  label: 'Domicile',
  lat: 6.13 + i / 100,
  lng: 1.21,
  district: ['Tokoin', 'Agoè', 'Adidogomé', 'Baguida'][i % 4] ?? 'Tokoin',
  landmark: withCod ? 'Pharmacie du Marché, portail bleu' : 'Face à l’école, maison blanche',
  recipientPhone: `+2289012${String(3400 + i).slice(-4)}`,
  zone: FIXTURE_ZONES[0] ?? null,
});

const today = () => new Date().toISOString().slice(0, 10);
const orderId = (n: number): string => FIXTURE_ORDERS[n - 1]?.id ?? '';

const deliveriesInit = (): MockDelivery[] => {
  const at = (h: number) => `${today()}T${String(h).padStart(2, '0')}:00:00.000Z`;
  const base = (i: number, n: number, over: Partial<MockDelivery>): MockDelivery => ({
    id: uid(850 + i),
    orderId: orderId(n),
    status: 'to_assign',
    zoneId: FIXTURE_ZONES[i % 3]?.id ?? '',
    feeXof: 1000,
    courierId: null,
    address: address(i, false),
    codBalanceXof: null,
    codCollectedXof: null,
    handoverAttempts: 0,
    scheduledFor: at(9 + i),
    failReason: null,
    failNote: null,
    ...over,
  });
  return [
    base(0, 3, {}),
    base(1, 4, {
      status: 'assigned',
      courierId: DEMO_COURIERS[0]?.id ?? null,
      codBalanceXof: 15000,
      address: address(1, true),
    }),
    base(2, 7, { status: 'in_progress', courierId: DEMO_COURIERS[0]?.id ?? null }),
    base(3, 8, { status: 'delivered', courierId: DEMO_COURIERS[1]?.id ?? null }),
  ];
};

const storesInit = (): AdminStore[] => [{ ...FIXTURE_STORE, defaultSlotCapacity: 5, active: true }];

const slotsInit = (): Record<string, AdminSlot[]> => {
  const slot = (i: number, day: number, h: number, booked: number): AdminSlot => {
    const start = new Date(`${today()}T${String(h).padStart(2, '0')}:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() + day);
    return {
      id: uid(890 + i),
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3600_000).toISOString(),
      capacity: 5,
      booked,
      remaining: 5 - booked,
    };
  };
  return { [FIXTURE_STORE.id]: [slot(0, 1, 10, 2), slot(1, 1, 11, 0), slot(2, 2, 10, 0)] };
};

const stockInit = (): AdminStockItem[] => {
  const items: AdminStockItem[] = [];
  FIXTURE_COLORS.slice(0, 3).forEach((c, ci) => {
    (['S', 'M', 'L'] as Size[]).forEach((size, si) => {
      const onHand = ci === 0 && size === 'M' ? 4 : 20 - ci * 3 + si;
      const reserved = ci === 0 && size === 'M' ? 2 : 1;
      items.push({
        id: uid(900 + ci * 10 + si),
        colorId: c.id,
        colorName: c.name,
        size,
        onHand,
        reserved,
        available: onHand - reserved,
        alertThreshold: 5,
        belowThreshold: onHand - reserved < 5,
      });
    });
  });
  return items;
};

let zones = zonesInit();
let deliveries = deliveriesInit();
let stores = storesInit();
let slots = slotsInit();
let stock = stockInit();
let attempts = new Map<string, number>();

export const resetLogisticsState = (): void => {
  zones = zonesInit();
  deliveries = deliveriesInit();
  stores = storesInit();
  slots = slotsInit();
  stock = stockInit();
  attempts = new Map();
};
const err = (status: number, code: ErrorCode, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
const forbidden = () => err(403, 'FORBIDDEN', 'Votre rôle ne permet pas cette action.');
const unauth = () => err(401, 'UNAUTHENTICATED', 'Session expirée.');
const notFound = () => err(404, 'NOT_FOUND', 'Élément introuvable.');

type Guard = { role: AdminRole } | { deny: Response };
const guard = (request: Request, allowed: AdminRole[]): Guard => {
  const role = roleFromAuthHeader(request.headers.get('Authorization'));
  if (!role) return { deny: unauth() };
  return allowed.includes(role) ? { role } : { deny: forbidden() };
};
const LOGI: AdminRole[] = ['logistics', 'super_admin'];
const PROD: AdminRole[] = ['production', 'super_admin'];

const toAdminDelivery = (d: MockDelivery): AdminDelivery => {
  const o = FIXTURE_ORDERS.find((x) => x.id === d.orderId);
  const zone = FIXTURE_ZONES.find((z) => z.id === d.zoneId);
  const courier = DEMO_COURIERS.find((c) => c.id === d.courierId);
  return {
    id: d.id,
    orderId: d.orderId,
    orderNumber: o?.number ?? 'TG-000000',
    status: d.status,
    customerName: 'Kofi Mensah',
    recipientPhone: d.address.recipientPhone,
    addressLabel: d.address.district,
    landmark: d.address.landmark,
    lat: d.address.lat,
    lng: d.address.lng,
    zone: zone ? { id: zone.id, name: zone.name } : null,
    courier: courier ?? null,
    codBalanceXof: d.codBalanceXof ?? 0,
    scheduledFor: d.scheduledFor,
    updatedAt: d.scheduledFor,
  };
};

const courierView = (d: MockDelivery): CourierDelivery => {
  const o = FIXTURE_ORDERS.find((x) => x.id === d.orderId);
  return {
    id: d.id,
    orderNumber: o?.number ?? 'TG-000000',
    customerName: 'Kofi Mensah',
    customerPhone: '+22890123400',
    address: d.address,
    codBalanceXof: d.codBalanceXof,
    status: d.status,
    itemsCount: o?.items.length ?? 1,
  };
};

const withDerivedStock = (i: AdminStockItem): AdminStockItem => ({
  ...i,
  available: i.onHand - i.reserved,
  belowThreshold: i.onHand - i.reserved < i.alertThreshold,
});

export const logisticsHandlers = [
  http.get('*/v1/catalog/colors', () => HttpResponse.json(FIXTURE_COLORS)),

  http.get('*/v1/admin/couriers', ({ request }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    return HttpResponse.json({ items: DEMO_COURIERS });
  }),

  http.get('*/v1/admin/delivery-zones', ({ request }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    return HttpResponse.json(zones);
  }),
  http.post('*/v1/admin/delivery-zones', async ({ request }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const body = (await request.json()) as Omit<AdminZone, 'id'>;
    const z: AdminZone = { ...body, id: uid(820 + zones.length) };
    zones.push(z);
    return HttpResponse.json(z, { status: 201 });
  }),
  http.patch('*/v1/admin/delivery-zones/:id', async ({ request, params }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const z = zones.find((x) => x.id === params.id);
    if (!z) return notFound();
    Object.assign(z, await request.json());
    return HttpResponse.json(z);
  }),

  http.get('*/v1/admin/deliveries', ({ request }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const u = new URL(request.url);
    const status = u.searchParams.get('status');
    const date = u.searchParams.get('date') ?? today();
    return HttpResponse.json({
      items: deliveries
        .filter((d) => d.scheduledFor.slice(0, 10) === date && (!status || d.status === status))
        .map(toAdminDelivery),
    });
  }),
  http.post('*/v1/admin/deliveries/:id/assign', async ({ request, params }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const d = deliveries.find((x) => x.id === params.id);
    if (!d) return notFound();
    const { courierId } = (await request.json()) as { courierId: string };
    const courier = DEMO_COURIERS.find((c) => c.id === courierId);
    if (!courier) return notFound();
    if (!['to_assign', 'assigned', 'failed'].includes(d.status)) {
      return err(409, 'INVALID_TRANSITION', 'Cette livraison ne peut plus être réaffectée.');
    }
    Object.assign(d, { courierId, status: 'assigned', handoverAttempts: 0, failReason: null });
    patchDemoOrder(d.orderId, {
      delivery: { status: 'assigned', courier },
    });
    return HttpResponse.json(d);
  }),

  http.get('*/v1/admin/stores', ({ request }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    return HttpResponse.json(stores);
  }),
  http.post('*/v1/admin/stores', async ({ request }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const body = (await request.json()) as Omit<AdminStore, 'id'>;
    const s: AdminStore = { ...body, id: uid(710 + stores.length) };
    stores.push(s);
    slots[s.id] = [];
    return HttpResponse.json(s, { status: 201 });
  }),
  http.patch('*/v1/admin/stores/:id', async ({ request, params }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const s = stores.find((x) => x.id === params.id);
    if (!s) return notFound();
    Object.assign(s, await request.json());
    return HttpResponse.json(s);
  }),
  http.get('*/v1/admin/stores/:id/slots', ({ request, params }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const list = slots[String(params.id)];
    if (!list) return notFound();
    const date = new URL(request.url).searchParams.get('date');
    return HttpResponse.json(list.filter((s) => !date || s.startsAt.slice(0, 10) === date));
  }),
  http.post('*/v1/admin/stores/:id/slots', async ({ request, params }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const list = slots[String(params.id)];
    if (!list) return notFound();
    const body = (await request.json()) as { days?: number; capacity?: number };
    const days = body.days ?? 7;
    const capacity = body.capacity ?? 5;
    const created = days * 2;
    for (let i = 0; i < created; i++) {
      const start = new Date(Date.now() + (i + 3) * 86_400_000);
      list.push({
        id: uid(1000 + list.length),
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + 3600_000).toISOString(),
        capacity,
        booked: 0,
        remaining: capacity,
      });
    }
    return HttpResponse.json({ created });
  }),
  http.patch('*/v1/admin/stores/:id/slots/:slotId', async ({ request, params }) => {
    const g = guard(request, LOGI);
    if ('deny' in g) return g.deny;
    const slot = slots[String(params.id)]?.find((s) => s.id === params.slotId);
    if (!slot) return notFound();
    const { capacity } = (await request.json()) as { capacity: number };
    if (capacity < slot.booked) {
      return err(
        400,
        'VALIDATION_FAILED',
        'La capacité ne peut pas être inférieure aux places déjà réservées.',
      );
    }
    slot.capacity = capacity;
    slot.remaining = capacity - slot.booked;
    return HttpResponse.json(slot);
  }),

  http.get('*/v1/admin/stock', ({ request }) => {
    const g = guard(request, PROD);
    if ('deny' in g) return g.deny;
    return HttpResponse.json(stock);
  }),
  http.post('*/v1/admin/stock/movements', async ({ request }) => {
    const g = guard(request, PROD);
    if ('deny' in g) return g.deny;
    const b = (await request.json()) as {
      colorId: string;
      size: Size;
      type: 'in' | 'adjust';
      quantity: number;
    };
    const color = FIXTURE_COLORS.find((c) => c.id === b.colorId);
    if (!color || !SIZES.includes(b.size)) return notFound();
    let item = stock.find((i) => i.colorId === b.colorId && i.size === b.size);
    if (!item) {
      item = withDerivedStock({
        id: uid(950 + stock.length),
        colorId: color.id,
        colorName: color.name,
        size: b.size,
        onHand: 0,
        reserved: 0,
        available: 0,
        alertThreshold: 5,
        belowThreshold: true,
      });
      stock.push(item);
    }
    if (item.onHand + b.quantity < item.reserved) {
      return err(
        400,
        'VALIDATION_FAILED',
        'Ajustement impossible : le stock deviendrait inférieur aux pièces réservées.',
      );
    }
    item.onHand += b.quantity;
    Object.assign(item, withDerivedStock(item));
    return HttpResponse.json(item);
  }),
  http.patch('*/v1/admin/stock/:id', async ({ request, params }) => {
    const g = guard(request, PROD);
    if ('deny' in g) return g.deny;
    const item = stock.find((i) => i.id === params.id);
    if (!item) return notFound();
    item.alertThreshold = ((await request.json()) as { alertThreshold: number }).alertThreshold;
    Object.assign(item, withDerivedStock(item));
    return HttpResponse.json(item);
  }),

  http.get('*/v1/courier/deliveries', ({ request }) => {
    const g = guard(request, ['courier']);
    if ('deny' in g) return g.deny;
    return HttpResponse.json(
      deliveries.filter((d) => d.courierId === DEMO_COURIERS[0]?.id).map(courierView),
    );
  }),
  http.post('*/v1/courier/deliveries/:id/start', ({ request, params }) => {
    const g = guard(request, ['courier']);
    if ('deny' in g) return g.deny;
    const d = deliveries.find((x) => x.id === params.id);
    if (!d) return notFound();
    if (d.status !== 'assigned')
      return err(409, 'INVALID_TRANSITION', 'Cette livraison n’est pas dans le bon état.');
    d.status = 'in_progress';
    return HttpResponse.json(courierView(d));
  }),
  http.post('*/v1/courier/deliveries/:id/complete', async ({ request, params }) => {
    const g = guard(request, ['courier']);
    if ('deny' in g) return g.deny;
    const d = deliveries.find((x) => x.id === params.id);
    if (!d) return notFound();
    if (d.status !== 'in_progress')
      return err(409, 'INVALID_TRANSITION', 'Cette livraison n’est pas dans le bon état.');
    const body = (await request.json()) as { handoverCode: string; codCollectedXof?: number };
    const n = attempts.get(d.id) ?? 0;
    if (n >= MAX_ATTEMPTS) {
      return err(403, 'HANDOVER_CODE_LOCKED', 'Trop de codes erronés : contactez la logistique.');
    }
    if (body.handoverCode !== DEMO_HANDOVER_CODE) {
      attempts.set(d.id, n + 1);
      return err(400, 'HANDOVER_CODE_INVALID', 'Code de remise incorrect.', {
        remainingAttempts: MAX_ATTEMPTS - n - 1,
      });
    }
    if (d.codBalanceXof !== null && body.codCollectedXof !== d.codBalanceXof) {
      return err(
        400,
        'COD_AMOUNT_MISMATCH',
        'Le montant encaissé doit être égal au solde à payer à la livraison.',
      );
    }
    d.status = 'delivered';
    d.codCollectedXof = body.codCollectedXof ?? null;
    return HttpResponse.json(courierView(d));
  }),
  http.post('*/v1/courier/deliveries/:id/fail', async ({ request, params }) => {
    const g = guard(request, ['courier']);
    if ('deny' in g) return g.deny;
    const d = deliveries.find((x) => x.id === params.id);
    if (!d) return notFound();
    const body = (await request.json()) as { reason: string; note?: string };
    d.status = 'failed';
    d.failReason = body.reason;
    d.failNote = body.note ?? null;
    return HttpResponse.json(courierView(d));
  }),
];
