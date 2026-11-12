import { http, HttpResponse } from 'msw';
import { uid } from '@streetwear/shared';
import type { PriceRules } from '@streetwear/shared';
import { apiErr, guardRole, pageOf, SUPER } from './admin-guard';
import type {
  BannedWord,
  CatalogFont,
  CatalogPattern,
  PatternCategory,
  TshirtColor,
} from '../lib/catalog-api';

const MIN_ACTIVE_WIDTH_PX = 1000;
const CLOUD = 'https://api.cloudinary.com/v1_1/demo-cloud';

let uploadConfigured = true;
export const setUploadConfigured = (v: boolean): void => {
  uploadConfigured = v;
};

const seedCategories = (): PatternCategory[] => [
  { id: uid(801), slug: 'pagne-classique', name: 'Pagne classique', position: 0 },
  { id: uid(802), slug: 'geometrique', name: 'Géométrique', position: 1 },
  { id: uid(803), slug: 'floral', name: 'Floral', position: 2 },
];
const seedPatterns = (): CatalogPattern[] => [
  {
    id: uid(811),
    name: 'Kente Lomé',
    origin: 'Ewé',
    categoryId: uid(801),
    tags: ['kente', 'traditionnel'],
    priceTier: 'standard',
    thumbnailUrl: `${CLOUD}/thumb/kente-lome`,
    previewUrl: `${CLOUD}/preview/kente-lome`,
    widthPx: 2400,
    heightPx: 2400,
    imagePublicId: 'patterns/kente-lome',
    rightsHolder: 'Atelier Ewé',
    rightsProofUrl: null,
    active: true,
  },
  {
    id: uid(812),
    name: 'Losanges Aného',
    origin: 'Aného',
    categoryId: uid(802),
    tags: ['géométrie'],
    priceTier: 'premium',
    thumbnailUrl: `${CLOUD}/thumb/losanges-anecho`,
    previewUrl: `${CLOUD}/preview/losanges-anecho`,
    widthPx: 3000,
    heightPx: 3000,
    imagePublicId: 'patterns/losanges-anecho',
    rightsHolder: 'Studio Aného',
    rightsProofUrl: 'https://example.test/droits/losanges.pdf',
    active: true,
  },
  {
    id: uid(813),
    name: 'Fleurs de Kpalimé',
    origin: 'Kpalimé',
    categoryId: uid(803),
    tags: ['floral'],
    priceTier: 'standard',
    thumbnailUrl: `${CLOUD}/thumb/fleurs-kpalime`,
    previewUrl: `${CLOUD}/preview/fleurs-kpalime`,
    widthPx: 800,
    heightPx: 800,
    imagePublicId: 'patterns/fleurs-kpalime',
    rightsHolder: null,
    rightsProofUrl: null,
    active: false,
  },
];
const seedColors = (): TshirtColor[] => [
  { id: uid(821), name: 'Blanc', hex: '#FFFFFF', isDark: false, active: true, position: 0 },
  { id: uid(822), name: 'Noir', hex: '#000000', isDark: true, active: true, position: 1 },
  { id: uid(823), name: 'Vert pagne', hex: '#1E7B4F', isDark: true, active: true, position: 2 },
];
const seedFonts = (): CatalogFont[] => [
  {
    id: uid(831),
    name: 'Sans Togo',
    family: 'Sans Togo',
    filePublicId: 'fonts/sans-togo',
    fileUrl: `${CLOUD}/raw/fonts/sans-togo`,
    licenseRef: 'OFL-1.1',
    active: true,
  },
];
const seedBannedWords = (): BannedWord[] => [
  { id: uid(841), word: 'arnaque' },
  { id: uid(842), word: 'contrefaçon' },
];
const seedPriceRules = (): PriceRules => ({
  baseXof: 5000,
  patternStandardXof: 1500,
  patternPremiumXof: 3000,
  textXof: 1000,
});

export let categories = seedCategories();
export let patterns = seedPatterns();
export let colors = seedColors();
export let fonts = seedFonts();
export let bannedWords = seedBannedWords();
export let priceRules = seedPriceRules();

export const resetCatalogState = (): void => {
  categories = seedCategories();
  patterns = seedPatterns();
  colors = seedColors();
  fonts = seedFonts();
  bannedWords = seedBannedWords();
  priceRules = seedPriceRules();
  uploadConfigured = true;
};

const unconfigured = () =>
  apiErr(503, 'PROVIDER_UNAVAILABLE', 'Le téléversement des médias n’est pas configuré.');

const patternReasons = (p: {
  active?: boolean;
  rightsHolder?: string | null;
  widthPx?: number;
  heightPx?: number;
}): string[] => {
  const reasons: string[] = [];
  if (!p.rightsHolder) reasons.push('RIGHTS_HOLDER_MISSING');
  if ((p.widthPx ?? 0) < MIN_ACTIVE_WIDTH_PX || (p.heightPx ?? 0) < MIN_ACTIVE_WIDTH_PX) {
    reasons.push('IMAGE_TOO_SMALL');
  }
  return reasons;
};

export const catalogHandlers = [
  http.post('*/v1/admin/media/upload-signature', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const body = (await request.json().catch(() => null)) as { kind?: string } | null;
    if (body?.kind !== 'pattern' && body?.kind !== 'font') {
      return apiErr(400, 'VALIDATION_FAILED', 'Type de média inconnu.');
    }
    if (!uploadConfigured) return unconfigured();
    const isFont = body.kind === 'font';
    return HttpResponse.json({
      uploadUrl: `${CLOUD}/${isFont ? 'raw' : 'image'}/upload`,
      apiKey: 'demo-api-key',
      timestamp: Math.floor(Date.now() / 1000),
      folder: isFont ? 'fonts' : 'patterns',
      publicId: `${isFont ? 'fonts' : 'patterns'}/${uid(900 + patterns.length)}`,
      signature: 'demo-signature',
      resourceType: isFont ? 'raw' : 'image',
      allowedFormats: isFont ? ['ttf', 'otf', 'woff2'] : ['png', 'jpg', 'svg'],
      maxBytes: 20 * 1024 * 1024,
    });
  }),

  http.get('*/v1/admin/pattern-categories', ({ request }) => {
    const denied = guardRole(request, SUPER);
    return denied ?? HttpResponse.json(categories);
  }),
  http.post('*/v1/admin/pattern-categories', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as Omit<PatternCategory, 'id'>;
    if (categories.some((c) => c.slug === b.slug)) {
      return apiErr(400, 'VALIDATION_FAILED', 'Ce slug existe déjà.');
    }
    const row = { id: uid(850 + categories.length), ...b };
    categories = [...categories, row];
    return HttpResponse.json(row, { status: 201 });
  }),
  http.patch('*/v1/admin/pattern-categories/:id', async ({ request, params }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as Partial<PatternCategory>;
    const row = categories.find((c) => c.id === params.id);
    if (!row) return apiErr(404, 'NOT_FOUND', 'Élément introuvable.');
    const next = { ...row, ...b };
    categories = categories.map((c) => (c.id === row.id ? next : c));
    return HttpResponse.json(next);
  }),

  http.get('*/v1/admin/patterns', ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const rows = patterns.filter((p) => !q || p.name.toLowerCase().includes(q));
    const limit = Number(url.searchParams.get('limit') ?? 20);
    return HttpResponse.json(pageOf(rows, url.searchParams.get('cursor'), limit));
  }),
  http.post('*/v1/admin/patterns', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as Omit<
      CatalogPattern,
      'id' | 'thumbnailUrl' | 'previewUrl'
    > & {
      imageFormat: string;
      imageBytes: number;
      svgSource?: string;
    };
    if (b.imageFormat === 'svg' && !b.svgSource) {
      return apiErr(400, 'VALIDATION_FAILED', 'Source SVG requise.', {
        reasons: ['SVG_SOURCE_REQUIRED'],
      });
    }
    if (b.active) {
      const reasons = patternReasons(b);
      if (reasons.length) {
        return apiErr(400, 'VALIDATION_FAILED', 'Activation refusée.', { reasons });
      }
    }
    const row: CatalogPattern = {
      id: uid(860 + patterns.length),
      name: b.name,
      origin: b.origin,
      categoryId: b.categoryId,
      tags: b.tags,
      priceTier: b.priceTier,
      thumbnailUrl: `${CLOUD}/thumb/${b.imagePublicId}`,
      previewUrl: `${CLOUD}/preview/${b.imagePublicId}`,
      widthPx: b.widthPx,
      heightPx: b.heightPx,
      imagePublicId: b.imagePublicId,
      rightsHolder: b.rightsHolder ?? null,
      rightsProofUrl: b.rightsProofUrl ?? null,
      active: b.active,
    };
    patterns = [...patterns, row];
    return HttpResponse.json(row, { status: 201 });
  }),
  http.patch('*/v1/admin/patterns/:id', async ({ request, params }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as Partial<CatalogPattern>;
    const row = patterns.find((p) => p.id === params.id);
    if (!row) return apiErr(404, 'NOT_FOUND', 'Élément introuvable.');
    const next = { ...row, ...b };
    if (next.active) {
      const reasons = patternReasons(next);
      if (reasons.length) {
        return apiErr(400, 'VALIDATION_FAILED', 'Activation refusée.', { reasons });
      }
    }
    patterns = patterns.map((p) => (p.id === row.id ? next : p));
    return HttpResponse.json(next);
  }),

  http.get('*/v1/admin/colors', ({ request }) => {
    const denied = guardRole(request, SUPER);
    return denied ?? HttpResponse.json(colors);
  }),
  http.post('*/v1/admin/colors', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const row = {
      id: uid(870 + colors.length),
      ...((await request.json()) as Omit<TshirtColor, 'id'>),
    };
    colors = [...colors, row];
    return HttpResponse.json(row, { status: 201 });
  }),
  http.patch('*/v1/admin/colors/:id', async ({ request, params }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const row = colors.find((c) => c.id === params.id);
    if (!row) return apiErr(404, 'NOT_FOUND', 'Élément introuvable.');
    const next = { ...row, ...((await request.json()) as Partial<TshirtColor>) };
    colors = colors.map((c) => (c.id === row.id ? next : c));
    return HttpResponse.json(next);
  }),

  http.get('*/v1/admin/fonts', ({ request }) => {
    const denied = guardRole(request, SUPER);
    return denied ?? HttpResponse.json(fonts);
  }),
  http.post('*/v1/admin/fonts', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as Omit<CatalogFont, 'id' | 'fileUrl'>;
    const row: CatalogFont = {
      id: uid(880 + fonts.length),
      name: b.name,
      family: b.family,
      filePublicId: b.filePublicId,
      fileUrl: `${CLOUD}/raw/${b.filePublicId}`,
      licenseRef: b.licenseRef ?? null,
      active: b.active,
    };
    fonts = [...fonts, row];
    return HttpResponse.json(row, { status: 201 });
  }),
  http.patch('*/v1/admin/fonts/:id', async ({ request, params }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const row = fonts.find((f) => f.id === params.id);
    if (!row) return apiErr(404, 'NOT_FOUND', 'Élément introuvable.');
    const next = { ...row, ...((await request.json()) as Partial<CatalogFont>) };
    fonts = fonts.map((f) => (f.id === row.id ? next : f));
    return HttpResponse.json(next);
  }),

  http.get('*/v1/admin/price-rules', ({ request }) => {
    const denied = guardRole(request, SUPER);
    return denied ?? HttpResponse.json(priceRules);
  }),
  http.patch('*/v1/admin/price-rules', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const b = (await request.json()) as Partial<PriceRules>;
    const values = Object.values({ ...priceRules, ...b });
    if (values.some((v) => typeof v !== 'number' || !Number.isInteger(v) || v < 0)) {
      return apiErr(400, 'VALIDATION_FAILED', 'Montants entiers positifs attendus.');
    }
    priceRules = { ...priceRules, ...b };
    return HttpResponse.json(priceRules);
  }),

  http.get('*/v1/admin/banned-words', ({ request }) => {
    const denied = guardRole(request, SUPER);
    return denied ?? HttpResponse.json(bannedWords);
  }),
  http.post('*/v1/admin/banned-words', async ({ request }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    const { word } = (await request.json()) as { word: string };
    if (bannedWords.some((w) => w.word === word)) {
      return apiErr(400, 'VALIDATION_FAILED', 'Ce mot est déjà interdit.');
    }
    const row = { id: uid(890 + bannedWords.length), word };
    bannedWords = [...bannedWords, row];
    return HttpResponse.json(row, { status: 201 });
  }),
  http.delete('*/v1/admin/banned-words/:id', ({ request, params }) => {
    const denied = guardRole(request, SUPER);
    if (denied) return denied;
    bannedWords = bannedWords.filter((w) => w.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
