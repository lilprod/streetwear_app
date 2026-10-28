import type { INestApplicationContext } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { SlotsService } from './slots.service';

export const SLOT_GENERATION_QUEUE = 'slot-generation';

/** Tâche quotidienne (02:00 UTC = Africa/Lome) : complète les créneaux des 14 prochains jours. */
export function startSlotGeneration(app: INestApplicationContext, redisUrl: string): void {
  const url = new URL(redisUrl);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
  const queue = new Queue(SLOT_GENERATION_QUEUE, { connection });
  void queue.upsertJobScheduler('daily', { pattern: '0 2 * * *', tz: 'UTC' }, { name: 'generate' });
  new Worker(SLOT_GENERATION_QUEUE, async () => app.get(SlotsService).generateAll({ days: 14 }), {
    connection,
  });
}
