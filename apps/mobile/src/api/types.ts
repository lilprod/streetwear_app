import type {
  AddCartItemInput,
  AuthResult,
  Availability,
  Cart,
  CreateDesignInput,
  Design,
  DesignPreviewsInput,
  ErrorCode,
  Font,
  Page,
  Pattern,
  PatternCategory,
  PriceRules,
  Quote,
  ReceptionInput,
  TshirtColor,
  UpdateCartItemInput,
  UpdateDesignInput,
  UpdateMeInput,
  User,
} from '@streetwear/shared';

export type ApiErrorCode = ErrorCode | 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number = 0,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK' || this.code === 'TIMEOUT';
  }
}

export type PatternsQuery = { category?: string; q?: string; cursor?: string };
export type DesignsQuery = { drafts?: boolean; cursor?: string };

export type OAuthProvider = 'apple' | 'google';

export interface ApiClient {
  listCategories(): Promise<PatternCategory[]>;
  listPatterns(query?: PatternsQuery): Promise<Page<Pattern>>;
  listColors(): Promise<TshirtColor[]>;
  listFonts(): Promise<Font[]>;
  getPricing(): Promise<PriceRules>;
  /** Route proposée (absente du contrat v1) : GET /catalog/banned-words -> string[]. */
  getBannedWords(): Promise<string[]>;
  listDesigns(query?: DesignsQuery): Promise<Page<Design>>;
  createDesign(input: CreateDesignInput): Promise<Design>;
  updateDesign(id: string, input: UpdateDesignInput): Promise<Design>;
  deleteDesign(id: string): Promise<void>;
  uploadPreviews(id: string, input: DesignPreviewsInput): Promise<Design>;
  getDesign(id: string): Promise<Design>;
  getAvailability(colorId: string): Promise<Availability>;

  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, code: string): Promise<AuthResult>;
  oauthSignIn(provider: OAuthProvider, idToken: string): Promise<AuthResult>;
  logout(refreshToken: string): Promise<void>;
  getMe(): Promise<User>;
  updateMe(input: UpdateMeInput): Promise<User>;

  getCart(): Promise<Cart>;
  addCartItem(input: AddCartItemInput): Promise<Cart>;
  updateCartItem(id: string, input: UpdateCartItemInput): Promise<Cart>;
  removeCartItem(id: string): Promise<Cart>;
  quoteCart(reception: ReceptionInput): Promise<Quote>;
}
