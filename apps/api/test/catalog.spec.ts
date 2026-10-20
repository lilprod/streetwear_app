import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { FIXTURE_PATTERNS, FIXTURE_PRICE_RULES } from '@streetwear/shared';
import { buildApp } from './helpers';

describe('catalog (public)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => ({ app, prisma } = await buildApp()));
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('lists categories with a 5 minute cache', async () => {
    const res = await http().get('/v1/catalog/categories');
    expect(res.status).toBe(200);
    expect(res.body.map((c: { slug: string }) => c.slug)).toEqual([
      'pagne-traditionnel',
      'geometrique',
    ]);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.headers.etag).toBeDefined();
  });

  it('answers 304 when the ETag matches', async () => {
    const first = await http().get('/v1/catalog/colors');
    const second = await http()
      .get('/v1/catalog/colors')
      .set('If-None-Match', String(first.headers.etag));
    expect(second.status).toBe(304);
  });

  it('lists the 6 seeded patterns in the contract shape', async () => {
    const res = await http().get('/v1/catalog/patterns');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(6);
    expect(res.body.nextCursor).toBeNull();
    const kente = res.body.items.find((p: { id: string }) => p.id === 'pat-kente-ewe');
    expect(kente).toMatchObject({
      name: 'Kente éwé',
      priceTier: 'premium',
      categoryId: FIXTURE_PATTERNS[0]?.categoryId,
      widthPx: 4800,
    });
    expect(kente.thumbnailUrl).toMatch(/^https?:\/\//);
    expect(kente.active).toBeUndefined();
  });

  it('paginates with an opaque cursor', async () => {
    const p1 = await http().get('/v1/catalog/patterns?limit=4');
    expect(p1.body.items).toHaveLength(4);
    expect(p1.body.nextCursor).toEqual(expect.any(String));
    const p2 = await http().get(`/v1/catalog/patterns?limit=4&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
    const ids = [...p1.body.items, ...p2.body.items].map((p: { id: string }) => p.id);
    expect(new Set(ids).size).toBe(6);
  });

  it.each(['kente', 'KENTÉ', 'ewe', 'éwé', 'Kente éwé'])(
    'finds "Kente éwé" with "%s"',
    async (q) => {
      const res = await http().get('/v1/catalog/patterns').query({ q });
      expect(res.body.items.map((p: { id: string }) => p.id)).toContain('pat-kente-ewe');
    },
  );

  it('searches tags and treats % literally', async () => {
    const tag = await http().get('/v1/catalog/patterns').query({ q: 'BOUE' });
    expect(tag.body.items.map((p: { id: string }) => p.id)).toEqual(['pat-bogolan']);
    const wild = await http().get('/v1/catalog/patterns').query({ q: '%' });
    expect(wild.body.items).toHaveLength(0);
  });

  it('filters by category id or slug', async () => {
    const res = await http().get('/v1/catalog/patterns?category=geometrique');
    expect(res.body.items).toHaveLength(3);
  });

  it('refuses invalid query parameters and cursors', async () => {
    const a = await http().get('/v1/catalog/patterns?limit=0');
    expect(a.status).toBe(400);
    expect(a.body.error.code).toBe('VALIDATION_FAILED');
    const b = await http().get('/v1/catalog/patterns?cursor=%%%');
    expect(b.status).toBe(400);
  });

  it('hides inactive patterns but keeps the rest', async () => {
    await prisma.pattern.update({ where: { id: 'pat-soleil' }, data: { active: false } });
    try {
      const list = await http().get('/v1/catalog/patterns');
      expect(list.body.items).toHaveLength(5);
      expect((await http().get('/v1/catalog/patterns/pat-soleil')).status).toBe(404);
      expect((await http().get('/v1/catalog/patterns/pat-bandes')).status).toBe(200);
    } finally {
      await prisma.pattern.update({ where: { id: 'pat-soleil' }, data: { active: true } });
    }
  });

  it('serves colors, fonts and pricing', async () => {
    const colors = await http().get('/v1/catalog/colors');
    expect(colors.body).toHaveLength(5);
    expect(colors.body[0]).toEqual({ id: 'col-noir', name: 'Noir', hex: '#111111', isDark: true });
    const fonts = await http().get('/v1/catalog/fonts');
    expect(fonts.body).toHaveLength(3);
    expect(fonts.body[0]).toEqual(
      expect.objectContaining({ id: 'font-anton', fileUrl: expect.stringContaining('fonts/') }),
    );
    const pricing = await http().get('/v1/catalog/pricing');
    expect(pricing.body).toEqual(FIXTURE_PRICE_RULES);
  });

  it('reports availability by size', async () => {
    const res = await http().get('/v1/catalog/availability?colorId=col-noir');
    expect(res.status).toBe(200);
    expect(res.body.sizes).toHaveLength(7);
    expect(res.body.sizes[0]).toEqual({ size: 'XS', available: true });
  });

  it('refuses availability without colorId or for unknown colors', async () => {
    expect((await http().get('/v1/catalog/availability')).status).toBe(400);
    expect((await http().get('/v1/catalog/availability?colorId=nope')).status).toBe(404);
  });

  it('answers GET /catalog/patterns in under 150 ms with 200 patterns', async () => {
    const extra = Array.from({ length: 200 }, (_, i) => ({
      id: `perf-${i}`,
      categoryId: FIXTURE_PATTERNS[0]?.categoryId as string,
      name: `Motif perf ${String(i).padStart(3, '0')}`,
      tags: ['perf', `t${i}`],
      imagePublicId: `patterns/perf-${i}`,
      widthPx: 4800,
      heightPx: 4800,
      rightsHolder: 'Test',
      active: true,
    }));
    await prisma.pattern.createMany({ data: extra });
    try {
      await http().get('/v1/catalog/patterns?limit=100');
      const durations: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        const res = await http().get('/v1/catalog/patterns?limit=100&q=perf');
        durations.push(performance.now() - t);
        expect(res.body.items).toHaveLength(100);
      }
      expect(Math.min(...durations)).toBeLessThan(150);
    } finally {
      await prisma.pattern.deleteMany({ where: { id: { startsWith: 'perf-' } } });
    }
  });
});
