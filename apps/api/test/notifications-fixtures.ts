import { FIXTURE_STORE } from '@streetwear/shared';
import { uuidv7 } from '../src/common/uuid';
import {
  NOTIFICATIONS_QUEUE,
  type NotificationJob,
  type NotificationsQueue,
} from '../src/modules/notifications/notifications.queue';
import {
  NotificationsService,
  type JobLike,
} from '../src/modules/notifications/notifications.service';
import { EMAIL_PROVIDER } from '../src/modules/notifications/providers/email.provider';
import type { FakeEmailProvider } from '../src/modules/notifications/providers/email.provider';
import {
  PUSH_PROVIDER,
  type FakePushProvider,
} from '../src/modules/notifications/providers/push.provider';
import { seedNotificationTemplates } from '../src/modules/notifications/seed';
import { OrdersService } from '../src/modules/orders/orders.service';
import { paymentsCtx } from './payments-fixtures';

export class InlineQueue implements NotificationsQueue {
  jobs: NotificationJob[] = [];
  failEnqueue = false;

  enqueue(job: NotificationJob): Promise<void> {
    if (this.failEnqueue) return Promise.reject(new Error('REDIS_DOWN'));
    this.jobs.push(job);
    return Promise.resolve();
  }
}

/** Job en mémoire ; `updateData` se comporte comme BullMQ (la charge est conservée entre les essais). */
export function memoryJob(data: NotificationJob): JobLike & { data: NotificationJob } {
  const job = {
    data,
    updateData: (d: NotificationJob) => {
      job.data = d;
      return Promise.resolve();
    },
  };
  return job;
}

/** App complète + file de notifications en mémoire + fournisseurs factices. */
export async function notificationsCtx() {
  const queue = new InlineQueue();
  const t = await paymentsCtx((b) => b.overrideProvider(NOTIFICATIONS_QUEUE).useValue(queue));
  await seedNotificationTemplates(t.prisma);
  const service = t.app.get(NotificationsService);
  const push = t.app.get<FakePushProvider>(PUSH_PROVIDER);
  const email = t.app.get<FakeEmailProvider>(EMAIL_PROVIDER);
  const orders = t.app.get(OrdersService);
  orders.registerPreconditionCheck('requiresOperator', async () => true);

  async function reset(): Promise<void> {
    queue.jobs = [];
    queue.failEnqueue = false;
    push.outbox.length = 0;
    push.failing = false;
    push.receiptErrors.clear();
    email.outbox.length = 0;
    email.failing = false;
    t.ctx.sms.outbox.length = 0;
    await t.prisma.notification.deleteMany();
    await t.prisma.pushToken.deleteMany();
  }

  /** Commande payée (domicile ou retrait) d'un client avec jeton push enregistré via l'API. */
  async function paid(
    kind: 'home' | 'pickup' = 'home',
    pushToken: string | null = 'ExpoToken-ok-1',
  ) {
    await t.setStock('col-noir', 'M', 1000);
    const s = await t.shopper({ size: 'M' });
    const reception =
      kind === 'pickup'
        ? { type: 'pickup', storeId: FIXTURE_STORE.id, slotId: (await t.slot(10)).id }
        : { type: 'home', addressId: s.addressId };
    const res = await t.placeOrder(s.auth, { reception, paymentMethod: 'tmoney' }).expect(201);
    const id = res.body.id as string;
    const created = t.events.find((e) => e.name === 'order.created' && e.payload.orderId === id);
    if (pushToken) {
      await t
        .http()
        .post('/v1/me/push-tokens')
        .set(...s.auth)
        .send({ token: pushToken, platform: 'android' })
        .expect(204);
    }
    await orders.runInTransaction((tx) =>
      orders.applyPaymentResult(id, { succeeded: true, kind: 'full' }, tx),
    );
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: s.id } });
    return {
      id,
      number: res.body.number as string,
      userId: s.id,
      phone: user.phone as string,
      createdPayload: created?.payload ?? {},
    };
  }

  const admin = { type: 'admin', role: 'super_admin' } as const;

  /** Fait avancer la commande (préconditions satisfaites en base) jusqu'à `to`. */
  async function advance(
    orderId: string,
    to: 'in_production' | 'ready' | 'shipped' | 'ready_for_pickup' | 'delivered',
  ): Promise<void> {
    const order = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const path: string[] = ['in_production', 'ready'];
    if (to === 'shipped' || to === 'delivered') path.push('shipped');
    if (to === 'ready_for_pickup') path.push('ready_for_pickup');
    const done = path.indexOf(order.status);
    for (const step of path.slice(done + 1)) {
      if (step === 'ready') {
        await t.prisma.orderItem.updateMany({
          where: { orderId },
          data: { printFileFrontUrl: 'https://cdn.example.com/f.png' },
        });
      }
      if (step === 'shipped' && order.receptionType === 'home') {
        const adminRow = await t.prisma.adminUser.findFirstOrThrow({ where: { role: 'courier' } });
        const courier =
          (await t.prisma.courier.findFirst({ where: { adminUserId: adminRow.id } })) ??
          (await t.prisma.courier.create({
            data: { id: uuidv7(), adminUserId: adminRow.id, phone: '+22890000009' },
          }));
        await t.prisma.delivery.update({
          where: { orderId },
          data: { courierId: courier.id, status: 'assigned' },
        });
      }
      await orders.transition(orderId, step as never, admin);
      if (step === to) break;
    }
  }

  /** Rejoue tous les jobs en attente (comme le worker) et renvoie les jobs traités. */
  async function drain() {
    await new Promise((r) => setTimeout(r, 20));
    const done: ReturnType<typeof memoryJob>[] = [];
    while (queue.jobs.length) {
      const job = memoryJob(queue.jobs.shift() as NotificationJob);
      await service.process(job);
      done.push(job);
    }
    return done;
  }

  return { ...t, sms: t.ctx.sms, queue, service, push, email, orders, reset, paid, advance, drain };
}

export type NotificationsCtx = Awaited<ReturnType<typeof notificationsCtx>>;
