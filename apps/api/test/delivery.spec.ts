import type { INestApplication } from '@nestjs/common';
import type { ReceptionInput } from '@streetwear/shared';
import request from 'supertest';
import { uuidv7 } from '../src/common/uuid';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { FakeOrderTransitionPort } from '../src/modules/delivery/order-transition.port';
import { SlotsService, hoursFor } from '../src/modules/delivery/slots.service';
import { SEED_ZONES, seedDelivery } from '../src/modules/delivery/seed';
import { PrismaService } from '../src/prisma/prisma.service';
import { FIXTURE_STORE } from '@streetwear/shared';
import { type AuthHeader, buildApp, createAdmin, type TestCtx } from './helpers';

const TOKOIN = { lat: 6.145, lng: 1.215 };
const SEA = { lat: 6.0, lng: 1.22 };

describe('SP06 delivery and pickup', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: TestCtx;
  let adminAuth: (r: 'logistics' | 'courier' | 'super_admin' | 'order_manager') => AuthHeader;
  let newCustomer: () => Promise<{ id: string; auth: AuthHeader }>;
  let svc: DeliveryService;
  let port: FakeOrderTransitionPort;
  const http = () => request(app.getHttpServer());
  const FUTURE = Date.now() + 3 * 86_400_000;

  async function address(userId: string, p: { lat: number; lng: number }) {
    return prisma.address.create({
      data: {
        id: uuidv7(),
        userId,
        label: 'Maison',
        district: 'Tokoin',
        landmark: 'Près du marché',
        recipientPhone: '+22890123456',
        ...p,
      },
    });
  }

  let slotSeq = 0;
  async function slot(capacity: number, startsAt = new Date(FUTURE + 60_000 * ++slotSeq)) {
    return prisma.pickupSlot.create({
      data: {
        id: uuidv7(),
        storeId: FIXTURE_STORE.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        capacity,
      },
    });
  }

  async function courier() {
    const { admin, token } = await createAdmin(ctx, 'courier');
    const row = await prisma.courier.create({
      data: { id: uuidv7(), adminUserId: admin.id, phone: '+22890000001' },
    });
    return { courierId: row.id, auth: ['Authorization', `Bearer ${token}`] as AuthHeader };
  }

  async function homeDelivery(codBalanceXof: number | null = null) {
    const customer = await newCustomer();
    const addr = await address(customer.id, TOKOIN);
    const orderId = uuidv7();
    const reception: ReceptionInput = { type: 'home', addressId: addr.id };
    const r = await prisma.$transaction((tx) =>
      svc.reserve(reception, { orderId, userId: customer.id, codBalanceXof }, tx),
    );
    if (r.type !== 'home') throw new Error('unexpected');
    return { id: r.deliveryId, code: r.handoverCode, orderId };
  }

  beforeAll(async () => {
    const built = await buildApp();
    ({ app, prisma, ctx, newCustomer } = built);
    adminAuth = built.adminAuth;
    svc = app.get(DeliveryService);
    port = app.get(FakeOrderTransitionPort);
    await prisma.$executeRawUnsafe(
      'TRUNCATE deliveries, pickups, pickup_slots, stores, couriers, delivery_zones CASCADE',
    );
    await seedDelivery(prisma);
    await seedDelivery(prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('zones (US-21)', () => {
    it('seeds 3 zones and 1 store idempotently', async () => {
      expect(await prisma.deliveryZone.count()).toBe(SEED_ZONES.length);
      expect(await prisma.store.count()).toBe(1);
      expect((await prisma.store.findFirstOrThrow()).name).toBe('[Nom de la boutique]');
    });

    it('resolves Tokoin to Lomé centre and the most specific zone elsewhere', async () => {
      const res = await http().get('/v1/delivery/zones/resolve').query(TOKOIN).expect(200);
      expect(res.body).toMatchObject({ name: 'Lomé centre', feeXof: 1000, delayHours: 24 });
      const agoe = await http().get('/v1/delivery/zones/resolve').query({ lat: 6.22, lng: 1.22 });
      expect(agoe.body.name).toBe('Lomé périphérie');
      const baguida = await http()
        .get('/v1/delivery/zones/resolve')
        .query({ lat: 6.13, lng: 1.33 });
      expect(baguida.body).toMatchObject({ name: 'Grand Lomé', feeXof: 2500 });
    });

    it('returns 404 at sea and 400 on invalid coordinates', async () => {
      const sea = await http().get('/v1/delivery/zones/resolve').query(SEA).expect(404);
      expect(sea.body.error.code).toBe('NOT_FOUND');
      await http().get('/v1/delivery/zones/resolve').query({ lat: 'x', lng: 1 }).expect(400);
      await http().get('/v1/delivery/zones/resolve').expect(400);
    });

    it('fills Address.zone on creation', async () => {
      const c = await newCustomer();
      const body = {
        label: 'Maison',
        ...TOKOIN,
        district: 'Tokoin',
        landmark: 'Près du marché',
        recipientPhone: '+22890123456',
      };
      const res = await http()
        .post('/v1/me/addresses')
        .set(...c.auth)
        .send(body)
        .expect(201);
      expect(res.body.zone).toMatchObject({ name: 'Lomé centre' });
      const out = await http()
        .post('/v1/me/addresses')
        .set(...c.auth)
        .send({ ...body, ...SEA });
      expect(out.body.zone).toBeNull();
    });
  });

  describe('admin zones, stores, slots (US-28, US-29)', () => {
    const ROUTES: [string, string][] = [
      ['get', '/v1/admin/delivery-zones'],
      ['post', '/v1/admin/delivery-zones'],
      ['patch', `/v1/admin/delivery-zones/${uuidv7()}`],
      ['get', '/v1/admin/stores'],
      ['post', '/v1/admin/stores'],
      ['patch', `/v1/admin/stores/${uuidv7()}`],
      ['get', `/v1/admin/stores/${uuidv7()}/slots`],
      ['post', `/v1/admin/stores/${uuidv7()}/slots`],
      ['get', '/v1/admin/deliveries'],
      ['post', `/v1/admin/deliveries/${uuidv7()}/assign`],
    ];
    const send = (m: string, u: string) =>
      (http() as unknown as Record<string, (x: string) => request.Test>)[m]?.(u) as request.Test;

    it.each(ROUTES)('refuses anonymous and customer on %s %s', async (m, u) => {
      expect((await send(m, u).send({})).status).toBe(401);
      const c = await newCustomer();
      expect(
        (
          await send(m, u)
            .set(...c.auth)
            .send({})
        ).status,
      ).toBe(401);
    });

    it.each(ROUTES)('refuses courier and order_manager on %s %s', async (m, u) => {
      for (const role of ['courier', 'order_manager'] as const) {
        const res = await send(m, u)
          .set(...adminAuth(role))
          .send({});
        expect(res.status).toBe(403);
      }
    });

    it('creates a zone from a GeoJSON Feature, then resolves into it', async () => {
      const feature = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-10, -10],
              [-9, -10],
              [-9, -9],
              [-10, -9],
              [-10, -10],
            ],
          ],
        },
      };
      const res = await http()
        .post('/v1/admin/delivery-zones')
        .set(...adminAuth('logistics'))
        .send({ name: 'Test', polygon: feature, feeXof: 500, delayHours: 12 })
        .expect(201);
      const patched = await http()
        .patch(`/v1/admin/delivery-zones/${res.body.id}`)
        .set(...adminAuth('logistics'))
        .send({ feeXof: 700 })
        .expect(200);
      expect(patched.body.feeXof).toBe(700);
      const hit = await http().get('/v1/delivery/zones/resolve').query({ lat: -9.5, lng: -9.5 });
      expect(hit.body).toMatchObject({ name: 'Test', feeXof: 700 });
      await http()
        .patch(`/v1/admin/delivery-zones/${res.body.id}`)
        .set(...adminAuth('logistics'))
        .send({ active: false })
        .expect(200);
      await http().get('/v1/delivery/zones/resolve').query({ lat: -9.5, lng: -9.5 }).expect(404);
    });

    it('rejects invalid zones and stores', async () => {
      const h = adminAuth('logistics');
      const bad = await http()
        .post('/v1/admin/delivery-zones')
        .set(...h)
        .send({
          name: '',
          polygon: { type: 'Polygon', coordinates: [] },
          feeXof: -1.5,
          delayHours: 1,
        });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      const store = await http()
        .post('/v1/admin/stores')
        .set(...h)
        .send({ name: 'B', address: 'A', lat: 6, lng: 1, openingHours: { lundi: '9h' } });
      expect(store.status).toBe(400);
    });

    it('generates 1-hour slots over 14 days, idempotently, and exposes only open ones', async () => {
      const h = adminAuth('logistics');
      const created = await http()
        .post('/v1/admin/stores')
        .set(...h)
        .send({
          name: 'Boutique 2',
          address: 'Rue 1',
          lat: 6.13,
          lng: 1.21,
          openingHours: { 'lun-sam': '09:00-12:00', dim: 'fermé' },
          defaultSlotCapacity: 2,
        })
        .expect(201);
      const sid = created.body.id as string;
      const first = await http()
        .post(`/v1/admin/stores/${sid}/slots`)
        .set(...h)
        .send({})
        .expect(201);
      const open = await prisma.pickupSlot.count({ where: { storeId: sid } });
      expect(first.body.created).toBe(open);
      expect(open).toBeGreaterThanOrEqual(30);
      expect(open).toBeLessThanOrEqual(42);
      const again = await http()
        .post(`/v1/admin/stores/${sid}/slots`)
        .set(...h)
        .send({});
      expect(again.body.created).toBe(0);

      const one = await prisma.pickupSlot.findFirstOrThrow({
        where: { storeId: sid },
        orderBy: { startsAt: 'asc' },
      });
      const date = one.startsAt.toISOString().slice(0, 10);
      const list = await http().get(`/v1/stores/${sid}/slots`).query({ date }).expect(200);
      expect(list.body.length).toBeGreaterThan(0);
      expect(list.body[0]).toEqual({
        id: expect.any(String),
        startsAt: expect.any(String),
        endsAt: expect.any(String),
        remaining: 2,
      });
      await prisma.pickupSlot.update({ where: { id: one.id }, data: { booked: 2 } });
      const after = await http().get(`/v1/stores/${sid}/slots`).query({ date });
      expect(after.body.map((s: { id: string }) => s.id)).not.toContain(one.id);

      const patch = await http()
        .patch(`/v1/admin/stores/${sid}/slots/${one.id}`)
        .set(...h)
        .send({ capacity: 1 });
      expect(patch.status).toBe(400);
      await http().get(`/v1/stores/${sid}/slots`).query({ date: 'hier' }).expect(400);
      await http().get(`/v1/stores/${uuidv7()}/slots`).query({ date }).expect(404);
    });

    it('lists active stores publicly', async () => {
      const res = await http().get('/v1/stores').expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('openingHours');
    });

    it('computes opening hours and generation counts', async () => {
      expect(hoursFor({ 'lun-sam': '09:00-19:00', dim: 'fermé' }, 1)).toEqual({
        open: 540,
        close: 1140,
      });
      expect(hoursFor({ 'lun-sam': '09:00-19:00', dim: 'fermé' }, 0)).toBeNull();
      expect(hoursFor({ 'lun-sam': '09:00-19:00', mer: '10:00-12:00' }, 3)).toEqual({
        open: 600,
        close: 720,
      });
      const s = await prisma.store.create({
        data: {
          id: uuidv7(),
          name: 'Gen',
          address: 'x',
          lat: 6,
          lng: 1,
          openingHours: { 'lun-sam': '09:00-19:00', dim: 'fermé' },
        },
      });
      const now = new Date('2026-11-02T00:00:00Z');
      expect(await app.get(SlotsService).generate(s.id, { now })).toBe(120);
    });
  });

  describe('quote and reserve (DeliveryService)', () => {
    it('quotes home delivery and rejects out-of-zone addresses', async () => {
      const c = await newCustomer();
      const ok = await address(c.id, TOKOIN);
      const q = await svc.quote({ type: 'home', addressId: ok.id }, c.id);
      expect(q.deliveryFeeXof).toBe(1000);
      expect(q.estimatedDeliveryAt).not.toBeNull();
      const far = await address(c.id, SEA);
      await expect(svc.quote({ type: 'home', addressId: far.id }, c.id)).rejects.toMatchObject({
        status: 422,
      });
      const other = await newCustomer();
      await expect(svc.quote({ type: 'home', addressId: ok.id }, other.id)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('quotes pickup, refusing full and unknown slots', async () => {
      const c = await newCustomer();
      const s = await slot(1);
      const q = await svc.quote({ type: 'pickup', storeId: FIXTURE_STORE.id, slotId: s.id }, c.id);
      expect(q).toMatchObject({ deliveryFeeXof: 0, estimatedDeliveryAt: null });
      await prisma.pickupSlot.update({ where: { id: s.id }, data: { booked: 1 } });
      await expect(
        svc.quote({ type: 'pickup', storeId: FIXTURE_STORE.id, slotId: s.id }, c.id),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        svc.quote({ type: 'pickup', storeId: FIXTURE_STORE.id, slotId: uuidv7() }, c.id),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lets exactly 4 of 10 simultaneous reservations succeed on a capacity-4 slot', async () => {
      const s = await slot(4);
      const reception: ReceptionInput = { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: s.id };
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          prisma.$transaction((tx) =>
            svc.reserve(reception, { orderId: uuidv7(), userId: uuidv7() }, tx),
          ),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled');
      const ko = results.filter((r) => r.status === 'rejected');
      expect(ok).toHaveLength(4);
      expect(ko).toHaveLength(6);
      for (const r of ko) {
        expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
        expect(JSON.stringify((r as PromiseRejectedResult).reason.getResponse())).toContain(
          'SLOT_FULL',
        );
      }
      expect((await prisma.pickupSlot.findUniqueOrThrow({ where: { id: s.id } })).booked).toBe(4);
      expect(await prisma.pickup.count({ where: { slotId: s.id } })).toBe(4);
    });

    it('releases a pickup and a delivery idempotently, without storing codes in clear', async () => {
      const s = await slot(2);
      const orderId = uuidv7();
      const r = await prisma.$transaction((tx) =>
        svc.reserve(
          { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: s.id },
          { orderId, userId: uuidv7() },
          tx,
        ),
      );
      if (r.type !== 'pickup') throw new Error('unexpected');
      const row = await prisma.pickup.findUniqueOrThrow({ where: { orderId } });
      expect(JSON.stringify(row)).not.toContain(r.pickupCode);
      await prisma.$transaction((tx) => svc.release(orderId, tx));
      await prisma.$transaction((tx) => svc.release(orderId, tx));
      expect((await prisma.pickupSlot.findUniqueOrThrow({ where: { id: s.id } })).booked).toBe(0);

      const d = await homeDelivery();
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: d.id } });
      expect(JSON.stringify(stored)).not.toContain(`"${d.code}"`);
      expect(stored.handoverCodeHash).toMatch(/^[0-9a-f]{64}$/);
      await prisma.$transaction((tx) => svc.release(d.orderId, tx));
      expect(await prisma.delivery.count({ where: { id: d.id } })).toBe(0);
    });

    it('rolls back the slot booking when the surrounding transaction fails', async () => {
      const s = await slot(1);
      await expect(
        prisma.$transaction(async (tx) => {
          await svc.reserve(
            { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: s.id },
            { orderId: uuidv7(), userId: uuidv7() },
            tx,
          );
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect((await prisma.pickupSlot.findUniqueOrThrow({ where: { id: s.id } })).booked).toBe(0);
    });
  });

  describe('assignment and courier (US-28)', () => {
    it('assigns a courier; admin payload never exposes the code or its hash', async () => {
      const c = await courier();
      const d = await homeDelivery();
      const h = adminAuth('logistics');
      const res = await http()
        .post(`/v1/admin/deliveries/${d.id}/assign`)
        .set(...h)
        .send({ courierId: c.courierId })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'assigned', courierId: c.courierId });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(d.code);
      expect(text).not.toMatch(/hash|handoverCode"/i);
      const date = new Date(res.body.scheduledFor).toISOString().slice(0, 10);
      const list = await http()
        .get('/v1/admin/deliveries')
        .query({ date })
        .set(...h)
        .expect(200);
      expect(list.body.map((x: { id: string }) => x.id)).toContain(d.id);
      expect(JSON.stringify(list.body)).not.toMatch(/hash/i);
      await http()
        .post(`/v1/admin/deliveries/${d.id}/assign`)
        .set(...h)
        .send({ courierId: uuidv7() })
        .expect(404);
      await http()
        .post(`/v1/admin/deliveries/${d.id}/assign`)
        .set(...h)
        .send({})
        .expect(400);
    });

    it('shows a courier only their own deliveries', async () => {
      const a = await courier();
      const b = await courier();
      const da = await homeDelivery();
      const db = await homeDelivery();
      const h = adminAuth('logistics');
      for (const [d, c] of [
        [da, a],
        [db, b],
      ] as const) {
        await http()
          .post(`/v1/admin/deliveries/${d.id}/assign`)
          .set(...h)
          .send({ courierId: c.courierId })
          .expect(200);
      }
      const date = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      const mine = await http()
        .get('/v1/courier/deliveries')
        .query({ date })
        .set(...a.auth)
        .expect(200);
      expect(mine.body.map((x: { id: string }) => x.id)).toEqual([da.id]);
      expect(mine.body[0]).toMatchObject({
        status: 'assigned',
        codBalanceXof: null,
        address: { district: 'Tokoin', zone: { name: 'Lomé centre' } },
      });
      expect(JSON.stringify(mine.body)).not.toMatch(/hash|handoverCode/i);
      await http()
        .post(`/v1/courier/deliveries/${db.id}/start`)
        .set(...a.auth)
        .expect(404);
      await http()
        .post(`/v1/courier/deliveries/${db.id}/complete`)
        .set(...a.auth)
        .send({ handoverCode: db.code })
        .expect(404);
      await http().get('/v1/courier/deliveries').expect(401);
      await http()
        .get('/v1/courier/deliveries')
        .set(...adminAuth('logistics'))
        .expect(403);
    });

    it('refuses a courier account without courier profile', async () => {
      await http()
        .get('/v1/courier/deliveries')
        .set(...adminAuth('courier'))
        .expect(403);
    });

    it('refuses wrong handover codes (5 tries max), then delivers with the right one', async () => {
      const c = await courier();
      const d = await homeDelivery();
      await prisma.delivery.update({
        where: { id: d.id },
        data: { courierId: c.courierId, status: 'assigned' },
      });
      await http()
        .post(`/v1/courier/deliveries/${d.id}/complete`)
        .set(...c.auth)
        .send({ handoverCode: d.code })
        .expect(409);
      await http()
        .post(`/v1/courier/deliveries/${d.id}/start`)
        .set(...c.auth)
        .expect(200);
      await http()
        .post(`/v1/courier/deliveries/${d.id}/start`)
        .set(...c.auth)
        .expect(409);
      const wrong = d.code === '000000' ? '111111' : '000000';
      await http()
        .post(`/v1/courier/deliveries/${d.id}/complete`)
        .set(...c.auth)
        .send({ handoverCode: 'abc' })
        .expect(400);
      for (let i = 1; i <= 5; i++) {
        const res = await http()
          .post(`/v1/courier/deliveries/${d.id}/complete`)
          .set(...c.auth)
          .send({ handoverCode: wrong })
          .expect(400);
        expect(res.body.error).toMatchObject({
          code: 'HANDOVER_CODE_INVALID',
          details: { remainingAttempts: 5 - i },
        });
        expect(JSON.stringify(res.body)).not.toContain(d.code);
      }
      const locked = await http()
        .post(`/v1/courier/deliveries/${d.id}/complete`)
        .set(...c.auth)
        .send({ handoverCode: d.code })
        .expect(403);
      expect(locked.body.error.code).toBe('HANDOVER_CODE_LOCKED');
      expect(
        (await prisma.delivery.findUniqueOrThrow({ where: { id: d.id } })).handoverAttempts,
      ).toBe(5);
      expect(port.calls.some((x) => x.orderId === d.orderId)).toBe(false);

      await prisma.delivery.update({ where: { id: d.id }, data: { handoverAttempts: 2 } });
      const ok = await http()
        .post(`/v1/courier/deliveries/${d.id}/complete`)
        .set(...c.auth)
        .send({ handoverCode: d.code })
        .expect(200);
      expect(ok.body.status).toBe('delivered');
      expect(port.calls).toContainEqual({
        orderId: d.orderId,
        to: 'delivered',
        codCollectedXof: null,
      });
    });

    it('requires the collected amount to equal the balance for cash on delivery', async () => {
      const c = await courier();
      const d = await homeDelivery(7000);
      await prisma.delivery.update({
        where: { id: d.id },
        data: { courierId: c.courierId, status: 'in_progress' },
      });
      const url = `/v1/courier/deliveries/${d.id}/complete`;
      const missing = await http()
        .post(url)
        .set(...c.auth)
        .send({ handoverCode: d.code })
        .expect(400);
      expect(missing.body.error.code).toBe('COD_AMOUNT_MISMATCH');
      await http()
        .post(url)
        .set(...c.auth)
        .send({ handoverCode: d.code, codCollectedXof: 6000 })
        .expect(400);
      const ok = await http()
        .post(url)
        .set(...c.auth)
        .send({ handoverCode: d.code, codCollectedXof: 7000 })
        .expect(200);
      expect(ok.body).toMatchObject({ status: 'delivered', codBalanceXof: 7000 });
      expect(
        (await prisma.delivery.findUniqueOrThrow({ where: { id: d.id } })).codCollectedXof,
      ).toBe(7000);
    });

    it('records a failed delivery and allows reassignment', async () => {
      const c = await courier();
      const d = await homeDelivery();
      await prisma.delivery.update({
        where: { id: d.id },
        data: { courierId: c.courierId, status: 'in_progress' },
      });
      const url = `/v1/courier/deliveries/${d.id}/fail`;
      await http()
        .post(url)
        .set(...c.auth)
        .send({ reason: 'other' })
        .expect(400);
      await http()
        .post(url)
        .set(...c.auth)
        .send({ reason: 'bogus' })
        .expect(400);
      const res = await http()
        .post(url)
        .set(...c.auth)
        .send({ reason: 'absent' })
        .expect(200);
      expect(res.body.status).toBe('failed');
      expect(port.calls).toContainEqual({
        orderId: d.orderId,
        to: 'delivery_failed',
        codCollectedXof: undefined,
      });
      await http()
        .post(url)
        .set(...c.auth)
        .send({ reason: 'absent' })
        .expect(409);
      await http()
        .post(`/v1/admin/deliveries/${d.id}/assign`)
        .set(...adminAuth('super_admin'))
        .send({ courierId: c.courierId })
        .expect(200);
    });
  });

  describe('courier profile sync with /admin/users', () => {
    const body = (extra: object = {}) => ({
      email: `c-${uuidv7()}@example.com`,
      password: 'correct-horse-battery',
      role: 'courier',
      ...extra,
    });

    it('creates an active profile, deactivates it on role change', async () => {
      const boss = adminAuth('super_admin');
      const res = await http()
        .post('/v1/admin/users')
        .set(...boss)
        .send(body({ phone: '+22891000000' }))
        .expect(201);
      const profile = await prisma.courier.findUniqueOrThrow({
        where: { adminUserId: res.body.id },
      });
      expect(profile).toMatchObject({ active: true, phone: '+22891000000' });
      const token = ctx.tokens.signAdmin(res.body.id, 'courier');
      await http()
        .get('/v1/courier/deliveries')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await http()
        .patch(`/v1/admin/users/${res.body.id}`)
        .set(...boss)
        .send({ role: 'logistics' })
        .expect(200);
      expect(
        (await prisma.courier.findUniqueOrThrow({ where: { adminUserId: res.body.id } })).active,
      ).toBe(false);
      await http()
        .get('/v1/courier/deliveries')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await http()
        .patch(`/v1/admin/users/${res.body.id}`)
        .set(...boss)
        .send({ role: 'courier' })
        .expect(200);
      expect(
        (await prisma.courier.findUniqueOrThrow({ where: { adminUserId: res.body.id } })).active,
      ).toBe(true);
    });

    it('refuses a courier without a valid phone', async () => {
      const boss = adminAuth('super_admin');
      const r = await http()
        .post('/v1/admin/users')
        .set(...boss)
        .send(body())
        .expect(400);
      expect(r.body.error.code).toBe('VALIDATION_FAILED');
      await http()
        .post('/v1/admin/users')
        .set(...boss)
        .send(body({ phone: '12345' }))
        .expect(400);
      const other = await createAdmin(ctx, 'logistics');
      await http()
        .patch(`/v1/admin/users/${other.admin.id}`)
        .set(...boss)
        .send({ role: 'courier' })
        .expect(400);
    });
  });
});
