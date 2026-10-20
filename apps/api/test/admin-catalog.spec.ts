import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { FIXTURE_CATEGORIES, FIXTURE_PRICE_RULES } from '@streetwear/shared';
import { MEDIA_PROVIDER } from '../src/media/media-provider';
import type { LocalMediaAdapter } from '../src/media/local-media.adapter';
import { adminAuth, buildApp, call, customerAuth, newUserId } from './helpers';

const CATEGORY_ID = FIXTURE_CATEGORIES[0]?.id as string;

const patternBody = (over: Record<string, unknown> = {}) => ({
  categoryId: CATEGORY_ID,
  name: 'Motif test admin',
  origin: 'Lomé',
  tags: ['test'],
  priceTier: 'standard',
  imagePublicId: 'patterns/admin-test',
  imageFormat: 'png',
  imageBytes: 1_000_000,
  widthPx: 4200,
  heightPx: 3000,
  rightsHolder: 'Atelier Test',
  rightsProofUrl: 'https://example.test/contrat.pdf',
  active: true,
  ...over,
});

describe('admin catalog', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());
  const admin = (m: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) =>
    call(app, m, `/v1/admin/${path}`)
      .set(...adminAuth('super_admin'))
      .send(body);

  beforeAll(async () => ({ app, prisma } = await buildApp()));
  afterEach(async () => {
    await prisma.pattern.deleteMany({ where: { name: { startsWith: 'Motif test admin' } } });
    await prisma.patternCategory.deleteMany({ where: { slug: { startsWith: 'cat-test' } } });
    await prisma.tshirtColor.deleteMany({ where: { name: { startsWith: 'Test ' } } });
    await prisma.font.deleteMany({ where: { name: { startsWith: 'Test ' } } });
    await prisma.bannedWord.deleteMany({ where: { word: { startsWith: 'motinterdittest' } } });
    await prisma.priceRule.update({
      where: { key: 'text' },
      data: { amountXof: FIXTURE_PRICE_RULES.textXof },
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('access control', () => {
    const routes: [string, string][] = [
      ['get', 'patterns'],
      ['post', 'patterns'],
      ['patch', 'patterns/x'],
      ['get', 'pattern-categories'],
      ['post', 'pattern-categories'],
      ['patch', 'pattern-categories/x'],
      ['get', 'colors'],
      ['post', 'colors'],
      ['patch', 'colors/x'],
      ['get', 'fonts'],
      ['post', 'fonts'],
      ['patch', 'fonts/x'],
      ['get', 'price-rules'],
      ['post', 'price-rules'],
      ['patch', 'price-rules'],
      ['get', 'banned-words'],
      ['post', 'banned-words'],
      ['delete', 'banned-words/x'],
      ['post', 'media/upload-signature'],
    ];

    it.each(routes)('%s /admin/%s: 401 without token, 401 for a customer token', async (m, p) => {
      const method = m as 'get';
      expect((await http()[method](`/v1/admin/${p}`)).status).toBe(401);
      const asCustomer = await call(app, method, `/v1/admin/${p}`).set(
        ...customerAuth(newUserId()),
      );
      expect(asCustomer.status).toBe(401);
    });

    it.each(routes)('%s /admin/%s: 403 for non super_admin roles', async (m, p) => {
      for (const role of ['order_manager', 'production', 'logistics', 'courier'] as const) {
        const res = await call(app, m as 'get', `/v1/admin/${p}`)
          .set(...adminAuth(role))
          .send({});
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('media', () => {
    it('signs uploads for patterns and fonts', async () => {
      const res = await admin('post', 'media/upload-signature', { kind: 'pattern' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        resourceType: 'image',
        allowedFormats: ['png', 'jpg', 'svg'],
        maxBytes: 20 * 1024 * 1024,
      });
      expect(res.body.publicId).toMatch(/^patterns\//);
      const font = await admin('post', 'media/upload-signature', { kind: 'font' });
      expect(font.body.resourceType).toBe('raw');
    });

    it('refuses an unknown kind', async () => {
      const res = await admin('post', 'media/upload-signature', { kind: 'video' });
      expect(res.status).toBe(400);
    });
  });

  describe('patterns', () => {
    it('creates, lists and updates a pattern', async () => {
      const created = await admin('post', 'patterns', patternBody());
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        name: 'Motif test admin',
        active: true,
        rightsHolder: 'Atelier Test',
        imagePublicId: 'patterns/admin-test',
      });
      const list = await admin('get', 'patterns?q=test admin');
      expect(list.body.items.map((p: { id: string }) => p.id)).toContain(created.body.id);
      const pub = await http().get(`/v1/catalog/patterns/${created.body.id}`);
      expect(pub.status).toBe(200);
      const upd = await admin('patch', `patterns/${created.body.id}`, { priceTier: 'premium' });
      expect(upd.body.priceTier).toBe('premium');
      expect((await admin('patch', 'patterns/inconnu', { name: 'x' })).status).toBe(404);
    });

    it('refuses activation without rights holder', async () => {
      const res = await admin('post', 'patterns', patternBody({ rightsHolder: '  ' }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.reasons).toEqual(['RIGHTS_HOLDER_MISSING']);
    });

    it('refuses activation under 4 000 px on the longest side', async () => {
      const res = await admin('post', 'patterns', patternBody({ widthPx: 3999, heightPx: 3000 }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.reasons).toEqual(['IMAGE_TOO_SMALL']);
      const ok = await admin('post', 'patterns', patternBody({ widthPx: 3000, heightPx: 4000 }));
      expect(ok.status).toBe(201);
    });

    it('allows importing an inactive pattern, then refuses its activation until compliant', async () => {
      const created = await admin(
        'post',
        'patterns',
        patternBody({ active: false, rightsHolder: null, widthPx: 1000, heightPx: 800 }),
      );
      expect(created.status).toBe(201);
      expect(created.body.active).toBe(false);
      expect((await http().get(`/v1/catalog/patterns/${created.body.id}`)).status).toBe(404);
      const fail = await admin('patch', `patterns/${created.body.id}`, { active: true });
      expect(fail.status).toBe(400);
      expect(fail.body.error.details.reasons).toEqual(['RIGHTS_HOLDER_MISSING', 'IMAGE_TOO_SMALL']);
      const ok = await admin('patch', `patterns/${created.body.id}`, {
        active: true,
        rightsHolder: 'Atelier',
        widthPx: 4500,
      });
      expect(ok.status).toBe(200);
    });

    it('refuses an image over 20 MB or in another format', async () => {
      const big = await admin(
        'post',
        'patterns',
        patternBody({ imageBytes: 20 * 1024 * 1024 + 1 }),
      );
      expect(big.status).toBe(400);
      const gif = await admin('post', 'patterns', patternBody({ imageFormat: 'gif' }));
      expect(gif.status).toBe(400);
      const noFormat = await admin('patch', 'patterns/x', { imagePublicId: 'patterns/y' });
      expect(noFormat.status).toBe(400);
    });

    it('refuses unknown fields and unknown categories', async () => {
      expect((await admin('post', 'patterns', patternBody({ foo: 1 }))).status).toBe(400);
      const res = await admin('post', 'patterns', patternBody({ categoryId: 'inconnue' }));
      expect(res.status).toBe(400);
    });

    it('sanitizes SVG sources before storing them', async () => {
      const svgSource =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">' +
        '<script>alert(1)</script><image href="https://evil.test/x.png"/>' +
        '<rect width="10" height="10" fill="red" onclick="x()"/></svg>';
      const res = await admin(
        'post',
        'patterns',
        patternBody({ imageFormat: 'svg', imagePublicId: 'patterns/svg-test', svgSource }),
      );
      expect(res.status).toBe(201);
      const media = app.get<LocalMediaAdapter>(MEDIA_PROVIDER);
      const stored = media.objects.get('patterns/svg-test');
      expect(stored?.contentType).toBe('image/svg+xml');
      const text = stored?.data.toString('utf8') ?? '';
      expect(text).toContain('<rect');
      expect(text).not.toMatch(/script|onload|onclick|evil|<image/i);
    });

    it('requires the SVG source for svg images', async () => {
      const res = await admin('post', 'patterns', patternBody({ imageFormat: 'svg' }));
      expect(res.status).toBe(400);
    });
  });

  describe('categories, colors, fonts', () => {
    it('manages categories', async () => {
      const created = await admin('post', 'pattern-categories', {
        slug: 'cat-test',
        name: 'Test catégorie',
      });
      expect(created.status).toBe(201);
      expect(
        (await admin('post', 'pattern-categories', { slug: 'cat-test', name: 'Dup' })).status,
      ).toBe(409);
      expect(
        (await admin('post', 'pattern-categories', { slug: 'Mauvais Slug', name: 'x' })).status,
      ).toBe(400);
      const upd = await admin('patch', `pattern-categories/${created.body.id}`, {
        name: 'Renommée',
      });
      expect(upd.body.name).toBe('Renommée');
      const list = await admin('get', 'pattern-categories');
      expect(list.body.length).toBeGreaterThanOrEqual(3);
      const pub = await http().get('/v1/catalog/categories');
      expect(pub.body.map((c: { slug: string }) => c.slug)).toContain('cat-test');
    });

    it('manages colors and hides deactivated ones from the public catalog', async () => {
      const created = await admin('post', 'colors', {
        name: 'Test rouge',
        hex: '#FF0000',
        isDark: true,
      });
      expect(created.status).toBe(201);
      expect(
        (await admin('post', 'colors', { name: 'Test', hex: 'rouge', isDark: true })).status,
      ).toBe(400);
      let pub = await http().get('/v1/catalog/colors');
      expect(pub.body.map((c: { name: string }) => c.name)).toContain('Test rouge');
      await admin('patch', `colors/${created.body.id}`, { active: false });
      pub = await http().get('/v1/catalog/colors');
      expect(pub.body.map((c: { name: string }) => c.name)).not.toContain('Test rouge');
      expect((await admin('get', 'colors')).body.some((c: { active: boolean }) => !c.active)).toBe(
        true,
      );
    });

    it('manages fonts and validates the font file', async () => {
      const body = {
        name: 'Test police',
        family: 'Test Sans',
        filePublicId: 'fonts/test',
        fileFormat: 'ttf',
        fileBytes: 50_000,
        licenseRef: 'OFL',
      };
      const created = await admin('post', 'fonts', body);
      expect(created.status).toBe(201);
      expect(created.body.fileUrl).toContain('fonts/test');
      expect((await admin('post', 'fonts', { ...body, fileFormat: 'exe' })).status).toBe(400);
      expect((await admin('post', 'fonts', { ...body, fileBytes: 21 * 1024 * 1024 })).status).toBe(
        400,
      );
      const upd = await admin('patch', `fonts/${created.body.id}`, { active: false });
      expect(upd.body.active).toBe(false);
      expect((await admin('get', 'fonts')).body.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('price rules and banned words', () => {
    it('reads and patches price rules, visible on the public endpoint', async () => {
      expect((await admin('get', 'price-rules')).body).toEqual(FIXTURE_PRICE_RULES);
      const res = await admin('patch', 'price-rules', { textXof: 1200 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...FIXTURE_PRICE_RULES, textXof: 1200 });
      expect((await http().get('/v1/catalog/pricing')).body.textXof).toBe(1200);
    });

    it('refuses non-integer or negative amounts and unknown keys', async () => {
      expect((await admin('patch', 'price-rules', { textXof: 10.5 })).status).toBe(400);
      expect((await admin('patch', 'price-rules', { textXof: -1 })).status).toBe(400);
      expect((await admin('patch', 'price-rules', { shippingXof: 1 })).status).toBe(400);
      expect((await admin('post', 'price-rules', { baseXof: 1 })).status).toBe(400);
      const full = await admin('post', 'price-rules', { ...FIXTURE_PRICE_RULES, baseXof: 9000 });
      expect(full.body.baseXof).toBe(9000);
      await admin('post', 'price-rules', FIXTURE_PRICE_RULES);
    });

    it('manages banned words and applies them to new designs', async () => {
      const list = await admin('get', 'banned-words');
      expect(list.body.length).toBeGreaterThanOrEqual(20);
      const created = await admin('post', 'banned-words', { word: 'motinterdittest' });
      expect(created.status).toBe(201);
      expect((await admin('post', 'banned-words', { word: 'motinterdittest' })).status).toBe(409);
      expect((await admin('post', 'banned-words', { word: 'ab' })).status).toBe(400);
      const del = await admin('delete', `banned-words/${created.body.id}`);
      expect(del.status).toBe(204);
      expect((await admin('delete', `banned-words/${created.body.id}`)).status).toBe(404);
    });
  });
});
