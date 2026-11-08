import { http, HttpResponse } from 'msw';
import {
  FIXTURE_ORDERS,
  type Order,
  uid,
  allowedTransitions,
  canTransition,
  type AdminRole,
  type ErrorCode,
  type OrderStatus,
} from '@streetwear/shared';
import {
  ORDER_STATUSES,
  unmetPreconditions,
  type AdminOperator,
  type AdminOrder,
  type AdminOrderSummary,
  type ProductionQueueItem,
} from '@streetwear/shared';
import { demoUserId, roleFromAuthHeader } from './handlers';

type AdminCustomer = AdminOrder['customer'];

/** Code de retrait des commandes de démo (hypothèse MSW : le contrat ne fixe pas le code). */
export const DEMO_PICKUP_CODE = '654321';
const PRODUCIBLE: OrderStatus[] = ['paid', 'deposit_paid', 'in_production'];
export const DEMO_OPERATORS: AdminOperator[] = [
  {
    id: demoUserId('production'),
    name: 'Production',
    email: 'production@streetwear.test',
    role: 'production',
  },
  {
    id: demoUserId('super_admin'),
    name: 'Admin',
    email: 'admin@streetwear.test',
    role: 'super_admin',
  },
];
const MAX_CODE_ATTEMPTS = 5;
const POST_PRODUCTION: OrderStatus[] = ['ready', 'shipped', 'ready_for_pickup', 'delivered'];
const codeAttempts = new Map<string, number>();
const PAGE_SIZE_MAX = 100;

const customer = (i: number): AdminCustomer => ({
  id: `00000000-0000-4000-8000-0000000007${String(i).padStart(2, '0')}`,
  name: ['Kofi Mensah', 'Ama Dossou', 'Yao Agbo', 'Akouvi Lawson'][i % 4] ?? null,
  phone: `+2289012${String(3400 + i).slice(-4)}`,
});

const productionOf = (o: Order): AdminOrder['production'] =>
  o.status === 'in_production' || POST_PRODUCTION.includes(o.status)
    ? {
        status: o.status === 'in_production' ? 'ready_to_print' : 'printed',
        operator: { id: DEMO_OPERATORS[0]?.id ?? '', name: DEMO_OPERATORS[0]?.name ?? '' },
        error: null,
        items: o.items.map((it) => ({ itemId: it.id, front: true, back: true })),
      }
    : null;

const build = (): AdminOrder[] =>
  FIXTURE_ORDERS.map((o, i) => ({
    ...structuredClone(o),
    receptionType: o.reception.type,
    vatIncludedXof: 0,
    customer: customer(i),
    statusHistory: [
      {
        from: null,
        to: 'pending_payment',
        actorType: 'customer',
        actorId: null,
        note: null,
        at: o.createdAt,
      },
    ],
    allowedTransitions: [],
    production: productionOf(o),
    delivery:
      o.status === 'shipped'
        ? {
            status: 'out_for_delivery',
            courier: { id: uid(980), name: 'Koffi Livreur', phone: '+22891000000' },
          }
        : null,
    payments: [],
  }));

let orders = build();
/** Modifie une commande de démo (tests : fichiers manquants, job en échec…). */
export const patchDemoOrder = (id: string, patch: Partial<AdminOrder>): void => {
  const o = orders.find((x) => x.id === id);
  if (o) Object.assign(o, patch);
};
let signCounter = 0;
export const resetOrdersState = (): void => {
  orders = build();
  signCounter = 0;
  codeAttempts.clear();
};

const err = (status: number, code: ErrorCode, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
const unauth = () => err(401, 'UNAUTHENTICATED', 'Session expirée.');
const forbidden = () => err(403, 'FORBIDDEN', 'Votre rôle ne permet pas cette action.');
const notFound = () => err(404, 'NOT_FOUND', 'Élément introuvable.');

const view = (o: AdminOrder, role: AdminRole): AdminOrder => ({
  ...o,
  allowedTransitions: allowedTransitions(
    o.status,
    { type: 'admin', role },
    { receptionType: o.receptionType },
  ),
});
const summary = (o: AdminOrder): AdminOrderSummary => ({
  id: o.id,
  number: o.number,
  status: o.status,
  totalXof: o.totalXof,
  paymentMethod: o.paymentMethod,
  createdAt: o.createdAt,
  itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
  receptionType: o.receptionType,
  customer: o.customer,
});
const toQueueItem = (o: AdminOrder): ProductionQueueItem => ({
  orderId: o.id,
  orderNumber: o.number,
  status: o.status,
  receptionType: o.receptionType,
  paidAt: new Date(Date.parse(o.createdAt) + 3600_000).toISOString(),
  itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
  production: o.production
    ? { status: o.production.status, operator: o.production.operator }
    : null,
});
const filterOrders = (u: URLSearchParams, withStatus: boolean) => {
  const q = u.get('q')?.toLowerCase();
  const from = u.get('from');
  const to = u.get('to');
  return orders.filter(
    (o) =>
      (!withStatus || !u.get('status') || o.status === u.get('status')) &&
      (!u.get('receptionType') || o.receptionType === u.get('receptionType')) &&
      (!u.get('paymentMethod') || o.paymentMethod === u.get('paymentMethod')) &&
      (!from || o.createdAt >= from) &&
      (!to || o.createdAt <= to) &&
      (!q ||
        o.number.toLowerCase().includes(q) ||
        (o.customer.name ?? '').toLowerCase().includes(q) ||
        (o.customer.phone ?? '').includes(q)),
  );
};
const paginate = <T>(rows: T[], u: URLSearchParams) => {
  const limit = Math.min(Number(u.get('limit') ?? 20), PAGE_SIZE_MAX);
  const start = Number(u.get('cursor') ?? 0);
  const end = start + limit;
  return { items: rows.slice(start, end), nextCursor: end < rows.length ? String(end) : null };
};
const isProdRole = (role: AdminRole) => role === 'production' || role === 'super_admin';
const move = (o: AdminOrder, to: OrderStatus, role: AdminRole, note?: string) => {
  o.statusHistory.push({
    from: o.status,
    to,
    actorType: 'admin',
    actorId: null,
    note: note ?? null,
    at: new Date().toISOString(),
  });
  o.status = to;
  o.history.push({ status: to, at: new Date().toISOString() });
};

export const ordersHandlers = [
  http.get('*/v1/admin/orders', ({ request }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role === 'courier') return forbidden();
    const u = new URL(request.url).searchParams;
    const page = paginate(filterOrders(u, true), u);
    return HttpResponse.json({ ...page, items: page.items.map(summary) });
  }),

  http.get('*/v1/admin/orders/counts', ({ request }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role === 'courier') return forbidden();
    const rows = filterOrders(new URL(request.url).searchParams, false);
    const counts = Object.fromEntries(
      ORDER_STATUSES.map((st) => [st, rows.filter((o) => o.status === st).length]),
    );
    return HttpResponse.json(counts);
  }),

  http.get('*/v1/admin/operators', ({ request }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (!isProdRole(role)) return forbidden();
    return HttpResponse.json({ items: DEMO_OPERATORS });
  }),

  http.get('*/v1/admin/production/queue', ({ request }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (!isProdRole(role)) return forbidden();
    const u = new URL(request.url).searchParams;
    const wanted: OrderStatus[] =
      u.get('status') === 'to_assign' ? ['paid', 'deposit_paid'] : ['in_production'];
    const rows = orders
      .filter((o) => wanted.includes(o.status))
      .map(toQueueItem)
      .sort((x, y) => x.paidAt.localeCompare(y.paidAt));
    return HttpResponse.json(paginate(rows, u));
  }),

  http.get('*/v1/admin/orders/:id', ({ request, params }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role === 'courier') return forbidden();
    const o = orders.find((x) => x.id === params.id);
    return o ? HttpResponse.json(view(o, role)) : notFound();
  }),

  http.post('*/v1/admin/orders/:id/transitions', async ({ request, params }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role === 'courier') return forbidden();
    const o = orders.find((x) => x.id === params.id);
    if (!o) return notFound();
    const body = (await request.json()) as { to: OrderStatus; note?: string; code?: string };
    if (
      !canTransition(o.status, body.to, { type: 'admin', role }, { receptionType: o.receptionType })
    ) {
      return err(409, 'INVALID_TRANSITION', 'Ce changement de statut n’est pas autorisé.');
    }
    if (
      o.status === 'ready_for_pickup' &&
      body.to === 'delivered' &&
      body.code !== DEMO_PICKUP_CODE
    ) {
      const n = (codeAttempts.get(o.id) ?? 0) + 1;
      if (n > MAX_CODE_ATTEMPTS) {
        return err(403, 'HANDOVER_CODE_LOCKED', 'Trop de codes erronés : le retrait est bloqué.');
      }
      codeAttempts.set(o.id, n);
      return err(400, 'HANDOVER_CODE_INVALID', 'Code de retrait incorrect.', {
        remainingAttempts: MAX_CODE_ATTEMPTS - n,
      });
    }
    const unmet = unmetPreconditions(o.status, body.to, {
      requiresPrintFiles: !!o.production && o.production.items.every((f) => f.front || f.back),
      requiresHandoverCode: true,
      requiresOperator: !!o.production?.operator,
      requiresCourier: !!o.delivery?.courier,
    });
    if (unmet.length > 0) {
      return err(409, 'INVALID_TRANSITION', 'Préconditions non satisfaites.', { unmet });
    }
    move(o, body.to, role, body.note);
    return HttpResponse.json(view(o, role));
  }),

  http.post('*/v1/admin/orders/:id/assign-operator', async ({ request, params }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role !== 'production' && role !== 'super_admin') return forbidden();
    const o = orders.find((x) => x.id === params.id);
    if (!o) return notFound();
    const body = (await request.json()) as { operatorId?: string };
    const operator = DEMO_OPERATORS.find((x) => x.id === body.operatorId);
    if (!operator) {
      return err(422, 'OPERATOR_INVALID', 'Cet opérateur ne peut pas être affecté.');
    }
    if (o.status !== 'in_production') {
      if (!PRODUCIBLE.includes(o.status)) {
        return err(409, 'INVALID_TRANSITION', 'Ce changement de statut n’est pas autorisé.');
      }
      move(o, 'in_production', role, 'Opérateur affecté');
    }
    o.production = {
      status: o.production?.status ?? 'queued',
      operator: { id: operator.id, name: operator.name },
      error: o.production?.error ?? null,
      items:
        o.production?.items ?? o.items.map((it) => ({ itemId: it.id, front: false, back: false })),
    };
    return HttpResponse.json(view(o, role));
  }),

  http.get('*/v1/admin/orders/:id/production-sheet.pdf', ({ request, params }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role !== 'production' && role !== 'super_admin') return forbidden();
    if (!orders.some((x) => x.id === params.id)) return notFound();
    return new HttpResponse('%PDF-1.4\n%%EOF', { headers: { 'Content-Type': 'application/pdf' } });
  }),

  http.get('*/v1/admin/order-items/:id/print-files', ({ request, params }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role !== 'production' && role !== 'super_admin') return forbidden();
    const item = orders.flatMap((o) => o.items).find((i) => i.id === params.id);
    if (!item) return notFound();
    const sig = ++signCounter;
    const base = `https://files.example.test/print/${item.id}`;
    return HttpResponse.json({
      front: `${base}/front.png?sig=${sig}&ttl=900`,
      back: `${base}/back.png?sig=${sig}&ttl=900`,
    });
  }),

  http.post('*/v1/admin/order-items/:id/print-files/regenerate', ({ request, params }) => {
    const role = roleFromAuthHeader(request.headers.get('Authorization'));
    if (!role) return unauth();
    if (role !== 'production' && role !== 'super_admin') return forbidden();
    const order = orders.find((o) => o.items.some((i) => i.id === params.id));
    if (!order) return notFound();
    if (!PRODUCIBLE.includes(order.status)) {
      return err(
        409,
        'ORDER_NOT_PRODUCIBLE',
        'Les fichiers ne peuvent être régénérés que pour une commande payée en cours de production.',
      );
    }
    return HttpResponse.json({ status: 'queued' }, { status: 202 });
  }),
];
