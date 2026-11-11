import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Size } from '@streetwear/shared';
import { uuidv7 } from '../src/common/uuid';
import { PAYMENT_EVENTS } from '../src/common/events';
import { PaymentsService } from '../src/modules/payments/payments.service';
import type {
  FakePaymentProvider,
  FakeWebhook,
} from '../src/modules/payments/providers/fake.provider';
import {
  PAYMENT_PROVIDERS,
  type PaymentProviders,
} from '../src/modules/payments/providers/payment-provider';
import { ReconciliationService } from '../src/modules/payments/reconciliation.service';
import type { AppOptions, AuthHeader } from './helpers';
import { productionCtx } from './production-fixtures';

export const PHONES = {
  success: '+22890123456',
  failure: '+22890123400',
  lost: '+22890123401',
  replayed: '+22890123402',
  never: '+22890123403',
} as const;

/** App complète (file de rendu factice) + agrégateur simulé + aides paiement. */
export async function paymentsCtx(extra?: AppOptions['configure']) {
  const t = await productionCtx(extra);
  const fake = t.app.get<PaymentProviders>(PAYMENT_PROVIDERS).active as FakePaymentProvider;
  const payments = t.app.get(PaymentsService);
  const reconciliation = t.app.get(ReconciliationService);
  const alerts: { name: string; payload: Record<string, unknown> }[] = [];
  const emitter = t.app.get(EventEmitter2);
  for (const name of Object.values(PAYMENT_EVENTS)) {
    emitter.on(name, (payload: Record<string, unknown>) => alerts.push({ name, payload }));
  }

  /** Commande en attente de paiement (une ligne, livraison à domicile). */
  async function order(
    method: 'tmoney' | 'flooz' | 'card' | 'cod' = 'tmoney',
    opts: { size?: Size; quantity?: number } = {},
  ) {
    const size = opts.size ?? 'M';
    await t.setStock('col-noir', size, 1000);
    const s = await t.shopper({ size, quantity: opts.quantity });
    const res = await t
      .placeOrder(s.auth, {
        reception: { type: 'home', addressId: s.addressId },
        paymentMethod: method,
      })
      .expect(201);
    return {
      id: res.body.id as string,
      number: res.body.number as string,
      totalXof: res.body.totalXof as number,
      depositXof: res.body.depositXof as number | null,
      auth: s.auth,
      userId: s.id,
    };
  }

  const pay = (
    auth: AuthHeader,
    orderId: string,
    body: Record<string, unknown> = { method: 'tmoney', payerPhone: PHONES.success },
    key: string = uuidv7(),
  ) =>
    t
      .http()
      .post(`/v1/orders/${orderId}/payments`)
      .set(...auth)
      .set('Idempotency-Key', key)
      .send(body);

  const send = (hook: FakeWebhook, provider = 'fake') =>
    t.http().post(`/v1/webhooks/payments/${provider}`).set(hook.headers).send(hook.body);

  const paymentRow = (id: string) => t.prisma.payment.findUniqueOrThrow({ where: { id } });

  /** Webhook signé que l'agrégateur enverrait pour ce paiement. */
  async function hookFor(paymentId: string, status: 'succeeded' | 'failed' = 'succeeded') {
    const p = await paymentRow(paymentId);
    return fake.webhook(
      { ref: p.providerRef as string, paymentId: p.id, amountXof: p.amountXof },
      status,
    );
  }

  const orderStatus = async (id: string) =>
    (await t.prisma.order.findUniqueOrThrow({ where: { id } })).status;

  const outMovements = (orderId: string) =>
    t.prisma.stockMovement.count({ where: { orderId, type: 'out' } });

  const paidTransitions = (orderId: string) =>
    t.prisma.orderStatusHistory.count({
      where: { orderId, toStatus: { in: ['paid', 'deposit_paid'] } },
    });

  /** Laisse aux écouteurs asynchrones (production) le temps d'agir avant d'affirmer une absence. */
  const settle = () => new Promise((r) => setTimeout(r, 250));

  return {
    ...t,
    fake,
    payments,
    reconciliation,
    alerts,
    order,
    pay,
    send,
    hookFor,
    paymentRow,
    orderStatus,
    outMovements,
    paidTransitions,
    settle,
  };
}

export type PaymentsCtx = Awaited<ReturnType<typeof paymentsCtx>>;
