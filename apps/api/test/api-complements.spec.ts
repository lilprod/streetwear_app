import type { INestApplication } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import { type ReceptionInput } from '@streetwear/shared';
import request from 'supertest';
import { uuidv7 } from '../src/common/uuid';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { seedDelivery } from '../src/modules/delivery/seed';
import { REVENUE_STATUSES, lomeDay, resolveRange } from '../src/modules/orders/stats.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { type AuthHeader, buildApp, createAdmin, insertOrder, type TestCtx } from './helpers';

const TOKOIN = { lat: 6.145, lng: 1.215 };

describe('API complements: couriers, deliveries, stats', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: TestCtx;
  let adminAuth: (
    r: 'logistics' | 'courier' | 'super_admin' | 'order_manager' | 'production',
  ) => AuthHeader;
  let newCustomer: () => Promise<{ id: string; auth: AuthHeader }>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const built = await buildApp();
    ({ app, prisma, ctx, newCustomer } = built);
    adminAuth = built.adminAuth;
    await prisma.$executeRawUnsafe(
      'TRUNCATE production_jobs, stock_movements, order_status_history, order_items, deliveries, pickups, orders, cart_items, carts, pickup_slots, stores, couriers, delivery_zones CASCADE',
    );
    await seedDelivery(prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  async function courierAccount(
    name: string | null,
    opts: { profileActive?: boolean; adminActive?: boolean } = {},
  ) {
    const { admin } = await createAdmin(ctx, 'courier', { active: opts.adminActive ?? true });
    if (name) await prisma.adminUser.update({ where: { id: admin.id }, data: { name } });
    const row = await prisma.courier.create({
      data: {
        id: uuidv7(),
        adminUserId: admin.id,
        phone: '+22890000001',
        active: opts.profileActive ?? true,
      },
    });
    return { id: row.id, adminId: admin.id };
  }

  describe('GET /admin/couriers', () => {
    it('lists active courier profiles sorted by name, with the profile id', async () => {
      const zoe = await courierAccount('Zoé Mensah');
      const alice = await courierAccount('Alice Koffi');
      await courierAccount('Inactif Profil', { profileActive: false });
      await courierAccount('Inactif Compte', { adminActive: false });
      const res = await http()
        .get('/v1/admin/couriers')
        .set(...adminAuth('logistics'))
        .expect(200);
      expect(res.body.items).toEqual([
        { id: alice.id, name: 'Alice Koffi', phone: '+22890000001' },
        { id: zoe.id, name: 'Zoé Mensah', phone: '+22890000001' },
      ]);
      await http()
        .get('/v1/admin/couriers')
        .set(...adminAuth('super_admin'))
        .expect(200);
    });

    it('refuses other roles and anonymous calls', async () => {
      await http().get('/v1/admin/couriers').expect(401);
      for (const r of ['order_manager', 'production', 'courier'] as const) {
        await http()
          .get('/v1/admin/couriers')
          .set(...adminAuth(r))
          .expect(403);
      }
      const c = await newCustomer();
      await http()
        .get('/v1/admin/couriers')
        .set(...c.auth)
        .expect(401);
    });
  });

  describe('GET /admin/deliveries (AdminDelivery)', () => {
    it('returns enriched items without per-row queries, never a code or hash', async () => {
      const svc = app.get(DeliveryService);
      const courier = await courierAccount('Livreur Test');
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const customer = await newCustomer();
        await prisma.user.update({ where: { id: customer.id }, data: { name: `Client ${i}` } });
        const addr = await prisma.address.create({
          data: {
            id: uuidv7(),
            userId: customer.id,
            label: `Maison ${i}`,
            district: 'Tokoin',
            landmark: 'Près du marché',
            recipientPhone: '+22890123456',
            ...TOKOIN,
          },
        });
        const order = await insertOrder(prisma, customer.id);
        const reception: ReceptionInput = { type: 'home', addressId: addr.id };
        const r = await prisma.$transaction((tx) =>
          svc.reserve(
            reception,
            { orderId: order.id, userId: customer.id, codBalanceXof: 5000 },
            tx,
          ),
        );
        if (r.type !== 'home') throw new Error('unexpected');
        ids.push(r.deliveryId);
      }
      const h = adminAuth('logistics');
      await http()
        .post(`/v1/admin/deliveries/${ids[1]}/assign`)
        .set(...h)
        .send({ courierId: courier.id })
        .expect(200);

      const spies = [
        jest.spyOn(prisma.delivery, 'findMany'),
        jest.spyOn(prisma.adminUser, 'findMany'),
        jest.spyOn(prisma.order, 'findUnique'),
        jest.spyOn(prisma.user, 'findUnique'),
      ];
      const scheduled = await prisma.delivery.findUniqueOrThrow({
        where: { id: ids[0] as string },
      });
      const date = scheduled.scheduledFor.toISOString().slice(0, 10);
      spies.forEach((s) => s.mockClear());
      const res = await http()
        .get('/v1/admin/deliveries')
        .query({ date })
        .set(...h)
        .expect(200);
      expect(spies[0]).toHaveBeenCalledTimes(1);
      expect(spies[1]).toHaveBeenCalledTimes(1);
      expect(spies[2]).not.toHaveBeenCalled();
      expect(spies[3]).not.toHaveBeenCalled();
      jest.restoreAllMocks();

      const items = res.body.items as Record<string, unknown>[];
      expect(items).toHaveLength(4);
      const assigned = items.find((x) => x.id === ids[1]);
      expect(assigned).toMatchObject({
        status: 'assigned',
        customerName: 'Client 1',
        recipientPhone: '+22890123456',
        addressLabel: 'Maison 1',
        landmark: 'Près du marché',
        lat: TOKOIN.lat,
        lng: TOKOIN.lng,
        courier: { id: courier.id, name: 'Livreur Test', phone: '+22890000001' },
        codBalanceXof: 5000,
      });
      expect(assigned?.zone).toMatchObject({ name: expect.any(String) });
      expect(assigned?.orderNumber).toMatch(/^TG-/);
      expect(items.find((x) => x.id === ids[0])).toMatchObject({ courier: null });
      expect(typeof assigned?.updatedAt).toBe('string');
      expect(JSON.stringify(res.body)).not.toMatch(/hash|handoverCode/i);
    });

    it('refuses other roles and validates the query', async () => {
      await http().get('/v1/admin/deliveries').expect(401);
      await http()
        .get('/v1/admin/deliveries')
        .set(...adminAuth('order_manager'))
        .expect(403);
      await http()
        .get('/v1/admin/deliveries')
        .query({ status: 'nope' })
        .set(...adminAuth('logistics'))
        .expect(400);
    });
  });

  describe('GET /admin/stats/summary', () => {
    const stats = (
      q: Record<string, string> = {},
      role: 'order_manager' | 'super_admin' = 'order_manager',
    ) =>
      http()
        .get('/v1/admin/stats/summary')
        .query(q)
        .set(...adminAuth(role));
    let customer: string;

    async function order(o: {
      status: OrderStatus;
      totalXof: number;
      createdAt: Date;
      reception?: 'home' | 'pickup';
      items?: { colorId: string; quantity: number; patterns: { front?: string; back?: string } }[];
    }) {
      const id = uuidv7();
      const items = o.items ?? [];
      await prisma.order.create({
        data: {
          id,
          number: `TG-S${id.slice(-8)}`,
          userId: customer,
          status: o.status,
          subtotalXof: o.totalXof,
          deliveryFeeXof: 0,
          totalXof: o.totalXof,
          vatIncludedXof: 0,
          paymentMethod: 'tmoney',
          receptionType: o.reception ?? 'home',
          receptionSnapshot: {},
          idempotencyKey: uuidv7(),
          idempotencyHash: 'x',
          createdAt: o.createdAt,
          items: {
            create: items.map((i) => ({
              id: uuidv7(),
              colorId: i.colorId,
              size: 'M',
              quantity: i.quantity,
              unitPriceXof: 1000,
              designSnapshot: {
                version: 1,
                colorId: i.colorId,
                zones: Object.fromEntries(
                  (['front', 'back'] as const).flatMap((z) =>
                    i.patterns[z]
                      ? [[z, { layers: [{ type: 'pattern', patternId: i.patterns[z] }] }]]
                      : [],
                  ),
                ),
              } as Prisma.InputJsonValue,
            })),
          },
        },
      });
    }

    beforeAll(async () => {
      customer = (await newCustomer()).id;
      await prisma.$executeRawUnsafe(
        'TRUNCATE production_jobs, stock_movements, order_status_history, order_items, deliveries, pickups, orders CASCADE',
      );
    });

    it('defines days, revenue and tops precisely (civil Lomé days, inclusive bounds)', async () => {
      const at = (s: string) => new Date(s);
      const item = (colorId: string, quantity: number, front?: string, back?: string) => ({
        colorId,
        quantity,
        patterns: { front, back },
      });
      await order({
        status: 'paid',
        totalXof: 10000,
        createdAt: at('2026-01-10T00:00:00.000Z'),
        items: [item('col-noir', 2, 'pat-soleil', 'pat-soleil')],
      });
      await order({
        status: 'deposit_paid',
        totalXof: 20000,
        createdAt: at('2026-01-10T23:59:59.999Z'),
        reception: 'pickup',
        items: [item('col-noir', 1, 'pat-wax-be'), item('col-sable', 1, 'pat-soleil')],
      });
      await order({
        status: 'delivered',
        totalXof: 30000,
        createdAt: at('2026-01-12T12:00:00.000Z'),
        items: [item('col-sable', 3)],
      });
      for (const status of [
        'pending_payment',
        'payment_failed',
        'expired',
        'cancelled',
        'refunded',
        'returned',
      ] as const) {
        await order({
          status,
          totalXof: 99999,
          createdAt: at('2026-01-11T08:00:00.000Z'),
          items: [item('col-indigo', 9, 'pat-bogolan')],
        });
      }
      await order({ status: 'paid', totalXof: 55555, createdAt: at('2026-01-09T23:59:59.999Z') });
      await order({ status: 'paid', totalXof: 55555, createdAt: at('2026-01-13T00:00:00.000Z') });

      const res = await stats({ from: '2026-01-10', to: '2026-01-12' }).expect(200);
      expect(res.body.from).toBe('2026-01-10T00:00:00.000Z');
      expect(res.body.to).toBe('2026-01-12T23:59:59.999Z');
      expect(res.body.ordersCount).toBe(9);
      expect(res.body.revenueXof).toBe(60000);
      expect(res.body.averageOrderXof).toBe(20000);
      expect(res.body.byStatus).toMatchObject({
        paid: 1,
        deposit_paid: 1,
        delivered: 1,
        pending_payment: 1,
        cancelled: 1,
        refunded: 1,
        returned: 1,
        in_production: 0,
      });
      expect(res.body.byReception).toEqual({ home: 8, pickup: 1 });
      expect(res.body.topPatterns).toEqual([
        { id: 'pat-soleil', name: 'Soleil', count: 3 },
        { id: 'pat-wax-be', name: 'Wax Bè', count: 1 },
      ]);
      expect(res.body.topColors).toEqual([
        { id: 'col-sable', name: 'Sable', hex: '#D9C3A0', count: 4 },
        { id: 'col-noir', name: 'Noir', hex: '#111111', count: 3 },
      ]);

      const iso = await stats(
        { from: '2026-01-10T15:00:00.000Z', to: '2026-01-10T16:00:00.000Z' },
        'super_admin',
      ).expect(200);
      expect(iso.body.ordersCount).toBe(2);
      expect(iso.body.revenueXof).toBe(30000);
      const none = await stats({ from: '2025-01-01', to: '2025-01-02' }).expect(200);
      expect(none.body).toMatchObject({
        ordersCount: 0,
        revenueXof: 0,
        averageOrderXof: 0,
        topPatterns: [],
        topColors: [],
      });
    });

    it('revenue statuses exclude unpaid, cancelled, refunded and returned orders', () => {
      for (const s of [
        'pending_payment',
        'payment_failed',
        'expired',
        'cancelled',
        'refunded',
        'returned',
      ]) {
        expect(REVENUE_STATUSES).not.toContain(s);
      }
      for (const s of ['paid', 'deposit_paid', 'delivered']) expect(REVENUE_STATUSES).toContain(s);
    });

    it('defaults to the last 30 civil days', async () => {
      const now = new Date();
      await order({ status: 'paid', totalXof: 7000, createdAt: now });
      await order({
        status: 'paid',
        totalXof: 8000,
        createdAt: new Date(now.getTime() - 40 * 86_400_000),
      });
      const res = await stats().expect(200);
      const today = lomeDay(now);
      expect(res.body.to).toBe(`${today}T23:59:59.999Z`);
      const span =
        (new Date(res.body.to).getTime() - new Date(res.body.from).getTime() + 1) / 86_400_000;
      expect(span).toBe(30);
      expect(res.body.revenueXof).toBe(7000);
    });

    it('rejects invalid periods and enforces roles', async () => {
      await stats({ from: '2026-02-02', to: '2026-02-01' }).expect(400);
      await stats({ from: 'hier' }).expect(400);
      await stats({ from: '2024-01-01', to: '2026-01-01' }).expect(400);
      expect(() => resolveRange({ from: '2026-02-02', to: '2026-02-01' })).toThrow();
      await http().get('/v1/admin/stats/summary').expect(401);
      for (const r of ['production', 'logistics', 'courier'] as const) {
        await http()
          .get('/v1/admin/stats/summary')
          .set(...adminAuth(r))
          .expect(403);
      }
    });

    it('aggregates in SQL: handles a few thousand orders without loading them', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO orders (id, number, user_id, status, subtotal_xof, delivery_fee_xof, total_xof, vat_included_xof, payment_method, reception_type, reception_snapshot, idempotency_key, idempotency_hash, created_at, updated_at)
         SELECT gen_random_uuid(), 'TG-B' || g, '${customer}'::uuid, 'paid', 1000, 0, 1000, 0, 'tmoney', 'home', '{}'::jsonb, gen_random_uuid(), 'x', '2026-03-05T10:00:00Z', now()
         FROM generate_series(1, 3000) g`,
      );
      const res = await stats({ from: '2026-03-05', to: '2026-03-05' }).expect(200);
      expect(res.body).toMatchObject({
        ordersCount: 3000,
        revenueXof: 3_000_000,
        averageOrderXof: 1000,
      });
    }, 30_000);
  });
});
