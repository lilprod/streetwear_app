import { PAYMENT_EVENTS } from '../src/common/events';
import { OrdersService } from '../src/modules/orders/orders.service';
import { def } from './def';
import { PHONES, type PaymentsCtx, paymentsCtx } from './payments-fixtures';

jest.setTimeout(30_000);

describe('SP12 corrections paiement (AN-006, AN-007)', () => {
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

  const expectNoProduction = async (orderId: string) => {
    await t.settle();
    expect(await t.job(orderId)).toBeNull();
    expect(await t.outMovements(orderId)).toBe(0);
  };

  describe('AN-006 : expiration de la commande et paiements en attente', () => {
    it('passe le paiement pending à expired avec la commande ; un succès tardif reste une alerte sans production', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const paymentId = res.body.paymentId as string;
      expect((await t.paymentRow(paymentId)).status).toBe('pending');

      await t.prisma.order.update({
        where: { id: o.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      expect(await t.app.get(OrdersService).expireDue(new Date())).toBeGreaterThanOrEqual(1);
      expect(await t.orderStatus(o.id)).toBe('expired');
      expect((await t.paymentRow(paymentId)).status).toBe('expired');

      await t.send(await t.hookFor(paymentId)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('expired');
      expect(await t.paymentRow(paymentId)).toMatchObject({
        status: 'succeeded',
        failureReason: 'order_not_payable',
      });
      expect(t.alerts.map((a) => a.name)).toEqual([PAYMENT_EVENTS.unexpectedSuccess]);
      await expectNoProduction(o.id);
    });

    it('ne touche pas aux paiements déjà terminés (failed)', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.failure });
      const paymentId = res.body.paymentId as string;
      const [hook] = await t.fake.webhooksFor(def((await t.paymentRow(paymentId)).providerRef));
      await t.send(def(hook)).expect(200);
      expect((await t.paymentRow(paymentId)).status).toBe('failed');
      await t.app.get(OrdersService).transition(o.id, 'expired', { type: 'system' });
      expect((await t.paymentRow(paymentId)).status).toBe('failed');
    });
  });

  describe('AN-007 : succès fournisseur après un échec', () => {
    it('après un refus : alerte payment.late_success, commande non payée, aucune production', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id, { method: 'tmoney', payerPhone: PHONES.failure });
      const paymentId = res.body.paymentId as string;
      const [declined] = await t.fake.webhooksFor(def((await t.paymentRow(paymentId)).providerRef));
      await t.send(def(declined)).expect(200);
      expect(await t.orderStatus(o.id)).toBe('payment_failed');
      t.alerts.length = 0;

      await t.send(await t.hookFor(paymentId)).expect(200);
      expect(t.alerts).toEqual([
        {
          name: PAYMENT_EVENTS.lateSuccess,
          payload: expect.objectContaining({
            paymentId,
            orderNumber: o.number,
            failureReason: 'declined',
            orderStatus: 'payment_failed',
            amountXof: o.totalXof,
          }),
        },
      ]);
      expect(await t.orderStatus(o.id)).toBe('payment_failed');
      expect((await t.paymentRow(paymentId)).status).toBe('failed');
      expect(await t.paidTransitions(o.id)).toBe(0);
      const event = await t.prisma.paymentEvent.findFirstOrThrow({
        where: { paymentId },
        orderBy: { receivedAt: 'desc' },
      });
      expect(event.outcome).toBe('late_success');
      await expectNoProduction(o.id);
    });

    it('après un écart de montant : alerte avec le motif amount_mismatch, jamais payée', async () => {
      const o = await t.order('tmoney');
      const res = await t.pay(o.auth, o.id).expect(201);
      const p = await t.paymentRow(res.body.paymentId);
      await t
        .send(
          t.fake.webhook(
            { ref: def(p.providerRef), paymentId: p.id, amountXof: p.amountXof },
            'succeeded',
            { amount: 100 },
          ),
        )
        .expect(200);
      expect(t.alerts.map((a) => a.name)).toEqual([PAYMENT_EVENTS.amountMismatch]);
      t.alerts.length = 0;

      await t.send(await t.hookFor(p.id)).expect(200);
      expect(t.alerts).toEqual([
        {
          name: PAYMENT_EVENTS.lateSuccess,
          payload: expect.objectContaining({ paymentId: p.id, failureReason: 'amount_mismatch' }),
        },
      ]);
      expect(await t.orderStatus(o.id)).toBe('pending_payment');
      expect(await t.paidTransitions(o.id)).toBe(0);
      await expectNoProduction(o.id);
    });
  });
});
