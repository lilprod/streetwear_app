import type { INestApplicationContext } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { OrdersService } from './orders.service';

export const ORDERS_EXPIRE_QUEUE = 'orders-expire';

/** Toutes les minutes : passe en `expired` les commandes non payées échues et libère leur stock. */
export function startOrdersExpiry(app: INestApplicationContext, redisUrl: string): void {
  const url = new URL(redisUrl);
  const connection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
  const queue = new Queue(ORDERS_EXPIRE_QUEUE, { connection });
  void queue.upsertJobScheduler('every-minute', { every: 60_000 }, { name: 'expire' });
  new Worker(ORDERS_EXPIRE_QUEUE, async () => app.get(OrdersService).expireDue(new Date()), {
    connection,
  });
}
