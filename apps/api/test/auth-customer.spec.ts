import request from 'supertest';
import { type TestCtx, createApp, resetDb } from './helpers';

const PHONE = '+22890123456';
const lastCode = (ctx: TestCtx): string =>
  /(\d{6})/.exec(ctx.sms.outbox[ctx.sms.outbox.length - 1]?.text ?? '')?.[1] ?? '';

describe('auth client (OTP, OAuth, refresh)', () => {
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

  const login = async () => {
    await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
    const res = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone: PHONE, code: lastCode(ctx) });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; refreshToken: string; isNewUser: boolean };
  };

  describe('POST /auth/otp/request', () => {
    it('sends a hashed 6-digit code by SMS', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: '90 12 34 56' }).expect(204);
      expect(ctx.sms.outbox).toHaveLength(1);
      expect(ctx.sms.outbox[0]?.phone).toBe(PHONE);
      const code = lastCode(ctx);
      expect(code).toMatch(/^\d{6}$/);
      const row = await ctx.prisma.otpCode.findFirstOrThrow();
      expect(row.codeHash).not.toContain(code);
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    });

    it.each(['1234567', '+33612345678', '', 'abc'])('rejects invalid phone %p', async (phone) => {
      const res = await http().post('/v1/auth/otp/request').send({ phone });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('limits to 3 sends per hour and per number', async () => {
      for (let i = 0; i < 3; i++) {
        await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
      }
      const res = await http().post('/v1/auth/otp/request').send({ phone: PHONE });
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.body.error.message).toMatch(/^Trop de demandes, réessaie dans \d+ min/);
      await http().post('/v1/auth/otp/request').send({ phone: '+22891234567' }).expect(204);
    });

    it('holds the limit under concurrent requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () => http().post('/v1/auth/otp/request').send({ phone: PHONE })),
      );
      expect(results.filter((r) => r.status === 204)).toHaveLength(3);
      expect(results.filter((r) => r.status === 429)).toHaveLength(5);
      expect(ctx.sms.outbox).toHaveLength(3);
    });
  });

  describe('POST /auth/otp/verify', () => {
    it('creates the account for a new number then reuses it', async () => {
      const first = await login();
      expect(first.isNewUser).toBe(true);
      const second = await login();
      expect(second.isNewUser).toBe(false);
      expect(await ctx.prisma.user.count()).toBe(1);
    });

    it('rejects a wrong code and locks the code after 5 attempts', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
      const good = lastCode(ctx);
      const bad = good === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        const res = await http().post('/v1/auth/otp/verify').send({ phone: PHONE, code: bad });
        expect(res.status).toBe(400);
      }
      const res = await http().post('/v1/auth/otp/verify').send({ phone: PHONE, code: good });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    });

    it('rejects an expired code', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
      await ctx.prisma.otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await http()
        .post('/v1/auth/otp/verify')
        .send({ phone: PHONE, code: lastCode(ctx) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
    });

    it('accepts a code only once', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
      const code = lastCode(ctx);
      await http().post('/v1/auth/otp/verify').send({ phone: PHONE, code }).expect(200);
      await http().post('/v1/auth/otp/verify').send({ phone: PHONE, code }).expect(400);
    });

    it('accepts a code once under concurrent verification', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: PHONE }).expect(204);
      const code = lastCode(ctx);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          http().post('/v1/auth/otp/verify').send({ phone: PHONE, code }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await ctx.prisma.user.count()).toBe(1);
    });

    it('rejects a malformed code', async () => {
      const res = await http().post('/v1/auth/otp/verify').send({ phone: PHONE, code: '12' });
      expect(res.status).toBe(400);
    });
  });

  describe('OAuth', () => {
    it.each(['apple', 'google'])(
      'logs in with %s and creates then reuses the account',
      async (p) => {
        const a = await http()
          .post(`/v1/auth/oauth/${p}`)
          .send({ idToken: 'sub-1|jo@example.com' });
        expect(a.status).toBe(200);
        expect(a.body.isNewUser).toBe(true);
        expect(a.body.user.email).toBe('jo@example.com');
        const b = await http()
          .post(`/v1/auth/oauth/${p}`)
          .send({ idToken: 'sub-1|jo@example.com' });
        expect(b.body.isNewUser).toBe(false);
        expect(b.body.user.id).toBe(a.body.user.id);
      },
    );

    it('rejects an invalid idToken and a missing one', async () => {
      await http().post('/v1/auth/oauth/google').send({ idToken: 'invalid' }).expect(401);
      await http().post('/v1/auth/oauth/apple').send({}).expect(400);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the refresh token and gives a working access token', async () => {
      const s = await login();
      const res = await http().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.refreshToken).not.toBe(s.refreshToken);
      await http().get('/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    });

    it('revokes the whole family when a refresh token is reused', async () => {
      const s = await login();
      const r1 = await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(200);
      const reuse = await http().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken });
      expect(reuse.status).toBe(401);
      expect(reuse.body.error.code).toBe('UNAUTHENTICATED');
      await http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: r1.body.refreshToken })
        .expect(401);
      expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('lets only one of two concurrent refreshes through the family intact', async () => {
      const s = await login();
      const results = await Promise.all([
        http().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }),
        http().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }),
      ]);
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('rejects an expired or unknown refresh token', async () => {
      const s = await login();
      await ctx.prisma.refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
      await http().post('/v1/auth/refresh').send({ refreshToken: 'nope' }).expect(401);
      await http().post('/v1/auth/refresh').send({}).expect(400);
    });

    it('logout revokes the session', async () => {
      const s = await login();
      await http().post('/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);
      await http().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
      await http().post('/v1/auth/logout').send({}).expect(400);
    });
  });
});
