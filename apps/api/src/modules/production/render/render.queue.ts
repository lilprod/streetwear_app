import type { INestApplicationContext } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrintFilesService } from './print-files.service';

export const RENDER_QUEUE_NAME = 'render-print-files';

export interface RenderQueue {
  /** Un travail par ligne de commande ; sans effet si un travail identique est déjà en attente. */
  enqueue(orderItemId: string): Promise<void>;
  close?(): Promise<void>;
}

export const RENDER_QUEUE = Symbol('RENDER_QUEUE');

export const redisConnection = (redisUrl: string) => {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
};

/** File BullMQ ; connexion ouverte à la première utilisation. */
export class BullRenderQueue implements RenderQueue {
  private queue?: Queue;

  constructor(private readonly redisUrl: string) {}

  async enqueue(orderItemId: string): Promise<void> {
    this.queue ??= new Queue(RENDER_QUEUE_NAME, { connection: redisConnection(this.redisUrl) });
    await this.queue.add(
      'render',
      { orderItemId },
      { jobId: `render-${orderItemId}`, removeOnComplete: true, removeOnFail: true },
    );
  }

  async close(): Promise<void> {
    await this.queue?.close();
  }
}

/** Worker : `PrintFilesService.process` ne lève jamais, un échec n'arrête donc pas la file. */
export function startRenderWorker(
  app: INestApplicationContext,
  redisUrl: string,
  concurrency = 1,
): Worker {
  return new Worker(
    RENDER_QUEUE_NAME,
    async (job) =>
      app.get(PrintFilesService).process((job.data as { orderItemId: string }).orderItemId),
    { connection: redisConnection(redisUrl), concurrency },
  );
}
