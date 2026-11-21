import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers';
import { uniqueIp, withEnv } from './with-env';

describe('global per-client limit shared through Redis (AN-009)', () => {
  const get = (app: INestApplication, path: string, ip: string) =>
    request(app.getHttpServer()).get(path).set('X-Forwarded-For', ip);

  it('counts all routes together per client', async () => {
    await withEnv({ RATE_LIMIT_PER_MINUTE: '4', TRUST_PROXY: '1' }, async () => {
      const { app } = await createApp();
      try {
        const a = uniqueIp();
        for (const path of [
          '/v1/catalog/colors',
          '/v1/catalog/fonts',
          '/v1/catalog/categories',
          '/v1/catalog/patterns',
        ])
          expect((await get(app, path, a)).status).toBe(200);
        const res = await get(app, '/v1/me', a);
        expect(res.status).toBe(429);
        expect(res.body.error.code).toBe('RATE_LIMITED');
        expect((await get(app, '/v1/catalog/colors', uniqueIp())).status).toBe(200);
      } finally {
        await app.close();
      }
    });
  }, 30_000);

  it('shares the counter between two API instances', async () => {
    await withEnv({ RATE_LIMIT_PER_MINUTE: '4', TRUST_PROXY: '1' }, async () => {
      const first = (await createApp()).app;
      const second = (await createApp()).app;
      try {
        const ip = uniqueIp();
        expect((await get(first, '/v1/catalog/colors', ip)).status).toBe(200);
        expect((await get(second, '/v1/catalog/colors', ip)).status).toBe(200);
        expect((await get(first, '/v1/catalog/fonts', ip)).status).toBe(200);
        expect((await get(second, '/v1/catalog/fonts', ip)).status).toBe(200);
        expect((await get(first, '/v1/catalog/colors', ip)).status).toBe(429);
        expect((await get(second, '/v1/catalog/colors', ip)).status).toBe(429);
      } finally {
        await first.close();
        await second.close();
      }
    });
  }, 30_000);

  it('keeps the admin login limit and leaves payment webhooks and health unthrottled', async () => {
    await withEnv(
      { RATE_LIMIT_PER_MINUTE: '2', RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE: '2', TRUST_PROXY: '1' },
      async () => {
        const { app } = await createApp();
        try {
          const ip = uniqueIp();
          const login = () =>
            request(app.getHttpServer())
              .post('/v1/admin/auth/login')
              .set('X-Forwarded-For', ip)
              .send({ email: 'inconnu@example.com', password: 'mauvais-mot-de-passe' });
          expect((await login()).status).toBe(401);
          expect((await login()).status).toBe(401);
          expect((await login()).status).toBe(429);

          const other = uniqueIp();
          for (let i = 0; i < 6; i++) {
            const hook = await request(app.getHttpServer())
              .post('/v1/webhooks/payments/fake')
              .set('X-Forwarded-For', other)
              .send({});
            expect(hook.status).not.toBe(429);
            expect((await get(app, '/v1/health', other)).status).not.toBe(429);
          }
        } finally {
          await app.close();
        }
      },
    );
  }, 30_000);
});
