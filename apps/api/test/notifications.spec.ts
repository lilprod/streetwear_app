import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { EVENTS, PAYMENT_EVENTS } from '../src/common/events';
import { decrypt, hmac } from '../src/common/crypto';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import {
  BullNotificationsQueue,
  NOTIFICATIONS_QUEUE_NAME,
  type NotificationJob,
} from '../src/modules/notifications/notifications.queue';
import { PRODUCTION_EVENTS } from '../src/modules/production/production.events';
import { ENV } from '../src/config/env';
import { startNotificationsWorker } from '../src/modules/notifications/notifications.worker';
import { redisConnection } from '../src/modules/production/render/render.queue';
import { waitFor } from './production-fixtures';
import { memoryJob, notificationsCtx, type NotificationsCtx } from './notifications-fixtures';

const def = <T>(v: T | undefined | null): T => {
  if (v === undefined || v === null) throw new Error('valeur attendue');
  return v;
};

const REDIS_URL = process.env.REDIS_URL as string;

describe('SP07 notifications', () => {
  let t: NotificationsCtx;
  const logs: string[] = [];

  beforeAll(async () => {
    t = await notificationsCtx();
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await t.app.close();
  });
  beforeEach(async () => {
    await t.reset();
    logs.length = 0;
  });

  const takeLast = () => {
    const job = t.queue.jobs.at(-1);
    t.queue.jobs = [];
    return job;
  };

  const rows = (orderId: string) =>
    t.prisma.notification.findMany({ where: { orderId }, orderBy: { channel: 'asc' } });

  /** Tout ce qui est persisté en base pour les commandes, livraisons, retraits et notifications. */
  async function dumpDb(): Promise<string> {
    const [a, b, c, d, e] = await Promise.all([
      t.prisma.notification.findMany(),
      t.prisma.notificationTemplate.findMany(),
      t.prisma.pickup.findMany(),
      t.prisma.delivery.findMany(),
      t.prisma.order.findMany(),
    ]);
    return JSON.stringify([a, b, c, d, e]);
  }

  async function dumpRedis(): Promise<string> {
    const redis = new Redis(REDIS_URL);
    try {
      const out: unknown[] = [];
      for (const key of await redis.keys('*')) {
        const type = await redis.type(key);
        if (type === 'string') out.push(await redis.get(key));
        else if (type === 'hash') out.push(await redis.hgetall(key));
        else if (type === 'list') out.push(await redis.lrange(key, 0, -1));
        else if (type === 'set') out.push(await redis.smembers(key));
        else if (type === 'zset') out.push(await redis.zrange(key, 0, -1));
        else if (type === 'stream') out.push(await redis.xrange(key, '-', '+'));
      }
      return JSON.stringify(out);
    } finally {
      redis.disconnect();
    }
  }

  describe('US-24 : un push et un SMS par changement de statut', () => {
    it('confirme la commande payée par push et SMS en français', async () => {
      const o = await t.paid();
      expect(t.queue.jobs).toHaveLength(1);
      expect(t.queue.jobs[0]).toMatchObject({ kind: 'order', orderId: o.id, status: 'paid' });
      await t.drain();
      expect(t.push.outbox).toHaveLength(1);
      expect(t.push.outbox[0]).toMatchObject({
        to: 'ExpoToken-ok-1',
        title: 'Commande confirmée',
        body: `${o.number} est payée, on lance la production.`,
        data: { orderId: o.id, status: 'paid' },
      });
      expect(t.sms.outbox).toEqual([
        {
          phone: o.phone,
          text: `[Streetwear] : commande ${o.number} confirmée. Suivi dans l'app.`,
        },
      ]);
      const saved = await rows(o.id);
      expect(saved.map((r) => [r.channel, r.status])).toEqual([
        ['push', 'sent'],
        ['sms', 'sent'],
      ]);
      expect(saved[0]?.providerRef).toMatch(/^fake-ticket-/);
      expect(saved[1]?.payload).toEqual({ orderNumber: o.number });
    });

    it('suit la commande : production (push seul), retrait, livraison, échec, expiration', async () => {
      const o = await t.paid('home');
      await t.drain();
      await t.advance(o.id, 'in_production');
      await t.drain();
      expect(t.push.outbox.at(-1)).toMatchObject({
        title: 'En production',
        body: "Ton t-shirt est à l'atelier.",
      });
      expect(t.sms.outbox).toHaveLength(1);
      await t.advance(o.id, 'ready');
      expect(t.queue.jobs).toHaveLength(0);
      const sent = (await rows(o.id)).map((r) => `${r.orderStatus}:${r.channel}`);
      expect(sent.sort()).toEqual(['in_production:push', 'paid:push', 'paid:sms']);

      const emitter = t.app.get(EventEmitter2);
      const evt = (to: string) => ({
        orderId: o.id,
        userId: o.userId,
        number: o.number,
        from: 'paid',
        to,
        actorType: 'system',
        actorId: null,
      });
      for (const [to, title, body] of [
        ['delivered', 'Livrée', 'Merci ! Montre-nous ton t-shirt.'],
        ['payment_failed', 'Paiement non abouti', "Réessaie depuis l'app."],
      ] as const) {
        emitter.emit(EVENTS.orderStatusChanged, evt(to));
        await t.drain();
        expect(t.push.outbox.at(-1)).toMatchObject({ title, body });
      }
      emitter.emit(EVENTS.orderExpired, { orderId: o.id, userId: o.userId, number: o.number });
      emitter.emit(EVENTS.orderStatusChanged, evt('expired'));
      await t.drain();
      expect(t.push.outbox.filter((m) => m.title === 'Commande expirée')).toHaveLength(1);
      expect(t.sms.outbox).toHaveLength(1);
      emitter.emit(EVENTS.orderStatusChanged, evt('cancelled'));
      expect(t.queue.jobs).toHaveLength(0);
    });

    it('ne notifie pas sans jeton ni numéro, et respecte un modèle désactivé', async () => {
      const o = await t.paid('home', null);
      await t.prisma.notificationTemplate.update({
        where: { key_channel: { key: 'order.paid', channel: 'sms' } },
        data: { active: false },
      });
      await t.drain();
      expect(t.push.outbox).toHaveLength(0);
      expect(t.sms.outbox).toHaveLength(0);
      expect((await rows(o.id)).map((r) => [r.channel, r.status, r.error])).toEqual([
        ['push', 'skipped', 'NO_PUSH_TOKEN'],
      ]);
      await t.prisma.notificationTemplate.update({
        where: { key_channel: { key: 'order.paid', channel: 'sms' } },
        data: { active: true },
      });
    });

    it("l'enregistrement du jeton push est idempotent et validé", async () => {
      const s = await t.shopper();
      const post = (body: object) =>
        t
          .http()
          .post('/v1/me/push-tokens')
          .set(...s.auth)
          .send(body);
      await post({ token: 'ExpoToken-a', platform: 'ios' }).expect(204);
      await post({ token: 'ExpoToken-a', platform: 'ios' }).expect(204);
      expect(await t.prisma.pushToken.count({ where: { userId: s.id } })).toBe(1);
      await post({ platform: 'ios' }).expect(400);
      await t.http().post('/v1/me/push-tokens').send({ token: 'x', platform: 'ios' }).expect(401);
    });
  });

  describe('idempotence par (commande, statut)', () => {
    it('événement émis deux fois : un seul push et un seul SMS', async () => {
      const o = await t.paid();
      const emitter = t.app.get(EventEmitter2);
      emitter.emit(EVENTS.orderStatusChanged, {
        orderId: o.id,
        userId: o.userId,
        number: o.number,
        from: 'pending_payment',
        to: 'paid',
        actorType: 'provider',
        actorId: null,
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(t.queue.jobs).toHaveLength(2);
      await t.drain();
      expect(t.push.outbox).toHaveLength(1);
      expect(t.sms.outbox).toHaveLength(1);
      expect(await t.prisma.notification.count({ where: { orderId: o.id } })).toBe(2);
    });

    it('jobs concurrents : un seul envoi par canal', async () => {
      const o = await t.paid();
      const job = takeLast();
      const many = Array.from({ length: 6 }, () => t.service.process(memoryJob(def(job))));
      await Promise.all(many);
      expect(t.push.outbox).toHaveLength(1);
      expect(t.sms.outbox).toHaveLength(1);
      expect(await t.prisma.notification.count({ where: { orderId: o.id } })).toBe(2);
    });

    it('la base refuse un doublon (commande, statut, canal)', async () => {
      const o = await t.paid();
      await t.drain();
      await expect(
        t.prisma.notification.create({
          data: {
            id: '01990000-0000-7000-8000-000000000001',
            orderId: o.id,
            orderStatus: 'paid',
            channel: 'push',
            templateKey: 'order.paid',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('un envoi partiel rejoué ne renvoie que le canal manquant', async () => {
      const o = await t.paid();
      t.push.failing = true;
      const job = takeLast();
      const mem = memoryJob(def(job));
      await expect(t.service.process(mem)).rejects.toThrow('NOTIFICATION_SEND_FAILED');
      expect(t.sms.outbox).toHaveLength(1);
      expect((await rows(o.id)).map((r) => [r.channel, r.status])).toEqual([
        ['push', 'failed'],
        ['sms', 'sent'],
      ]);
      t.push.failing = false;
      await t.service.process(mem);
      expect(t.push.outbox).toHaveLength(1);
      expect(t.sms.outbox).toHaveLength(1);
    });
  });

  describe('pannes de fournisseur', () => {
    it('une file ou un fournisseur en panne ne bloque jamais une transition', async () => {
      const o = await t.paid();
      await t.drain();
      t.queue.failEnqueue = true;
      t.push.failing = true;
      t.email.failing = true;
      await t.advance(o.id, 'in_production');
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
        'in_production',
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(logs.some((l) => l.includes('Mise en file de la notification impossible'))).toBe(true);
    });

    it('un push en panne laisse la commande intacte et le job rejouable', async () => {
      const o = await t.paid();
      t.push.failing = true;
      await expect(t.drain()).rejects.toThrow('NOTIFICATION_SEND_FAILED');
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('paid');
    });

    it('le job BullMQ est configuré avec 3 essais et attente exponentielle', async () => {
      const queue = new BullNotificationsQueue(REDIS_URL);
      const raw = new Queue(NOTIFICATIONS_QUEUE_NAME, { connection: redisConnection(REDIS_URL) });
      await raw.obliterate({ force: true });
      const job: NotificationJob = {
        kind: 'order',
        orderId: '01990000-0000-7000-8000-0000000000aa',
        userId: '01990000-0000-7000-8000-0000000000bb',
        orderNumber: 'TG-000001',
        status: 'paid',
      };
      await queue.enqueue(job);
      await queue.enqueue(job);
      const [stored, ...rest] = await raw.getJobs(['waiting', 'delayed']);
      expect(rest).toHaveLength(0);
      expect(stored?.opts.attempts).toBe(3);
      expect(stored?.opts.backoff).toMatchObject({ type: 'exponential' });
      await raw.obliterate({ force: true });
      await raw.close();
      await queue.close();
    });
  });

  describe('jetons push invalides', () => {
    it('supprime un jeton DeviceNotRegistered dès le premier ticket en erreur', async () => {
      const o = await t.paid('home', 'invalid-token-1');
      await t.prisma.pushToken.create({
        data: {
          id: '01990000-0000-7000-8000-0000000000c1',
          userId: o.userId,
          token: 'ExpoToken-good',
          platform: 'ios',
        },
      });
      await t.drain();
      const left = await t.prisma.pushToken.findMany({ where: { userId: o.userId } });
      expect(left.map((x) => x.token)).toEqual(['ExpoToken-good']);
      expect((await rows(o.id)).find((r) => r.channel === 'push')?.status).toBe('sent');
    });

    it('un seul jeton invalide : envoi en échec définitif sans rejeu, jeton supprimé', async () => {
      const o = await t.paid('home', 'invalid-token-2');
      await t.drain();
      expect(await t.prisma.pushToken.count({ where: { userId: o.userId } })).toBe(0);
      const push = (await rows(o.id)).find((r) => r.channel === 'push');
      expect([push?.status, push?.error]).toEqual(['failed', 'DEVICE_NOT_REGISTERED']);
    });

    it('supprime sur reçu en erreur (job de reçus)', async () => {
      const o = await t.paid();
      const [paidJob] = t.queue.jobs.splice(0);
      await t.service.process(memoryJob(def(paidJob)));
      const receipts = t.queue.jobs.find((j) => j.kind === 'receipts');
      expect(receipts?.kind === 'receipts' && receipts.tickets).toHaveLength(1);
      if (receipts?.kind !== 'receipts') throw new Error('reçus attendus');
      t.push.receiptErrors.set(def(receipts.tickets[0]).id, 'DeviceNotRegistered');
      await t.service.process(memoryJob(receipts));
      expect(await t.prisma.pushToken.count({ where: { userId: o.userId } })).toBe(0);
    });
  });

  describe('codes de retrait et de remise', () => {
    it("order.created n'enfile rien et le code initial n'est écrit nulle part", async () => {
      t.queue.jobs = [];
      const o = await t.paid('pickup');
      expect(t.queue.jobs.every((j) => j.kind === 'order' && j.status === 'paid')).toBe(true);
      const initial = String(o.createdPayload.pickupCode);
      expect(initial).toMatch(/^\d{6}$/);
      expect(JSON.stringify(t.queue.jobs)).not.toContain(`"${initial}"`);
      expect(await dumpDb()).not.toContain(initial);
    });

    it('retrait : nouveau code émis au changement de statut, haché, identique en push et SMS', async () => {
      const o = await t.paid('pickup');
      await t.drain();
      const pickupBefore = await t.prisma.pickup.findUniqueOrThrow({ where: { orderId: o.id } });
      await t.advance(o.id, 'ready_for_pickup');
      const job = takeLast();
      const mem = memoryJob(def(job));
      await t.service.process(mem);

      const push = def(t.push.outbox.at(-1));
      const code = /Code de retrait : (\d{6})$/.exec(push.body)?.[1] as string;
      expect(code).toMatch(/^\d{6}$/);
      expect(push.title).toBe('Prête au retrait');
      expect(push.data).toEqual({ orderId: o.id, status: 'ready_for_pickup', code });
      expect(t.sms.outbox.at(-1)?.text).toBe(
        `[Streetwear] : ${o.number} prete. Code de retrait ${code}.`,
      );

      const pickup = await t.prisma.pickup.findUniqueOrThrow({ where: { orderId: o.id } });
      const delivery = t.app.get(DeliveryService);
      expect(pickup.pickupCodeHash).toBe(delivery.codeHash('pickup', pickup.id, code));
      expect(pickup.pickupCodeHash).not.toBe(pickupBefore.pickupCodeHash);
      expect(pickup.codeAttempts).toBe(0);
      expect(mem.data).toMatchObject({ kind: 'order' });
      const enc = (mem.data as { encCode?: string }).encCode as string;
      expect(enc).not.toContain(code);
      const key = hmac(t.app.get(ENV).JWT_SECRET, 'notification-code-key');
      expect(decrypt(key, enc)).toBe(code);

      const db = await dumpDb();
      expect(db).not.toContain(code);
      expect(db).not.toContain(String(o.createdPayload.pickupCode));
      const all = logs.join('\n');
      expect(all).not.toContain(code);
      expect(all).not.toContain(o.phone);
    });

    it('un rejeu réutilise le même code pour les deux canaux', async () => {
      const o = await t.paid('pickup');
      await t.drain();
      await t.advance(o.id, 'ready_for_pickup');
      const job = takeLast();
      t.push.failing = true;
      const mem = memoryJob(def(job));
      await expect(t.service.process(mem)).rejects.toThrow();
      const smsCode = /(\d{6})\.$/.exec(def(t.sms.outbox.at(-1)).text)?.[1];
      t.push.failing = false;
      await t.service.process(mem);
      expect(t.push.outbox.at(-1)?.body).toBe(`Code de retrait : ${smsCode}`);
      expect(t.sms.outbox.filter((m) => m.text.includes('Code de retrait'))).toHaveLength(1);
      const pickup = await t.prisma.pickup.findUniqueOrThrow({ where: { orderId: o.id } });
      expect(pickup.pickupCodeHash).toBe(
        t.app.get(DeliveryService).codeHash('pickup', pickup.id, smsCode as string),
      );
    });

    it('livraison : le code de remise remplace le hachage et le courrier le valide', async () => {
      const o = await t.paid('home');
      await t.drain();
      await t.advance(o.id, 'shipped');
      const job = takeLast();
      await t.service.process(memoryJob(def(job)));
      const push = def(t.push.outbox.at(-1));
      const code = /Code de remise : (\d{6})$/.exec(push.body)?.[1] as string;
      expect(push.title).toBe('En route');
      expect(push.data).toEqual({ orderId: o.id, status: 'shipped', code });
      expect(t.sms.outbox.at(-1)?.text).toBe(
        `[Streetwear] : ${o.number} en livraison. Code de remise ${code}.`,
      );
      const d = await t.prisma.delivery.findUniqueOrThrow({ where: { orderId: o.id } });
      expect(d.handoverCodeHash).toBe(t.app.get(DeliveryService).codeHash('handover', d.id, code));
      expect(await dumpDb()).not.toContain(code);
    });

    it('commande déjà passée à un autre statut : aucun code émis, envoi ignoré', async () => {
      const o = await t.paid('pickup');
      await t.drain();
      await t.advance(o.id, 'ready_for_pickup');
      const job = takeLast();
      const before = await t.prisma.pickup.findUniqueOrThrow({ where: { orderId: o.id } });
      await t.prisma.order.update({ where: { id: o.id }, data: { status: 'delivered' } });
      const sms = t.sms.outbox.length;
      await t.service.process(memoryJob(def(job)));
      expect(t.sms.outbox).toHaveLength(sms);
      const after = await t.prisma.pickup.findUniqueOrThrow({ where: { orderId: o.id } });
      expect(after.pickupCodeHash).toBe(before.pickupCodeHash);
      expect(
        (await rows(o.id)).filter((r) => r.orderStatus === 'ready_for_pickup').map((r) => r.error),
      ).toEqual(['STALE', 'STALE']);
    });

    it('data.code du push est présent même si le corps du modèle ne contient pas le code, sans persistance', async () => {
      const key = { key_channel: { key: 'order.ready_for_pickup', channel: 'push' as const } };
      const tpl = await t.prisma.notificationTemplate.findUniqueOrThrow({ where: key });
      await t.prisma.notificationTemplate.update({
        where: key,
        data: { body: 'Ta commande {{orderNumber}} est prête.' },
      });
      try {
        const o = await t.paid('pickup');
        await t.drain();
        await t.advance(o.id, 'ready_for_pickup');
        await t.service.process(memoryJob(def(takeLast())));
        const push = def(t.push.outbox.at(-1));
        expect(push.body).toBe(`Ta commande ${o.number} est prête.`);
        const code = (push.data as { code?: string }).code as string;
        expect(code).toMatch(/^\d{6}$/);
        const pickup = await t.prisma.pickup.findUniqueOrThrow({ where: { orderId: o.id } });
        expect(pickup.pickupCodeHash).toBe(
          t.app.get(DeliveryService).codeHash('pickup', pickup.id, code),
        );
        const rows = await t.prisma.notification.findMany({ where: { orderId: o.id } });
        expect(JSON.stringify(rows)).not.toContain(code);
        expect(await dumpDb()).not.toContain(code);
        expect(logs.join('\n')).not.toContain(code);
      } finally {
        await t.prisma.notificationTemplate.update({ where: key, data: { body: tpl.body } });
      }
    });

    it('aucun code en clair dans Redis (job BullMQ réel), ni en base, ni dans les journaux', async () => {
      const o = await t.paid('pickup');
      await t.drain();
      await t.advance(o.id, 'ready_for_pickup');
      t.queue.jobs = [];
      const raw = new Queue(NOTIFICATIONS_QUEUE_NAME, { connection: redisConnection(REDIS_URL) });
      await raw.obliterate({ force: true });
      const real = new BullNotificationsQueue(REDIS_URL);
      const worker = startNotificationsWorker(t.app, REDIS_URL);
      t.push.failing = true;
      await real.enqueue({
        kind: 'order',
        orderId: o.id,
        userId: o.userId,
        orderNumber: o.number,
        status: 'ready_for_pickup',
      });
      try {
        const delayed = await waitFor(async () => {
          const jobs = await raw.getJobs(['delayed']);
          const job = jobs[0];
          return job && (job.data as { encCode?: string }).encCode ? job : false;
        });
        const smsCode = /(\d{6})\.$/.exec(def(t.sms.outbox.at(-1)).text)?.[1] as string;
        const redisDump = await dumpRedis();
        expect(redisDump).not.toContain(smsCode);
        expect(redisDump).toContain('encCode');
        const key = hmac(t.app.get(ENV).JWT_SECRET, 'notification-code-key');
        expect(decrypt(key, (delayed.data as { encCode: string }).encCode)).toBe(smsCode);

        t.push.failing = false;
        await delayed.promote();
        await waitFor(async () => t.push.outbox.at(-1)?.body.includes(smsCode));
        await waitFor(async () => {
          const c = await raw.getJobCounts('delayed', 'waiting', 'active', 'completed', 'failed');
          return Object.values(c).every((n) => n === 0);
        });
        expect(await dumpRedis()).not.toContain(smsCode);
        expect(await dumpDb()).not.toContain(smsCode);
        expect(logs.join('\n')).not.toContain(smsCode);
      } finally {
        await worker.close();
        await raw.obliterate({ force: true });
        await raw.close();
        await real.close();
      }
    }, 30_000);
  });

  describe('alertes équipe par e-mail', () => {
    const emitter = () => t.app.get(EventEmitter2);
    const emails = () => t.email.outbox.map((m) => m.to).sort();
    const adminsOf = async (...roles: ('production' | 'order_manager' | 'super_admin')[]) =>
      (
        await t.prisma.adminUser.findMany({
          where: { role: { in: roles }, active: true },
          select: { email: true },
        })
      )
        .map((a) => a.email)
        .sort();

    it('stock bas : e-mail aux comptes production et super_admin actifs uniquement', async () => {
      await t.prisma.adminUser.updateMany({
        where: { role: 'production' },
        data: { active: true },
      });
      const inactive = await t.prisma.adminUser.create({
        data: {
          id: '01990000-0000-7000-8000-0000000000d1',
          email: 'inactif@example.com',
          role: 'production',
          active: false,
          passwordHash: 'x',
        },
      });
      const color = await t.prisma.tshirtColor.findUniqueOrThrow({ where: { id: 'col-noir' } });
      emitter().emit(EVENTS.stockBelowThreshold, {
        stockItemId: '01990000-0000-7000-8000-0000000000e1',
        colorId: 'col-noir',
        size: 'M',
        available: 2,
        alertThreshold: 5,
      });
      await waitFor(async () => t.queue.jobs.length > 0);
      await t.drain();
      expect(emails()).toEqual(await adminsOf('production', 'super_admin'));
      expect(emails()).not.toContain(inactive.email);
      expect(t.email.outbox[0]?.subject).toBe(`Stock bas : ${color.name} M (2)`);
      expect(t.email.outbox[0]?.text).toContain("seuil d'alerte : 5");
      await t.prisma.adminUser.delete({ where: { id: inactive.id } });
    });

    it.each([
      [
        PRODUCTION_EVENTS.renderFailed,
        {
          orderId: 'o',
          orderItemId: 'i',
          orderNumber: 'TG-000042',
          code: 'PATTERN_ASSET_MISSING',
          message: 'm',
        },
        ['production', 'super_admin'],
        'Rendu HD en échec : TG-000042',
      ],
      [
        PAYMENT_EVENTS.amountMismatch,
        {
          paymentId: 'p',
          orderId: 'o',
          orderNumber: 'TG-000042',
          provider: 'fake',
          expectedXof: 12000,
          receivedXof: 10000,
        },
        ['order_manager', 'super_admin'],
        'Écart de montant : TG-000042',
      ],
      [
        PAYMENT_EVENTS.unexpectedSuccess,
        {
          paymentId: 'p',
          orderId: 'o',
          orderNumber: 'TG-000042',
          provider: 'fake',
          amountXof: 12000,
          orderStatus: 'expired',
        },
        ['order_manager', 'super_admin'],
        'Paiement sur commande non payable : TG-000042',
      ],
      [
        PAYMENT_EVENTS.reconciliationMismatch,
        {
          reconciliationId: 'r',
          date: '2026-11-10',
          provider: 'fake',
          matched: 40,
          mismatchCount: 2,
        },
        ['order_manager', 'super_admin'],
        'Rapprochement du 2026-11-10 : 2 écart(s)',
      ],
    ] as const)('%s : destinataires selon le rôle', async (event, payload, roles, subject) => {
      emitter().emit(event, payload);
      await waitFor(async () => t.queue.jobs.length > 0);
      await t.drain();
      expect(emails()).toEqual(await adminsOf(...roles));
      expect(t.email.outbox.every((m) => m.subject === subject)).toBe(true);
      expect(JSON.stringify(t.email.outbox)).not.toContain('{{');
    });

    it('formate les montants en FCFA', async () => {
      emitter().emit(PAYMENT_EVENTS.amountMismatch, {
        paymentId: 'p',
        orderId: 'o',
        orderNumber: 'TG-000042',
        provider: 'fake',
        expectedXof: 12000,
        receivedXof: 10000,
      });
      await waitFor(async () => t.queue.jobs.length > 0);
      await t.drain();
      expect(t.email.outbox[0]?.text).toContain('10 000 FCFA');
      expect(t.email.outbox[0]?.text).toContain('12 000 FCFA');
    });

    it('e-mail en panne : rejeu sans doublon pour les destinataires déjà servis', async () => {
      emitter().emit(PAYMENT_EVENTS.reconciliationMismatch, {
        reconciliationId: 'r',
        date: '2026-11-10',
        provider: 'fake',
        matched: 1,
        mismatchCount: 1,
      });
      await waitFor(async () => t.queue.jobs.length > 0);
      const job = takeLast();
      t.email.failing = true;
      await expect(t.service.process(memoryJob(def(job)))).rejects.toThrow(
        'NOTIFICATION_SEND_FAILED',
      );
      expect(t.email.outbox).toHaveLength(0);
      t.email.failing = false;
      await t.service.process(memoryJob(def(job)));
      await t.service.process(memoryJob(def(job)));
      expect(emails()).toEqual(await adminsOf('order_manager', 'super_admin'));
    });
  });

  describe('GET/PATCH /admin/notification-templates', () => {
    const url = '/v1/admin/notification-templates';
    const patch = (body: object, role: 'super_admin' = 'super_admin') =>
      t
        .http()
        .patch(url)
        .set(...t.adminAuth(role))
        .send(body);

    it('liste les modèles avec aperçu et variables (super_admin)', async () => {
      const res = await t
        .http()
        .get(url)
        .set(...t.adminAuth('super_admin'))
        .expect(200);
      const paid = res.body.items.find(
        (i: { key: string; channel: string }) => i.key === 'order.paid' && i.channel === 'sms',
      );
      expect(paid).toMatchObject({
        body: "[{{brand}}] : commande {{orderNumber}} confirmée. Suivi dans l'app.",
        preview: {
          title: null,
          body: "[Streetwear] : commande TG-000123 confirmée. Suivi dans l'app.",
        },
        variables: ['brand', 'orderNumber', 'status'],
      });
      expect(paid.smsMaxLength).toBeLessThanOrEqual(160);
      expect(res.body.items).toHaveLength(15);
      const pickup = res.body.items.find(
        (i: { key: string; channel: string }) =>
          i.key === 'order.ready_for_pickup' && i.channel === 'push',
      );
      expect(pickup.preview.body).toBe('Code de retrait : 123456');
    });

    it('refuse sans authentification et pour les autres rôles', async () => {
      await t.http().get(url).expect(401);
      await t.http().patch(url).send({}).expect(401);
      for (const role of ['order_manager', 'production', 'logistics', 'courier'] as const) {
        await t
          .http()
          .get(url)
          .set(...t.adminAuth(role))
          .expect(403);
        await t
          .http()
          .patch(url)
          .set(...t.adminAuth(role))
          .send({ key: 'order.paid', channel: 'push', body: 'x' })
          .expect(403);
      }
    });

    it('modifie un modèle et utilise le nouveau texte aux envois suivants', async () => {
      const res = await patch({
        key: 'order.paid',
        channel: 'push',
        title: 'Payée !',
        body: 'Reçu pour {{orderNumber}}.',
      }).expect(200);
      expect(res.body).toMatchObject({
        title: 'Payée !',
        preview: { title: 'Payée !', body: 'Reçu pour TG-000123.' },
      });
      const o = await t.paid();
      await t.drain();
      expect(t.push.outbox[0]).toMatchObject({ title: 'Payée !', body: `Reçu pour ${o.number}.` });
      await patch({
        key: 'order.paid',
        channel: 'push',
        title: 'Commande confirmée',
        body: '{{orderNumber}} est payée, on lance la production.',
      }).expect(200);
    });

    it.each([
      [
        'variable inconnue',
        { key: 'order.paid', channel: 'push', body: 'Salut {{inconnue}}' },
        'UNKNOWN_VARIABLE',
      ],
      [
        'code interdit dans le modèle',
        { key: 'order.paid', channel: 'push', body: '{{pickupCode}}' },
        'UNKNOWN_VARIABLE',
      ],
      [
        'code dans le titre',
        { key: 'order.ready_for_pickup', channel: 'push', title: '{{pickupCode}}' },
        'CODE_IN_TITLE',
      ],
      [
        'SMS avec emoji',
        { key: 'order.paid', channel: 'sms', body: 'Merci 🎉 {{orderNumber}}' },
        'SMS_NOT_GSM7',
      ],
      [
        'SMS trop long',
        { key: 'order.paid', channel: 'sms', body: `${'a'.repeat(150)} {{orderNumber}}` },
        'SMS_TOO_LONG',
      ],
      [
        'accolades non fermées',
        { key: 'order.paid', channel: 'push', body: 'Salut {{orderNumber' },
        'MALFORMED_PLACEHOLDER',
      ],
      [
        'titre sur un SMS',
        { key: 'order.paid', channel: 'sms', title: 'Titre' },
        'SMS_HAS_NO_TITLE',
      ],
    ])('refuse : %s', async (_name, body, reason) => {
      const res = await patch(body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.reasons).toContain(reason);
      expect(res.body.error.message).toMatch(/[a-zé]/);
    });

    it('refuse un corps invalide et un modèle inconnu', async () => {
      await patch({ key: 'order.paid' }).expect(400);
      await patch({ key: 'order.paid', channel: 'push', body: '', extra: 1 }).expect(400);
      await patch({ key: 'order.unknown', channel: 'push', body: 'x' }).expect(404);
      await patch({ key: 'order.in_production', channel: 'sms', body: 'x' }).expect(404);
    });

    it('désactive un canal', async () => {
      await patch({ key: 'order.paid', channel: 'sms', active: false }).expect(200);
      const o = await t.paid();
      await t.drain();
      expect(t.sms.outbox).toHaveLength(0);
      expect((await rows(o.id)).map((r) => r.channel)).toEqual(['push']);
      await patch({ key: 'order.paid', channel: 'sms', active: true }).expect(200);
    });
  });
});
