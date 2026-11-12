import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationTemplate } from '@prisma/client';
import { decrypt, encrypt, hmac } from '../../common/crypto';
import { maskTgPhone } from '../../common/redact';
import { uuidv7 } from '../../common/uuid';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService, randomCode } from '../delivery/delivery.service';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider';
import { gsm7Length, SMS_MAX_SEPTETS, toGsm7 } from './gsm7';
import {
  NOTIFICATIONS_QUEUE,
  type NotificationJob,
  type NotificationsQueue,
} from './notifications.queue';
import { EMAIL_PROVIDER, type EmailProvider } from './providers/email.provider';
import { PUSH_PROVIDER, type PushProvider } from './providers/push.provider';
import { codeVarsIn, render, STATUS_LABEL, STATUS_TEMPLATE_KEY, type CodeVar } from './templates';

/** Sous-ensemble d'un job BullMQ utilisé par le traitement (testable sans Redis). */
export interface JobLike {
  data: NotificationJob;
  updateData(data: NotificationJob): Promise<void>;
}

type OrderJob = Extract<NotificationJob, { kind: 'order' }>;
type AlertJob = Extract<NotificationJob, { kind: 'alert' }>;
type ReceiptsJob = Extract<NotificationJob, { kind: 'receipts' }>;

interface Claim {
  id: string;
  template: NotificationTemplate;
}

interface Outcome {
  status: 'sent' | 'failed' | 'skipped';
  providerRef?: string;
  error?: string;
  /** Erreur transitoire : le job doit être rejoué. */
  retry?: boolean;
}

const CLAIM_TTL_MS = 2 * 60_000;
const PERMANENT_PUSH_ERRORS = new Set(['DeviceNotRegistered']);

/** Code transmis en clair dans `data.code` du push, jamais persisté ni journalisé. */
const PUSH_CODE_VAR: Partial<Record<string, CodeVar>> = {
  ready_for_pickup: 'pickupCode',
  shipped: 'handoverCode',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  private readonly codeSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(NOTIFICATIONS_QUEUE) private readonly queue: NotificationsQueue,
    private readonly delivery: DeliveryService,
  ) {
    this.codeSecret = env.NOTIFICATION_CODE_KEY || hmac(env.JWT_SECRET, 'notification-code-key');
  }

  async process(job: JobLike): Promise<void> {
    const data = job.data;
    if (data.kind === 'order') await this.processOrder(job, data);
    else if (data.kind === 'alert') await this.processAlert(data);
    else await this.processReceipts(data);
  }

  // ---- Notifications client (push + SMS) ----

  private async processOrder(job: JobLike, data: OrderJob): Promise<void> {
    const key = STATUS_TEMPLATE_KEY[data.status];
    if (!key) return;
    const templates = await this.prisma.notificationTemplate.findMany({
      where: { key, active: true, channel: { in: ['push', 'sms'] } },
    });
    const claims: Claim[] = [];
    for (const template of templates) {
      const claimed = await this.claim({
        template,
        orderId: data.orderId,
        orderStatus: data.status,
        userId: data.userId,
        payload: { orderNumber: data.orderNumber },
      });
      if (claimed) claims.push(claimed);
    }
    if (!claims.length) return;

    const values: Record<string, string> = {
      brand: this.env.BRAND_NAME,
      orderNumber: data.orderNumber,
      status: STATUS_LABEL[data.status] ?? data.status,
    };
    const pushCodeVar = claims.some((c) => c.template.channel === 'push')
      ? PUSH_CODE_VAR[data.status]
      : undefined;
    const codeVars = [
      ...new Set([
        ...claims.flatMap((c) => codeVarsIn(c.template.body)),
        ...(pushCodeVar ? [pushCodeVar] : []),
      ]),
    ];
    if (codeVars.length) {
      const code = await this.issueCode(job, data, codeVars);
      if (code === null) {
        for (const c of claims) await this.finish(c.id, { status: 'skipped', error: 'STALE' });
        return;
      }
      for (const v of codeVars) values[v] = code;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { phone: true, deletedAt: true },
    });
    let retry = false;
    for (const c of claims) {
      let outcome: Outcome;
      try {
        outcome =
          !user || user.deletedAt
            ? { status: 'skipped', error: 'USER_GONE' }
            : c.template.channel === 'push'
              ? await this.sendPush(data, c.template, values)
              : await this.sendSms(user.phone, c.template, values);
      } catch (err) {
        outcome = { status: 'failed', error: errorLabel(err), retry: true };
      }
      await this.finish(c.id, outcome);
      this.logger.log(
        `${c.template.key} (${c.template.channel}) : ${outcome.status}` +
          (outcome.error ? ` [${outcome.error}]` : '') +
          (c.template.channel === 'sms' ? ` → ${maskTgPhone(user?.phone) ?? '••••'}` : ''),
      );
      retry ||= outcome.retry === true;
    }
    if (retry) throw new Error('NOTIFICATION_SEND_FAILED');
  }

  /**
   * Émet un nouveau code (les codes ne sont stockés que hachés) : le code est tiré une fois par job,
   * chiffré dans la charge du job (rejeu avec le même code), puis son hachage remplace l'ancien.
   * `null` si la commande a changé d'état ou si la remise/le retrait est déjà terminé.
   */
  private async issueCode(
    job: JobLike,
    data: OrderJob,
    codeVars: CodeVar[],
  ): Promise<string | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: { status: true },
    });
    if (!order || order.status !== data.status) return null;
    let code: string;
    if (data.encCode) code = decrypt(this.codeSecret, data.encCode);
    else {
      code = randomCode();
      await job.updateData({ ...data, encCode: encrypt(this.codeSecret, code) });
    }
    if (codeVars.includes('pickupCode')) {
      const pickup = await this.prisma.pickup.findUnique({ where: { orderId: data.orderId } });
      if (!pickup || pickup.collectedAt) return null;
      await this.prisma.pickup.update({
        where: { id: pickup.id },
        data: {
          pickupCodeHash: this.delivery.codeHash('pickup', pickup.id, code),
          codeAttempts: 0,
        },
      });
    }
    if (codeVars.includes('handoverCode')) {
      const d = await this.prisma.delivery.findUnique({ where: { orderId: data.orderId } });
      if (!d || d.status === 'delivered') return null;
      await this.prisma.delivery.update({
        where: { id: d.id },
        data: {
          handoverCodeHash: this.delivery.codeHash('handover', d.id, code),
          handoverAttempts: 0,
        },
      });
    }
    return code;
  }

  private async sendPush(
    data: OrderJob,
    tpl: NotificationTemplate,
    values: Record<string, string>,
  ): Promise<Outcome> {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId: data.userId } });
    if (!tokens.length) return { status: 'skipped', error: 'NO_PUSH_TOKEN' };
    const title = render(tpl.title ?? '', values);
    const body = render(tpl.body, values);
    const codeVar = PUSH_CODE_VAR[data.status];
    const code = codeVar ? values[codeVar] : undefined;
    const tickets = await this.push.send(
      tokens.map((t) => ({
        to: t.token,
        title,
        body,
        data: { orderId: data.orderId, status: data.status, ...(code ? { code } : {}) },
      })),
    );
    const byToken = new Map(tokens.map((t) => [t.token, t.id]));
    const dead = tickets.filter((t) => !t.ok && PERMANENT_PUSH_ERRORS.has(t.error));
    if (dead.length) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: dead.map((t) => t.to) } } });
    }
    const ok = tickets.flatMap((t) =>
      t.ok ? [{ id: t.id, tokenId: byToken.get(t.to) ?? '' }] : [],
    );
    if (ok.length) {
      await this.queue
        .enqueue({ kind: 'receipts', tickets: ok })
        .catch(() => this.logger.warn('Mise en file des reçus push en échec'));
      return {
        status: 'sent',
        providerRef: ok
          .map((t) => t.id)
          .join(',')
          .slice(0, 200),
      };
    }
    if (dead.length === tickets.length) return { status: 'failed', error: 'DEVICE_NOT_REGISTERED' };
    return { status: 'failed', error: 'PUSH_REJECTED', retry: true };
  }

  private async sendSms(
    phone: string | null,
    tpl: NotificationTemplate,
    values: Record<string, string>,
  ): Promise<Outcome> {
    if (!phone) return { status: 'skipped', error: 'NO_PHONE' };
    const text = toGsm7(render(tpl.body, values));
    if (text === null || gsm7Length(text) > SMS_MAX_SEPTETS) {
      return { status: 'failed', error: 'SMS_INVALID_TEXT' };
    }
    await this.sms.send(phone, text);
    return { status: 'sent' };
  }

  // ---- Reçus Expo ----

  private async processReceipts(data: ReceiptsJob): Promise<void> {
    const receipts = await this.push.receipts(data.tickets.map((t) => t.id));
    const dead = data.tickets
      .filter((t) => {
        const r = receipts[t.id];
        return r && !r.ok && PERMANENT_PUSH_ERRORS.has(r.error) && t.tokenId;
      })
      .map((t) => t.tokenId);
    if (dead.length) await this.prisma.pushToken.deleteMany({ where: { id: { in: dead } } });
  }

  // ---- Alertes équipe (e-mail) ----

  private async processAlert(data: AlertJob): Promise<void> {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { key_channel: { key: data.key, channel: 'email' } },
    });
    if (!template?.active) return;
    const recipients = await this.prisma.adminUser.findMany({
      where: { active: true, role: { in: [...new Set([...data.roles, 'super_admin' as const])] } },
      select: { id: true, email: true },
    });
    let retry = false;
    for (const r of recipients) {
      const claim = await this.claim({
        template,
        alertId: data.alertId,
        adminUserId: r.id,
        payload: data.variables,
      });
      if (!claim) continue;
      let outcome: Outcome;
      try {
        await this.email.send({
          to: r.email,
          subject: render(template.title ?? data.key, data.variables),
          text: render(template.body, data.variables),
        });
        outcome = { status: 'sent' };
      } catch (err) {
        outcome = { status: 'failed', error: errorLabel(err), retry: true };
      }
      await this.finish(claim.id, outcome);
      retry ||= outcome.retry === true;
    }
    this.logger.log(`Alerte ${data.key} traitée (${recipients.length} destinataire(s))`);
    if (retry) throw new Error('NOTIFICATION_SEND_FAILED');
  }

  // ---- Journal et idempotence ----

  /**
   * Réserve l'envoi : la ligne est unique en base par (commande, statut, canal) ou (alerte, admin).
   * Renvoie `null` si déjà envoyé, ignoré ou en cours chez un autre worker.
   */
  private async claim(input: {
    template: NotificationTemplate;
    userId?: string;
    adminUserId?: string;
    orderId?: string;
    orderStatus?: string;
    alertId?: string;
    payload: Record<string, string>;
  }): Promise<Claim | null> {
    const { template } = input;
    const scope = input.orderId
      ? { orderId: input.orderId, orderStatus: input.orderStatus, channel: template.channel }
      : { alertId: input.alertId, adminUserId: input.adminUserId, channel: template.channel };
    await this.prisma.notification.createMany({
      data: [
        {
          id: uuidv7(),
          ...scope,
          userId: input.userId,
          templateKey: template.key,
          payload: input.payload,
        },
      ],
      skipDuplicates: true,
    });
    const row = await this.prisma.notification.findFirst({ where: scope, select: { id: true } });
    if (!row) return null;
    const { count } = await this.prisma.notification.updateMany({
      where: {
        id: row.id,
        status: { in: ['queued', 'failed'] },
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } }],
      },
      data: { claimedAt: new Date(), attempts: { increment: 1 } },
    });
    return count === 1 ? { id: row.id, template } : null;
  }

  private async finish(id: string, outcome: Outcome): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: {
        status: outcome.status,
        providerRef: outcome.providerRef ?? null,
        error: outcome.error ?? null,
        claimedAt: null,
        sentAt: outcome.status === 'sent' ? new Date() : null,
      },
    });
  }
}

function errorLabel(err: unknown): string {
  const m = err instanceof Error ? err.message : 'UNKNOWN';
  return /^[A-Z0-9_]{3,60}$/.test(m) ? m : 'PROVIDER_ERROR';
}
