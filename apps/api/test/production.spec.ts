import { def } from './def';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter2 } from '@nestjs/event-emitter';
import sharp from 'sharp';
import { PRODUCTION_EVENTS } from '../src/modules/production/production.events';
import { BullRenderQueue, startRenderWorker } from '../src/modules/production/render/render.queue';
import { type AuthHeader, createAdmin } from './helpers';
import { type ProductionCtx, productionCtx, waitFor } from './production-fixtures';

describe('SP08 production (US-12, US-26)', () => {
  let t: ProductionCtx;
  const get = (url: string, auth?: AuthHeader) => {
    const r = t.http().get(url);
    return auth ? r.set(...auth) : r;
  };
  const post = (url: string, auth?: AuthHeader, body: object = {}) => {
    const r = t.http().post(url);
    return (auth ? r.set(...auth) : r).send(body);
  };
  const files = (orderId: string) =>
    readdirSync(join(t.dir, 'print-files', orderId)).filter((f) => f.endsWith('.png'));
  const renderAll = async (items: { id: string }[]) => {
    for (const i of items) await t.printFiles.process(i.id);
  };

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
    t.assets.missing.clear();
  });

  describe('trigger and render job', () => {
    it('queues one render per order line when the order is paid (order.status_changed)', async () => {
      const o = await t.paidOrder({ bases: ['patternOnly', 'patternAndText'] });
      await waitFor(async () => t.queue.ids.length === 2);
      expect(t.queue.ids.sort()).toEqual(o.items.map((i) => i.id).sort());
      expect((await t.job(o.id))?.status).toBe('queued');
    });

    it('also triggers on deposit_paid (cash on delivery)', async () => {
      const o = await t.paidOrder({ method: 'cod' });
      await waitFor(async () => t.queue.ids.length === 1);
      expect((await t.job(o.id))?.status).toBe('queued');
    });

    it('does not trigger while the order is unpaid', async () => {
      const o = await t.paidOrder({ pay: false });
      await new Promise((r) => setTimeout(r, 150));
      expect(t.queue.ids).toHaveLength(0);
      expect(await t.job(o.id)).toBeNull();
    });

    it('renders every zone, stores files at the stable key and fills print_file_*_url', async () => {
      const o = await t.paidOrder({ bases: ['frontBackTiled', 'patternOnly'] });
      await waitFor(async () => t.queue.ids.length === 2);
      await renderAll(o.items);
      const rows = await t.prisma.orderItem.findMany({
        where: { orderId: o.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const hasBack = (r: (typeof rows)[number]) =>
        !!(r.designSnapshot as { zones: { back?: unknown } }).zones.back;
      const a = def(rows.find(hasBack));
      const b = def(rows.find((r) => !hasBack(r)));
      const ia = rows.indexOf(a) + 1;
      const ib = rows.indexOf(b) + 1;
      expect(def(a).printFileFrontUrl).toBe(`print-files/${o.id}/${o.number}_${ia}_front.png`);
      expect(def(a).printFileBackUrl).toBe(`print-files/${o.id}/${o.number}_${ia}_back.png`);
      expect(def(b).printFileFrontUrl).toBe(`print-files/${o.id}/${o.number}_${ib}_front.png`);
      expect(def(b).printFileBackUrl).toBeNull();
      const meta = await sharp(await t.storage.get(def(def(a).printFileFrontUrl))).metadata();
      expect(Math.abs(def(meta.width) - 3508)).toBeLessThanOrEqual(1);
      expect(meta.density).toBe(300);
      const j = await t.job(o.id);
      expect(j?.status).toBe('ready_to_print');
      expect(j?.error).toBeNull();
    });

    it('rerunning a render overwrites the file without creating a duplicate', async () => {
      const o = await t.paidOrder({ bases: ['patternAndText'] });
      await t.printFiles.process(def(o.items[0]).id);
      const before = files(o.id);
      await t.printFiles.process(def(o.items[0]).id);
      await t.printFiles.process(def(o.items[0]).id);
      expect(files(o.id)).toEqual(before);
      expect(before).toHaveLength(1);
    });

    it('concurrent renders of the same line leave one file and a consistent job', async () => {
      const o = await t.paidOrder({ bases: ['frontBackTiled'] });
      await Promise.all([1, 2, 3].map(() => t.printFiles.process(def(o.items[0]).id)));
      expect(files(o.id)).toHaveLength(2);
      expect((await t.job(o.id))?.status).toBe('ready_to_print');
    });

    it('a missing pattern fails the job, alerts, and does not block the other lines', async () => {
      const o = await t.paidOrder({ bases: ['patternOnly', 'patternAndText'] });
      const alerts: Record<string, unknown>[] = [];
      t.app.get(EventEmitter2).on(PRODUCTION_EVENTS.renderFailed, (e: Record<string, unknown>) => {
        alerts.push(e);
      });
      const bad = def(
        o.items.find((i) => JSON.stringify(i.designSnapshot).includes('pat-kente-ewe')),
      );
      t.assets.missing.add('patterns/pat-kente-ewe');
      await expect(renderAll(o.items)).resolves.toBeUndefined();
      const j = await t.job(o.id);
      expect(j?.status).toBe('failed');
      expect(j?.error).toContain('PATTERN_ASSET_MISSING');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        orderId: o.id,
        orderItemId: bad.id,
        code: 'PATTERN_ASSET_MISSING',
      });
      expect(JSON.stringify(alerts[0])).not.toMatch(/\+228/);
      const items = await t.prisma.orderItem.findMany({
        where: { orderId: o.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(def(items.find((i) => i.id === bad.id)).printFileFrontUrl).toBeNull();
      expect(def(items.find((i) => i.id !== bad.id)).printFileFrontUrl).not.toBeNull();
    });

    it('regenerating after a failure recovers the job', async () => {
      const admin = t.adminAuth('production');
      const o = await t.paidOrder();
      t.assets.missing.add('patterns/pat-kente-ewe');
      await renderAll(o.items);
      expect((await t.job(o.id))?.status).toBe('failed');
      t.assets.missing.clear();
      t.queue.ids.length = 0;
      await post(
        `/v1/admin/order-items/${def(o.items[0]).id}/print-files/regenerate`,
        admin,
      ).expect(202);
      expect((await t.job(o.id))?.status).toBe('queued');
      expect(t.queue.ids).toEqual([def(o.items[0]).id]);
      await renderAll(o.items);
      expect((await t.job(o.id))?.status).toBe('ready_to_print');
    });

    it('runs through the real BullMQ queue and worker (Redis)', async () => {
      const o = await t.paidOrder({ bases: ['patternOnly'] });
      const queue = new BullRenderQueue(def(process.env.REDIS_URL));
      const worker = startRenderWorker(t.app, def(process.env.REDIS_URL));
      try {
        await queue.enqueue(def(o.items[0]).id);
        await queue.enqueue(def(o.items[0]).id);
        await waitFor(async () => (await t.job(o.id))?.status === 'ready_to_print', 20000);
        expect(files(o.id)).toHaveLength(1);
      } finally {
        await worker.close();
        await queue.close();
      }
    }, 40000);
  });

  describe('POST /admin/orders/:id/assign-operator', () => {
    const url = (id: string) => `/v1/admin/orders/${id}/assign-operator`;

    it('blocks paid -> in_production without an operator (requiresOperator)', async () => {
      const o = await t.paidOrder();
      const res = await post(`/v1/admin/orders/${o.id}/transitions`, t.adminAuth('production'), {
        to: 'in_production',
      });
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toContain('requiresOperator');
    });

    it('assigns the operator and moves the order to in_production', async () => {
      const o = await t.paidOrder();
      const { admin } = await createAdmin(t.ctx, 'production');
      const res = await post(url(o.id), t.adminAuth('production'), { operatorId: admin.id }).expect(
        200,
      );
      expect(res.body.status).toBe('in_production');
      expect((await t.job(o.id))?.operatorId).toBe(admin.id);
    });

    it('reassigning on an order already in production only changes the operator', async () => {
      const o = await t.paidOrder();
      const a = await createAdmin(t.ctx, 'production');
      const b = await createAdmin(t.ctx, 'production');
      await post(url(o.id), t.adminAuth('production'), { operatorId: a.admin.id }).expect(200);
      await post(url(o.id), t.adminAuth('super_admin'), { operatorId: b.admin.id }).expect(200);
      expect((await t.job(o.id))?.operatorId).toBe(b.admin.id);
      expect(
        await t.prisma.orderStatusHistory.count({
          where: { orderId: o.id, toStatus: 'in_production' },
        }),
      ).toBe(1);
    });

    it('two concurrent assignments produce a single transition', async () => {
      const o = await t.paidOrder();
      const a = await createAdmin(t.ctx, 'production');
      const b = await createAdmin(t.ctx, 'production');
      const [r1, r2] = await Promise.all([
        post(url(o.id), t.adminAuth('production'), { operatorId: a.admin.id }),
        post(url(o.id), t.adminAuth('production'), { operatorId: b.admin.id }),
      ]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      expect(
        await t.prisma.orderStatusHistory.count({
          where: { orderId: o.id, toStatus: 'in_production' },
        }),
      ).toBe(1);
      expect([a.admin.id, b.admin.id]).toContain((await t.job(o.id))?.operatorId);
    });

    it('in_production -> ready needs the HD files (requiresPrintFiles), then marks the job printed', async () => {
      const o = await t.paidOrder();
      const { admin } = await createAdmin(t.ctx, 'production');
      await post(url(o.id), t.adminAuth('production'), { operatorId: admin.id }).expect(200);
      const ready = () =>
        post(`/v1/admin/orders/${o.id}/transitions`, t.adminAuth('production'), { to: 'ready' });
      expect((await ready()).status).toBe(409);
      await renderAll(o.items);
      expect((await ready()).status).toBe(200);
      await waitFor(async () => (await t.job(o.id))?.status === 'printed');
    });

    it('refuses invalid bodies (400) and malformed ids (404)', async () => {
      const o = await t.paidOrder();
      await post(url(o.id), t.adminAuth('production'), {}).expect(400);
      await post(url(o.id), t.adminAuth('production'), { operatorId: 'x' }).expect(400);
      await post(url('not-a-uuid'), t.adminAuth('production'), { operatorId: t.newId() }).expect(
        404,
      );
    });

    it('refuses an unknown, inactive or non-production operator (422)', async () => {
      const o = await t.paidOrder();
      const courier = await createAdmin(t.ctx, 'courier');
      const gone = await createAdmin(t.ctx, 'production', { active: false });
      for (const operatorId of [t.newId(), courier.admin.id, gone.admin.id]) {
        const res = await post(url(o.id), t.adminAuth('production'), { operatorId }).expect(422);
        expect(res.body.error.code).toBe('OPERATOR_INVALID');
      }
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('paid');
    });

    it('refuses an unpaid order (409) and an unknown order (404)', async () => {
      const unpaid = await t.paidOrder({ pay: false });
      const { admin } = await createAdmin(t.ctx, 'production');
      await post(url(unpaid.id), t.adminAuth('production'), { operatorId: admin.id }).expect(409);
      await post(url(t.newId()), t.adminAuth('production'), { operatorId: admin.id }).expect(404);
    });

    it('refuses other roles (403) and anonymous calls (401)', async () => {
      const o = await t.paidOrder();
      const { admin } = await createAdmin(t.ctx, 'production');
      for (const role of ['order_manager', 'logistics', 'courier'] as const) {
        await post(url(o.id), t.adminAuth(role), { operatorId: admin.id }).expect(403);
      }
      await post(url(o.id), undefined, { operatorId: admin.id }).expect(401);
    });
  });

  describe('GET /admin/order-items/:id/print-files', () => {
    it('returns signed URLs valid 15 minutes for the zones present', async () => {
      const o = await t.paidOrder({ bases: ['frontBackTiled'] });
      await renderAll(o.items);
      const res = await get(
        `/v1/admin/order-items/${def(o.items[0]).id}/print-files`,
        t.adminAuth('production'),
      ).expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['back', 'front']);
      const u = new URL(res.body.front);
      const ttl = Number(u.searchParams.get('expires')) - Date.now() / 1000;
      expect(ttl).toBeGreaterThan(14 * 60);
      expect(ttl).toBeLessThanOrEqual(15 * 60);
      expect(u.pathname).toContain(`print-files/${o.id}/${o.number}_1_front.png`);
    });

    it('omits zones without file and answers {} before rendering', async () => {
      const o = await t.paidOrder();
      const res = await get(
        `/v1/admin/order-items/${def(o.items[0]).id}/print-files`,
        t.adminAuth('super_admin'),
      ).expect(200);
      expect(res.body).toEqual({});
    });

    it('malformed or unknown id (404), rights (403) and auth (401)', async () => {
      const o = await t.paidOrder();
      const id = def(o.items[0]).id;
      await get('/v1/admin/order-items/nope/print-files', t.adminAuth('production')).expect(404);
      await get(`/v1/admin/order-items/${t.newId()}/print-files`, t.adminAuth('production')).expect(
        404,
      );
      await get(`/v1/admin/order-items/${id}/print-files`, t.adminAuth('logistics')).expect(403);
      await get(`/v1/admin/order-items/${id}/print-files`).expect(401);
    });
  });

  describe('POST /admin/order-items/:id/print-files/regenerate', () => {
    const url = (id: string) => `/v1/admin/order-items/${id}/print-files/regenerate`;

    it('queues the line again (202), once even when called twice', async () => {
      const o = await t.paidOrder();
      await renderAll(o.items);
      t.queue.ids.length = 0;
      await post(url(def(o.items[0]).id), t.adminAuth('production')).expect(202);
      await post(url(def(o.items[0]).id), t.adminAuth('super_admin')).expect(202);
      expect(t.queue.ids).toEqual([def(o.items[0]).id]);
      expect((await t.job(o.id))?.status).toBe('queued');
    });

    it('refuses an unpaid order (409), unknown or malformed line (404), rights (403), auth (401)', async () => {
      const unpaid = await t.paidOrder({ pay: false });
      await post(url(def(unpaid.items[0]).id), t.adminAuth('production')).expect(409);
      await post(url(t.newId()), t.adminAuth('production')).expect(404);
      await post(url('x'), t.adminAuth('production')).expect(404);
      await post(url(def(unpaid.items[0]).id), t.adminAuth('order_manager')).expect(403);
      await post(url(def(unpaid.items[0]).id)).expect(401);
    });
  });

  describe('GET /admin/orders/:id/production-sheet.pdf', () => {
    it('returns an A4 PDF for a rendered order', async () => {
      const o = await t.paidOrder({ bases: ['patternAndText', 'frontBackTiled'] });
      const { admin } = await createAdmin(t.ctx, 'production');
      await renderAll(o.items);
      await post(`/v1/admin/orders/${o.id}/assign-operator`, t.adminAuth('production'), {
        operatorId: admin.id,
      }).expect(200);
      const res = await get(
        `/v1/admin/orders/${o.id}/production-sheet.pdf`,
        t.adminAuth('production'),
      )
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.toString('latin1')).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
      expect(pdf.length).toBeGreaterThan(5000);
    });

    it('works before rendering (previews unavailable), 404, 403, 401', async () => {
      const o = await t.paidOrder();
      await get(`/v1/admin/orders/${o.id}/production-sheet.pdf`, t.adminAuth('super_admin')).expect(
        200,
      );
      await get(
        `/v1/admin/orders/${t.newId()}/production-sheet.pdf`,
        t.adminAuth('production'),
      ).expect(404);
      await get('/v1/admin/orders/x/production-sheet.pdf', t.adminAuth('production')).expect(404);
      await get(
        `/v1/admin/orders/${o.id}/production-sheet.pdf`,
        t.adminAuth('order_manager'),
      ).expect(403);
      await get(`/v1/admin/orders/${o.id}/production-sheet.pdf`).expect(401);
    });
  });

  it('keeps temporary storage out of the repository', () => {
    expect(join(t.dir)).toContain('sw-print-');
  });
});
