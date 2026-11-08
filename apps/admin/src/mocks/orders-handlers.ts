import { http, HttpResponse } from 'msw';
import {
  FIXTURE_ORDERS,
  allowedTransitions,
  canTransition,
  type AdminRole,
  type OrderStatus,
} from '@streetwear/shared';
import type { AdminCustomer, AdminOrder, AdminOrderSummary } from '../lib/orders-api';
import { roleFromAuthHeader } from './handlers';

/** Code de retrait des commandes de démo (hypothèse MSW : le contrat ne fixe pas le code). */
export const DEMO_PICKUP_CODE = '654321';
const PRODUCIBLE: OrderStatus[] = ['paid', 'deposit_paid', 'in_production'];
const OPERATOR_IDS = ['demo-production', 'demo-super_admin'];
const PAGE_SIZE_MAX = 100;

const customer = (i: number): AdminCustomer => ({
  id: `00000000-0000-4000-8000-0000000007${String(i).padStart(2, '0')}`,
  name: ['Kofi Mensah', 'Ama Dossou', 'Yao Agbo', 'Akouvi Lawson'][i % 4] ?? null,
  phone: `+2289012${String(3400 + i).slice(-4)}`,
});

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
  }));

let orders = build();
let signCounter = 0;
export const resetOrdersState = (): void => {
  orders = build();
  signCounter = 0;
};

const err = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status });
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
const move = (o: AdminOrder, to: OrderStatus, role: AdminRole, note?: string) => {
  o.statusHistory.push({
    from: o.status,
    to,
    actorType: 'admin',
    actorId: `demo-${role}`,
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
    const q = u.get('q')?.toLowerCase();
    const from = u.get('from');
    const to = u.get('to');
    const rows = orders.filter(
      (o) =>
        (!u.get('status') || o.status === u.get('status')) &&
        (!u.get('receptionType') || o.receptionType === u.get('receptionType')) &&
        (!u.get('paymentMethod') || o.paymentMethod === u.get('paymentMethod')) &&
        (!from || o.createdAt >= from) &&
        (!to || o.createdAt <= to) &&
        (!q ||
          o.number.toLowerCase().includes(q) ||
          (o.customer.name ?? '').toLowerCase().includes(q) ||
          (o.customer.phone ?? '').includes(q)),
    );
    const limit = Math.min(Number(u.get('limit') ?? 20), PAGE_SIZE_MAX);
    const start = Number(u.get('cursor') ?? 0);
    const end = start + limit;
    return HttpResponse.json({
      items: rows.slice(start, end).map(summary),
      nextCursor: end < rows.length ? String(end) : null,
    });
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
      return err(422, 'VALIDATION_FAILED', 'Code de retrait incorrect.');
    }
    if (body.to === 'in_production') {
      return err(409, 'INVALID_TRANSITION', 'Affectez d’abord un opérateur.');
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
    if (!body.operatorId || !OPERATOR_IDS.includes(body.operatorId)) {
      return err(422, 'OPERATOR_INVALID', 'Cet opérateur ne peut pas être affecté.');
    }
    if (o.status !== 'in_production') {
      if (!PRODUCIBLE.includes(o.status)) {
        return err(409, 'INVALID_TRANSITION', 'Ce changement de statut n’est pas autorisé.');
      }
      move(o, 'in_production', role, 'Opérateur affecté');
    }
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
