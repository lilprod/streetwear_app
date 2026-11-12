import type {
  AddCartItemInput,
  Address,
  AddressInput,
  AuthResult,
  Availability,
  Cart,
  CreateDesignInput,
  CreateOrderInput,
  CreatePaymentInput,
  DeliveryZoneSummary,
  Design,
  DesignPreviewsInput,
  ErrorCode,
  Font,
  Order,
  OrderSummary,
  Page,
  Pattern,
  PatternCategory,
  Payment,
  PaymentStatusResponse,
  PickupSlot,
  PriceRules,
  PushTokenInput,
  Quote,
  ReceptionInput,
  Store,
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

  deleteMe(): Promise<void>;
  listAddresses(): Promise<Address[]>;
  createAddress(input: AddressInput): Promise<Address>;
  updateAddress(id: string, input: Partial<AddressInput>): Promise<Address>;
  deleteAddress(id: string): Promise<void>;
  registerPushToken(input: PushTokenInput): Promise<void>;

  /** `null` quand le point est hors des zones (404 NOT_FOUND). */
  resolveZone(lat: number, lng: number): Promise<DeliveryZoneSummary | null>;
  listStores(): Promise<Store[]>;
  listSlots(storeId: string, date: string): Promise<PickupSlot[]>;

  /** `idempotencyKey` : UUID généré une fois par tentative, rejoué tel quel à chaque nouvel appui. */
  createOrder(input: CreateOrderInput, idempotencyKey: string): Promise<Order>;
  listOrders(cursor?: string): Promise<Page<OrderSummary>>;
  getOrder(id: string): Promise<Order>;
  getReceiptPdf(id: string): Promise<Uint8Array>;
  reorder(id: string): Promise<Cart>;
  createPayment(
    orderId: string,
    input: CreatePaymentInput,
    idempotencyKey: string,
  ): Promise<Payment>;
  getPayment(id: string): Promise<PaymentStatusResponse>;
}
