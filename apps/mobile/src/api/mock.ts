import {
  FIXTURE_CATEGORIES,
  FIXTURE_COLORS,
  FIXTURE_DESIGNS,
  FIXTURE_FONTS,
  FIXTURE_PATTERNS,
  FIXTURE_PATTERNS_BY_ID,
  FIXTURE_PRICE_RULES,
  FIXTURE_ZONES,
  AddCartItemInputSchema,
  CART_LINE_MAX_QUANTITY,
  CreateDesignInputSchema,
  DesignPreviewsInputSchema,
  QuoteInputSchema,
  SIZES,
  UpdateCartItemInputSchema,
  UpdateDesignInputSchema,
  computeCartTotals,
  computeUnitPriceXof,
  containsBannedWord,
  normalizeTgPhone,
  uid,
  validateDesignSpec,
  type AuthResult,
  type Cart,
  type CartItem,
  type Design,
  type DesignSpec,
  type Size,
  type User,
} from '@streetwear/shared';
import { t } from '../i18n/fr';
import { newLayerId } from '../features/studio/model';
import type { TokenStore } from '../auth/tokens';
import { createMockOrders, type MockOrdersOptions } from './mock-orders';
import { ApiError, type ApiClient } from './types';

export const MOCK_BANNED_WORDS = ['merde', 'putain', 'connard', 'salope'];

export const MOCK_OTP_CODE = '123456';
export const MOCK_SOLD_OUT_SIZES: Size[] = ['3XL'];

export type MockOptions = {
  latencyMs?: number;
  now?: () => Date;
  /** Quand fourni, les routes protégées exigent une session, comme l'API réelle. */
  tokens?: TokenStore;
  otpCode?: string;
  soldOutSizes?: Size[];
} & MockOrdersOptions;

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

  const otpCode = options.otpCode ?? MOCK_OTP_CODE;
  const soldOut = new Set<Size>(options.soldOutSizes ?? MOCK_SOLD_OUT_SIZES);
  const otpState = new Map<string, { sends: number; attempts: number; pending: boolean }>();
  const users = new Map<string, User>();
  let tokenSeq = 0;
  let itemSeq = 0;
  let cartItems: { id: string; designId: string; size: Size; quantity: number }[] = [];

  const requireAuth = async (): Promise<void> => {
    if (!options.tokens) return;
    const tokens = await options.tokens.get();
    if (!tokens?.accessToken.startsWith('mock-access')) {
      throw new ApiError('UNAUTHENTICATED', t('api.unauthenticated'), 401);
    }
  };
  const authed =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      await requireAuth();
      return fn(...args);
    };
  const issue = (user: User, isNewUser: boolean): AuthResult => {
    tokenSeq += 1;
    return {
      accessToken: `mock-access-${tokenSeq}`,
      refreshToken: `mock-refresh-${tokenSeq}`,
      user,
      isNewUser,
    };
  };
  const findOrCreate = (key: string, phone: string | null): AuthResult => {
    const existing = users.get(key);
    if (existing) return issue(existing, false);
    const user: User = {
      id: uid(900 + users.size),
      phone,
      name: null,
      email: null,
      createdAt: now().toISOString(),
    };
    users.set(key, user);
    return issue(user, true);
  };
  let me: User | null = null;

  const buildCart = (): Cart => {
    const items: CartItem[] = [];
    for (const line of cartItems) {
      const design = designs.get(line.designId);
      if (!design) continue;
      items.push({
        id: line.id,
        design,
        size: line.size,
        quantity: line.quantity,
        unitPriceXof: design.unitPriceXof,
        lineTotalXof: design.unitPriceXof * line.quantity,
        available: !soldOut.has(line.size),
      });
    }
    const totals = computeCartTotals(items, 0);
    return { items, subtotalXof: totals.subtotalXof, itemCount: totals.itemCount };
  };
  const invalid = () => new ApiError('VALIDATION_FAILED', t('api.invalidRequest'), 400);

  const get = (id: string): Design => {
    const d = designs.get(id);
    if (!d) throw new ApiError('NOT_FOUND', t('api.designNotFound'), 404);
    return d;
  };

  const orders = createMockOrders(
    {
      now,
      wait,
      authed,
      cart: buildCart,
      clearCart: () => {
        cartItems = [];
      },
      addToCart: (line) => {
        const twin = cartItems.find((l) => l.designId === line.designId && l.size === line.size);
        if (twin) twin.quantity = Math.min(CART_LINE_MAX_QUANTITY, twin.quantity + line.quantity);
        else {
          itemSeq += 1;
          cartItems.push({ id: uid(2000 + itemSeq), ...line });
        }
      },
      invalid,
    },
    options,
  );
  const { addressById, ...ordersApi } = orders;

  const base: ApiClient = {
    ...ordersApi,
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
    getDesign: (id) => wait(() => get(id)),
    getAvailability: () =>
      wait(() => ({ sizes: SIZES.map((size) => ({ size, available: !soldOut.has(size) })) })),

    requestOtp: (phone) =>
      wait(() => {
        const e164 = normalizeTgPhone(phone);
        if (!e164) throw invalid();
        const st = otpState.get(e164) ?? { sends: 0, attempts: 0, pending: false };
        if (st.sends >= 3) {
          throw new ApiError('RATE_LIMITED', t('login.rate', { n: 60 }), 429, {
            retryAfterMinutes: 60,
          });
        }
        otpState.set(e164, { sends: st.sends + 1, attempts: 0, pending: true });
      }),
    verifyOtp: (phone, code) =>
      wait(() => {
        const e164 = normalizeTgPhone(phone);
        const st = e164 ? otpState.get(e164) : undefined;
        if (!e164 || !/^\d{6}$/.test(code)) throw invalid();
        if (!st?.pending) throw new ApiError('OTP_INVALID', t('login.code.invalid'), 400);
        if (st.attempts >= 5) {
          throw new ApiError('OTP_ATTEMPTS_EXCEEDED', t('login.code.exceeded'), 400);
        }
        if (code !== otpCode) {
          st.attempts += 1;
          throw new ApiError(
            st.attempts >= 5 ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INVALID',
            st.attempts >= 5 ? t('login.code.exceeded') : t('login.code.invalid'),
            400,
          );
        }
        st.pending = false;
        const res = findOrCreate(e164, e164);
        me = res.user;
        return res;
      }),
    oauthSignIn: (provider, idToken) =>
      wait(() => {
        if (!idToken || idToken === 'invalid') {
          throw new ApiError('UNAUTHENTICATED', t('api.unauthenticated'), 401);
        }
        const res = findOrCreate(`${provider}:${idToken}`, null);
        me = res.user;
        return res;
      }),
    logout: () => wait(() => undefined),
    getMe: authed(() =>
      wait(() => {
        if (!me) throw new ApiError('UNAUTHENTICATED', t('api.unauthenticated'), 401);
        return me;
      }),
    ),
    updateMe: authed((input) =>
      wait(() => {
        if (!me) throw new ApiError('UNAUTHENTICATED', t('api.unauthenticated'), 401);
        me = { ...me, name: input.name ?? me.name, email: input.email ?? me.email };
        return me;
      }),
    ),

    getCart: authed(() => wait(buildCart)),
    addCartItem: authed((input) =>
      wait(() => {
        const parsed = AddCartItemInputSchema.safeParse(input);
        if (!parsed.success) throw invalid();
        get(parsed.data.designId);
        const twin = cartItems.find(
          (l) => l.designId === parsed.data.designId && l.size === parsed.data.size,
        );
        const quantity = (twin?.quantity ?? 0) + parsed.data.quantity;
        if (quantity > CART_LINE_MAX_QUANTITY) throw invalid();
        if (twin) twin.quantity = quantity;
        else {
          itemSeq += 1;
          cartItems.push({ id: uid(2000 + itemSeq), ...parsed.data });
        }
        return buildCart();
      }),
    ),
    updateCartItem: authed((id, input) =>
      wait(() => {
        const parsed = UpdateCartItemInputSchema.safeParse(input);
        const line = cartItems.find((l) => l.id === id);
        if (!parsed.success) throw invalid();
        if (!line) throw new ApiError('NOT_FOUND', t('api.notFound'), 404);
        line.size = parsed.data.size ?? line.size;
        line.quantity = parsed.data.quantity ?? line.quantity;
        return buildCart();
      }),
    ),
    removeCartItem: authed((id) =>
      wait(() => {
        if (!cartItems.some((l) => l.id === id)) {
          throw new ApiError('NOT_FOUND', t('api.notFound'), 404);
        }
        cartItems = cartItems.filter((l) => l.id !== id);
        return buildCart();
      }),
    ),
    quoteCart: authed((reception) =>
      wait(() => {
        const parsed = QuoteInputSchema.safeParse({ reception });
        const cart = buildCart();
        if (!parsed.success || cart.items.length === 0) throw invalid();
        const target = parsed.data.reception;
        let fee = 0;
        if (target.type === 'home') {
          const address = addressById(target.addressId);
          const zone = address ? address.zone : (FIXTURE_ZONES[0] ?? null);
          if (!zone) throw new ApiError('OUT_OF_ZONE', t('api.outOfZone'), 422);
          fee = zone.feeXof;
        }
        const totals = computeCartTotals(cart.items, fee);
        const ready = new Date(now().getTime() + 48 * 3600_000).toISOString();
        return {
          subtotalXof: totals.subtotalXof,
          deliveryFeeXof: totals.deliveryFeeXof,
          totalXof: totals.totalXof,
          vatIncludedXof: totals.vatIncludedXof,
          estimatedReadyAt: ready,
          estimatedDeliveryAt:
            parsed.data.reception.type === 'home'
              ? new Date(now().getTime() + 72 * 3600_000).toISOString()
              : null,
        };
      }),
    ),
  };
  if (!options.tokens) return base;
  const protectedDesigns = [
    'listDesigns',
    'createDesign',
    'updateDesign',
    'deleteDesign',
    'uploadPreviews',
    'getDesign',
  ] as const;
  const guarded: ApiClient = { ...base };
  for (const name of protectedDesigns) {
    const fn = base[name] as (...a: unknown[]) => Promise<unknown>;
    (guarded as unknown as Record<string, unknown>)[name] = authed(fn);
  }
  return guarded;
}
