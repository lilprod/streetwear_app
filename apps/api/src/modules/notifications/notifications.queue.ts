import type { AdminRole, OrderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { redisConnection } from '../production/render/render.queue';

export const NOTIFICATIONS_QUEUE_NAME = 'notifications';
export const RECEIPTS_DELAY_MS = 15 * 60_000;

/**
 * Les charges utiles sont persistées dans Redis : jamais de code en clair, de numéro de téléphone
 * ni de jeton push. `encCode` est chiffré (AES-256-GCM).
 */
export type NotificationJob =
  | {
      kind: 'order';
      orderId: string;
      userId: string;
      orderNumber: string;
      status: OrderStatus;
      encCode?: string;
    }
  | {
      kind: 'alert';
      alertId: string;
      key: string;
      variables: Record<string, string>;
      roles: AdminRole[];
    }
  | { kind: 'receipts'; tickets: { id: string; tokenId: string }[] };

export interface NotificationsQueue {
  enqueue(job: NotificationJob): Promise<void>;
  close?(): Promise<void>;
}

export const NOTIFICATIONS_QUEUE = Symbol('NOTIFICATIONS_QUEUE');

const jobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: { age: 24 * 3600 },
} as const;

export class BullNotificationsQueue implements NotificationsQueue {
  private queue?: Queue;

  constructor(private readonly redisUrl: string) {}

  async enqueue(job: NotificationJob): Promise<void> {
    this.queue ??= new Queue(NOTIFICATIONS_QUEUE_NAME, {
      connection: redisConnection(this.redisUrl),
    });
    if (job.kind === 'order') {
      await this.queue.add('order', job, {
        ...jobOptions,
        jobId: `order-${job.orderId}-${job.status}`,
      });
    } else if (job.kind === 'alert') {
      await this.queue.add('alert', job, { ...jobOptions, jobId: `alert-${job.alertId}` });
    } else {
      await this.queue.add('receipts', job, { ...jobOptions, delay: RECEIPTS_DELAY_MS });
    }
  }

  async close(): Promise<void> {
    await this.queue?.close();
  }
}
