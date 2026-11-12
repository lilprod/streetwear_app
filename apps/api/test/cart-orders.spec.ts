import {
  FIXTURE_PATTERNS_BY_ID,
  FIXTURE_PRICE_RULES,
  FIXTURE_STORE,
  computeCartTotals,
  computeCodDepositXof,
  computeDepositXof,
  computeUnitPriceXof,
  type DesignSpec,
} from '@streetwear/shared';
import { uuidv7 } from '../src/common/uuid';
import { OrdersService } from '../src/modules/orders/orders.service';
import { SEA, ordersCtx, type OrdersCtx } from './orders-fixtures';

const PRICE = computeUnitPriceXof(
  {
    version: 1,
    colorId: 'x',
    zones: { front: { layers: [{ type: 'pattern', patternId: 'pat-kente-ewe' }] } },
  } as unknown as DesignSpec,
  FIXTURE_PRICE_RULES,
  FIXTURE_PATTERNS_BY_ID,
);

describe('SP04 cart and customer orders', () => {
  let t: OrdersCtx;
  let orders: OrdersService;
  const home = (addressId: string) => ({ type: 'home', addressId });

  beforeAll(async () => {
    t = await ordersCtx();
    orders = t.app.get(OrdersService);
  });
  afterAll(async () => {
    await t.app.close();
  });

  describe('cart (US-14)', () => {
    it('starts empty, requires a customer token', async () => {
      const c = await t.newCustomer();
      const res = await t
        .http()
        .get('/v1/cart')
        .set(...c.auth)
        .expect(200);
      expect(res.body).toEqual({ items: [], subtotalXof: 0, itemCount: 0 });
      await t.http().get('/v1/cart').expect(401);
      await t
        .http()
        .get('/v1/cart')
        .set(...t.adminAuth('super_admin'))
        .expect(401);
    });

    it('merges same design + size, keeps sizes apart, flags unavailable lines', async () => {
      await t.setStock('col-blanc', 'M', 1);
      await t.setStock('col-blanc', 'L', 10);
      const c = await t.newCustomer();
      const d = await t.design(c.auth, t.withColor('col-blanc'));
      expect(d.unitPriceXof).toBe(PRICE);
      await t.addToCart(c.auth, d.id, 'M', 1);
      await t.addToCart(c.auth, d.id, 'L', 2);
      const res = await t.addToCart(c.auth, d.id, 'M', 1);
      expect(res.body.items).toHaveLength(2);
      const [m, l] = res.body.items;
      expect(m).toMatchObject({
        size: 'M',
        quantity: 2,
        unitPriceXof: PRICE,
        lineTotalXof: 2 * PRICE,
        available: false,
      });
      expect(l).toMatchObject({ size: 'L', quantity: 2, available: true });
      expect(m.design.id).toBe(d.id);
      expect(res.body).toMatchObject({ subtotalXof: 4 * PRICE, itemCount: 4 });
    });

    it('refuses invalid input, foreign designs and lines over 50', async () => {
      const c = await t.newCustomer();
      const other = await t.newCustomer();
      const d = await t.design(c.auth);
      const foreign = await t.design(other.auth);
      const post = (body: object) =>
        t
          .http()
          .post('/v1/cart/items')
          .set(...c.auth)
          .send(body);
      expect((await post({ designId: d.id, size: 'M', quantity: 0 })).body.error.code).toBe(
        'VALIDATION_FAILED',
      );
      await post({ designId: d.id, size: 'XXL', quantity: 1 }).expect(400);
      await post({ designId: d.id, size: 'M', quantity: 1, unitPriceXof: 1 }).expect(400);
      await post({ designId: foreign.id, size: 'M', quantity: 1 }).expect(404);
      await post({ designId: d.id, size: 'M', quantity: 50 }).expect(200);
      await post({ designId: d.id, size: 'M', quantity: 1 }).expect(400);
      await t
        .http()
        .post('/v1/cart/items')
        .send({ designId: d.id, size: 'M', quantity: 1 })
        .expect(401);
    });

    it('updates a line (merging on size change) and deletes it; other customers get 404', async () => {
      const c = await t.newCustomer();
      const d = await t.design(c.auth);
      await t.addToCart(c.auth, d.id, 'S', 2);
      const cart = (await t.addToCart(c.auth, d.id, 'M', 3)).body;
      const s = cart.items.find((i: { size: string }) => i.size === 'S');
      const other = await t.newCustomer();
      await t
        .http()
        .patch(`/v1/cart/items/${s.id}`)
        .set(...other.auth)
        .send({ quantity: 1 })
        .expect(404);
      await t
        .http()
        .patch(`/v1/cart/items/${s.id}`)
        .set(...c.auth)
        .send({ quantity: 51 })
        .expect(400);
      await t
        .http()
        .patch(`/v1/cart/items/${s.id}`)
        .set(...c.auth)
        .send({ quantity: 4 })
        .expect(200);
      const merged = await t
        .http()
        .patch(`/v1/cart/items/${s.id}`)
        .set(...c.auth)
        .send({ size: 'M' })
        .expect(200);
      expect(merged.body.items).toHaveLength(1);
      expect(merged.body.items[0]).toMatchObject({ size: 'M', quantity: 7 });
      const id = merged.body.items[0].id;
      await t
        .http()
        .delete(`/v1/cart/items/${id}`)
        .set(...other.auth)
        .expect(404);
      const empty = await t
        .http()
        .delete(`/v1/cart/items/${id}`)
        .set(...c.auth)
        .expect(200);
      expect(empty.body.items).toEqual([]);
      await t
        .http()
        .delete('/v1/cart/items/not-a-uuid')
        .set(...c.auth)
        .expect(404);
    });

    it('quotes home delivery (zone fee, VAT, configurable production hours) and pickup', async () => {
      const s = await t.shopper({ colorId: 'col-sable', size: 'L', quantity: 2 });
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...t.adminAuth('super_admin'))
        .send({ production_hours: 24 })
        .expect(200);
      const before = Date.now();
      const q = await t
        .http()
        .post('/v1/cart/quote')
        .set(...s.auth)
        .send({ reception: home(s.addressId) })
        .expect(200);
      const totals = computeCartTotals([{ unitPriceXof: PRICE, quantity: 2 }], 1000);
      expect(q.body).toMatchObject({
        subtotalXof: totals.subtotalXof,
        deliveryFeeXof: 1000,
        totalXof: totals.totalXof,
        vatIncludedXof: totals.vatIncludedXof,
      });
      const ready = new Date(q.body.estimatedReadyAt).getTime() - before;
      expect(ready).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
      expect(ready).toBeLessThan(25 * 3_600_000);
      expect(new Date(q.body.estimatedDeliveryAt).getTime()).toBe(
        new Date(q.body.estimatedReadyAt).getTime() + 24 * 3_600_000,
      );
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...t.adminAuth('super_admin'))
        .send({ production_hours: 48 })
        .expect(200);

      const slot = await t.slot();
      const p = await t
        .http()
        .post('/v1/cart/quote')
        .set(...s.auth)
        .send({ reception: { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: slot.id } })
        .expect(200);
      expect(p.body).toMatchObject({
        deliveryFeeXof: 0,
        estimatedDeliveryAt: null,
        totalXof: totals.subtotalXof,
      });

      const far = await t.address(s.id, SEA);
      const out = await t
        .http()
        .post('/v1/cart/quote')
        .set(...s.auth)
        .send({ reception: home(far.id) })
        .expect(422);
      expect(out.body.error.code).toBe('OUT_OF_ZONE');
      await t
        .http()
        .post('/v1/cart/quote')
        .set(...s.auth)
        .send({ reception: { type: 'home' } })
        .expect(400);
      const empty = await t.newCustomer();
      const addr = await t.address(empty.id);
      await t
        .http()
        .post('/v1/cart/quote')
        .set(...empty.auth)
        .send({ reception: home(addr.id) })
        .expect(400);
      await t
        .http()
        .post('/v1/cart/quote')
        .send({ reception: home(addr.id) })
        .expect(401);
    });
  });

  describe('order creation (US-17, US-19, US-20)', () => {
    it('creates a pending order with server-side prices, reserves stock, empties the cart', async () => {
      await t.setStock('col-noir', 'M', 10);
      const s = await t.shopper({ quantity: 2 });
      t.events.length = 0;
      const res = await t
        .placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'tmoney' })
        .expect(201);
      const totals = computeCartTotals([{ unitPriceXof: PRICE, quantity: 2 }], 1000);
      expect(res.body).toMatchObject({
        status: 'pending_payment',
        subtotalXof: totals.subtotalXof,
        deliveryFeeXof: 1000,
        totalXof: totals.totalXof,
        depositXof: null,
        paymentMethod: 'tmoney',
        reception: { type: 'home', address: { id: s.addressId, zone: { name: 'Lomé centre' } } },
        history: [{ status: 'pending_payment' }],
      });
      expect(res.body.number).toMatch(/^TG-\d{6}$/);
      expect(res.body.items[0]).toMatchObject({
        colorId: 'col-noir',
        size: 'M',
        quantity: 2,
        unitPriceXof: PRICE,
        lineTotalXof: 2 * PRICE,
      });
      expect(res.body.items[0].design.spec.colorId).toBe('col-noir');
      const ttl = new Date(res.body.expiresAt).getTime() - new Date(res.body.createdAt).getTime();
      expect(ttl).toBe(30 * 60_000);

      expect(await t.stockOf('col-noir', 'M')).toMatchObject({ onHand: 10, reserved: 2 });
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.vatIncludedXof).toBe(totals.vatIncludedXof);
      expect(
        (
          await t
            .http()
            .get('/v1/cart')
            .set(...s.auth)
        ).body.items,
      ).toEqual([]);
      const created = t.events.find((e) => e.name === 'order.created');
      expect(created?.payload).toMatchObject({ orderId: res.body.id, number: res.body.number });
      expect(created?.payload.handoverCode).toMatch(/^\d{6}$/);
      const delivery = await t.prisma.delivery.findUniqueOrThrow({
        where: { orderId: res.body.id },
      });
      expect(JSON.stringify(delivery)).not.toContain(`"${String(created?.payload.handoverCode)}"`);
    });

    it('never trusts a client price: extra fields are refused, totals follow current price rules', async () => {
      await t.setStock('col-noir', 'S', 10);
      const s = await t.shopper({ size: 'S' });
      const body = { reception: home(s.addressId), paymentMethod: 'flooz' };
      await t.placeOrder(s.auth, { ...body, totalXof: 1 }).expect(400);
      await t.placeOrder(s.auth, { ...body, items: [{ unitPriceXof: 1 }] }).expect(400);
      await t.prisma.priceRule.update({ where: { key: 'base' }, data: { amountXof: 9000 } });
      try {
        const res = await t.placeOrder(s.auth, body).expect(201);
        expect(res.body.items[0].unitPriceXof).toBe(PRICE + 500);
        expect(res.body.totalXof).toBe(PRICE + 500 + 1000);
      } finally {
        await t.prisma.priceRule.update({
          where: { key: 'base' },
          data: { amountXof: FIXTURE_PRICE_RULES.baseXof },
        });
      }
    });

    it('computes the COD deposit and the balance due to the courier', async () => {
      await t.setStock('col-noir', 'L', 10);
      const s = await t.shopper({ size: 'L', quantity: 3 });
      const res = await t
        .placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'cod' })
        .expect(201);
      const total = 3 * PRICE + 1000;
      const deposit = computeDepositXof(total, 50);
      expect(res.body).toMatchObject({ totalXof: total, depositXof: deposit });
      const d = await t.prisma.delivery.findUniqueOrThrow({ where: { orderId: res.body.id } });
      expect(d.codBalanceXof).toBe(total - deposit);
      expect(await orders.paymentDue(res.body.id)).toMatchObject({
        kind: 'deposit',
        amountXof: deposit,
      });
    });

    it('books a pickup slot and snapshots store + slot', async () => {
      await t.setStock('col-noir', 'XL', 10);
      const s = await t.shopper({ size: 'XL' });
      const slot = await t.slot(1);
      const body = {
        reception: { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: slot.id },
        paymentMethod: 'card',
      };
      const res = await t.placeOrder(s.auth, body).expect(201);
      expect(res.body).toMatchObject({
        deliveryFeeXof: 0,
        reception: { type: 'pickup', store: { id: FIXTURE_STORE.id }, slot: { id: slot.id } },
      });
      expect((await t.prisma.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).booked).toBe(
        1,
      );
      expect(
        t.events.some(
          (e) =>
            e.name === 'order.created' &&
            e.payload.orderId === res.body.id &&
            /^\d{6}$/.test(String(e.payload.pickupCode)),
        ),
      ).toBe(true);
    });

    it('refuses with 409 OUT_OF_STOCK listing the lines, without side effects', async () => {
      await t.setStock('col-indigo', 'M', 1);
      const s = await t.shopper({ colorId: 'col-indigo', size: 'M', quantity: 2 });
      const slot = await t.slot(1);
      const res = await t
        .placeOrder(s.auth, {
          reception: { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: slot.id },
          paymentMethod: 'tmoney',
        })
        .expect(409);
      expect(res.body.error.code).toBe('OUT_OF_STOCK');
      const cart = (
        await t
          .http()
          .get('/v1/cart')
          .set(...s.auth)
      ).body;
      expect(cart.items[0].available).toBe(false);
      expect(res.body.error.details.items).toEqual([
        {
          cartItemId: cart.items[0].id,
          designId: s.design.id,
          colorId: 'col-indigo',
          size: 'M',
          requested: 2,
          available: 1,
        },
      ]);
      expect(await t.stockOf('col-indigo', 'M')).toMatchObject({ onHand: 1, reserved: 0 });
      expect((await t.prisma.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).booked).toBe(
        0,
      );
      expect(await t.prisma.order.count({ where: { userId: s.id } })).toBe(0);
    });

    it('refuses an empty cart, a disabled payment method, a missing or invalid key, inactive patterns', async () => {
      const c = await t.newCustomer();
      const addr = await t.address(c.id);
      await t.placeOrder(c.auth, { reception: home(addr.id), paymentMethod: 'tmoney' }).expect(400);
      await t.setStock('col-noir', 'XS', 5);
      const s = await t.shopper({ size: 'XS' });
      const body = { reception: home(s.addressId), paymentMethod: 'cod' };
      await t
        .http()
        .post('/v1/orders')
        .set(...s.auth)
        .send(body)
        .expect(400);
      await t.placeOrder(s.auth, body, 'not-a-uuid').expect(400);
      await t.placeOrder(s.auth, { ...body, paymentMethod: 'cash' }).expect(400);
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...t.adminAuth('super_admin'))
        .send({ payment_methods_enabled: ['tmoney'] })
        .expect(200);
      await t.placeOrder(s.auth, body).expect(400);
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...t.adminAuth('super_admin'))
        .send({ payment_methods_enabled: ['tmoney', 'flooz', 'card', 'cod'] })
        .expect(200);
      await t.prisma.pattern.update({ where: { id: 'pat-kente-ewe' }, data: { active: false } });
      try {
        const res = await t.placeOrder(s.auth, body).expect(422);
        expect(res.body.error.code).toBe('PATTERN_INACTIVE');
      } finally {
        await t.prisma.pattern.update({ where: { id: 'pat-kente-ewe' }, data: { active: true } });
      }
      await t.http().post('/v1/orders').set('Idempotency-Key', uuidv7()).send(body).expect(401);
    });
  });

  describe('idempotency', () => {
    it('replays the same order for the same key and body, without double reservation', async () => {
      await t.setStock('col-terracotta', 'M', 10);
      const s = await t.shopper({ colorId: 'col-terracotta', size: 'M', quantity: 2 });
      const key = uuidv7();
      const body = { reception: home(s.addressId), paymentMethod: 'tmoney' };
      const first = await t.placeOrder(s.auth, body, key).expect(201);
      const again = await t.placeOrder(s.auth, body, key).expect(201);
      expect(again.body).toEqual(first.body);
      expect(await t.stockOf('col-terracotta', 'M')).toMatchObject({ reserved: 2 });
      const conflict = await t
        .placeOrder(s.auth, { ...body, paymentMethod: 'flooz' }, key)
        .expect(409);
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      const other = await t.shopper({ colorId: 'col-terracotta', size: 'M' });
      await t
        .placeOrder(other.auth, { reception: home(other.addressId), paymentMethod: 'tmoney' }, key)
        .expect(409);
    });

    it('creates a single order when the same key is sent concurrently', async () => {
      await t.setStock('col-terracotta', 'L', 10);
      const s = await t.shopper({ colorId: 'col-terracotta', size: 'L', quantity: 3 });
      const key = uuidv7();
      const body = { reception: home(s.addressId), paymentMethod: 'tmoney' };
      const results = await Promise.all(
        Array.from({ length: 5 }, () => t.placeOrder(s.auth, body, key)),
      );
      for (const r of results) expect(r.status).toBe(201);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await t.prisma.order.count({ where: { userId: s.id } })).toBe(1);
      expect(await t.stockOf('col-terracotta', 'L')).toMatchObject({ onHand: 10, reserved: 3 });
      expect(await t.prisma.stockMovement.count({ where: { orderId: results[0]?.body.id } })).toBe(
        1,
      );
    });
  });

  describe('concurrency (US-19)', () => {
    it('20 simultaneous orders for 5 pieces: exactly 5 succeed, 15 get 409 OUT_OF_STOCK', async () => {
      await t.setStock('col-sable', 'XS', 5);
      const shoppers = await Promise.all(
        Array.from({ length: 20 }, () => t.shopper({ colorId: 'col-sable', size: 'XS' })),
      );
      const results = await Promise.all(
        shoppers.map((s) =>
          t.placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'tmoney' }),
        ),
      );
      const ok = results.filter((r) => r.status === 201);
      const ko = results.filter((r) => r.status === 409);
      expect(ok).toHaveLength(5);
      expect(ko).toHaveLength(15);
      for (const r of ko) expect(r.body.error.code).toBe('OUT_OF_STOCK');
      const item = await t.stockOf('col-sable', 'XS');
      expect(item).toMatchObject({ onHand: 5, reserved: 5 });
      expect(
        await t.prisma.stockMovement.count({ where: { stockItemId: item.id, type: 'reserve' } }),
      ).toBe(5);
      expect(
        await t.prisma.delivery.count({ where: { orderId: { in: ok.map((r) => r.body.id) } } }),
      ).toBe(5);
      expect(
        await t.prisma.order.count({ where: { userId: { in: shoppers.map((s) => s.id) } } }),
      ).toBe(5);
    });
  });

  describe('expiry (US-18)', () => {
    it('expires unpaid orders after order_expiry_minutes (simulated clock) and releases stock and slot', async () => {
      await t.setStock('col-blanc', 'XS', 4);
      const s = await t.shopper({ colorId: 'col-blanc', size: 'XS', quantity: 3 });
      const slot = await t.slot(2);
      const created = new Date(Date.now() - 60 * 60_000);
      const order = await orders.create(
        s.id,
        {
          reception: { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: slot.id },
          paymentMethod: 'tmoney',
        },
        uuidv7(),
        created,
      );
      expect(await t.stockOf('col-blanc', 'XS')).toMatchObject({ reserved: 3 });
      expect(await orders.expireDue(new Date(created.getTime() + 29 * 60_000))).toBe(0);
      t.events.length = 0;
      expect(
        await orders.expireDue(new Date(created.getTime() + 30 * 60_000)),
      ).toBeGreaterThanOrEqual(1);
      const after = await t
        .http()
        .get(`/v1/orders/${order.id}`)
        .set(...s.auth)
        .expect(200);
      expect(after.body.status).toBe('expired');
      expect(after.body.history.map((h: { status: string }) => h.status)).toEqual([
        'pending_payment',
        'expired',
      ]);
      expect(after.body.reception.type).toBe('pickup');
      expect(await t.stockOf('col-blanc', 'XS')).toMatchObject({ onHand: 4, reserved: 0 });
      expect((await t.prisma.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).booked).toBe(
        0,
      );
      expect(t.events.map((e) => e.name)).toEqual(
        expect.arrayContaining(['order.expired', 'order.status_changed']),
      );
      expect(await orders.expireDue(new Date(created.getTime() + 31 * 60_000))).toBe(0);
      await expect(
        orders.applyPaymentResult(order.id, { succeeded: true, kind: 'full' }, t.prisma),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('also expires failed-payment orders past their deadline, releasing stock and slot', async () => {
      await t.setStock('col-blanc', 'S', 2);
      const s = await t.shopper({ colorId: 'col-blanc', size: 'S', quantity: 2 });
      const slot = await t.slot(1);
      const created = new Date(Date.now() - 2 * 60 * 60_000);
      const order = await orders.create(
        s.id,
        {
          reception: { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: slot.id },
          paymentMethod: 'flooz',
        },
        uuidv7(),
        created,
      );
      await orders.runInTransaction((tx) =>
        orders.applyPaymentResult(order.id, { succeeded: false }, tx),
      );
      expect(await t.stockOf('col-blanc', 'S')).toMatchObject({ onHand: 2, reserved: 2 });
      expect(await orders.expireDue(new Date(created.getTime() + 29 * 60_000))).toBe(0);
      expect(await orders.expireDue(new Date(created.getTime() + 30 * 60_000))).toBe(1);
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.status).toBe('expired');
      expect(await t.stockOf('col-blanc', 'S')).toMatchObject({ onHand: 2, reserved: 0 });
      expect((await t.prisma.pickupSlot.findUniqueOrThrow({ where: { id: slot.id } })).booked).toBe(
        0,
      );
      await expect(
        orders.transition(order.id, 'pending_payment', { type: 'customer', id: s.id }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('payment result, tracking and receipt (US-18, US-20, US-23)', () => {
    it('moves stock from reserved to out on success and serves the PDF receipt', async () => {
      await t.setStock('col-indigo', 'L', 6);
      const s = await t.shopper({ colorId: 'col-indigo', size: 'L', quantity: 2 });
      const order = (
        await t
          .placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'tmoney' })
          .expect(201)
      ).body;
      await t
        .http()
        .get(`/v1/orders/${order.id}/receipt.pdf`)
        .set(...s.auth)
        .expect(404);
      await expect(
        orders.runInTransaction((tx) =>
          orders.applyPaymentResult(order.id, { succeeded: true, kind: 'deposit' }, tx),
        ),
      ).rejects.toMatchObject({ status: 409 });
      t.events.length = 0;
      await orders.runInTransaction((tx) =>
        orders.applyPaymentResult(order.id, { succeeded: true, kind: 'full' }, tx),
      );
      expect(await t.stockOf('col-indigo', 'L')).toMatchObject({ onHand: 4, reserved: 0 });
      expect(t.events.map((e) => e.name)).toEqual(
        expect.arrayContaining(['order.status_changed', 'design.ordered']),
      );
      const got = await t
        .http()
        .get(`/v1/orders/${order.id}`)
        .set(...s.auth)
        .expect(200);
      expect(got.body).toMatchObject({ status: 'paid', expiresAt: null });
      expect(got.body.history.map((h: { status: string }) => h.status)).toEqual([
        'pending_payment',
        'paid',
      ]);
      const pdf = await t
        .http()
        .get(`/v1/orders/${order.id}/receipt.pdf`)
        .set(...s.auth)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      const other = await t.newCustomer();
      await t
        .http()
        .get(`/v1/orders/${order.id}/receipt.pdf`)
        .set(...other.auth)
        .expect(404);
      await t.http().get(`/v1/orders/${order.id}/receipt.pdf`).expect(401);
      await expect(
        orders.runInTransaction((tx) =>
          orders.applyPaymentResult(order.id, { succeeded: true, kind: 'full' }, tx),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('marks failed payments, lets the customer retry with a fresh expiry', async () => {
      await t.setStock('col-indigo', 'S', 3);
      const s = await t.shopper({ colorId: 'col-indigo', size: 'S' });
      const order = (
        await t
          .placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'cod' })
          .expect(201)
      ).body;
      await orders.runInTransaction((tx) =>
        orders.applyPaymentResult(order.id, { succeeded: false }, tx),
      );
      expect(
        (
          await t
            .http()
            .get(`/v1/orders/${order.id}`)
            .set(...s.auth)
        ).body,
      ).toMatchObject({ status: 'payment_failed', expiresAt: order.expiresAt });
      await orders.transition(order.id, 'pending_payment', { type: 'customer', id: s.id });
      const retried = (
        await t
          .http()
          .get(`/v1/orders/${order.id}`)
          .set(...s.auth)
      ).body;
      expect(retried.status).toBe('pending_payment');
      expect(new Date(retried.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);
      await orders.runInTransaction((tx) =>
        orders.applyPaymentResult(order.id, { succeeded: true, kind: 'deposit' }, tx),
      );
      expect(
        (
          await t
            .http()
            .get(`/v1/orders/${order.id}`)
            .set(...s.auth)
        ).body.status,
      ).toBe('deposit_paid');
      expect(await t.stockOf('col-indigo', 'S')).toMatchObject({ onHand: 2, reserved: 0 });
    });

    it('lists own orders with cursor pagination and hides others', async () => {
      await t.setStock('col-terracotta', 'XS', 10);
      const s = await t.shopper({ colorId: 'col-terracotta', size: 'XS' });
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        if (i > 0) await t.addToCart(s.auth, s.design.id, 'XS', 1);
        ids.push(
          (
            await t
              .placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'tmoney' })
              .expect(201)
          ).body.id,
        );
      }
      const p1 = await t
        .http()
        .get('/v1/orders?limit=2')
        .set(...s.auth)
        .expect(200);
      expect(p1.body.items.map((o: { id: string }) => o.id)).toEqual([ids[2], ids[1]]);
      expect(p1.body.items[0]).toMatchObject({
        status: 'pending_payment',
        itemCount: 1,
        paymentMethod: 'tmoney',
      });
      const p2 = await t
        .http()
        .get(`/v1/orders?limit=2&cursor=${p1.body.nextCursor}`)
        .set(...s.auth)
        .expect(200);
      expect(p2.body).toMatchObject({ items: [{ id: ids[0] }], nextCursor: null });
      await t
        .http()
        .get('/v1/orders?cursor=bogus')
        .set(...s.auth)
        .expect(400);
      await t
        .http()
        .get('/v1/orders?limit=500')
        .set(...s.auth)
        .expect(400);
      const other = await t.newCustomer();
      expect(
        (
          await t
            .http()
            .get('/v1/orders')
            .set(...other.auth)
        ).body.items,
      ).toEqual([]);
      await t
        .http()
        .get(`/v1/orders/${ids[0]}`)
        .set(...other.auth)
        .expect(404);
      await t.http().get('/v1/orders').expect(401);
    });
  });

  describe('reorder and design deletion (US-27)', () => {
    it('re-adds lines at current prices, copying a design edited since the order', async () => {
      await t.setStock('col-noir', '2XL', 10);
      const s = await t.shopper({ size: '2XL', quantity: 2 });
      const order = (
        await t
          .placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'tmoney' })
          .expect(201)
      ).body;
      const cart = await t
        .http()
        .post(`/v1/orders/${order.id}/reorder`)
        .set(...s.auth)
        .expect(200);
      expect(cart.body.items).toEqual([
        expect.objectContaining({ size: '2XL', quantity: 2, unitPriceXof: PRICE }),
      ]);
      expect(cart.body.items[0].design.id).toBe(s.design.id);
      await t
        .http()
        .patch(`/v1/designs/${s.design.id}`)
        .set(...s.auth)
        .send({ spec: t.withColor('col-noir', 'patternAndText') })
        .expect(200);
      const again = await t
        .http()
        .post(`/v1/orders/${order.id}/reorder`)
        .set(...s.auth)
        .expect(200);
      expect(again.body.items).toHaveLength(2);
      const copy = again.body.items.find(
        (i: { design: { id: string } }) => i.design.id !== s.design.id,
      );
      expect(copy.design.spec).toEqual(order.items[0].design.spec);
      const other = await t.newCustomer();
      await t
        .http()
        .post(`/v1/orders/${order.id}/reorder`)
        .set(...other.auth)
        .expect(404);
      await t.http().post(`/v1/orders/${order.id}/reorder`).expect(401);
    });

    it('refuses to delete a design used in a cart or an order (409 DESIGN_IN_USE)', async () => {
      await t.setStock('col-noir', 'M', 10);
      const s = await t.shopper();
      const inCart = await t
        .http()
        .delete(`/v1/designs/${s.design.id}`)
        .set(...s.auth)
        .expect(409);
      expect(inCart.body.error.code).toBe('DESIGN_IN_USE');
      await t
        .placeOrder(s.auth, { reception: home(s.addressId), paymentMethod: 'tmoney' })
        .expect(201);
      expect(
        (
          await t
            .http()
            .delete(`/v1/designs/${s.design.id}`)
            .set(...s.auth)
            .expect(409)
        ).body.error.code,
      ).toBe('DESIGN_IN_USE');
      const unused = await t.design(s.auth);
      await t
        .http()
        .delete(`/v1/designs/${unused.id}`)
        .set(...s.auth)
        .expect(204);
    });
  });
  describe('codDepositXof and estimated dates (complement)', () => {
    it('quotes codDepositXof with the shared deposit rule, 0 when the percent is 0', async () => {
      const s = await t.shopper({ colorId: 'col-sable', size: 'M', quantity: 3 });
      const admin = t.adminAuth('super_admin');
      const quote = () =>
        t
          .http()
          .post('/v1/cart/quote')
          .set(...s.auth)
          .send({ reception: home(s.addressId) })
          .expect(200);
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...admin)
        .send({ cod_deposit_percent: 30 })
        .expect(200);
      const q = await quote();
      expect(q.body.codDepositXof).toBe(computeCodDepositXof(q.body.totalXof, 30));
      expect(q.body.codDepositXof).toBe(computeDepositXof(q.body.totalXof, 30));
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...admin)
        .send({ cod_deposit_percent: 0 })
        .expect(200);
      expect((await quote()).body.codDepositXof).toBe(0);
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...admin)
        .send({ cod_deposit_percent: 50 })
        .expect(200);
    });

    it('freezes the estimates at order creation and exposes them on the order', async () => {
      await t.setStock('col-sable', 'M', 50);
      const s = await t.shopper({ colorId: 'col-sable', size: 'M' });
      const q = await t
        .http()
        .post('/v1/cart/quote')
        .set(...s.auth)
        .send({ reception: home(s.addressId) })
        .expect(200);
      const res = await t.placeOrder(s.auth, {
        reception: home(s.addressId),
        paymentMethod: 'cod',
      });
      expect(res.status).toBe(201);
      expect(res.body.depositXof).toBe(q.body.codDepositXof);
      const ready = new Date(res.body.estimatedReadyAt).getTime();
      const gap = ready - new Date(q.body.estimatedReadyAt).getTime();
      expect(Math.abs(gap)).toBeLessThan(5000);
      expect(new Date(res.body.estimatedDeliveryAt).getTime()).toBe(ready + 24 * 3_600_000);
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...t.adminAuth('super_admin'))
        .send({ production_hours: 72 })
        .expect(200);
      const again = await t
        .http()
        .get(`/v1/orders/${res.body.id}`)
        .set(...s.auth)
        .expect(200);
      expect(again.body.estimatedReadyAt).toBe(res.body.estimatedReadyAt);
      expect(again.body.estimatedDeliveryAt).toBe(res.body.estimatedDeliveryAt);
      await t
        .http()
        .patch('/v1/admin/settings')
        .set(...t.adminAuth('super_admin'))
        .send({ production_hours: 48 })
        .expect(200);
    });

    it('pickup orders have a ready date equal to the slot start and no delivery date; legacy rows give null', async () => {
      await t.setStock('col-sable', 'M', 50);
      const s = await t.shopper({ colorId: 'col-sable', size: 'M' });
      const slot = await t.slot();
      const res = await t.placeOrder(s.auth, {
        reception: { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: slot.id },
        paymentMethod: 'tmoney',
      });
      expect(res.status).toBe(201);
      expect(res.body.estimatedReadyAt).toBe(slot.startsAt.toISOString());
      expect(res.body.estimatedDeliveryAt).toBeNull();
      await t.prisma.order.update({
        where: { id: res.body.id },
        data: { estimatedReadyAt: null, estimatedDeliveryAt: null },
      });
      const old = await t
        .http()
        .get(`/v1/orders/${res.body.id}`)
        .set(...s.auth)
        .expect(200);
      expect(old.body).toMatchObject({ estimatedReadyAt: null, estimatedDeliveryAt: null });
    });
  });
});
