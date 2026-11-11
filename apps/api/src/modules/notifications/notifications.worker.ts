import type { INestApplicationContext } from '@nestjs/common';
import { Worker } from 'bullmq';
import { redisConnection } from '../production/render/render.queue';
import { NOTIFICATIONS_QUEUE_NAME, type NotificationJob } from './notifications.queue';
import { NotificationsService } from './notifications.service';

export function startNotificationsWorker(
  app: INestApplicationContext,
  redisUrl: string,
  concurrency = 5,
): Worker {
  return new Worker(
    NOTIFICATIONS_QUEUE_NAME,
    async (job) =>
      app.get(NotificationsService).process({
        data: job.data as NotificationJob,
        updateData: (data) => job.updateData(data),
      }),
    { connection: redisConnection(redisUrl), concurrency },
  );
}
