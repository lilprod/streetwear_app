import { type Queue, QueueEvents } from 'bullmq';
import { PAYMENT_EVENTS } from '../src/common/events';
import { maskTgPhone } from '../src/common/redact';
import {
  PAYMENTS_RECONCILE_QUEUE,
  startPaymentsReconcile,
} from '../src/modules/payments/payments-reconcile.queue';
import { createPaymentProviders } from '../src/modules/payments/providers/providers.factory';
import { previousLomeDay } from '../src/modules/payments/reconciliation.service';
import { def } from './def';
import { PHONES, type PaymentsCtx, paymentsCtx } from './payments-fixtures';

jest.setTimeout(30_000);

const today = () => new Date().toISOString().slice(0, 10);

describe('SP05 back-office paiements et rapprochement (US-34)', () => {
  let t: PaymentsCtx;

  beforeAll(async () => {
    t = await paymentsCtx();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(async () => {
    t.alerts.length = 0;
    await t.prisma.$executeRawUnsafe(
      'TRUNCATE payment_events, payments, reconciliations, production_jobs, stock_movements, order_status_history, order_items, deliveries, pickups, orders, cart_items, carts CASCADE',
    );
    await t.fake.reset();
  });

  const paidOrder = async (phone: string = PHONES.success) => {
    const o = await t.order('tmoney');
    const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: phone }).expect(201);
    return { ...o, paymentId: res.body.paymentId as string };
  };

  describe('GET /admin/payments', () => {
    it('liste filtrable, numéro masqué, droits order_manager et super_admin seulement', async () => {
      const a = await paidOrder();
      await t.send(await t.hookFor(a.paymentId)).expect(200);
      const b = await paidOrder(PHONES.never);

      const all = await t
        .http()
        .get('/v1/admin/payments')
        .set(...t.adminAuth('order_manager'))
        .expect(200);
      expect(all.body.items.map((i: { id: string }) => i.id)).toEqual([b.paymentId, a.paymentId]);
      expect(all.body.items[1]).toMatchObject({
        orderId: a.id,
        orderNumber: a.number,
        provider: 'fake',
        method: 'tmoney',
        kind: 'full',
        status: 'succeeded',
        payerPhone: '+228 90 •• •• 56',
        confirmedAt: expect.any(String),
      });
      expect(JSON.stringify(all.body)).not.toContain(PHONES.success);

      const ok = await t
        .http()
        .get('/v1/admin/payments?status=succeeded')
        .set(...t.adminAuth('super_admin'))
        .expect(200);
      expect(ok.body.items.map((i: { id: string }) => i.id)).toEqual([a.paymentId]);

      const page = await t
        .http()
        .get('/v1/admin/payments?limit=1')
        .set(...t.adminAuth('order_manager'))
        .expect(200);
      expect(page.body.items).toHaveLength(1);
      const next = await t
        .http()
        .get(`/v1/admin/payments?limit=1&cursor=${def(page.body.nextCursor)}`)
        .set(...t.adminAuth('order_manager'))
        .expect(200);
      expect(next.body.items[0].id).toBe(a.paymentId);

      await t
        .http()
        .get('/v1/admin/payments?status=nope')
        .set(...t.adminAuth('order_manager'))
        .expect(400);
      await t
        .http()
        .get('/v1/admin/payments')
        .set(...t.adminAuth('production'))
        .expect(403);
      await t
        .http()
        .get('/v1/admin/payments')
        .set(...t.adminAuth('logistics'))
        .expect(403);
      await t.http().get('/v1/admin/payments').expect(401);
      await t
        .http()
        .get('/v1/admin/reconciliations')
        .set(...t.adminAuth('courier'))
        .expect(403);
    });

    it('détail commande : payments[] rempli ; file de production : paidAt = paiement confirmé', async () => {
      const a = await paidOrder();
      await t.send(await t.hookFor(a.paymentId)).expect(200);
      const p = await t.paymentRow(a.paymentId);
      const detail = await t
        .http()
        .get(`/v1/admin/orders/${a.id}`)
        .set(...t.adminAuth('order_manager'))
        .expect(200);
      expect(detail.body.payments).toEqual([
        {
          id: p.id,
          method: 'tmoney',
          status: 'succeeded',
          amountXof: a.totalXof,
          createdAt: p.createdAt.toISOString(),
        },
      ]);
      const confirmedAt = new Date('2026-11-09T08:00:00.000Z');
      await t.prisma.payment.update({ where: { id: p.id }, data: { confirmedAt } });
      const queue = await t
        .http()
        .get('/v1/admin/production/queue?status=to_assign')
        .set(...t.adminAuth('production'))
        .expect(200);
      expect(queue.body.items).toEqual([
        expect.objectContaining({ orderId: a.id, paidAt: confirmedAt.toISOString() }),
      ]);
    });
  });

  describe('rapprochement quotidien', () => {
    it('tout concorde : rapport sans écart ; un webhook perdu est rattrapé', async () => {
      const a = await paidOrder();
      await t.send(await t.hookFor(a.paymentId)).expect(200);
      const lost = await paidOrder(PHONES.lost);
      const failed = await paidOrder(PHONES.failure);
      const [ko] = await t.fake.webhooksFor(
        def((await t.paymentRow(failed.paymentId)).providerRef),
      );
      await t.send(def(ko)).expect(200);

      const [report] = await t.reconciliation.reconcile(today());
      expect(report).toMatchObject({
        provider: 'fake',
        matched: 3,
        mismatchCount: 0,
        mismatches: [],
      });
      expect(await t.orderStatus(lost.id)).toBe('paid');
      expect(t.alerts).toEqual([]);
    });

    it('écarts : montant falsifié et paiement inconnu de l’agrégateur → rapport + alerte', async () => {
      const a = await paidOrder();
      const p = await t.paymentRow(a.paymentId);
      await t
        .send(
          t.fake.webhook(
            { ref: def(p.providerRef), paymentId: p.id, amountXof: p.amountXof },
            'succeeded',
            {
              amount: 50,
            },
          ),
        )
        .expect(200);
      const ghost = await paidOrder();
      await t.send(await t.hookFor(ghost.paymentId)).expect(200);
      await t.fake.reset();
      t.alerts.length = 0;

      const [report] = await t.reconciliation.reconcile(today());
      expect(report?.mismatchCount).toBe(1);
      expect(report?.mismatches).toEqual([
        expect.objectContaining({
          type: 'missing_at_provider',
          paymentId: ghost.paymentId,
          orderNumber: ghost.number,
        }),
      ]);
      expect(t.alerts).toEqual([
        {
          name: PAYMENT_EVENTS.reconciliationMismatch,
          payload: expect.objectContaining({ provider: 'fake', date: today(), mismatchCount: 1 }),
        },
      ]);
    });

    it('statut divergent : notre paiement failed (montant falsifié) mais succès chez l’agrégateur', async () => {
      const a = await paidOrder();
      const p = await t.paymentRow(a.paymentId);
      await t
        .send(
          t.fake.webhook(
            { ref: def(p.providerRef), paymentId: p.id, amountXof: p.amountXof },
            'succeeded',
            {
              amount: 50,
            },
          ),
        )
        .expect(200);
      const [report] = await t.reconciliation.reconcile(today());
      expect(report?.mismatches).toEqual([
        expect.objectContaining({
          type: 'status_mismatch',
          providerStatus: 'succeeded',
          paymentStatus: 'failed',
        }),
      ]);
    });

    it('relancer le même jour remplace le rapport ; GET /admin/reconciliations', async () => {
      await paidOrder();
      await t.reconciliation.reconcile(today());
      await t.reconciliation.reconcile(today());
      expect(await t.prisma.reconciliation.count()).toBe(1);
      const res = await t
        .http()
        .get('/v1/admin/reconciliations')
        .set(...t.adminAuth('order_manager'))
        .expect(200);
      expect(res.body).toEqual({
        items: [
          expect.objectContaining({
            date: today(),
            provider: 'fake',
            matched: 1,
            mismatchCount: 0,
          }),
        ],
        nextCursor: null,
      });
      await t
        .http()
        .get('/v1/admin/reconciliations')
        .set(...t.adminAuth('production'))
        .expect(403);
      await expect(t.reconciliation.reconcile('2026-13')).rejects.toThrow(RangeError);
    });

    it('file payments-reconcile : planifiée à 02:00 Africa/Lome, traite la veille', async () => {
      const redisUrl = def(process.env.REDIS_URL);
      const { queue, worker } = startPaymentsReconcile(t.app, redisUrl);
      const events = new QueueEvents(PAYMENTS_RECONCILE_QUEUE, {
        connection: queue.opts.connection,
      });
      try {
        let scheduler: Awaited<ReturnType<Queue['getJobScheduler']>> | undefined;
        for (let i = 0; i < 40 && !scheduler; i++) {
          scheduler = await queue.getJobScheduler('daily-0200-lome');
          if (!scheduler) await new Promise((r) => setTimeout(r, 50));
        }
        expect(scheduler).toMatchObject({ pattern: '0 2 * * *', tz: 'Africa/Lome' });
        expect(queue.name).toBe(PAYMENTS_RECONCILE_QUEUE);
        await paidOrder();
        const job = await queue.add('reconcile', { date: today() });
        const result: unknown = await job.waitUntilFinished(events, 10_000);
        expect(result).toEqual([{ provider: 'fake', mismatches: 0 }]);
      } finally {
        await queue.removeJobScheduler('daily-0200-lome');
        await events.close();
        await worker.close();
        await queue.close();
      }
    });
  });

  describe('unités', () => {
    it('veille en Africa/Lome (UTC+0)', () => {
      expect(previousLomeDay(new Date('2026-11-10T02:00:00Z'))).toBe('2026-11-09');
      expect(previousLomeDay(new Date('2026-01-01T00:30:00Z'))).toBe('2025-12-31');
    });

    it('masquage du numéro', () => {
      expect(maskTgPhone('+22890123456')).toBe('+228 90 •• •• 56');
      expect(maskTgPhone(null)).toBeNull();
      expect(maskTgPhone('garbage')).toBe('••••');
    });

    it('configuration : fake interdit en production, secret obligatoire, agrégateur inconnu refusé', () => {
      const base = {
        REDIS_URL: 'redis://localhost:6379/14',
        FAKE_PAYMENT_WEBHOOK_SECRET: 'x'.repeat(32),
      };
      expect(createPaymentProviders({ ...base, NODE_ENV: 'test' }).active.name).toBe('fake');
      expect(() => createPaymentProviders({ ...base, NODE_ENV: 'production' })).toThrow(
        /production/,
      );
      expect(() =>
        createPaymentProviders({ ...base, NODE_ENV: 'test', FAKE_PAYMENT_WEBHOOK_SECRET: 'short' }),
      ).toThrow(/FAKE_PAYMENT_WEBHOOK_SECRET/);
      expect(() =>
        createPaymentProviders({ ...base, NODE_ENV: 'test', PAYMENT_PROVIDER: 'paygate' }),
      ).toThrow(/inconnu/);
    });
  });
});
