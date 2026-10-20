import type {
  CreateDesignInput,
  Design,
  DesignPreviewsInput,
  ErrorCode,
  Font,
  Page,
  Pattern,
  PatternCategory,
  PriceRules,
  TshirtColor,
  UpdateDesignInput,
} from '@streetwear/shared';

export type ApiErrorCode = ErrorCode | 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number = 0,
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
}
