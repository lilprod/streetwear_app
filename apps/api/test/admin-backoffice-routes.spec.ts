import {
  AdminOperatorSchema,
  AdminOrderSchema,
  AdminOrderSummarySchema,
  ORDER_STATUSES,
  ProductionQueueItemSchema,
} from '@streetwear/shared';
import { uuidv7 } from '../src/common/uuid';
import { type AuthHeader, createAdmin } from './helpers';
import { type ProductionCtx, productionCtx } from './production-fixtures';

describe('SP11 lot B back-office routes', () => {
  let t: ProductionCtx;
  const get = (url: string, auth?: AuthHeader) => {
    const r = t.http().get(url);
    return auth ? r.set(...auth) : r;
  };
  const assign = (orderId: string, operatorId: string) =>
    t
      .http()
      .post(`/v1/admin/orders/${orderId}/assign-operator`)
      .set(...t.adminAuth('production'))
      .send({ operatorId });

  beforeAll(async () => {
    t = await productionCtx();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    await t.prisma.$executeRawUnsafe(
      'TRUNCATE production_jobs, stock_movements, order_status_history, order_items, deliveries, pickups, orders, cart_items, carts CASCADE',
    );
    t.queue.ids.length = 0;
  });

  describe('GET /admin/operators', () => {
    it('lists active production and super_admin accounts sorted by name', async () => {
      const mk = async (role: 'production' | 'super_admin' | 'logistics', name: string | null) => {
        const { admin } = await createAdmin(t.ctx, role);
        await t.prisma.adminUser.update({ where: { id: admin.id }, data: { name } });
        return admin;
      };
      const zoe = await mk('production', '~Zoé');
      const abel = await mk('super_admin', '~Abel');
      await mk('logistics', '~Aaron');
      const off = await createAdmin(t.ctx, 'production', { active: false });
      await t.prisma.adminUser.update({ where: { id: off.admin.id }, data: { name: 'Absent' } });
      const res = await get('/v1/admin/operators', [
        'Authorization',
        `Bearer ${t.ctx.tokens.signAdmin(abel.id, 'super_admin')}`,
      ]).expect(200);
      const mine = res.body.items.filter((i: { name: string }) => i.name.startsWith('~'));
      expect(mine.map((i: { id: string }) => i.id)).toEqual([abel.id, zoe.id]);
      for (const i of res.body.items) AdminOperatorSchema.parse(i);
      expect(mine[0]).toEqual({
        id: abel.id,
        name: '~Abel',
        email: abel.email,
        role: 'super_admin',
      });
      const names: string[] = res.body.items.map((i: { name: string }) => i.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    });

    it('is reserved to production and super_admin', async () => {
      await get('/v1/admin/operators').expect(401);
      const c = await t.newCustomer();
      await get('/v1/admin/operators', c.auth).expect(401);
      for (const role of ['order_manager', 'logistics', 'courier'] as const) {
        const r = await get('/v1/admin/operators', t.adminAuth(role)).expect(403);
        expect(r.body.error.code).toBe('FORBIDDEN');
      }
      await get('/v1/admin/operators', t.adminAuth('production')).expect(200);
      await get('/v1/admin/operators', t.adminAuth('super_admin')).expect(200);
    });
  });

  describe('GET /admin/production/queue', () => {
    const queue = (q: string, auth: AuthHeader = t.adminAuth('production')) =>
      get(`/v1/admin/production/queue?${q}`, auth);

    it('lists to_assign (paid, deposit_paid) oldest payment first, with cursor pagination', async () => {
      const a = await t.paidOrder();
      const b = await t.paidOrder({ method: 'cod' });
      const c = await t.paidOrder({ bases: ['patternOnly', 'patternOnly'] });
      await t.paidOrder({ pay: false });
      const p1 = await queue('status=to_assign&limit=2').expect(200);
      expect(p1.body.items.map((i: { orderId: string }) => i.orderId)).toEqual([a.id, b.id]);
      expect(p1.body.nextCursor).toEqual(expect.any(String));
      const p2 = await queue(`status=to_assign&limit=2&cursor=${p1.body.nextCursor}`).expect(200);
      expect(p2.body.items.map((i: { orderId: string }) => i.orderId)).toEqual([c.id]);
      expect(p2.body.nextCursor).toBeNull();
      const all = [...p1.body.items, ...p2.body.items];
      for (const i of all) ProductionQueueItemSchema.parse(i);
      expect(all[1].status).toBe('deposit_paid');
      expect(all[0]).toMatchObject({
        orderNumber: a.number,
        receptionType: 'home',
        itemsCount: 1,
        production: { status: 'queued', operator: null },
      });
      expect(all[2].itemsCount).toBe(2);
      const paidAts = all.map((i: { paidAt: string }) => i.paidAt);
      expect([...paidAts].sort()).toEqual(paidAts);
    });

    it('lists in_production with the operator, and moves orders out of to_assign', async () => {
      const a = await t.paidOrder();
      const b = await t.paidOrder();
      const op = await createAdmin(t.ctx, 'production');
      await t.prisma.adminUser.update({ where: { id: op.admin.id }, data: { name: 'Kodjo' } });
      await assign(a.id, op.admin.id).expect(200);
      const todo = await queue('status=to_assign').expect(200);
      expect(todo.body.items.map((i: { orderId: string }) => i.orderId)).toEqual([b.id]);
      const prod = await queue('status=in_production').expect(200);
      expect(prod.body.items).toHaveLength(1);
      expect(prod.body.items[0]).toMatchObject({
        orderId: a.id,
        status: 'in_production',
        production: { operator: { id: op.admin.id, name: 'Kodjo' } },
      });
      expect(prod.body.nextCursor).toBeNull();
    });

    it('rejects a missing or unknown status and a bad cursor', async () => {
      for (const q of [
        '',
        'status=paid',
        'status=to_assign&limit=0',
        'status=to_assign&limit=500',
      ]) {
        const r = await queue(q).expect(400);
        expect(r.body.error.code).toBe('VALIDATION_FAILED');
      }
      const r = await queue('status=to_assign&cursor=zzz').expect(400);
      expect(r.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('is reserved to production and super_admin', async () => {
      await get('/v1/admin/production/queue?status=to_assign').expect(401);
      for (const role of ['order_manager', 'logistics', 'courier'] as const) {
        const r = await queue('status=to_assign', t.adminAuth(role)).expect(403);
        expect(r.body.error.code).toBe('FORBIDDEN');
      }
      await queue('status=to_assign', t.adminAuth('super_admin')).expect(200);
    });
  });

  describe('GET /admin/orders/counts', () => {
    const counts = (q = '', auth: AuthHeader = t.adminAuth('order_manager')) =>
      get(`/v1/admin/orders/counts${q ? `?${q}` : ''}`, auth);

    it('returns every status, zeros included, and honours the list filters', async () => {
      await t.paidOrder();
      await t.paidOrder({ method: 'cod' });
      await t.paidOrder({ pay: false });
      const res = await counts().expect(200);
      expect(Object.keys(res.body).sort()).toEqual([...ORDER_STATUSES].sort());
      expect(res.body).toMatchObject({
        paid: 1,
        deposit_paid: 1,
        pending_payment: 1,
        in_production: 0,
        refunded: 0,
      });
      const cod = await counts('paymentMethod=cod').expect(200);
      expect(cod.body).toMatchObject({ deposit_paid: 1, paid: 0, pending_payment: 0 });
      const pickup = await counts('receptionType=pickup').expect(200);
      expect(Object.values(pickup.body).every((n) => n === 0)).toBe(true);
      const future = await counts('from=2999-01-01T00:00:00.000Z').expect(200);
      expect(Object.values(future.body).every((n) => n === 0)).toBe(true);
      const ignored = await counts('status=paid').expect(200);
      expect(ignored.body.pending_payment).toBe(1);
      const q = await counts('q=ZZZ-no-match').expect(200);
      expect(Object.values(q.body).every((n) => n === 0)).toBe(true);
    });

    it('is not shadowed by /admin/orders/:id and rejects bad filters', async () => {
      await counts('receptionType=nope').expect(400);
      await counts('from=hier').expect(400);
    });

    it('is open to the four staff roles only', async () => {
      await get('/v1/admin/orders/counts').expect(401);
      for (const role of ['order_manager', 'production', 'logistics', 'super_admin'] as const) {
        await counts('', t.adminAuth(role)).expect(200);
      }
      const r = await counts('', t.adminAuth('courier')).expect(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /admin/orders/:id enrichment', () => {
    it('returns null production/delivery fields and empty payments when absent', async () => {
      const o = await t.paidOrder({ pay: false });
      await t.prisma.delivery.deleteMany({ where: { orderId: o.id } });
      const res = await get(`/v1/admin/orders/${o.id}`, t.adminAuth('order_manager')).expect(200);
      expect(res.body.production).toBeNull();
      expect(res.body.delivery).toBeNull();
      expect(res.body.payments).toEqual([]);
      AdminOrderSchema.parse({
        ...res.body,
        statusHistory: res.body.statusHistory,
      });
    });

    it('exposes the production job, operator, file presence and delivery', async () => {
      const o = await t.paidOrder({ bases: ['patternOnly', 'patternOnly'] });
      const op = await createAdmin(t.ctx, 'production');
      await t.prisma.adminUser.update({ where: { id: op.admin.id }, data: { name: 'Kodjo' } });
      const [first] = o.items;
      await t.prisma.orderItem.update({
        where: { id: def(first).id },
        data: { printFileFrontUrl: 'print-files/x_front.png' },
      });
      await assign(o.id, op.admin.id).expect(200);
      await t.prisma.productionJob.update({
        where: { orderId: o.id },
        data: { status: 'failed', error: 'PATTERN_ASSET_MISSING' },
      });
      const courierUser = await createAdmin(t.ctx, 'courier');
      await t.prisma.adminUser.update({
        where: { id: courierUser.admin.id },
        data: { name: 'Yao' },
      });
      const courier = await t.prisma.courier.create({
        data: { id: uuidv7(), adminUserId: courierUser.admin.id, phone: '+22890111111' },
      });
      await t.prisma.delivery.update({
        where: { orderId: o.id },
        data: { courierId: courier.id, status: 'assigned' },
      });
      const res = await get(`/v1/admin/orders/${o.id}`, t.adminAuth('production')).expect(200);
      AdminOrderSchema.parse(res.body);
      expect(res.body.production).toMatchObject({
        status: 'failed',
        error: 'PATTERN_ASSET_MISSING',
        operator: { id: op.admin.id, name: 'Kodjo' },
      });
      const byId = new Map(res.body.production.items.map((i: { itemId: string }) => [i.itemId, i]));
      expect(byId.get(def(first).id)).toEqual({ itemId: def(first).id, front: true, back: false });
      expect(byId.get(def(o.items[1]).id)).toEqual({
        itemId: def(o.items[1]).id,
        front: false,
        back: false,
      });
      expect(res.body.delivery).toEqual({
        status: 'assigned',
        courier: { id: courier.id, name: 'Yao', phone: '+22890111111' },
      });
      expect(res.body.payments).toEqual([]);
      const summary = await get('/v1/admin/orders', t.adminAuth('order_manager')).expect(200);
      AdminOrderSummarySchema.parse(summary.body.items[0]);
    });
  });
});

function def<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('valeur attendue');
  return v;
}
