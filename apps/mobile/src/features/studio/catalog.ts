import type { Font, Pattern, PatternCategory, PriceRules, TshirtColor } from '@streetwear/shared';
import type { ApiClient } from '../../api/types';
import type { KeyValueStorage } from '../../storage/storage';

export type Catalog = {
  categories: PatternCategory[];
  patterns: Pattern[];
  colors: TshirtColor[];
  fonts: Font[];
  pricing: PriceRules;
  bannedWords: string[];
};

const CACHE_KEY = 'catalog:v1';
const MAX_PAGES = 20;

const readCache = (storage: KeyValueStorage): Catalog | null => {
  const raw = storage.getString(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Catalog;
  } catch {
    return null;
  }
};

async function allPatterns(api: ApiClient): Promise<Pattern[]> {
  const out: Pattern[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const page = await api.listPatterns({ cursor });
    out.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

export async function loadCatalog(
  api: ApiClient,
  storage: KeyValueStorage,
): Promise<{ catalog: Catalog; fromCache: boolean }> {
  const cached = readCache(storage);
  try {
    const [categories, patterns, colors, fonts, pricing, banned] = await Promise.all([
      api.listCategories(),
      allPatterns(api),
      api.listColors(),
      api.listFonts(),
      api.getPricing(),
      api.getBannedWords().catch(() => null),
    ]);
    const catalog: Catalog = {
      categories,
      patterns,
      colors,
      fonts,
      pricing,
      bannedWords: banned ?? cached?.bannedWords ?? [],
    };
    storage.set(CACHE_KEY, JSON.stringify(catalog));
    return { catalog, fromCache: false };
  } catch (e) {
    if (cached) return { catalog: cached, fromCache: true };
    throw e;
  }
}

export const patternsById = (patterns: Pattern[]): Record<string, Pattern> =>
  Object.fromEntries(patterns.map((p) => [p.id, p]));
