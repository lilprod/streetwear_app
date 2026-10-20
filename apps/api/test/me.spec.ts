import request from 'supertest';
import { type TestCtx, bearer, createApp, createCustomer, resetDb } from './helpers';

const ADDRESS = {
  label: 'Maison',
  lat: 6.13,
  lng: 1.22,
  district: 'Tokoin',
  landmark: 'Près de la pharmacie',
  recipientPhone: '90 12 34 56',
};

describe('/me', () => {
  let ctx: TestCtx;
  let token: string;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    token = (await createCustomer(ctx)).token;
  });

  it.each([
    ['get', '/v1/me'],
    ['patch', '/v1/me'],
    ['delete', '/v1/me'],
    ['get', '/v1/me/addresses'],
    ['post', '/v1/me/addresses'],
    ['post', '/v1/me/push-tokens'],
  ] as const)('%s %s requires authentication', async (method, url) => {
    const res = await http()[method](url);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects an admin token', async () => {
    const t = ctx.tokens.signAdmin('00000000-0000-7000-8000-000000000000', 'super_admin');
    await http().get('/v1/me').set(bearer(t)).expect(401);
  });

  it('returns and updates the profile', async () => {
    const me = await http().get('/v1/me').set(bearer(token)).expect(200);
    expect(me.body).toMatchObject({ phone: '+22890123456', name: null, email: null });
    const res = await http()
      .patch('/v1/me')
      .set(bearer(token))
      .send({ name: 'Afi', email: 'afi@example.com' })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Afi', email: 'afi@example.com' });
  });

  it('refuses an invalid profile update', async () => {
    const bad = await http().patch('/v1/me').set(bearer(token)).send({ email: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await http().patch('/v1/me').set(bearer(token)).send({ name: '  ' }).expect(400);
    await http().patch('/v1/me').set(bearer(token)).send({ phone: '+22890000000' }).expect(400);
  });

  it('anonymizes the account on delete and revokes access', async () => {
    const s = await http().post('/v1/auth/otp/request').send({ phone: '+22891111111' });
    expect(s.status).toBe(204);
    const code = /(\d{6})/.exec(ctx.sms.outbox.at(-1)?.text ?? '')?.[1];
    const login = await http().post('/v1/auth/otp/verify').send({ phone: '+22891111111', code });
    const auth = bearer(login.body.accessToken);
    await http().patch('/v1/me').set(auth).send({ name: 'Kofi' }).expect(200);
    await http().post('/v1/me/addresses').set(auth).send(ADDRESS).expect(201);
    await http().delete('/v1/me').set(auth).expect(204);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: login.body.user.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.name).toBeNull();
    expect(row.phone).not.toContain('91111111');
    expect(await ctx.prisma.address.count({ where: { userId: row.id } })).toBe(0);
    await http().get('/v1/me').set(auth).expect(401);
    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  describe('addresses', () => {
    it('creates (zone null), lists, updates and deletes', async () => {
      const created = await http()
        .post('/v1/me/addresses')
        .set(bearer(token))
        .send(ADDRESS)
        .expect(201);
      expect(created.body).toMatchObject({
        label: 'Maison',
        recipientPhone: '+22890123456',
        zone: null,
      });
      const list = await http().get('/v1/me/addresses').set(bearer(token)).expect(200);
      expect(list.body).toHaveLength(1);
      const patched = await http()
        .patch(`/v1/me/addresses/${created.body.id}`)
        .set(bearer(token))
        .send({ landmark: 'Face au marché' })
        .expect(200);
      expect(patched.body.landmark).toBe('Face au marché');
      expect(patched.body.district).toBe('Tokoin');
      await http().delete(`/v1/me/addresses/${created.body.id}`).set(bearer(token)).expect(204);
      await http().delete(`/v1/me/addresses/${created.body.id}`).set(bearer(token)).expect(404);
    });

    it('validates the input (GPS point required)', async () => {
      const noLat: Record<string, unknown> = { ...ADDRESS };
      delete noLat.lat;
      const res = await http().post('/v1/me/addresses').set(bearer(token)).send(noLat);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      await http()
        .post('/v1/me/addresses')
        .set(bearer(token))
        .send({ ...ADDRESS, recipientPhone: '123' })
        .expect(400);
    });

    it("hides other customers' addresses", async () => {
      const created = await http()
        .post('/v1/me/addresses')
        .set(bearer(token))
        .send(ADDRESS)
        .expect(201);
      const other = await createCustomer(ctx, '+22892222222');
      await http()
        .patch(`/v1/me/addresses/${created.body.id}`)
        .set(bearer(other.token))
        .send({ label: 'x' })
        .expect(404);
      await http()
        .delete(`/v1/me/addresses/${created.body.id}`)
        .set(bearer(other.token))
        .expect(404);
      await http().patch('/v1/me/addresses/not-a-uuid').set(bearer(token)).send({}).expect(404);
      const list = await http().get('/v1/me/addresses').set(bearer(other.token)).expect(200);
      expect(list.body).toEqual([]);
    });
  });

  describe('push tokens', () => {
    it('registers and moves a token, one row per token', async () => {
      await http()
        .post('/v1/me/push-tokens')
        .set(bearer(token))
        .send({ token: 'ExpoPush[abc]', platform: 'android' })
        .expect(204);
      const other = await createCustomer(ctx, '+22893333333');
      await http()
        .post('/v1/me/push-tokens')
        .set(bearer(other.token))
        .send({ token: 'ExpoPush[abc]', platform: 'ios' })
        .expect(204);
      const rows = await ctx.prisma.pushToken.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.userId).toBe(other.user.id);
    });

    it('refuses an invalid platform', async () => {
      const res = await http()
        .post('/v1/me/push-tokens')
        .set(bearer(token))
        .send({ token: 'x', platform: 'web' });
      expect(res.status).toBe(400);
    });
  });
});
