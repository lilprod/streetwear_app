import type { INestApplicationContext } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { ReconciliationService, previousLomeDay } from './reconciliation.service';

export const PAYMENTS_RECONCILE_QUEUE = 'payments-reconcile';
export const RECONCILE_CRON = { pattern: '0 2 * * *', tz: 'Africa/Lome' } as const;

/** Chaque jour à 02:00 Africa/Lome : rapprochement de la veille pour chaque agrégateur. */
export function startPaymentsReconcile(
  app: INestApplicationContext,
  redisUrl: string,
): { queue: Queue; worker: Worker } {
  const url = new URL(redisUrl);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
  const queue = new Queue(PAYMENTS_RECONCILE_QUEUE, { connection });
  void queue.upsertJobScheduler('daily-0200-lome', RECONCILE_CRON, { name: 'reconcile' });
  const worker = new Worker(
    PAYMENTS_RECONCILE_QUEUE,
    async (job) => {
      const date = (job.data as { date?: string } | undefined)?.date ?? previousLomeDay();
      const reports = await app.get(ReconciliationService).reconcile(date);
      return reports.map((r) => ({ provider: r.provider, mismatches: r.mismatchCount }));
    },
    { connection },
  );
  return { queue, worker };
}
