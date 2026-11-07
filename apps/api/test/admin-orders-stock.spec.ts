import { FIXTURE_STORE, ORDER_STATUSES, type Size } from '@streetwear/shared';
import { uuidv7 } from '../src/common/uuid';
import { OrdersService } from '../src/modules/orders/orders.service';
import { type AuthHeader, createAdmin } from './helpers';
import { ordersCtx, type OrdersCtx } from './orders-fixtures';

describe('SP04 back-office orders and stock (US-25, US-30)', () => {
  let t: OrdersCtx;
  let orders: OrdersService;
  const post = (url: string, auth: AuthHeader, body: object) =>
    t
      .http()
      .post(url)
      .set(...auth)
      .send(body);
  const move = (id: string, auth: AuthHeader, to: string, note?: string) =>
    post(`/v1/admin/orders/${id}/transitions`, auth, { to, ...(note ? { note } : {}) });

  /** Commande à domicile (ou retrait) ; payée si demandé. Renvoie aussi le code de remise. */
  async function order(
    opts: { size?: Size; pay?: boolean; pickup?: boolean; method?: string } = {},
  ) {
    const size = opts.size ?? 'M';
    await t.prisma.stockItem.upsert({
      where: { colorId_size: { colorId: 'col-noir', size } },
      create: { id: uuidv7(), colorId: 'col-noir', size, onHand: 1000 },
      update: {},
    });
    const s = await t.shopper({ size });
    const reception = opts.pickup
      ? { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: (await t.slot(10)).id }
      : { type: 'home', addressId: s.addressId };
    const res = await t
      .placeOrder(s.auth, { reception, paymentMethod: opts.method ?? 'tmoney' })
      .expect(201);
    const created = t.events.find(
      (e) => e.name === 'order.created' && e.payload.orderId === res.body.id,
    );
    if (opts.pay) {
      await orders.runInTransaction((tx) =>
        orders.applyPaymentResult(
          res.body.id,
          { succeeded: true, kind: opts.method === 'cod' ? 'deposit' : 'full' },
          tx,
        ),
      );
    }
    return {
      id: res.body.id as string,
      number: res.body.number as string,
      customer: s,
      code: created?.payload.handoverCode as string,
      pickupCode: created?.payload.pickupCode as string,
    };
  }

  beforeAll(async () => {
    t = await ordersCtx();
    orders = t.app.get(OrdersService);
  });
  afterAll(async () => {
    await t.app.close();
  });

  describe('access control', () => {
    it('requires a staff role on every admin order and stock route', async () => {
      const o = await order();
      const c = await t.newCustomer();
      const routes: [string, string, object?][] = [
        ['get', '/v1/admin/orders'],
        ['get', `/v1/admin/orders/${o.id}`],
        ['post', `/v1/admin/orders/${o.id}/transitions`, { to: 'cancelled' }],
      ];
      for (const [m, url, body] of routes) {
        const call = () => (m === 'get' ? t.http().get(url) : t.http().post(url));
        await call().send(body).expect(401);
        await call()
          .set(...c.auth)
          .send(body)
          .expect(401);
        const r = await call()
          .set(...t.adminAuth('courier'))
          .send(body)
          .expect(403);
        expect(r.body.error.code).toBe('FORBIDDEN');
      }
      for (const role of ['logistics', 'order_manager', 'courier'] as const) {
        await t
          .http()
          .get('/v1/admin/stock')
          .set(...t.adminAuth(role))
          .expect(403);
        await post('/v1/admin/stock/movements', t.adminAuth(role), {
          colorId: 'col-noir',
          size: 'M',
          type: 'in',
          quantity: 1,
          note: 'x',
        }).expect(403);
      }
      await t.http().get('/v1/admin/stock').expect(401);
      await t
        .http()
        .get('/v1/admin/stock')
        .set(...c.auth)
        .expect(401);
    });
  });

  describe('list and detail', () => {
    it('filters by status, reception, payment, dates and searches number, name, phone', async () => {
      const a = await order({ pay: true });
      const b = await order({ pickup: true, method: 'card' });
      await t.prisma.user.update({
        where: { id: b.customer.id },
        data: { name: 'Akossiwa Mensah' },
      });
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: a.customer.id } });
      const auth = t.adminAuth('order_manager');
      const list = (q: string) =>
        t
          .http()
          .get(`/v1/admin/orders?${q}`)
          .set(...auth)
          .expect(200);
      const ids = (r: { body: { items: { id: string }[] } }) => r.body.items.map((i) => i.id);

      expect(ids(await list('status=paid'))).toContain(a.id);
      expect(ids(await list('status=paid'))).not.toContain(b.id);
      expect(ids(await list('receptionType=pickup'))).toContain(b.id);
      expect(ids(await list('receptionType=pickup'))).not.toContain(a.id);
      expect(ids(await list('paymentMethod=card'))).toEqual(expect.arrayContaining([b.id]));
      expect(ids(await list(`q=${a.number}`))).toEqual([a.id]);
      expect(ids(await list(`q=${a.number.toLowerCase()}`))).toEqual([a.id]);
      expect(ids(await list('q=akossiwa'))).toEqual([b.id]);
      const digits = (user.phone as string).slice(4);
      const spaced = digits.replace(/(\d{2})(?=\d)/g, '$1 ');
      expect(ids(await list(`q=${encodeURIComponent(spaced)}`))).toContain(a.id);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      expect((await list(`from=${future}`)).body.items).toEqual([]);
      expect(ids(await list(`to=${future}&status=paid&q=${a.number}`))).toEqual([a.id]);
      const item = (await list(`q=${a.number}`)).body.items[0];
      expect(item).toMatchObject({
        number: a.number,
        status: 'paid',
        receptionType: 'home',
        itemCount: 1,
        customer: { id: a.customer.id, phone: user.phone },
      });

      const p1 = await list('limit=1');
      expect(p1.body.items).toHaveLength(1);
      const p2 = await list(`limit=1&cursor=${p1.body.nextCursor}`);
      expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);

      await t
        .http()
        .get('/v1/admin/orders?status=bogus')
        .set(...auth)
        .expect(400);
      await t
        .http()
        .get('/v1/admin/orders?from=yesterday')
        .set(...auth)
        .expect(400);
      await t
        .http()
        .get('/v1/admin/orders?cursor=zzz')
        .set(...auth)
        .expect(400);
    });

    it('shows the detail with customer, history and the transitions allowed to the caller', async () => {
      const o = await order({ pay: true });
      const get = (role: Parameters<OrdersCtx['adminAuth']>[0]) =>
        t
          .http()
          .get(`/v1/admin/orders/${o.id}`)
          .set(...t.adminAuth(role))
          .expect(200);
      const prod = await get('production');
      expect(prod.body).toMatchObject({
        id: o.id,
        status: 'paid',
        receptionType: 'home',
        customer: { id: o.customer.id },
        allowedTransitions: ['in_production'],
      });
      expect(prod.body.statusHistory).toEqual([
        expect.objectContaining({ from: null, to: 'pending_payment', actorType: 'customer' }),
        expect.objectContaining({ from: 'pending_payment', to: 'paid', actorType: 'provider' }),
      ]);
      expect((await get('order_manager')).body.allowedTransitions).toEqual(['cancelled']);
      expect((await get('super_admin')).body.allowedTransitions.sort()).toEqual([
        'cancelled',
        'in_production',
      ]);
      expect((await get('logistics')).body.allowedTransitions).toEqual([]);
      await t
        .http()
        .get(`/v1/admin/orders/${uuidv7()}`)
        .set(...t.adminAuth('production'))
        .expect(404);
      await t
        .http()
        .get('/v1/admin/orders/nope')
        .set(...t.adminAuth('production'))
        .expect(404);
    });
  });

  describe('transitions', () => {
    it('runs a home order to delivered, checking roles and preconditions', async () => {
      const o = await order({ pay: true });
      const prod = t.adminAuth('production');
      const logi = t.adminAuth('logistics');

      const noOp = await move(o.id, prod, 'in_production').expect(409);
      expect(noOp.body.error).toMatchObject({
        code: 'INVALID_TRANSITION',
        details: { unmet: ['requiresOperator'] },
      });
      orders.registerPreconditionCheck('requiresOperator', async () => true);
      await move(o.id, logi, 'in_production').expect(409);
      const started = await move(o.id, prod, 'in_production', 'Atelier A').expect(200);
      expect(started.body.status).toBe('in_production');

      const noFiles = await move(o.id, prod, 'ready').expect(409);
      expect(noFiles.body.error.details.unmet).toEqual(['requiresPrintFiles']);
      await t.prisma.orderItem.updateMany({
        where: { orderId: o.id },
        data: { printFileFrontUrl: 'https://cdn.example.com/f.png' },
      });
      await move(o.id, prod, 'ready').expect(200);

      await move(o.id, prod, 'shipped').expect(409);
      await move(o.id, logi, 'ready_for_pickup').expect(409);
      const noCourier = await move(o.id, logi, 'shipped').expect(409);
      expect(noCourier.body.error.details.unmet).toEqual(['requiresCourier']);
      const { admin, token } = await createAdmin(t.ctx, 'courier');
      const courier = await t.prisma.courier.create({
        data: { id: uuidv7(), adminUserId: admin.id, phone: '+22890000009' },
      });
      await t.prisma.delivery.update({
        where: { orderId: o.id },
        data: { courierId: courier.id, status: 'assigned' },
      });
      await move(o.id, logi, 'shipped').expect(200);
      await move(o.id, logi, 'delivered').expect(409);

      const delivery = await t.prisma.delivery.findUniqueOrThrow({ where: { orderId: o.id } });
      const cAuth: AuthHeader = ['Authorization', `Bearer ${token}`];
      const list = await t
        .http()
        .get('/v1/courier/deliveries')
        .query({ date: delivery.scheduledFor.toISOString().slice(0, 10) })
        .set(...cAuth)
        .expect(200);
      expect(list.body[0]).toMatchObject({
        orderNumber: o.number,
        itemsCount: 1,
        customerPhone: '+22890123456',
      });
      await t
        .http()
        .post(`/v1/courier/deliveries/${delivery.id}/start`)
        .set(...cAuth)
        .expect(200);
      await t
        .http()
        .post(`/v1/courier/deliveries/${delivery.id}/complete`)
        .set(...cAuth)
        .send({ handoverCode: o.code })
        .expect(200);

      const final = await t
        .http()
        .get(`/v1/admin/orders/${o.id}`)
        .set(...t.adminAuth('super_admin'))
        .expect(200);
      expect(final.body.status).toBe('delivered');
      expect(final.body.statusHistory.map((h: { to: string }) => h.to)).toEqual([
        'pending_payment',
        'paid',
        'in_production',
        'ready',
        'shipped',
        'delivered',
      ]);
      expect(final.body.statusHistory[2]).toMatchObject({ actorType: 'admin', note: 'Atelier A' });
      const audit = await t.prisma.auditLog.findMany({
        where: { entity: 'orders', entityId: o.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit).toHaveLength(3);
      expect(audit[0]?.before).toMatchObject({ status: 'paid' });
    });

    it('records a failed delivery through the courier route and lets logistics return the order', async () => {
      orders.registerPreconditionCheck('requiresOperator', async () => true);
      const o = await order({ pay: true });
      await t.prisma.orderItem.updateMany({
        where: { orderId: o.id },
        data: { printFileFrontUrl: 'https://cdn.example.com/f.png' },
      });
      await move(o.id, t.adminAuth('production'), 'in_production').expect(200);
      await move(o.id, t.adminAuth('production'), 'ready').expect(200);
      const { admin, token } = await createAdmin(t.ctx, 'courier');
      const courier = await t.prisma.courier.create({
        data: { id: uuidv7(), adminUserId: admin.id, phone: '+22890000008' },
      });
      const d = await t.prisma.delivery.update({
        where: { orderId: o.id },
        data: { courierId: courier.id, status: 'assigned' },
      });
      await move(o.id, t.adminAuth('super_admin'), 'shipped').expect(200);
      await t
        .http()
        .post(`/v1/courier/deliveries/${d.id}/fail`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'absent' })
        .expect(200);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
        'delivery_failed',
      );
      await move(o.id, t.adminAuth('logistics'), 'returned').expect(200);
      await move(o.id, t.adminAuth('order_manager'), 'refunded').expect(409);
      await move(o.id, t.adminAuth('super_admin'), 'refunded').expect(200);
    });

    async function readyForPickup() {
      orders.registerPreconditionCheck('requiresOperator', async () => true);
      const o = await order({ pay: true, pickup: true });
      await t.prisma.orderItem.updateMany({
        where: { orderId: o.id },
        data: { printFileFrontUrl: 'https://cdn.example.com/f.png' },
      });
      await move(o.id, t.adminAuth('production'), 'in_production').expect(200);
      await move(o.id, t.adminAuth('production'), 'ready').expect(200);
      await move(o.id, t.adminAuth('logistics'), 'shipped').expect(409);
      await move(o.id, t.adminAuth('logistics'), 'ready_for_pickup').expect(200);
      return o;
    }
    const collect = (id: string, auth: AuthHeader, code?: string) =>
      post(`/v1/admin/orders/${id}/transitions`, auth, {
        to: 'delivered',
        ...(code ? { code } : {}),
      });
    const wrongCode = (code: string) => (code === '000000' ? '111111' : '000000');

    it('delivers a pickup order with the right pickup code (logistics, super_admin)', async () => {
      const o = await readyForPickup();
      expect(o.pickupCode).toMatch(/^\d{6}$/);
      const missing = await collect(o.id, t.adminAuth('logistics')).expect(400);
      expect(missing.body.error.code).toBe('VALIDATION_FAILED');
      await collect(o.id, t.adminAuth('logistics'), '12ab').expect(400);
      await collect(o.id, t.adminAuth('production'), o.pickupCode).expect(409);
      await collect(o.id, t.adminAuth('order_manager'), o.pickupCode).expect(409);
      const bad = await collect(o.id, t.adminAuth('logistics'), wrongCode(o.pickupCode)).expect(
        400,
      );
      expect(bad.body.error).toMatchObject({
        code: 'HANDOVER_CODE_INVALID',
        details: { remainingAttempts: 4 },
      });
      expect(JSON.stringify(bad.body)).not.toContain(o.pickupCode);
      const ok = await collect(o.id, t.adminAuth('logistics'), o.pickupCode).expect(200);
      expect(ok.body.status).toBe('delivered');
      const pickup = await t.prisma.pickup.findUniqueOrThrow({ where: { orderId: o.id } });
      expect(pickup.collectedAt).not.toBeNull();
      expect(JSON.stringify(pickup)).not.toContain(`"${o.pickupCode}"`);
      await collect(o.id, t.adminAuth('logistics'), o.pickupCode).expect(409);

      const o2 = await readyForPickup();
      await collect(o2.id, t.adminAuth('super_admin'), o2.pickupCode).expect(200);
    });

    it('locks the pickup after 5 wrong codes (403 HANDOVER_CODE_LOCKED)', async () => {
      const o = await readyForPickup();
      for (let i = 1; i <= 5; i++) {
        const r = await collect(o.id, t.adminAuth('logistics'), wrongCode(o.pickupCode)).expect(
          400,
        );
        expect(r.body.error.details.remainingAttempts).toBe(5 - i);
      }
      const locked = await collect(o.id, t.adminAuth('logistics'), o.pickupCode).expect(403);
      expect(locked.body.error.code).toBe('HANDOVER_CODE_LOCKED');
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      expect(row.status).toBe('ready_for_pickup');
    });

    it('cancels before production: releases a pending reservation, restocks a paid order', async () => {
      await t.setStock('col-noir', 'S', 5);
      const pending = await order({ size: 'S' });
      const paid = await order({ size: 'S', pay: true });
      expect(await t.stockOf('col-noir', 'S')).toMatchObject({ onHand: 4, reserved: 1 });
      await move(pending.id, t.adminAuth('production'), 'cancelled').expect(409);
      await move(pending.id, t.adminAuth('order_manager'), 'cancelled', 'Demande du client').expect(
        200,
      );
      expect(await t.stockOf('col-noir', 'S')).toMatchObject({ onHand: 4, reserved: 0 });
      expect(await t.prisma.delivery.count({ where: { orderId: pending.id } })).toBe(0);
      await move(paid.id, t.adminAuth('order_manager'), 'cancelled').expect(200);
      expect(await t.stockOf('col-noir', 'S')).toMatchObject({ onHand: 5, reserved: 0 });
      const adjust = await t.prisma.stockMovement.findFirstOrThrow({
        where: { orderId: paid.id, type: 'adjust' },
      });
      expect(adjust.quantity).toBe(1);
      await move(paid.id, t.adminAuth('order_manager'), 'cancelled').expect(409);
      await move(paid.id, t.adminAuth('super_admin'), 'refunded').expect(200);
    });

    it('answers 409 INVALID_TRANSITION for every transition not in the state machine', async () => {
      const o = await order();
      const boss = t.adminAuth('super_admin');
      for (const to of ORDER_STATUSES.filter((s) => s !== 'cancelled')) {
        const r = await move(o.id, boss, to).expect(409);
        expect(r.body.error.code).toBe('INVALID_TRANSITION');
      }
      await move(o.id, boss, 'bogus').expect(400);
      await move(o.id, boss, 'cancelled', 'x'.repeat(501)).expect(400);
      await post(`/v1/admin/orders/${o.id}/transitions`, boss, {
        to: 'cancelled',
        extra: 1,
      }).expect(400);
      await move(uuidv7(), boss, 'cancelled').expect(404);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
        'pending_payment',
      );
    });
  });

  describe('stock (US-19, US-30)', () => {
    it('lists stock, records entries and adjustments, refuses invalid movements', async () => {
      const prod = t.adminAuth('production');
      const entry = await post('/v1/admin/stock/movements', prod, {
        colorId: 'col-terracotta',
        size: '3XL',
        type: 'in',
        quantity: 12,
        note: 'Livraison fournisseur',
      }).expect(201);
      expect(entry.body).toMatchObject({
        colorId: 'col-terracotta',
        colorName: 'Terracotta',
        size: '3XL',
        onHand: 12,
        reserved: 0,
        available: 12,
      });
      const adj = await post('/v1/admin/stock/movements', prod, {
        colorId: 'col-terracotta',
        size: '3XL',
        type: 'adjust',
        quantity: -2,
        note: 'Inventaire',
      }).expect(201);
      expect(adj.body.onHand).toBe(10);
      const list = await t
        .http()
        .get('/v1/admin/stock')
        .set(...t.adminAuth('super_admin'))
        .expect(200);
      expect(list.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: entry.body.id, onHand: 10 })]),
      );
      const movements = await t.prisma.stockMovement.findMany({
        where: { stockItemId: entry.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(movements.map((m) => [m.type, m.quantity, m.note])).toEqual([
        ['in', 12, 'Livraison fournisseur'],
        ['adjust', -2, 'Inventaire'],
      ]);
      const first = movements[0] as (typeof movements)[number];
      expect(first.adminUserId).not.toBeNull();

      const bad = (body: object) => post('/v1/admin/stock/movements', prod, body);
      await bad({
        colorId: 'col-terracotta',
        size: '3XL',
        type: 'out',
        quantity: 1,
        note: 'x',
      }).expect(400);
      await bad({
        colorId: 'col-terracotta',
        size: '3XL',
        type: 'in',
        quantity: -1,
        note: 'x',
      }).expect(400);
      await bad({
        colorId: 'col-terracotta',
        size: '3XL',
        type: 'adjust',
        quantity: 0,
        note: 'x',
      }).expect(400);
      await bad({ colorId: 'col-terracotta', size: '3XL', type: 'in', quantity: 1 }).expect(400);
      await bad({
        colorId: 'col-terracotta',
        size: '3XL',
        type: 'adjust',
        quantity: -11,
        note: 'x',
      }).expect(400);
      await bad({ colorId: 'nope', size: 'M', type: 'in', quantity: 1, note: 'x' }).expect(404);

      await expect(
        t.prisma.stockMovement.update({ where: { id: first.id }, data: { quantity: 99 } }),
      ).rejects.toThrow();
      await expect(t.prisma.stockMovement.delete({ where: { id: first.id } })).rejects.toThrow();
    });

    it('updates the alert threshold and emits stock.below_threshold when availability crosses it', async () => {
      const prod = t.adminAuth('production');
      await t.setStock('col-blanc', 'XL', 3, 0);
      const item = await t.stockOf('col-blanc', 'XL');
      await t
        .http()
        .patch(`/v1/admin/stock/${item.id}`)
        .set(...t.adminAuth('logistics'))
        .send({ alertThreshold: 2 })
        .expect(403);
      await t
        .http()
        .patch(`/v1/admin/stock/${item.id}`)
        .set(...prod)
        .send({ alertThreshold: -1 })
        .expect(400);
      await t
        .http()
        .patch(`/v1/admin/stock/${uuidv7()}`)
        .set(...prod)
        .send({ alertThreshold: 2 })
        .expect(404);
      const res = await t
        .http()
        .patch(`/v1/admin/stock/${item.id}`)
        .set(...prod)
        .send({ alertThreshold: 2 })
        .expect(200);
      expect(res.body).toMatchObject({ alertThreshold: 2, available: 3, belowThreshold: false });

      t.events.length = 0;
      const s = await t.shopper({ colorId: 'col-blanc', size: 'XL', quantity: 2 });
      await t
        .placeOrder(s.auth, {
          reception: { type: 'home', addressId: s.addressId },
          paymentMethod: 'tmoney',
        })
        .expect(201);
      const alert = t.events.find((e) => e.name === 'stock.below_threshold');
      expect(alert?.payload).toEqual({
        stockItemId: item.id,
        colorId: 'col-blanc',
        size: 'XL',
        available: 1,
        alertThreshold: 2,
      });
      const listed = (
        await t
          .http()
          .get('/v1/admin/stock')
          .set(...prod)
      ).body.find((i: { id: string }) => i.id === item.id);
      expect(listed).toMatchObject({ reserved: 2, available: 1, belowThreshold: true });
      const catalog = await t.http().get('/v1/catalog/availability?colorId=col-blanc').expect(200);
      expect(catalog.body.sizes.find((x: { size: string }) => x.size === 'XL').available).toBe(
        true,
      );
    });
  });

  describe('performance', () => {
    it('lists 10 000 orders filtered and searched in under 300 ms', async () => {
      const owner = await t.newCustomer();
      await t.prisma.$executeRawUnsafe(`
        INSERT INTO orders (id, number, user_id, status, subtotal_xof, delivery_fee_xof, total_xof,
          vat_included_xof, payment_method, reception_type, reception_snapshot, idempotency_key,
          idempotency_hash, created_at, updated_at)
        SELECT gen_random_uuid(), 'TG-P' || lpad(i::text, 6, '0'), '${owner.id}'::uuid,
          (ARRAY['paid','pending_payment','in_production','delivered']::order_status[])[1 + i % 4],
          11000, 1000, 12000, 1831, 'tmoney', 'home', '{}'::jsonb, gen_random_uuid(), 'perf',
          now() - (i || ' minutes')::interval, now()
        FROM generate_series(1, 10000) AS i`);
      await t.prisma.$executeRawUnsafe('ANALYZE orders');
      const auth = t.adminAuth('order_manager');
      try {
        for (const q of [
          'status=paid',
          'limit=100',
          'q=TG-P0099',
          'status=in_production&q=mensah',
        ]) {
          await t
            .http()
            .get(`/v1/admin/orders?${q}`)
            .set(...auth)
            .expect(200);
          const start = performance.now();
          const res = await t
            .http()
            .get(`/v1/admin/orders?${q}`)
            .set(...auth)
            .expect(200);
          const ms = performance.now() - start;
          expect(ms).toBeLessThan(300);
          if (q === 'status=paid') expect(res.body.items).toHaveLength(20);
        }
      } finally {
        await t.prisma.$executeRawUnsafe(`DELETE FROM orders WHERE idempotency_hash = 'perf'`);
      }
    });
  });
});
