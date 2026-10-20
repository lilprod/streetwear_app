import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Design as DesignRow } from '@prisma/client';
import {
  computeUnitPriceXof,
  containsBannedWord,
  validateDesignSpec,
  type CreateDesignInput,
  type Design,
  type DesignPreviewsInput,
  type DesignSpec,
  type Page,
  type UpdateDesignInput,
} from '@streetwear/shared';
import { ApiException, notFound } from '../common/api-exception';
import { CatalogService } from '../catalog/catalog.service';
import { PricingRulesService } from '../catalog/pricing-rules.service';
import { MEDIA_PROVIDER, type MediaProvider } from '../media/media-provider';
import { PrismaService } from '../prisma/prisma.service';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PREVIEW_BYTES = 500 * 1024;

const layersOf = (spec: DesignSpec) =>
  [spec.zones.front, spec.zones.back].flatMap((z) => z?.layers ?? []);

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingRulesService,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  async list(
    userId: string,
    query: { drafts?: boolean; cursor?: string; limit: number },
  ): Promise<Page<Design>> {
    const where: Prisma.DesignWhereInput = { userId };
    if (query.drafts !== undefined) where.isDraft = query.drafts;
    if (query.cursor) {
      const [ts, id] = this.decodeCursor(query.cursor);
      where.AND = [{ OR: [{ updatedAt: { lt: ts } }, { updatedAt: ts, id: { lt: id } }] }];
    }
    const rows = await this.prisma.design.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      items: await this.toDtos(pageRows),
      nextCursor:
        hasMore && last
          ? Buffer.from(JSON.stringify([last.updatedAt.toISOString(), last.id])).toString(
              'base64url',
            )
          : null,
    };
  }

  async get(userId: string, id: string): Promise<Design> {
    return (await this.toDtos([await this.owned(userId, id)]))[0] as Design;
  }

  async create(userId: string, input: CreateDesignInput): Promise<Design> {
    const spec = await this.checkSpec(input.spec);
    const row = await this.prisma.design.create({
      data: {
        userId,
        spec: spec as unknown as Prisma.InputJsonValue,
        specVersion: spec.version,
        name: input.name ?? null,
        isDraft: true,
      },
    });
    return (await this.toDtos([row]))[0] as Design;
  }

  async update(userId: string, id: string, input: UpdateDesignInput): Promise<Design> {
    await this.owned(userId, id);
    const data: Prisma.DesignUpdateInput = {};
    if (input.spec) {
      const spec = await this.checkSpec(input.spec);
      data.spec = spec as unknown as Prisma.InputJsonValue;
      data.specVersion = spec.version;
    }
    if (input.name !== undefined) data.name = input.name;
    if (input.isDraft !== undefined) data.isDraft = input.isDraft;
    const row = await this.prisma.design.update({ where: { id }, data });
    return (await this.toDtos([row]))[0] as Design;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.design.delete({ where: { id } });
  }

  async duplicate(userId: string, id: string): Promise<Design> {
    const src = await this.owned(userId, id);
    const row = await this.prisma.design.create({
      data: {
        userId,
        spec: src.spec as Prisma.InputJsonValue,
        specVersion: src.specVersion,
        name: src.name ? `${src.name} (copie)`.slice(0, 100) : null,
        previewFrontUrl: src.previewFrontUrl,
        previewBackUrl: src.previewBackUrl,
        isDraft: true,
      },
    });
    return (await this.toDtos([row]))[0] as Design;
  }

  async setPreviews(userId: string, id: string, input: DesignPreviewsInput): Promise<Design> {
    await this.owned(userId, id);
    const data: Prisma.DesignUpdateInput = {};
    for (const side of ['front', 'back'] as const) {
      const b64 = input[side];
      if (b64 === undefined) continue;
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > MAX_PREVIEW_BYTES || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          'Aperçu invalide : PNG de 500 Ko maximum.',
          {
            fieldErrors: { [side]: ['PNG de 500 Ko maximum attendu.'] },
          },
        );
      }
      const url = await this.media.putObject(`designs/${id}/${side}`, buf, 'image/png');
      data[side === 'front' ? 'previewFrontUrl' : 'previewBackUrl'] = `${url}?v=${Date.now()}`;
    }
    const row = await this.prisma.design.update({ where: { id }, data });
    return (await this.toDtos([row]))[0] as Design;
  }

  private async owned(userId: string, id: string): Promise<DesignRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Design');
    const row = await this.prisma.design.findFirst({ where: { id, userId } });
    if (!row) throw notFound('Design');
    return row;
  }

  private async checkSpec(input: DesignSpec): Promise<DesignSpec> {
    const result = validateDesignSpec(input);
    if (!result.ok) {
      throw new ApiException(400, 'VALIDATION_FAILED', 'Le design est invalide.', {
        issues: result.errors,
      });
    }
    const spec = result.spec;
    const layers = layersOf(spec);
    const patternIds = [
      ...new Set(layers.flatMap((l) => (l.type === 'pattern' ? [l.patternId] : []))),
    ];
    const fontIds = [...new Set(layers.flatMap((l) => (l.type === 'text' ? [l.fontId] : [])))];

    const [patterns, fonts, color] = await Promise.all([
      this.catalog.getPatternsByIds(patternIds),
      this.prisma.font.findMany({ where: { id: { in: fontIds }, active: true } }),
      this.prisma.tshirtColor.findFirst({ where: { id: spec.colorId, active: true } }),
    ]);
    const unavailable: { kind: 'pattern' | 'font' | 'color'; id: string }[] = [];
    for (const id of patternIds) {
      if (!patterns.get(id)?.active) unavailable.push({ kind: 'pattern', id });
    }
    const activeFonts = new Set(fonts.map((f) => f.id));
    for (const id of fontIds) if (!activeFonts.has(id)) unavailable.push({ kind: 'font', id });
    if (!color) unavailable.push({ kind: 'color', id: spec.colorId });
    if (unavailable.length > 0) {
      throw new ApiException(
        422,
        'PATTERN_INACTIVE',
        'Un élément du design (motif, police ou couleur) n’est plus disponible.',
        { items: unavailable },
      );
    }

    const texts = layers.flatMap((l) => (l.type === 'text' ? [l.text] : []));
    if (texts.length > 0) {
      const words = (await this.prisma.bannedWord.findMany({ select: { word: true } })).map(
        (w) => w.word,
      );
      if (texts.some((t) => containsBannedWord(t, words))) {
        throw new ApiException(422, 'TEXT_REJECTED', 'Ce texte ne peut pas être imprimé.');
      }
    }
    return spec;
  }

  private async toDtos(rows: DesignRow[]): Promise<Design[]> {
    if (rows.length === 0) return [];
    const specs = rows.map((r) => r.spec as unknown as DesignSpec);
    const ids = [
      ...new Set(
        specs.flatMap((s) =>
          layersOf(s).flatMap((l) => (l.type === 'pattern' ? [l.patternId] : [])),
        ),
      ),
    ];
    const [patterns, rules] = await Promise.all([
      this.catalog.getPatternsByIds(ids),
      this.pricing.current(),
    ]);
    return rows.map((r, i) => ({
      id: r.id,
      name: r.name,
      spec: specs[i] as DesignSpec,
      isDraft: r.isDraft,
      previewFrontUrl: r.previewFrontUrl,
      previewBackUrl: r.previewBackUrl,
      unitPriceXof: computeUnitPriceXof(specs[i] as DesignSpec, rules, patterns),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private decodeCursor(cursor: string): [Date, string] {
    try {
      const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') {
        const d = new Date(v[0]);
        if (!Number.isNaN(d.getTime())) return [d, v[1]];
      }
    } catch {
      /* curseur invalide */
    }
    throw new ApiException(400, 'VALIDATION_FAILED', 'Curseur de pagination invalide.');
  }
}
