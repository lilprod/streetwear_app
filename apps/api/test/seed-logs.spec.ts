import fs from 'node:fs';
import request from 'supertest';
import { seed } from '../src/seed/seed';
import { type TestCtx, createApp, resetDb } from './helpers';

describe('seed and log hygiene', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  it('seeds default settings and one super admin, idempotently', async () => {
    const opts = { adminEmail: 'Root@Example.com', adminPassword: 'seed-password-123' };
    await seed(ctx.prisma, opts);
    await ctx.prisma.setting.update({ where: { key: 'cod_deposit_percent' }, data: { value: 30 } });
    await seed(ctx.prisma, opts);
    expect(await ctx.prisma.setting.count()).toBe(4);
    expect(
      (await ctx.prisma.setting.findUniqueOrThrow({ where: { key: 'cod_deposit_percent' } })).value,
    ).toBe(30);
    const admins = await ctx.prisma.adminUser.findMany();
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ email: 'root@example.com', role: 'super_admin' });
    await expect(
      seed(ctx.prisma, { adminEmail: 'a@b.co', adminPassword: 'short' }),
    ).rejects.toThrow();
  });

  it('never writes OTP codes, passwords or tokens to the logs', async () => {
    const chunks: string[] = [];
    const record = (spy: unknown[]): void => {
      for (const a of spy) if (typeof a === 'string' || Buffer.isBuffer(a)) chunks.push(String(a));
    };
    const w = jest.spyOn(fs, 'writeSync').mockImplementation(((...args: unknown[]) => {
      record(args.slice(1, 2));
      return 0;
    }) as never);
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(((c: unknown) => {
      record([c]);
      return true;
    }) as never);
    const http = () => request(ctx.app.getHttpServer());
    try {
      await http().post('/v1/auth/otp/request').send({ phone: '+22890123456' }).expect(204);
      const sms = ctx.sms.outbox.at(-1)?.text ?? '';
      const code = /(\d{6})/.exec(sms)?.[1] ?? '';
      const res = await http()
        .post('/v1/auth/otp/verify')
        .send({ phone: '+22890123456', code })
        .expect(200);
      await http()
        .post('/v1/admin/auth/login')
        .send({ email: 'x@example.com', password: 'my-secret-password' });
      const text = chunks.join('');
      expect(text).not.toContain(code);
      expect(text).not.toContain(res.body.refreshToken);
      expect(text).not.toContain(res.body.accessToken);
      expect(text).not.toContain('my-secret-password');
      expect(text).not.toContain('90123456');
    } finally {
      w.mockRestore();
      out.mockRestore();
    }
  });
});
