import { Logger } from '@nestjs/common';
import { uuidv7 } from '../src/common/uuid';
import { PAYMENT_EVENTS } from '../src/common/events';
import { OrdersService } from '../src/modules/orders/orders.service';
import { FAKE_SIGNATURE_HEADER } from '../src/modules/payments/providers/fake.provider';
import { def } from './def';
import { PHONES, type PaymentsCtx, paymentsCtx } from './payments-fixtures';
import { waitFor } from './production-fixtures';

// Parcours HTTP complets (commande + paiement + webhook + écouteurs) : délai explicite.
jest.setTimeout(30_000);

describe('SP05 paiement (US-15 à US-18)', () => {
  let t: PaymentsCtx;

  beforeAll(async () => {
    t = await paymentsCtx();
  });
  afterAll(async () => {
    await t.app.close();
  });
  beforeEach(() => {
    t.alerts.length = 0;
    t.events.length = 0;
  });

  const itemIds = async (orderId: string) =>
    (await t.prisma.orderItem.findMany({ where: { orderId }, select: { id: true } })).map(
      (i) => i.id,
    );
  const jobCreated = (orderId: string) => waitFor(() => t.job(orderId).then((j) => j ?? false));
  const expectNoJob = async (orderId: string) => {
    await t.settle();
    expect(await t.job(orderId)).toBeNull();
    for (const id of await itemIds(orderId)) expect(t.queue.ids).not.toContain(id);
  };

  describe('POST /orders/:id/payments', () => {
    it('T-Money : montant recalculé côté serveur, demande sur le téléphone', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      expect(res.body).toEqual({
        paymentId: expect.any(String),
        status: 'pending',
        amountXof: o.totalXof,
        kind: 'full',
        nextAction: { type: 'approve_on_phone', message: expect.stringContaining('T-Money') },
      });
      const p = await t.paymentRow(res.body.paymentId);
      expect(p).toMatchObject({ provider: 'fake', method: 'tmoney', payerPhone: PHONES.success });
      expect(p.providerRef).toMatch(/^fk_/);
    });

    it('un montant envoyé par le client est refusé (corps strict)', async () => {
      const o = await t.order('tmoney');
      const res = await t
        .pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.success, amountXof: 1 })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(await t.prisma.payment.count({ where: { orderId: o.id } })).toBe(0);
    });

    it('carte (US-16) : redirection vers la page de l’agrégateur avec retour dans l’app', async () => {
      const o = await t.order('card');
      const res = await t.pay(o.auth, o.id, { method: 'card' }).expect(201);
      expect(res.body.nextAction.type).toBe('redirect');
      expect(res.body.nextAction.url).toContain(encodeURIComponent('streetwear://'));
      expect((await t.paymentRow(res.body.paymentId)).payerPhone).toBeNull();
    });

    it('paiement à la livraison (US-17) : acompte en Mobile Money, carte refusée', async () => {
      const o = await t.order('cod');
      expect(def(o.depositXof)).toBeGreaterThan(0);
      const card = await t.pay(o.auth, o.id, { method: 'card' }).expect(400);
      expect(card.body.error.code).toBe('VALIDATION_FAILED');
      const res = await t
        .pay(o.auth, o.id, { method: 'flooz', payerPhone: PHONES.success })
        .expect(201);
      expect(res.body).toMatchObject({ kind: 'deposit', amountXof: o.depositXof });
      await t.send(await t.hookFor(res.body.paymentId)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('deposit_paid');
      await jobCreated(o.id);
    });

    it('validation et droits : clé absente, numéro absent, méthode différente, autre client, sans jeton', async () => {
      const o = await t.order('tmoney');
      const noKey = await t
        .http()
        .post(`/v1/orders/${o.id}/payments`)
        .set(...o.auth)
        .send({ method: 'tmoney', payerPhone: PHONES.success })
        .expect(400);
      expect(noKey.body.error.details.fieldErrors['Idempotency-Key']).toBeDefined();
      await t.pay(o.auth, o.id, { method: 'tmoney' }).expect(400);
      await t.pay(o.auth, o.id, { method: 'flooz', payerPhone: PHONES.success }).expect(400);
      const other = await t.newCustomer();
      expect((await t.pay(other.auth, o.id).expect(404)).body.error.code).toBe('NOT_FOUND');
      await t
        .http()
        .post(`/v1/orders/${o.id}/payments`)
        .set('Idempotency-Key', uuidv7())
        .send({ method: 'tmoney', payerPhone: PHONES.success })
        .expect(401);
      expect(await t.prisma.payment.count({ where: { orderId: o.id } })).toBe(0);
    });

    it('commande expirée ou déjà payée : 409 ORDER_NOT_PAYABLE', async () => {
      const o = await t.order('tmoney');
      await t.prisma.order.update({
        where: { id: o.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await t.pay(o.auth, o.id).expect(409);
      expect(res.body.error.code).toBe('ORDER_NOT_PAYABLE');

      const paid = await t.order('tmoney');
      const p = await t.pay(paid.auth, paid.id).expect(201);
      await t.send(await t.hookFor(p.body.paymentId)).expect(200);
      const again = await t.pay(paid.auth, paid.id).expect(409);
      expect(again.body.error).toMatchObject({ code: 'ORDER_NOT_PAYABLE' });
    });

    it('double appui « Payer » même clé (séquentiel) : un seul Payment, même réponse', async () => {
      const o = await t.order('tmoney');
      const key = uuidv7();
      const a = await t.pay(o.auth, o.id, undefined, key).expect(201);
      const b = await t.pay(o.auth, o.id, undefined, key).expect(201);
      expect(b.body).toEqual(a.body);
      expect(await t.prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
    });

    it('double appui même clé (simultané ×5) : un seul Payment, un seul appel à l’agrégateur', async () => {
      const o = await t.order('tmoney');
      const key = uuidv7();
      const spy = jest.spyOn(t.fake, 'initiate');
      const res = await Promise.all(
        Array.from({ length: 5 }, () => t.pay(o.auth, o.id, undefined, key)),
      );
      expect(res.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      expect(new Set(res.map((r) => r.body.paymentId)).size).toBe(1);
      expect(await t.prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('même clé, corps différent : 409 IDEMPOTENCY_CONFLICT', async () => {
      const o = await t.order('tmoney');
      const key = uuidv7();
      await t.pay(o.auth, o.id, undefined, key).expect(201);
      const res = await t
        .pay(o.auth, o.id, { method: 'tmoney', payerPhone: '+22891111111' }, key)
        .expect(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('nouvelle clé pendant un paiement en cours : refus (pas de double débit)', async () => {
      const o = await t.order('tmoney');
      const first = await t.pay(o.auth, o.id).expect(201);
      const res = await t.pay(o.auth, o.id).expect(409);
      expect(res.body.error).toMatchObject({
        code: 'ORDER_NOT_PAYABLE',
        details: { reason: 'payment_pending', paymentId: first.body.paymentId },
      });
      expect(await t.prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
    });

    it('agrégateur indisponible : 502 PROVIDER_UNAVAILABLE, paiement failed, nouvel essai possible', async () => {
      const o = await t.order('tmoney');
      const spy = jest.spyOn(t.fake, 'initiate').mockRejectedValueOnce(new Error('timeout'));
      const res = await t.pay(o.auth, o.id).expect(502);
      expect(res.body.error.code).toBe('PROVIDER_UNAVAILABLE');
      spy.mockRestore();
      const [p] = await t.prisma.payment.findMany({ where: { orderId: o.id } });
      expect(p).toMatchObject({ status: 'failed', failureReason: 'provider_unavailable' });
      await t.pay(o.auth, o.id).expect(201);
    });

    it('journaux : numéro masqué (+228 90 •• •• 56), jamais en clair', async () => {
      const lines: string[] = [];
      const spies = (['log', 'warn', 'error'] as const).map((m) =>
        jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => {
          lines.push(args.map(String).join(' '));
        }),
      );
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      await t.send(await t.hookFor(res.body.paymentId)).expect(200);
      for (const s of spies) s.mockRestore();
      expect(lines.some((l) => l.includes('+228 90 •• •• 56'))).toBe(true);
      expect(lines.join('\n')).not.toContain(PHONES.success);
      expect(lines.join('\n')).not.toContain('90123456');
    });
  });

  describe('POST /webhooks/payments/:provider', () => {
    it('nominal : payée, stock sorti, événement après validation, job de production créé (SP08)', async () => {
      const o = await t.order('tmoney', { quantity: 2 });
      const res = await t.pay(o.auth, o.id).expect(201);
      const hook = await t.hookFor(res.body.paymentId);
      const ack = await t.send(hook).expect(200);
      expect(ack.body).toEqual({ received: true });
      expect(await t.orderStatus(o.id)).toBe('paid');
      const p = await t.paymentRow(res.body.paymentId);
      expect(p.status).toBe('succeeded');
      expect(p.confirmedAt).toBeInstanceOf(Date);
      expect(await t.outMovements(o.id)).toBe(1);
      const changed = t.events.filter(
        (e) => e.name === 'order.status_changed' && e.payload.orderId === o.id,
      );
      expect(changed).toEqual([
        expect.objectContaining({
          payload: expect.objectContaining({ to: 'paid', actorType: 'provider' }),
        }),
      ]);
      const job = await jobCreated(o.id);
      expect(job.status).toBe('queued');
      for (const id of await itemIds(o.id)) expect(t.queue.ids).toContain(id);
      const ev = await t.prisma.paymentEvent.findFirstOrThrow({ where: { paymentId: p.id } });
      expect(ev).toMatchObject({ signatureValid: true, outcome: 'processed', rawBody: hook.body });
      const status = await t
        .http()
        .get(`/v1/payments/${p.id}`)
        .set(...o.auth)
        .expect(200);
      expect(status.body).toEqual({ paymentId: p.id, status: 'succeeded', orderStatus: 'paid' });
    });

    it('signature invalide : enregistré brut, 401, aucune transition, aucun job', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const hook = await t.hookFor(res.body.paymentId);
      const forged = {
        ...hook,
        headers: { ...hook.headers, [FAKE_SIGNATURE_HEADER]: 'a'.repeat(64) },
      };
      const r1 = await t.send(forged).expect(401);
      expect(r1.body.error.code).toBe('UNAUTHENTICATED');
      const unsigned = { ...hook, headers: { 'content-type': 'application/json' } };
      await t.send(unsigned).expect(401);
      const short = { ...hook, headers: { ...hook.headers, [FAKE_SIGNATURE_HEADER]: 'abc' } };
      await t.send(short).expect(401);

      const events = await t.prisma.paymentEvent.findMany({
        where: { providerRef: (await t.paymentRow(res.body.paymentId)).providerRef },
      });
      expect(events).toHaveLength(3);
      for (const e of events) {
        expect(e).toMatchObject({ signatureValid: false, outcome: 'rejected', rawBody: hook.body });
        expect(e.raw).toEqual(JSON.parse(hook.body));
      }
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
      expect((await t.paymentRow(res.body.paymentId)).status).toBe('pending');
      expect(await t.outMovements(o.id)).toBe(0);
      await expectNoJob(o.id);
    });

    it('corps modifié après signature (montant changé) : 401, rien ne bouge', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const hook = await t.hookFor(res.body.paymentId);
      const tampered = { ...hook, body: hook.body.replace(/"amount":\d+/, '"amount":100') };
      await t.send(tampered).expect(401);
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
      await expectNoJob(o.id);
    });

    it('corps non JSON ou agrégateur inconnu : conservé tel quel', async () => {
      const raw = 'not json é';
      await t
        .http()
        .post('/v1/webhooks/payments/fake')
        .set('content-type', 'text/plain')
        .set(FAKE_SIGNATURE_HEADER, t.fake.sign(raw))
        .send(raw)
        .expect(200);
      const ev = await t.prisma.paymentEvent.findFirstOrThrow({ where: { rawBody: raw } });
      expect(ev).toMatchObject({ signatureValid: true, outcome: 'malformed', raw: null });
      const unknown = await t
        .http()
        .post('/v1/webhooks/payments/paygate')
        .set('content-type', 'application/json')
        .send('{"x":1}')
        .expect(404);
      expect(unknown.body.error.code).toBe('NOT_FOUND');
      expect(
        await t.prisma.paymentEvent.count({
          where: { provider: 'paygate', signatureValid: false },
        }),
      ).toBeGreaterThan(0);
    });

    it('même webhook reçu 3 fois : une transition, un mouvement de stock, un job', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.replayed });
      const hooks = await t.fake.webhooksFor(
        (await t.paymentRow(res.body.paymentId)).providerRef as string,
      );
      expect(hooks).toHaveLength(3);
      for (const h of hooks) await t.send(h).expect(200);
      expect(await t.orderStatus(o.id)).toBe('paid');
      expect(await t.paidTransitions(o.id)).toBe(1);
      expect(await t.outMovements(o.id)).toBe(1);
      const outcomes = (
        await t.prisma.paymentEvent.findMany({
          where: { paymentId: res.body.paymentId },
          orderBy: { receivedAt: 'asc' },
        })
      ).map((e) => e.outcome);
      expect(outcomes).toEqual(['processed', 'duplicate', 'duplicate']);
      await jobCreated(o.id);
      expect(
        t.events.filter((e) => e.name === 'order.status_changed' && e.payload.orderId === o.id),
      ).toHaveLength(1);
    });

    it('concurrence : 8 webhooks identiques simultanés → une seule transition', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const hook = await t.hookFor(res.body.paymentId);
      const all = await Promise.all(Array.from({ length: 8 }, () => t.send(hook)));
      expect(all.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(await t.paidTransitions(o.id)).toBe(1);
      expect(await t.outMovements(o.id)).toBe(1);
      const outcomes = (
        await t.prisma.paymentEvent.findMany({ where: { paymentId: res.body.paymentId } })
      ).map((e) => e.outcome);
      expect(outcomes.filter((x) => x === 'processed')).toHaveLength(1);
      expect(outcomes.filter((x) => x === 'duplicate')).toHaveLength(7);
      expect(
        t.events.filter((e) => e.name === 'order.status_changed' && e.payload.orderId === o.id),
      ).toHaveLength(1);
    });

    it('concurrence : succès et échec simultanés + interrogation → un seul résultat cohérent', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const ok = await t.hookFor(res.body.paymentId, 'succeeded');
      const ko = await t.hookFor(res.body.paymentId, 'failed');
      await Promise.all([
        t.send(ok),
        t.send(ko),
        t.payments.refresh(res.body.paymentId),
        t.send(ok),
      ]);
      const p = await t.paymentRow(res.body.paymentId);
      const status = await t.orderStatus(o.id);
      expect(['succeeded', 'failed']).toContain(p.status);
      expect(status).toBe(p.status === 'succeeded' ? 'paid' : 'payment_failed');
      expect(
        await t.prisma.orderStatusHistory.count({
          where: { orderId: o.id, fromStatus: 'pending_payment' },
        }),
      ).toBe(1);
      expect(await t.outMovements(o.id)).toBe(p.status === 'succeeded' ? 1 : 0);
    });

    it('montant falsifié (signature valide) : paiement failed, commande non payée, alerte, aucun job', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const p = await t.paymentRow(res.body.paymentId);
      const forged = t.fake.webhook(
        { ref: def(p.providerRef), paymentId: p.id, amountXof: p.amountXof },
        'succeeded',
        { amount: 100 },
      );
      await t.send(forged).expect(200);
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
      expect(await t.paymentRow(p.id)).toMatchObject({
        status: 'failed',
        failureReason: 'amount_mismatch',
      });
      expect(t.alerts).toEqual([
        {
          name: PAYMENT_EVENTS.amountMismatch,
          payload: expect.objectContaining({
            paymentId: p.id,
            orderNumber: o.number,
            expectedXof: o.totalXof,
            receivedXof: 100,
          }),
        },
      ]);
      // Le vrai webhook arrivé ensuite ne rouvre pas le paiement.
      await t.send(await t.hookFor(p.id)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
      expect(await t.outMovements(o.id)).toBe(0);
      await expectNoJob(o.id);
    });

    it('montant dû modifié côté commande après création du paiement : refusé (paymentDue fait foi)', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      await t.prisma.order.update({
        where: { id: o.id },
        data: { totalXof: { increment: 1000 }, subtotalXof: { increment: 1000 } },
      });
      await t.send(await t.hookFor(res.body.paymentId)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
      expect(t.alerts.map((a) => a.name)).toEqual([PAYMENT_EVENTS.amountMismatch]);
    });

    it('échec (numéro …00) : payment_failed, puis nouvel essai qui aboutit (US-15 « Réessayer »)', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.failure });
      const [hook] = await t.fake.webhooksFor(
        def((await t.paymentRow(res.body.paymentId)).providerRef),
      );
      await t.send(def(hook)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('payment_failed');
      expect((await t.paymentRow(res.body.paymentId)).status).toBe('failed');
      await expectNoJob(o.id);

      const retry = await t.pay(o.auth, o.id).expect(201);
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
      await t.send(await t.hookFor(retry.body.paymentId)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('paid');
      await jobCreated(o.id);
    });

    it('succès pour une commande expirée : pas de transition, alerte remboursement', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      await t.app.get(OrdersService).transition(o.id, 'expired', { type: 'system' });
      await t.send(await t.hookFor(res.body.paymentId)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('expired');
      expect(await t.paymentRow(res.body.paymentId)).toMatchObject({
        status: 'succeeded',
        failureReason: 'order_not_payable',
      });
      expect(t.alerts.map((a) => a.name)).toEqual([PAYMENT_EVENTS.unexpectedSuccess]);
      await expectNoJob(o.id);
    });

    it('webhook arrivé avant l’enregistrement de la référence : retrouvé par notre référence', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const p = await t.paymentRow(res.body.paymentId);
      await t.prisma.payment.update({ where: { id: p.id }, data: { providerRef: null } });
      await t
        .send(
          t.fake.webhook(
            { ref: def(p.providerRef), paymentId: p.id, amountXof: p.amountXof },
            'succeeded',
          ),
        )
        .expect(200);
      expect(await t.orderStatus(o.id)).toBe('paid');
      expect((await t.paymentRow(p.id)).providerRef).toBe(p.providerRef);
    });

    it('référence inconnue : 200, enregistré, sans effet', async () => {
      const hook = t.fake.webhook(
        { ref: 'fk_unknown', paymentId: uuidv7(), amountXof: 5000 },
        'succeeded',
      );
      await t.send(hook).expect(200);
      const ev = await t.prisma.paymentEvent.findFirstOrThrow({
        where: { providerRef: 'fk_unknown' },
      });
      expect(ev.outcome).toBe('unknown_payment');
    });
  });

  describe('GET /payments/:id (filet webhook perdu)', () => {
    it('webhook perdu : en attente avant 60 s sans interroger, puis payée via getStatus', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.lost });
      const id = res.body.paymentId as string;
      expect(await t.fake.webhooksFor(def((await t.paymentRow(id)).providerRef))).toEqual([]);
      const spy = jest.spyOn(t.fake, 'getStatus');
      const early = await t
        .http()
        .get(`/v1/payments/${id}`)
        .set(...o.auth)
        .expect(200);
      expect(early.body).toEqual({
        paymentId: id,
        status: 'pending',
        orderStatus: 'pending_payment',
      });
      expect(spy).not.toHaveBeenCalled();

      await t.prisma.payment.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      const late = await t
        .http()
        .get(`/v1/payments/${id}`)
        .set(...o.auth)
        .expect(200);
      expect(late.body).toEqual({ paymentId: id, status: 'succeeded', orderStatus: 'paid' });
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      expect(await t.outMovements(o.id)).toBe(1);
      await jobCreated(o.id);
    });

    it('jamais validé (…03) : reste en attente, interrogation limitée à une toutes les 15 s', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.never });
      const id = res.body.paymentId as string;
      await t.prisma.payment.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - 90_000) },
      });
      const spy = jest.spyOn(t.fake, 'getStatus');
      for (let i = 0; i < 3; i++) {
        const r = await t
          .http()
          .get(`/v1/payments/${id}`)
          .set(...o.auth)
          .expect(200);
        expect(r.body.status).toBe('pending');
      }
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
    });

    it('agrégateur en panne pendant l’interrogation : statut renvoyé quand même', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.lost });
      const id = res.body.paymentId as string;
      await t.prisma.payment.update({
        where: { id },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      const spy = jest.spyOn(t.fake, 'getStatus').mockRejectedValueOnce(new Error('down'));
      const r = await t
        .http()
        .get(`/v1/payments/${id}`)
        .set(...o.auth)
        .expect(200);
      expect(r.body.status).toBe('pending');
      spy.mockRestore();
    });

    it('paiement d’un autre client : 404 ; sans jeton : 401', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const other = await t.newCustomer();
      await t
        .http()
        .get(`/v1/payments/${res.body.paymentId}`)
        .set(...other.auth)
        .expect(404);
      await t.http().get(`/v1/payments/${res.body.paymentId}`).expect(401);
      await t
        .http()
        .get('/v1/payments/not-a-uuid')
        .set(...o.auth)
        .expect(404);
    });

    it('nouvel essai après 2 min : l’ancien paiement est d’abord interrogé puis remplacé', async () => {
      const o = await t.order('tmoney');
      const first = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.never });
      await t.prisma.payment.update({
        where: { id: first.body.paymentId },
        data: { createdAt: new Date(Date.now() - 130_000) },
      });
      const second = await t.pay(o.auth, o.id).expect(201);
      expect(await t.paymentRow(first.body.paymentId)).toMatchObject({
        status: 'expired',
        failureReason: 'superseded',
      });
      await t.send(await t.hookFor(second.body.paymentId)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('paid');
    });
  });
});
