import request from 'supertest';
import { type TestCtx, bearer, createAdmin, createApp, resetDb } from './helpers';

const DAY_MS = 24 * 3600 * 1000;
const PHONE = '+22890123457';

describe('critères d’acceptation (AN-013)', () => {
  let ctx: TestCtx;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.sms.outbox.length = 0;
  });

  describe('US-02 : mot de passe admin d’au moins 12 caractères', () => {
    it('refuses 11 characters and accepts 12 when creating an admin', async () => {
      const { token } = await createAdmin(ctx, 'super_admin');
      const body = (password: string, email: string) => ({
        email,
        password,
        role: 'production',
      });
      const short = await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send(body('a'.repeat(11), 'court@example.com'));
      expect(short.status).toBe(400);
      expect(short.body.error.code).toBe('VALIDATION_FAILED');
      await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send(body('a'.repeat(12), 'limite@example.com'))
        .expect(201);
    });

    it('refuses an 11-character password change and accepts 12', async () => {
      const { token } = await createAdmin(ctx, 'super_admin');
      const { admin } = await createAdmin(ctx, 'production');
      await http()
        .patch(`/v1/admin/users/${admin.id}`)
        .set(bearer(token))
        .send({ password: 'b'.repeat(11) })
        .expect(400);
      await http()
        .patch(`/v1/admin/users/${admin.id}`)
        .set(bearer(token))
        .send({ password: 'b'.repeat(12) })
        .expect(200);
    });
  });

  describe('US-01 : session client de 30 jours', () => {
    const lastCode = (): string =>
      /(\d{6})/.exec(ctx.sms.outbox[ctx.sms.outbox.length - 1]?.text ?? '')?.[1] ?? '';

    it('gives a refresh token valid 30 days at login and keeps 30 days after rotation', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
      const login = await http()
        .post('/v1/auth/otp/verify')
        .send({ phone: PHONE, code: lastCode() })
        .expect(200);
      const first = await ctx.prisma.refreshToken.findFirstOrThrow();
      const remaining = first.expiresAt.getTime() - Date.now();
      expect(remaining).toBeGreaterThan(30 * DAY_MS - 60_000);
      expect(remaining).toBeLessThanOrEqual(30 * DAY_MS);

      const rotated = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(login.body.refreshToken);
      const next = await ctx.prisma.refreshToken.findFirstOrThrow({
        where: { revokedAt: null },
      });
      const nextRemaining = next.expiresAt.getTime() - Date.now();
      expect(nextRemaining).toBeGreaterThan(30 * DAY_MS - 60_000);
      expect(nextRemaining).toBeLessThanOrEqual(30 * DAY_MS);
    });

    it('still accepts a session at day 29 and refuses it after day 30', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
      const login = await http()
        .post('/v1/auth/otp/verify')
        .send({ phone: PHONE, code: lastCode() })
        .expect(200);
      await ctx.prisma.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() + 1 * DAY_MS) },
      });
      const ok = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });
      expect(ok.status).toBe(200);
      await ctx.prisma.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: ok.body.refreshToken })
        .expect(401);
    });
  });
});
