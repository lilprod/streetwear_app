import * as Sentry from '@sentry/node';
import { Queue, Worker } from 'bullmq';
import request from 'supertest';
import { CatalogService } from '../src/catalog/catalog.service';
import { logFailedJobs } from '../src/common/worker-logging';
import { initSentry } from '../src/config/sentry';
import { createApp } from './helpers';

jest.setTimeout(30_000);

// Construit à l'exécution : le contexte source joint par Sentry ne doit pas contenir le numéro en clair.
const DIGITS = ['2289', '0123456'].join('');
const PHONE = `+${DIGITS}`;

const sent: string[] = [];
const fakeTransport = () => ({
  send: async (envelope: unknown) => {
    const text = JSON.stringify(envelope);
    if (text.includes('"type":"event"')) sent.push(text);
    return {};
  },
  flush: async () => true,
});

const redisConnection = () => {
  const url = new URL(process.env.REDIS_URL ?? '');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number(url.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
  };
};

describe('error reporting (AN-011)', () => {
  beforeEach(() => {
    sent.length = 0;
    initSentry('https://public@sentry.invalid/1', 'test', fakeTransport);
  });
  afterEach(async () => {
    await Sentry.close(1000);
  });

  it('sends 5xx errors to Sentry with the scrub applied, and ignores 4xx', async () => {
    const { app } = await createApp();
    try {
      jest
        .spyOn(app.get(CatalogService), 'colors')
        .mockRejectedValueOnce(new Error(`panne pour ${PHONE}`));
      const res = await request(app.getHttpServer()).get('/v1/catalog/colors');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      await Sentry.flush(1000);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toContain('panne pour');
      expect(sent[0]).not.toContain(DIGITS);

      sent.length = 0;
      expect((await request(app.getHttpServer()).get('/v1/me')).status).toBe(401);
      await Sentry.flush(1000);
      expect(sent).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('logs every failed BullMQ job without job data and reports it to Sentry', async () => {
    const name = `an011-${Date.now()}`;
    const queue = new Queue(name, { connection: redisConnection() });
    const logs: string[] = [];
    const worker = logFailedJobs(
      new Worker(
        name,
        async (): Promise<void> => {
          throw new TypeError(`échec avec ${PHONE}`);
        },
        { connection: redisConnection() },
      ),
      { error: (m) => logs.push(m) },
    );
    try {
      await queue.add('boom', { phone: PHONE, code: '123456' });
      const start = Date.now();
      while (logs.length === 0 && Date.now() - start < 10_000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain(`File ${name}`);
      expect(logs[0]).toContain('boom');
      expect(logs[0]).toContain('TypeError');
      expect(logs[0]).not.toMatch(new RegExp(`${DIGITS}|123456`));
      await Sentry.flush(1000);
      expect(sent).toHaveLength(1);
      expect(sent[0]).not.toContain(DIGITS);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
