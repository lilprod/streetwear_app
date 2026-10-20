import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PriceRules } from '@streetwear/shared';
import type { z } from 'zod';
import { PRICE_RULE_KEYS, PricingRulesService } from '../catalog/pricing-rules.service';
import { ApiException, notFound } from '../common/api-exception';
import { omit } from '../common/omit';
import { MEDIA_PROVIDER, type MediaKind, type MediaProvider } from '../media/media-provider';
import { isSvgDocument, sanitizeSvg } from '../media/svg-sanitizer';
import { PrismaService } from '../prisma/prisma.service';
import type * as S from './admin-catalog.schemas';

export const MIN_PATTERN_SIDE_PX = 4000;

async function guarded<T>(fn: () => Promise<T>, what: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        throw new ApiException(409, 'CONFLICT', `${what} existe déjà.`);
      }
      if (e.code === 'P2025') throw notFound(what);
      if (e.code === 'P2003') {
        throw new ApiException(400, 'VALIDATION_FAILED', 'Référence inconnue.', {
          fieldErrors: { categoryId: ['Catégorie inconnue.'] },
        });
      }
    }
    throw e;
  }
}

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingRulesService,
    @Inject(MEDIA_PROVIDER) private readonly media: MediaProvider,
  ) {}

  signUpload(kind: MediaKind) {
    return this.media.signUpload(kind);
  }

  // Catégories
  listCategories() {
    return this.prisma.patternCategory.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }
  createCategory(input: z.output<typeof S.CategoryInputSchema>) {
    return guarded(() => this.prisma.patternCategory.create({ data: input }), 'Catégorie');
  }
  updateCategory(id: string, input: z.output<typeof S.CategoryPatchSchema>) {
    return guarded(
      () => this.prisma.patternCategory.update({ where: { id }, data: input }),
      'Catégorie',
    );
  }

  // Motifs
  async listPatterns(query: z.output<typeof S.PatternsAdminQuerySchema>) {
    const rows = await this.prisma.pattern.findMany({
      where: {
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((p) => this.patternView(p));
    return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
  }

  async createPattern(input: z.output<typeof S.PatternInputSchema>) {
    const { imageFormat, svgSource } = input;
    const data = omit(input, 'imageFormat', 'imageBytes', 'svgSource');
    this.assertActivatable(data);
    await this.ingestSvg(imageFormat, data.imagePublicId, svgSource);
    const row = await guarded(
      () =>
        this.prisma.pattern.create({ data: { ...data, rightsHolder: data.rightsHolder ?? null } }),
      'Motif',
    );
    return this.patternView(row);
  }

  async updatePattern(id: string, input: z.output<typeof S.PatternPatchSchema>) {
    const existing = await this.prisma.pattern.findUnique({ where: { id } });
    if (!existing) throw notFound('Motif');
    const { imageFormat, svgSource } = input;
    const patch = omit(input, 'imageFormat', 'imageBytes', 'svgSource');
    this.assertActivatable({ ...existing, ...patch });
    if (patch.imagePublicId && imageFormat) {
      await this.ingestSvg(imageFormat, patch.imagePublicId, svgSource);
    }
    const row = await guarded(
      () => this.prisma.pattern.update({ where: { id }, data: patch }),
      'Motif',
    );
    return this.patternView(row);
  }

  private assertActivatable(p: {
    active?: boolean;
    rightsHolder?: string | null;
    widthPx?: number;
    heightPx?: number;
  }): void {
    if (!p.active) return;
    const reasons: string[] = [];
    if (!p.rightsHolder?.trim()) reasons.push('RIGHTS_HOLDER_MISSING');
    if (Math.max(p.widthPx ?? 0, p.heightPx ?? 0) < MIN_PATTERN_SIDE_PX) {
      reasons.push('IMAGE_TOO_SMALL');
    }
    if (reasons.length > 0) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Activation refusée : détenteur des droits requis et image d’au moins 4 000 px sur le grand côté.',
        { reasons },
      );
    }
  }

  private async ingestSvg(format: string, publicId: string, source?: string): Promise<void> {
    if (format !== 'svg') return;
    if (!source || !isSvgDocument(source)) {
      throw new ApiException(
        400,
        'VALIDATION_FAILED',
        'Le contenu SVG est requis et doit être valide.',
        {
          fieldErrors: { svgSource: ['SVG requis.'] },
        },
      );
    }
    const clean = sanitizeSvg(source);
    if (!isSvgDocument(clean)) {
      throw new ApiException(400, 'VALIDATION_FAILED', 'Le SVG est inutilisable après nettoyage.');
    }
    await this.media.putObject(publicId, Buffer.from(clean, 'utf8'), 'image/svg+xml');
  }

  private patternView(p: {
    id: string;
    categoryId: string;
    name: string;
    origin: string;
    tags: string[];
    priceTier: 'standard' | 'premium';
    imagePublicId: string;
    widthPx: number;
    heightPx: number;
    rightsHolder: string | null;
    rightsProofUrl: string | null;
    active: boolean;
  }) {
    return {
      id: p.id,
      name: p.name,
      origin: p.origin,
      categoryId: p.categoryId,
      tags: p.tags,
      priceTier: p.priceTier,
      thumbnailUrl: this.media.thumbnailUrl(p.imagePublicId),
      previewUrl: this.media.previewUrl(p.imagePublicId),
      widthPx: p.widthPx,
      heightPx: p.heightPx,
      imagePublicId: p.imagePublicId,
      rightsHolder: p.rightsHolder,
      rightsProofUrl: p.rightsProofUrl,
      active: p.active,
    };
  }

  // Couleurs
  listColors() {
    return this.prisma.tshirtColor.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] });
  }
  createColor(input: z.output<typeof S.ColorInputSchema>) {
    return this.prisma.tshirtColor.create({ data: input });
  }
  updateColor(id: string, input: z.output<typeof S.ColorPatchSchema>) {
    return guarded(() => this.prisma.tshirtColor.update({ where: { id }, data: input }), 'Couleur');
  }

  // Polices
  async listFonts() {
    const rows = await this.prisma.font.findMany({ orderBy: { name: 'asc' } });
    return rows.map((f) => this.fontView(f));
  }
  async createFont(input: z.output<typeof S.FontInputSchema>) {
    const data = omit(input, 'fileFormat', 'fileBytes');
    return this.fontView(
      await this.prisma.font.create({ data: { ...data, licenseRef: data.licenseRef ?? null } }),
    );
  }
  async updateFont(id: string, input: z.output<typeof S.FontPatchSchema>) {
    const data = omit(input, 'fileFormat', 'fileBytes');
    return this.fontView(
      await guarded(() => this.prisma.font.update({ where: { id }, data }), 'Police'),
    );
  }
  private fontView(f: {
    id: string;
    name: string;
    family: string;
    filePublicId: string;
    licenseRef: string | null;
    active: boolean;
  }) {
    return { ...f, fileUrl: this.media.fileUrl(f.filePublicId) };
  }

  // Règles de prix
  getPriceRules(): Promise<PriceRules> {
    return this.pricing.current();
  }
  async setPriceRules(input: Partial<PriceRules>): Promise<PriceRules> {
    await this.prisma.$transaction(
      Object.entries(input).map(([field, amount]) =>
        this.prisma.priceRule.upsert({
          where: { key: PRICE_RULE_KEYS[field as keyof PriceRules] },
          create: { key: PRICE_RULE_KEYS[field as keyof PriceRules], amountXof: amount },
          update: { amountXof: amount },
        }),
      ),
    );
    return this.pricing.current();
  }

  // Mots interdits
  listBannedWords() {
    return this.prisma.bannedWord.findMany({ orderBy: { word: 'asc' } });
  }
  createBannedWord(word: string) {
    return guarded(() => this.prisma.bannedWord.create({ data: { word } }), 'Mot interdit');
  }
  async deleteBannedWord(id: string): Promise<void> {
    await guarded(() => this.prisma.bannedWord.delete({ where: { id } }), 'Mot interdit');
  }
}
