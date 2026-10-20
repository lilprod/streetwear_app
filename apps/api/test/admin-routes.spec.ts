import request from 'supertest';
import { SettingsService } from '../src/modules/settings/settings.service';
import { type TestCtx, bearer, createAdmin, createApp, createCustomer, resetDb } from './helpers';

const ROUTES: [string, string][] = [
  ['get', '/v1/admin/users'],
  ['post', '/v1/admin/users'],
  ['patch', '/v1/admin/users/00000000-0000-7000-8000-000000000000'],
  ['get', '/v1/admin/audit-logs'],
  ['get', '/v1/admin/settings'],
  ['patch', '/v1/admin/settings'],
];

describe('admin routes: access, users, audit, settings', () => {
  let ctx: TestCtx;
  const http = () => request(ctx.app.getHttpServer());
  const call = (method: string, url: string) =>
    (http() as unknown as Record<string, (u: string) => request.Test>)[method]?.(
      url,
    ) as request.Test;

  beforeAll(async () => {
    ctx = await createApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    ctx.app.get(SettingsService).clearCache();
  });

  it.each(ROUTES)('customer cannot call %s %s', async (method, url) => {
    const { token } = await createCustomer(ctx);
    const res = await call(method, url).set(bearer(token)).send({});
    expect([401, 403]).toContain(res.status);
  });

  it.each(ROUTES)('anonymous cannot call %s %s', async (method, url) => {
    const res = await call(method, url).send({});
    expect(res.status).toBe(401);
  });

  it('forbids non super_admin roles on /admin/users, audit-logs and settings', async () => {
    for (const role of ['production', 'order_manager', 'logistics', 'courier'] as const) {
      const { token } = await createAdmin(ctx, role);
      for (const url of ['/v1/admin/users', '/v1/admin/audit-logs', '/v1/admin/settings']) {
        const res = await http().get(url).set(bearer(token));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    }
  });

  describe('admin users (US-32)', () => {
    it('lists, creates, validates, updates, deactivates and resets TOTP', async () => {
      const { token, admin: boss } = await createAdmin(ctx, 'super_admin');
      const list = await http().get('/v1/admin/users').set(bearer(token)).expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toMatch(/password|argon2|totpSecret/i);

      const bad = await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send({ email: 'a@example.com', password: 'short', role: 'production' });
      expect(bad.status).toBe(400);
      await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send({ email: 'a@example.com', password: 'long-enough-password', role: 'boss' })
        .expect(400);

      const created = await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send({ email: 'Prod@Example.com', password: 'long-enough-password', role: 'production' })
        .expect(201);
      expect(created.body).toMatchObject({
        email: 'prod@example.com',
        role: 'production',
        active: true,
        totpEnabled: false,
      });
      const dup = await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send({ email: 'prod@example.com', password: 'long-enough-password', role: 'production' });
      expect(dup.status).toBe(409);

      const patched = await http()
        .patch(`/v1/admin/users/${created.body.id}`)
        .set(bearer(token))
        .send({ role: 'logistics' })
        .expect(200);
      expect(patched.body.role).toBe('logistics');

      await ctx.prisma.adminUser.update({
        where: { id: created.body.id },
        data: { totpSecret: 'x' },
      });
      const reset = await http()
        .patch(`/v1/admin/users/${created.body.id}`)
        .set(bearer(token))
        .send({ resetTotp: true })
        .expect(200);
      expect(reset.body.totpEnabled).toBe(false);

      const victimToken = ctx.tokens.signAdmin(created.body.id, 'logistics');
      await http().get('/v1/admin/settings').set(bearer(victimToken)).expect(403);
      await http()
        .patch(`/v1/admin/users/${created.body.id}`)
        .set(bearer(token))
        .send({ active: false })
        .expect(200);
      await http().get('/v1/admin/settings').set(bearer(victimToken)).expect(401);

      const self = await http()
        .patch(`/v1/admin/users/${boss.id}`)
        .set(bearer(token))
        .send({ active: false });
      expect(self.status).toBe(409);
      await http().patch('/v1/admin/users/nope').set(bearer(token)).send({}).expect(404);
    });
  });

  describe('audit log', () => {
    it('records before/after on 3 admin write routes, without secrets', async () => {
      const { token, admin } = await createAdmin(ctx, 'super_admin');
      const created = await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send({ email: 'x@example.com', password: 'long-enough-password', role: 'production' })
        .expect(201);
      await http()
        .patch(`/v1/admin/users/${created.body.id}`)
        .set(bearer(token))
        .send({ active: false })
        .expect(200);
      await http()
        .patch('/v1/admin/settings')
        .set(bearer(token))
        .send({ cod_deposit_percent: 40 })
        .expect(200);

      const logs = await ctx.prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
      expect(logs.map((l) => [l.action, l.entity])).toEqual([
        ['POST /admin/users', 'users'],
        ['PATCH /admin/users/:id', 'users'],
        ['PATCH /admin/settings', 'settings'],
      ]);
      expect(logs.every((l) => l.adminUserId === admin.id)).toBe(true);
      expect(logs[0]?.entityId).toBe(created.body.id);
      expect(logs[1]?.before).toMatchObject({ active: true });
      expect(logs[1]?.after).toMatchObject({ active: false });
      expect(logs[2]?.before).toMatchObject({ cod_deposit_percent: 50 });
      expect(logs[2]?.after).toMatchObject({ cod_deposit_percent: 40 });
      expect(JSON.stringify(logs)).not.toMatch(/long-enough-password|argon2/);
    });

    it('does not log reads or failed writes, and filters by entity', async () => {
      const { token } = await createAdmin(ctx, 'super_admin');
      await http().get('/v1/admin/users').set(bearer(token)).expect(200);
      await http().post('/v1/admin/users').set(bearer(token)).send({}).expect(400);
      expect(await ctx.prisma.auditLog.count()).toBe(0);
      const u = await http()
        .post('/v1/admin/users')
        .set(bearer(token))
        .send({ email: 'y@example.com', password: 'long-enough-password', role: 'courier' })
        .expect(201);
      await http()
        .patch('/v1/admin/settings')
        .set(bearer(token))
        .send({ order_expiry_minutes: 45 })
        .expect(200);
      const res = await http()
        .get('/v1/admin/audit-logs?entity=users')
        .set(bearer(token))
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ entity: 'users', entityId: u.body.id });
      const byId = await http()
        .get(`/v1/admin/audit-logs?entityId=${u.body.id}&limit=1`)
        .set(bearer(token))
        .expect(200);
      expect(byId.body.nextCursor).toBeNull();
      await http().get('/v1/admin/audit-logs?limit=1000').set(bearer(token)).expect(400);
    });
  });

  describe('settings', () => {
    it('returns defaults, updates with validation, and SettingsService caches 60 s', async () => {
      const { token } = await createAdmin(ctx, 'super_admin');
      const get = await http().get('/v1/admin/settings').set(bearer(token)).expect(200);
      expect(get.body).toMatchObject({ cod_deposit_percent: 50, order_expiry_minutes: 30 });
      expect(get.body.print_zones.front).toEqual({ widthMm: 297, heightMm: 420 });

      for (const body of [
        { cod_deposit_percent: 101 },
        { cod_deposit_percent: 10.5 },
        { payment_methods_enabled: [] },
        { payment_methods_enabled: ['bitcoin'] },
        { unknown_key: 1 },
        {},
      ]) {
        const res = await http().patch('/v1/admin/settings').set(bearer(token)).send(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
      const ok = await http()
        .patch('/v1/admin/settings')
        .set(bearer(token))
        .send({ payment_methods_enabled: ['cod'] })
        .expect(200);
      expect(ok.body.payment_methods_enabled).toEqual(['cod']);

      const svc = ctx.app.get(SettingsService);
      expect(await svc.get('payment_methods_enabled')).toEqual(['cod']);
      await ctx.prisma.setting.update({
        where: { key: 'payment_methods_enabled' },
        data: { value: ['card'] },
      });
      expect(await svc.get('payment_methods_enabled')).toEqual(['cod']);
      svc.clearCache();
      expect(await svc.get('payment_methods_enabled')).toEqual(['card']);
    });
  });
});
