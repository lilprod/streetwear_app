import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

describe('GET /v1/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ bufferLogs: true });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports db and redis as ok', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('returns the standard error format on unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('serves the OpenAPI docs', async () => {
    const res = await request(app.getHttpServer()).get('/v1/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.paths['/v1/health']).toBeDefined();
  });
});
