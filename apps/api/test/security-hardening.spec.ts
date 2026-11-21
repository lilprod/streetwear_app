import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { scrub } from '../src/config/sentry';
import { createApp } from './helpers';

describe('security hardening (SP12-B)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await createApp()).app;
  });
  afterAll(async () => {
    await app.close();
  });

  it('sets security headers and hides X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('does not cache authenticated or error responses, but keeps the catalogue cache policy', async () => {
    const err = await request(app.getHttpServer()).get('/v1/me');
    expect(err.status).toBe(401);
    expect(err.headers['cache-control']).toBe('no-store');
    const catalog = await request(app.getHttpServer()).get('/v1/catalog/colors');
    expect(catalog.headers['cache-control']).toMatch(/^public, max-age=/);
  });

  it('answers 413 (not 500) when the body exceeds the 1 MB limit', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ pad: 'a'.repeat(1_200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('answers 400 on malformed JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/otp/request')
      .set('content-type', 'application/json')
      .send('{pas du json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('exposes no CORS headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/catalog/colors')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Sentry scrub', () => {
  it('masks personal data and secrets by key and phone numbers in text', () => {
    const out = JSON.stringify(
      scrub({
        request: {
          headers: { authorization: 'Bearer abc.def', cookie: 'sid=1' },
          data: {
            phone: '+22890123456',
            recipientPhone: '+22891234567',
            payerPhone: '+22892345678',
            code: '987654',
            handoverCode: '554433',
            refreshToken: 'r1',
            email: 'a@b.tg',
            address: 'rue 1',
            lat: 6.13,
          },
        },
        user: { username: 'Kokou', ip_address: '1.2.3.4' },
        message: 'Échec pour +22890123456 avec Bearer xyz.123',
        tags: { orderNumber: 'TG-000001' },
        exception: { values: [{ type: 'Error', value: 'boom' }] },
      }),
    );
    for (const secret of [
      '+228',
      '987654',
      '554433',
      'abc.def',
      'xyz.123',
      'sid=1',
      'a@b.tg',
      'rue 1',
      'Kokou',
      '1.2.3.4',
      '6.13',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('TG-000001');
    expect(out).toContain('boom');
  });
});
