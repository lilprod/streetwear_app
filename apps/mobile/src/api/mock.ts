import {
  FIXTURE_CATEGORIES,
  FIXTURE_COLORS,
  FIXTURE_DESIGNS,
  FIXTURE_FONTS,
  FIXTURE_PATTERNS,
  FIXTURE_PATTERNS_BY_ID,
  FIXTURE_PRICE_RULES,
  CreateDesignInputSchema,
  DesignPreviewsInputSchema,
  UpdateDesignInputSchema,
  computeUnitPriceXof,
  containsBannedWord,
  validateDesignSpec,
  type Design,
  type DesignSpec,
} from '@streetwear/shared';
import { t } from '../i18n/fr';
import { newLayerId } from '../features/studio/model';
import { ApiError, type ApiClient } from './types';

export const MOCK_BANNED_WORDS = ['merde', 'putain', 'connard', 'salope'];

export type MockOptions = { latencyMs?: number; now?: () => Date };

export function createMockApi(options: MockOptions = {}): ApiClient {
  const latency = options.latencyMs ?? 120;
  const now = options.now ?? (() => new Date());
  const designs = new Map<string, Design>(FIXTURE_DESIGNS.map((d) => [d.id, { ...d }]));

  const wait = <T>(value: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(value());
        } catch (e) {
          reject(e);
        }
      }, latency),
    );

  const checkSpec = (spec: DesignSpec): number => {
    const res = validateDesignSpec(spec);
    if (!res.ok) {
      throw new ApiError(
        'VALIDATION_FAILED',
        res.errors[0]?.message ?? t('api.invalidDesign'),
        422,
      );
    }
    for (const zone of [spec.zones.front, spec.zones.back]) {
      for (const layer of zone?.layers ?? []) {
        if (layer.type === 'pattern' && !FIXTURE_PATTERNS_BY_ID[layer.patternId]) {
          throw new ApiError('PATTERN_INACTIVE', t('api.patternInactive'), 422);
        }
        if (layer.type === 'text' && containsBannedWord(layer.text, MOCK_BANNED_WORDS)) {
          throw new ApiError('TEXT_REJECTED', t('api.textRejected'), 422);
        }
      }
    }
    if (!FIXTURE_COLORS.some((c) => c.id === spec.colorId)) {
      throw new ApiError('VALIDATION_FAILED', t('api.colorInactive'), 422);
    }
    return computeUnitPriceXof(spec, FIXTURE_PRICE_RULES, FIXTURE_PATTERNS_BY_ID);
  };

  const get = (id: string): Design => {
    const d = designs.get(id);
    if (!d) throw new ApiError('NOT_FOUND', t('api.designNotFound'), 404);
    return d;
  };

  return {
    listCategories: () => wait(() => [...FIXTURE_CATEGORIES]),
    listPatterns: (q) =>
      wait(() => {
        const needle = q?.q?.trim().toLowerCase();
        const items = FIXTURE_PATTERNS.filter(
          (p) =>
            (!q?.category || p.categoryId === q.category) &&
            (!needle || p.name.toLowerCase().includes(needle) || p.tags.includes(needle)),
        );
        return { items, nextCursor: null };
      }),
    listColors: () => wait(() => [...FIXTURE_COLORS]),
    listFonts: () => wait(() => [...FIXTURE_FONTS]),
    getPricing: () => wait(() => ({ ...FIXTURE_PRICE_RULES })),
    getBannedWords: () => wait(() => [...MOCK_BANNED_WORDS]),
    listDesigns: (q) =>
      wait(() => {
        const items = [...designs.values()]
          .filter((d) => q?.drafts === undefined || d.isDraft === q.drafts)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return { items, nextCursor: null };
      }),
    createDesign: (input) =>
      wait(() => {
        const parsed = CreateDesignInputSchema.safeParse(input);
        if (!parsed.success) {
          throw new ApiError('VALIDATION_FAILED', t('api.invalidDesign'), 422);
        }
        const unitPriceXof = checkSpec(parsed.data.spec);
        const design: Design = {
          id: newLayerId(),
          name: parsed.data.name ?? null,
          spec: parsed.data.spec,
          isDraft: true,
          previewFrontUrl: null,
          previewBackUrl: null,
          unitPriceXof,
          updatedAt: now().toISOString(),
        };
        designs.set(design.id, design);
        return design;
      }),
    updateDesign: (id, input) =>
      wait(() => {
        const current = get(id);
        const parsed = UpdateDesignInputSchema.safeParse(input);
        if (!parsed.success) {
          throw new ApiError('VALIDATION_FAILED', t('api.invalidDesign'), 422);
        }
        const spec = parsed.data.spec ?? current.spec;
        const unitPriceXof = checkSpec(spec);
        const next: Design = {
          ...current,
          spec,
          name: parsed.data.name ?? current.name,
          isDraft: parsed.data.isDraft ?? current.isDraft,
          unitPriceXof,
          updatedAt: now().toISOString(),
        };
        designs.set(id, next);
        return next;
      }),
    deleteDesign: (id) =>
      wait(() => {
        get(id);
        designs.delete(id);
      }),
    uploadPreviews: (id, input) =>
      wait(() => {
        const current = get(id);
        const parsed = DesignPreviewsInputSchema.safeParse(input);
        if (!parsed.success) {
          throw new ApiError('VALIDATION_FAILED', t('api.previewInvalid'), 422);
        }
        const next: Design = {
          ...current,
          previewFrontUrl: parsed.data.front
            ? `https://cdn.example.test/designs/${id}/front.png`
            : current.previewFrontUrl,
          previewBackUrl: parsed.data.back
            ? `https://cdn.example.test/designs/${id}/back.png`
            : current.previewBackUrl,
        };
        designs.set(id, next);
        return next;
      }),
  };
}
