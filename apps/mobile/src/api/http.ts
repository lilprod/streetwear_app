import {
  ApiErrorSchema,
  AuthResultSchema,
  AvailabilitySchema,
  CartSchema,
  DesignSchema,
  FontSchema,
  PatternCategorySchema,
  PatternSchema,
  PriceRulesSchema,
  QuoteSchema,
  TokensSchema,
  TshirtColorSchema,
  UserSchema,
  pageSchema,
} from '@streetwear/shared';
import { t } from '../i18n/fr';
import type { TokenStore } from '../auth/tokens';
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
  tokens?: TokenStore;
  onSessionExpired?: () => void;
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
    extra: { anonymous?: boolean; idempotencyKey?: string; retried?: boolean } = {},
  ): Promise<T> {
    const qs = Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    const url = `${options.baseUrl}${path}${qs ? `?${qs}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (extra.idempotencyKey) headers['Idempotency-Key'] = extra.idempotencyKey;
    if (!extra.anonymous) {
      const token = options.tokens
        ? ((await options.tokens.get())?.accessToken ?? null)
        : await options.getAccessToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

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
      if (res.status === 401 && options.tokens && !extra.anonymous && !extra.retried) {
        if (await refreshOnce()) {
          return request(method, path, schema, body, query, { ...extra, retried: true });
        }
      }
      if (parsed.success) {
        throw new ApiError(
          parsed.data.error.code,
          parsed.data.error.message,
          res.status,
          parsed.data.error.details,
        );
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

  let refreshing: Promise<boolean> | null = null;
  const refreshOnce = (): Promise<boolean> => {
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };
  async function doRefresh(): Promise<boolean> {
    const store = options.tokens;
    const current = await store?.get();
    if (!store || !current) return false;
    try {
      const next = await request(
        'POST',
        '/auth/refresh',
        TokensSchema,
        {
          refreshToken: current.refreshToken,
        },
        undefined,
        { anonymous: true },
      );
      await store.set(next);
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.isNetwork || e.status >= 500)) throw e;
      await store.clear();
      options.onSessionExpired?.();
      return false;
    }
  }

  const designSchema = DesignSchema;
  const anon = { anonymous: true };
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
    getDesign: (id) => request('GET', `/designs/${id}`, designSchema),
    getAvailability: (colorId) =>
      request('GET', '/catalog/availability', AvailabilitySchema, undefined, { colorId }),

    requestOtp: async (phone) => {
      await request('POST', '/auth/otp/request', null, { phone }, undefined, anon);
    },
    verifyOtp: (phone, code) =>
      request('POST', '/auth/otp/verify', AuthResultSchema, { phone, code }, undefined, anon),
    oauthSignIn: (provider, idToken) =>
      request('POST', `/auth/oauth/${provider}`, AuthResultSchema, { idToken }, undefined, anon),
    logout: async (refreshToken) => {
      await request('POST', '/auth/logout', null, { refreshToken }, undefined, anon);
    },
    getMe: () => request('GET', '/me', UserSchema),
    updateMe: (input) => request('PATCH', '/me', UserSchema, input),

    getCart: () => request('GET', '/cart', CartSchema),
    addCartItem: (input) => request('POST', '/cart/items', CartSchema, input),
    updateCartItem: (id, input) => request('PATCH', `/cart/items/${id}`, CartSchema, input),
    removeCartItem: (id) => request('DELETE', `/cart/items/${id}`, CartSchema),
    quoteCart: (reception) => request('POST', '/cart/quote', QuoteSchema, { reception }),
  };
}
