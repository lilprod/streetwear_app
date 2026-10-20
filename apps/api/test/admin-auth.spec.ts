import request from 'supertest';
import {
  type TestCtx,
  TEST_PASSWORD,
  bearer,
  createApp,
  createAdmin,
  resetDb,
  totpNow,
} from './helpers';

describe('admin authentication', () => {
  let ctx: TestCtx;
  const http = () => request(ctx.app.getHttpServer());
  const login = (email: string, password = TEST_PASSWORD) =>
    http().post('/v1/admin/auth/login').send({ email, password });

  beforeAll(async () => {
    ctx = await createApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it('enrols TOTP at the first login then asks for the code', async () => {
    const { admin } = await createAdmin(ctx, 'order_manager');
    const first = await login(admin.email).expect(200);
    expect(first.body.type).toBe('totp_required');
    const { secret, otpauthUrl } = first.body.enrollment;
    expect(otpauthUrl).toContain('otpauth://totp/');
    const done = await http()
      .post('/v1/admin/auth/totp')
      .send({ challenge: first.body.challenge, code: totpNow(secret) })
      .expect(200);
    expect(done.body.user).toMatchObject({ email: admin.email, role: 'order_manager' });
    expect(done.body.refreshToken).toEqual(expect.any(String));
    expect(Date.parse(done.body.expiresAt)).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
    const stored = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stored.totpSecret).not.toBeNull();
    expect(stored.totpSecret).not.toContain(secret);
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);

    const second = await login(admin.email).expect(200);
    expect(second.body).toMatchObject({ type: 'totp_required', enrollment: null });
    await http()
      .post('/v1/admin/auth/totp')
      .send({ challenge: second.body.challenge, code: totpNow(secret) })
      .expect(200);
  });

  it('rejects a wrong TOTP code and a non-challenge token', async () => {
    const { admin, token } = await createAdmin(ctx, 'production');
    const first = await login(admin.email);
    const bad = await http()
      .post('/v1/admin/auth/totp')
      .send({
        challenge: first.body.challenge,
        code: '000000' === totpNow(first.body.enrollment.secret) ? '111111' : '000000',
      });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_TOTP');
    await http().post('/v1/admin/auth/totp').send({ challenge: token, code: '123456' }).expect(401);
    await http().post('/v1/admin/auth/totp').send({ challenge: 'x', code: '12' }).expect(400);
  });

  it('logs a courier in without TOTP', async () => {
    const { admin } = await createAdmin(ctx, 'courier');
    const res = await login(admin.email).expect(200);
    expect(res.body.type).toBe('session');
    expect(res.body.session.user.role).toBe('courier');
    await http().get('/v1/admin/users').set(bearer(res.body.session.accessToken)).expect(403);
  });

  it('rejects wrong credentials, unknown and inactive accounts identically', async () => {
    const { admin } = await createAdmin(ctx, 'logistics');
    const inactive = await createAdmin(ctx, 'logistics', { active: false });
    for (const res of [
      await login(admin.email, 'wrong-password-123'),
      await login('nobody@example.com'),
      await login(inactive.admin.email),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    await http().post('/v1/admin/auth/login').send({ email: 'bad', password: 'x' }).expect(400);
  });

  it('locks the account for 15 minutes after 5 failures, even with the right password', async () => {
    const { admin } = await createAdmin(ctx, 'super_admin');
    for (let i = 0; i < 4; i++) {
      await login(admin.email, 'wrong-password-123').expect(401);
    }
    const fifth = await login(admin.email, 'wrong-password-123');
    expect(fifth.status).toBe(403);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
    const locked = await login(admin.email);
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    const row = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    const delta = (row.lockedUntil?.getTime() ?? 0) - Date.now();
    expect(delta).toBeGreaterThan(14 * 60_000);
    await ctx.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lockedUntil: new Date(Date.now() - 1) },
    });
    await login(admin.email).expect(200);
  });

  it('counts concurrent failures atomically', async () => {
    const { admin } = await createAdmin(ctx, 'super_admin');
    await Promise.all(Array.from({ length: 5 }, () => login(admin.email, 'wrong-password-123')));
    const row = await ctx.prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row.lockedUntil).not.toBeNull();
  });

  describe('session refresh', () => {
    const session = async () => {
      const { admin } = await createAdmin(ctx, 'courier');
      const res = await login(admin.email).expect(200);
      return {
        admin,
        s: res.body.session as { accessToken: string; refreshToken: string; expiresAt: string },
      };
    };

    it('rotates, keeps the original 8 h cap, and detects reuse', async () => {
      const { s } = await session();
      const r = await http()
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(200);
      expect(r.body.refreshToken).not.toBe(s.refreshToken);
      const rows = await ctx.prisma.refreshToken.findMany({
        where: { adminUserId: { not: null } },
      });
      const caps = new Set(rows.map((x) => x.expiresAt.getTime()));
      expect(caps.size).toBe(1);
      expect(Math.max(...caps) - Date.now()).toBeLessThanOrEqual(8 * 3600_000);
      await http()
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      await http()
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: r.body.refreshToken })
        .expect(401);
    });

    it('refuses an expired session, a customer endpoint, and logout revokes', async () => {
      const { s } = await session();
      await http().post('/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
      const old = await session();
      await ctx.prisma.refreshToken.updateMany({
        where: { adminUserId: old.admin.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http()
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: old.s.refreshToken })
        .expect(401);
      const again = await http()
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: s.refreshToken });
      await http()
        .post('/v1/admin/auth/logout')
        .send({ refreshToken: again.body.refreshToken })
        .expect(204);
      await http()
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: again.body.refreshToken })
        .expect(401);
      await http().post('/v1/admin/auth/refresh').send({}).expect(400);
    });

    it('refuses refresh once the admin is deactivated', async () => {
      const { admin, s } = await session();
      await ctx.prisma.adminUser.update({ where: { id: admin.id }, data: { active: false } });
      await http()
        .post('/v1/admin/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      await http().get('/v1/admin/users').set(bearer(s.accessToken)).expect(401);
    });
  });
});
