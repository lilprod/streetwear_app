import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Font,
  Page,
  Pattern,
  PatternCategory,
  PriceRules,
  Size,
  TshirtColor,
} from '@streetwear/shared';
import { SIZES } from '@streetwear/shared';
import { ApiException, notFound } from '../common/api-exception';
import { omit } from '../common/omit';
import { MEDIA_PROVIDER, type MediaProvider } from '../media/media-provider';
import { PrismaService } from '../prisma/prisma.service';
import { PricingRulesService } from './pricing-rules.service';
import { STOCK_READER, type StockReader } from './stock-reader';

export type PatternRow = {
  id: string;
  name: string;
  origin: string;
  category_id: string;
  tags: string[];
  price_tier: 'standard' | 'premium';
  image_public_id: string;
  width_px: number;
  height_px: number;
  active: boolean;
};

export type PatternView = Pattern & { active: boolean };

export type PatternsQuery = { category?: string; q?: string; cursor?: string; limit: number };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingRulesService,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
    @Inject(STOCK_READER) private readonly stock: StockReader,
  ) {}

  toPattern(r: PatternRow): PatternView {
    return {
      id: r.id,
      name: r.name,
      origin: r.origin,
      categoryId: r.category_id,
      tags: r.tags,
      priceTier: r.price_tier,
      thumbnailUrl: this.media.thumbnailUrl(r.image_public_id),
      previewUrl: this.media.previewUrl(r.image_public_id),
      widthPx: r.width_px,
      heightPx: r.height_px,
      active: r.active,
    };
  }

  async categories(): Promise<PatternCategory[]> {
    const rows = await this.prisma.patternCategory.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, position: c.position }));
  }

  async patterns(query: PatternsQuery): Promise<Page<Pattern>> {
    const conds: Prisma.Sql[] = [Prisma.sql`p.active = true`];
    if (query.category) {
      conds.push(Prisma.sql`(p.category_id = ${query.category} OR c.slug = ${query.category})`);
    }
    const q = query.q?.trim();
    if (q) {
      const like = `%${escapeLike(q)}%`;
      conds.push(
        Prisma.sql`(unaccent(p.name) ILIKE unaccent(${like}) OR unaccent(array_to_string(p.tags, ' ')) ILIKE unaccent(${like}))`,
      );
    }
    if (query.cursor) {
      const [name, id] = this.decodeCursor(query.cursor);
      conds.push(Prisma.sql`(p.name, p.id) > (${name}, ${id})`);
    }
    const rows = await this.prisma.$queryRaw<PatternRow[]>(Prisma.sql`
      SELECT p.id, p.name, p.origin, p.category_id, p.tags, p.price_tier::text AS price_tier,
             p.image_public_id, p.width_px, p.height_px, p.active
      FROM patterns p JOIN pattern_categories c ON c.id = p.category_id
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY p.name, p.id
      LIMIT ${query.limit + 1}`);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: pageRows.map((r) => {
        return omit(this.toPattern(r), 'active');
      }),
      nextCursor: hasMore && last ? this.encodeCursor(last.name, last.id) : null,
    };
  }

  async pattern(id: string): Promise<Pattern> {
    const rows = await this.prisma.$queryRaw<PatternRow[]>(Prisma.sql`
      SELECT p.id, p.name, p.origin, p.category_id, p.tags, p.price_tier::text AS price_tier,
             p.image_public_id, p.width_px, p.height_px, p.active
      FROM patterns p WHERE p.id = ${id} AND p.active = true`);
    const row = rows[0];
    if (!row) throw notFound('Motif');
    return omit(this.toPattern(row), 'active');
  }

  /** Service interne (SP04, SP08) : inclut les motifs désactivés, `active` indiqué. */
  async getPatternsByIds(ids: string[]): Promise<Map<string, PatternView>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<PatternRow[]>(Prisma.sql`
      SELECT p.id, p.name, p.origin, p.category_id, p.tags, p.price_tier::text AS price_tier,
             p.image_public_id, p.width_px, p.height_px, p.active
      FROM patterns p WHERE p.id IN (${Prisma.join(ids)})`);
    return new Map(rows.map((r) => [r.id, this.toPattern(r)]));
  }

  async colors(): Promise<TshirtColor[]> {
    const rows = await this.prisma.tshirtColor.findMany({
      where: { active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map((c) => ({ id: c.id, name: c.name, hex: c.hex, isDark: c.isDark }));
  }

  async fonts(): Promise<Font[]> {
    const rows = await this.prisma.font.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((f) => ({
      id: f.id,
      name: f.name,
      family: f.family,
      fileUrl: this.media.fileUrl(f.filePublicId),
    }));
  }

  pricingRules(): Promise<PriceRules> {
    return this.pricing.current();
  }

  async availability(colorId: string): Promise<{ sizes: { size: Size; available: boolean }[] }> {
    const color = await this.prisma.tshirtColor.findFirst({ where: { id: colorId, active: true } });
    if (!color) throw notFound('Couleur');
    const bySize = await this.stock.availableBySize(colorId);
    return { sizes: SIZES.map((size) => ({ size, available: bySize[size] ?? false })) };
  }

  private encodeCursor(name: string, id: string): string {
    return Buffer.from(JSON.stringify([name, id])).toString('base64url');
  }

  private decodeCursor(cursor: string): [string, string] {
    try {
      const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') {
        return [v[0], v[1]];
      }
    } catch {
      /* curseur invalide */
    }
    throw new ApiException(400, 'VALIDATION_FAILED', 'Curseur de pagination invalide.');
  }
}
