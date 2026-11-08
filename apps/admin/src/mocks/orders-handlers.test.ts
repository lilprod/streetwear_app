import {
  AdminOperatorSchema,
  AdminOrderSchema,
  AdminOrderSummarySchema,
  ApiErrorSchema,
  OrderCountsSchema,
  ProductionQueueItemSchema,
  pageSchema,
  uid,
} from '@streetwear/shared';
import { z } from 'zod';
import { DEMO_ACCOUNTS, demoSession } from './handlers';
import { patchDemoOrder } from './orders-handlers';

const auth = (role: string) => {
  const a = DEMO_ACCOUNTS.find((x) => x.role === role);
  if (!a) throw new Error(role);
  return { Authorization: `Bearer ${demoSession(a).accessToken}` };
};
const get = async (path: string, role = 'super_admin') => {
  const r = await fetch(`http://localhost/v1${path}`, { headers: auth(role) });
  return { status: r.status, body: (await r.json()) as unknown };
};

describe('handlers MSW : formes conformes aux schémas de packages/shared', () => {
  it('GET /admin/orders', async () => {
    const { body } = await get('/admin/orders');
    expect(pageSchema(AdminOrderSummarySchema).strict().safeParse(body).success).toBe(true);
  });

  it('GET /admin/orders/:id pour chaque commande de démo et un job en échec', async () => {
    for (let n = 1; n <= 8; n += 1) {
      const { body } = await get(`/admin/orders/${uid(500 + n)}`);
      expect(AdminOrderSchema.safeParse(body).success, `commande ${n}`).toBe(true);
    }
    patchDemoOrder(uid(505), {
      production: { status: 'failed', operator: null, error: 'Rendu HD impossible', items: [] },
    });
    const { body } = await get(`/admin/orders/${uid(505)}`);
    expect(AdminOrderSchema.safeParse(body).success).toBe(true);
  });

  it('GET /admin/orders/counts (filtres de la liste, hors statut)', async () => {
    const all = OrderCountsSchema.parse((await get('/admin/orders/counts')).body);
    expect(Object.values(all).reduce((a, b) => a + b, 0)).toBe(8);
    const pickup = OrderCountsSchema.parse(
      (await get('/admin/orders/counts?receptionType=pickup')).body,
    );
    expect(pickup.ready_for_pickup).toBe(1);
    expect(pickup.paid).toBe(0);
  });

  it('GET /admin/operators et /admin/production/queue', async () => {
    const ops = z
      .object({ items: z.array(AdminOperatorSchema) })
      .parse((await get('/admin/operators')).body);
    expect(ops.items.length).toBeGreaterThan(0);
    const toAssign = pageSchema(ProductionQueueItemSchema).parse(
      (await get('/admin/production/queue?status=to_assign')).body,
    );
    expect(toAssign.items.map((i) => i.orderNumber)).toEqual(['TG-000003', 'TG-000004']);
    const inProd = pageSchema(ProductionQueueItemSchema).parse(
      (await get('/admin/production/queue?status=in_production&limit=1')).body,
    );
    expect(inProd.items).toHaveLength(1);
    expect(inProd.items[0]?.production?.operator).not.toBeNull();
  });

  it('refuse les rôles non autorisés (403) et les appels sans jeton (401)', async () => {
    expect((await get('/admin/operators', 'logistics')).status).toBe(403);
    expect((await get('/admin/production/queue?status=to_assign', 'order_manager')).status).toBe(
      403,
    );
    expect((await get('/admin/orders/counts', 'courier')).status).toBe(403);
    const r = await fetch('http://localhost/v1/admin/operators');
    expect(r.status).toBe(401);
  });

  it('les erreurs respectent ApiErrorSchema', async () => {
    const r = await fetch(`http://localhost/v1/admin/orders/${uid(506)}/transitions`, {
      method: 'POST',
      headers: { ...auth('logistics'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'delivered', code: '000000' }),
    });
    expect(r.status).toBe(400);
    const parsed = ApiErrorSchema.parse(await r.json());
    expect(parsed.error.code).toBe('HANDOVER_CODE_INVALID');
    expect(parsed.error.details).toEqual({ remainingAttempts: 4 });
  });
});
