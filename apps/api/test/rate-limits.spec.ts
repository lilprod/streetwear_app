import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers';
import { clearThrottleKeys, nextPhone, uniqueIp, withEnv } from './with-env';

describe('rate limits per real client (AN-002)', () => {
  const otp = (app: INestApplication, ip: string) =>
    request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .set('X-Forwarded-For', ip)
      .send({ phone: nextPhone() });

  it('counts per X-Forwarded-For client when TRUST_PROXY=1', async () => {
    await withEnv({ RATE_LIMIT_OTP_PER_MINUTE: '2', TRUST_PROXY: '1' }, async () => {
      const { app } = await createApp();
      try {
        const a = uniqueIp();
        const b = uniqueIp();
        expect((await otp(app, a)).status).toBe(204);
        expect((await otp(app, a)).status).toBe(204);
        expect((await otp(app, a)).status).toBe(429);
        expect((await otp(app, b)).status).toBe(204);
      } finally {
        await app.close();
      }
    });
  }, 30_000);

  it('shares one counter and ignores X-Forwarded-For when TRUST_PROXY is unset', async () => {
    await clearThrottleKeys();
    await withEnv({ RATE_LIMIT_OTP_PER_MINUTE: '2', TRUST_PROXY: '' }, async () => {
      const { app } = await createApp();
      try {
        expect((await otp(app, uniqueIp())).status).toBe(204);
        expect((await otp(app, uniqueIp())).status).toBe(204);
        const res = await otp(app, uniqueIp());
        expect(res.status).toBe(429);
        expect(res.body.error.code).toBe('RATE_LIMITED');
      } finally {
        await app.close();
      }
    });
  }, 30_000);
});
