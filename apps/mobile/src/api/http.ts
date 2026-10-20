import {
  ApiErrorSchema,
  DesignSchema,
  FontSchema,
  PatternCategorySchema,
  PatternSchema,
  PriceRulesSchema,
  TshirtColorSchema,
  pageSchema,
} from '@streetwear/shared';
import { t } from '../i18n/fr';
import { ApiError, type ApiClient } from './types';

type Parser<T> = {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
};

const bannedWordsParser: Parser<string[]> = {
  safeParse: (v) =>
    Array.isArray(v) && v.every((w) => typeof w === 'string')
      ? { success: true, data: v as string[] }
      : { success: false },
};

export type HttpOptions = {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export function createHttpApi(options: HttpOptions): ApiClient {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15000;

  async function request<T>(
    method: string,
    path: string,
    schema: Parser<T> | null,
    body?: unknown,
    query?: Record<string, string | boolean | undefined>,
  ): Promise<T> {
    const qs = Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const url = `${options.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await options.getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      const aborted = (e as { name?: string }).name === 'AbortError';
      throw new ApiError(
        aborted ? 'TIMEOUT' : 'NETWORK',
        aborted ? t('api.timeout') : t('api.network'),
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null));
      if (parsed.success) {
        throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
      }
      throw new ApiError('SERVICE_UNAVAILABLE', t('api.unavailable'), res.status);
    }
    if (!schema || res.status === 204) return undefined as T;
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError('INVALID_RESPONSE', t('api.invalidResponse'), res.status);
    }
    return parsed.data;
  }

  const designSchema = DesignSchema;
  return {
    listCategories: () => request('GET', '/catalog/categories', PatternCategorySchema.array()),
    listPatterns: (q) =>
      request('GET', '/catalog/patterns', pageSchema(PatternSchema), undefined, {
        category: q?.category,
        q: q?.q,
        cursor: q?.cursor,
      }),
    listColors: () => request('GET', '/catalog/colors', TshirtColorSchema.array()),
    listFonts: () => request('GET', '/catalog/fonts', FontSchema.array()),
    getPricing: () => request('GET', '/catalog/pricing', PriceRulesSchema),
    getBannedWords: () => request('GET', '/catalog/banned-words', bannedWordsParser),
    listDesigns: (q) =>
      request('GET', '/designs', pageSchema(designSchema), undefined, {
        drafts: q?.drafts,
        cursor: q?.cursor,
      }),
    createDesign: (input) => request('POST', '/designs', designSchema, input),
    updateDesign: (id, input) => request('PATCH', `/designs/${id}`, designSchema, input),
    deleteDesign: async (id) => {
      await request('DELETE', `/designs/${id}`, null);
    },
    uploadPreviews: (id, input) => request('POST', `/designs/${id}/previews`, designSchema, input),
  };
}
