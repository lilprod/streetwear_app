import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  FIXTURE_PATTERNS_BY_ID,
  FIXTURE_PRICE_RULES,
  INVALID_DESIGNS,
  VALID_DESIGNS,
  computeUnitPriceXof,
  type DesignSpec,
} from '@streetwear/shared';
import { type AuthHeader, buildApp, call } from './helpers';

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('designs (client)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminHeader: AuthHeader;
  let me: string;
  let other: string;
  const authOf = new Map<string, AuthHeader>();
  const customerAuth = (id: string): AuthHeader => authOf.get(id) as AuthHeader;
  const http = () => request(app.getHttpServer());
  const post = (path: string, user: string, body?: unknown) =>
    http()
      .post(path)
      .set(...customerAuth(user))
      .send(body as object);

  beforeAll(async () => {
    const built = await buildApp();
    ({ app, prisma } = built);
    adminHeader = built.adminAuth('super_admin');
    for (const who of ['me', 'other'] as const) {
      const c = await built.newCustomer();
      authOf.set(c.id, c.auth);
      if (who === 'me') me = c.id;
      else other = c.id;
    }
  });
  afterEach(async () => {
    await prisma.design.deleteMany({ where: { userId: { in: [me, other] } } });
    await prisma.pattern.updateMany({ data: { active: true } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('requires a customer token', async () => {
    expect((await http().get('/v1/designs')).status).toBe(401);
    const res = await http().post('/v1/designs').set('Authorization', 'Bearer nope').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    const admin = await http()
      .get('/v1/designs')
      .set(...adminHeader);
    expect(admin.status).toBe(401);
  });

  describe('Idempotency-Key', () => {
    const key = '0b8f7a52-6f3e-4f0e-9a43-2f6c1f0f9d11';
    const spec = VALID_DESIGNS.patternOnly;
    const withKey = (k: string, body: object) =>
      http()
        .post('/v1/designs')
        .set(...customerAuth(me))
        .set('Idempotency-Key', k)
        .send(body);

    it('replays the same key and body without creating a second design', async () => {
      const first = await withKey(key, { spec, name: 'Un' });
      expect(first.status).toBe(201);
      const second = await withKey(key, { spec, name: 'Un' });
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.design.count({ where: { userId: me } })).toBe(1);
    });

    it('answers 409 IDEMPOTENCY_CONFLICT when the body differs', async () => {
      await withKey(key, { spec, name: 'Un' });
      const res = await withKey(key, { spec, name: 'Deux' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(await prisma.design.count({ where: { userId: me } })).toBe(1);
    });

    it('scopes the key per user and rejects a malformed key', async () => {
      await withKey(key, { spec });
      const mine = await prisma.design.count({ where: { userId: me } });
      const res = await http()
        .post('/v1/designs')
        .set(...customerAuth(other))
        .set('Idempotency-Key', key)
        .send({ spec });
      expect(res.status).toBe(201);
      expect(mine).toBe(1);
      expect((await withKey('pas-un-uuid', { spec })).status).toBe(400);
    });

    it('creates one design on concurrent replays', async () => {
      const results = await Promise.all(
        [1, 2, 3].map(() => withKey('7c9e6679-7425-40de-944b-e07fc1f90ae7', { spec })),
      );
      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    });
  });

  it.each(Object.entries(VALID_DESIGNS))(
    'creates design "%s" with the price of computeUnitPriceXof',
    async (_name, spec) => {
      const res = await post('/v1/designs', me, { spec, name: 'Mon design' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Mon design', isDraft: true, spec });
      expect(res.body.unitPriceXof).toBe(
        computeUnitPriceXof(spec as DesignSpec, FIXTURE_PRICE_RULES, FIXTURE_PATTERNS_BY_ID),
      );
      const read = await http()
        .get(`/v1/designs/${res.body.id}`)
        .set(...customerAuth(me));
      expect(read.body.unitPriceXof).toBe(res.body.unitPriceXof);
    },
  );

  it.each(INVALID_DESIGNS)('refuses the invalid design "$name"', async ({ spec }) => {
    const res = await post('/v1/designs', me, { spec });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses unknown body fields', async () => {
    const res = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly, extra: 1 });
    expect(res.status).toBe(400);
  });

  it('refuses a deactivated pattern on write (422) but keeps the design readable', async () => {
    const created = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly });
    await prisma.pattern.update({ where: { id: 'pat-kente-ewe' }, data: { active: false } });

    const again = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('PATTERN_INACTIVE');
    expect(again.body.error.details.items).toEqual([{ kind: 'pattern', id: 'pat-kente-ewe' }]);

    const patch = await http()
      .patch(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me))
      .send({ spec: VALID_DESIGNS.patternOnly });
    expect(patch.status).toBe(422);

    const read = await http()
      .get(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me));
    expect(read.status).toBe(200);
    expect(read.body.unitPriceXof).toBe(created.body.unitPriceXof);
    const rename = await http()
      .patch(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me))
      .send({ name: 'Renommé' });
    expect(rename.status).toBe(200);
  });

  it('refuses unknown or inactive fonts and colors with 422', async () => {
    const spec = structuredClone(VALID_DESIGNS.patternAndText) as DesignSpec;
    const text = spec.zones.front?.layers[1];
    if (text?.type === 'text') text.fontId = 'font-inconnue';
    const font = await post('/v1/designs', me, { spec });
    expect(font.status).toBe(422);
    expect(font.body.error.code).toBe('PATTERN_INACTIVE');
    await prisma.tshirtColor.update({ where: { id: 'col-noir' }, data: { active: false } });
    try {
      const color = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly });
      expect(color.status).toBe(422);
    } finally {
      await prisma.tshirtColor.update({ where: { id: 'col-noir' }, data: { active: true } });
    }
  });

  it('refuses banned words regardless of accents and case (422 TEXT_REJECTED)', async () => {
    for (const bad of ['MERDE', 'Mérde', 'm e r d e']) {
      const spec = structuredClone(VALID_DESIGNS.patternAndText) as DesignSpec;
      const text = spec.zones.front?.layers[1];
      if (text?.type === 'text') text.text = bad;
      const res = await post('/v1/designs', me, { spec });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        code: 'TEXT_REJECTED',
        message: 'Ce texte ne peut pas être imprimé.',
      });
    }
  });

  it('only exposes a customer’s own designs (404 otherwise)', async () => {
    const mine = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly });
    const id = mine.body.id as string;
    const as = (m: 'get' | 'patch' | 'delete' | 'post', path: string, body?: object) =>
      call(app, m, `/v1/designs/${path}`)
        .set(...customerAuth(other))
        .send(body);
    expect((await as('get', id)).status).toBe(404);
    expect((await as('patch', id, { name: 'vol' })).status).toBe(404);
    expect((await as('delete', id)).status).toBe(404);
    expect((await as('post', `${id}/duplicate`)).status).toBe(404);
    expect((await as('post', `${id}/previews`, { front: PNG_1PX })).status).toBe(404);
    expect((await as('get', 'not-a-uuid')).status).toBe(404);
    const list = await http()
      .get('/v1/designs')
      .set(...customerAuth(other));
    expect(list.body.items).toEqual([]);
    expect((await prisma.design.count({ where: { id } })) === 1).toBe(true);
  });

  it('updates, then deletes a design', async () => {
    const created = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly });
    const upd = await http()
      .patch(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me))
      .send({ spec: VALID_DESIGNS.patternAndText, isDraft: false });
    expect(upd.status).toBe(200);
    expect(upd.body.isDraft).toBe(false);
    expect(upd.body.unitPriceXof).toBe(11000);
    const bad = await http()
      .patch(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me))
      .send({ isDraft: 'oui' });
    expect(bad.status).toBe(400);
    const del = await http()
      .delete(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me));
    expect(del.status).toBe(204);
    const gone = await http()
      .get(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me));
    expect(gone.status).toBe(404);
  });

  it('duplicates into a new editable draft', async () => {
    const created = await post('/v1/designs', me, {
      spec: VALID_DESIGNS.frontBackTiled,
      name: 'Tuile',
    });
    await http()
      .patch(`/v1/designs/${created.body.id}`)
      .set(...customerAuth(me))
      .send({ isDraft: false });
    const dup = await post(`/v1/designs/${created.body.id}/duplicate`, me);
    expect(dup.status).toBe(201);
    expect(dup.body.id).not.toBe(created.body.id);
    expect(dup.body).toMatchObject({ isDraft: true, name: 'Tuile (copie)' });
    expect(dup.body.spec).toEqual(created.body.spec);
  });

  it('lists with draft filter and cursor pagination, newest first', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly, name: `D${i}` });
      ids.push(r.body.id);
    }
    await http()
      .patch(`/v1/designs/${ids[0]}`)
      .set(...customerAuth(me))
      .send({ isDraft: false });
    const get = (q: string) =>
      http()
        .get(`/v1/designs${q}`)
        .set(...customerAuth(me));
    expect((await get('?drafts=true')).body.items).toHaveLength(2);
    expect((await get('?drafts=false')).body.items).toHaveLength(1);
    const p1 = await get('?limit=2');
    expect(p1.body.items.map((d: { name: string }) => d.name)).toEqual(['D0', 'D2']);
    const p2 = await get(`?limit=2&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items.map((d: { name: string }) => d.name)).toEqual(['D1']);
    expect(p2.body.nextCursor).toBeNull();
    expect((await get('?drafts=maybe')).status).toBe(400);
  });

  it('stores PNG previews through the media provider', async () => {
    const created = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly });
    const res = await post(`/v1/designs/${created.body.id}/previews`, me, {
      front: PNG_1PX,
      back: PNG_1PX,
    });
    expect(res.status).toBe(201);
    expect(res.body.previewFrontUrl).toContain(`designs/${created.body.id}/front`);
    expect(res.body.previewBackUrl).toContain(`designs/${created.body.id}/back`);
  });

  it('refuses empty, oversized and non-PNG previews', async () => {
    const created = await post('/v1/designs', me, { spec: VALID_DESIGNS.patternOnly });
    const url = `/v1/designs/${created.body.id}/previews`;
    expect((await post(url, me, {})).status).toBe(400);
    const big = Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      Buffer.alloc(500 * 1024),
    ]).toString('base64');
    expect((await post(url, me, { front: big })).status).toBe(400);
    const jpeg = Buffer.from('ffd8ffe000104a464946', 'hex').toString('base64');
    const res = await post(url, me, { back: jpeg });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
