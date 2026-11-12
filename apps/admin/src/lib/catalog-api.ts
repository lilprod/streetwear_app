import type {
  AdminTshirtColor as TshirtColor,
  BannedWord,
  CatalogFont,
  CatalogPattern,
  FontFormat,
  Page,
  PatternCategory,
  PatternFormat,
  PriceRules,
  PriceTier,
  UploadSignature,
} from '@streetwear/shared';
import { api } from './api';

export type {
  BannedWord,
  CatalogFont,
  CatalogPattern,
  FontFormat,
  PatternCategory,
  PatternFormat,
  PriceTier,
  UploadSignature,
} from '@streetwear/shared';
export type { AdminTshirtColor as TshirtColor } from '@streetwear/shared';

export type PatternInput = {
  name: string;
  origin: string;
  categoryId: string;
  tags: string[];
  priceTier: PriceTier;
  rightsHolder: string | null;
  rightsProofUrl: string | null;
  active: boolean;
  imagePublicId: string;
  imageFormat: PatternFormat;
  imageBytes: number;
  widthPx: number;
  heightPx: number;
  svgSource?: string;
};
export type PatternPatch = Partial<Omit<PatternInput, 'svgSource'>> & { svgSource?: string };

export const listPatterns = (q: string, cursor?: string, signal?: AbortSignal) =>
  api<Page<CatalogPattern>>('/admin/patterns', { query: { q, cursor, limit: 20 }, signal });
export const createPattern = (body: PatternInput) =>
  api<CatalogPattern>('/admin/patterns', { method: 'POST', body });
export const updatePattern = (id: string, body: PatternPatch) =>
  api<CatalogPattern>(`/admin/patterns/${id}`, { method: 'PATCH', body });

export const listCategories = () => api<PatternCategory[]>('/admin/pattern-categories');
export const createCategory = (body: Omit<PatternCategory, 'id'>) =>
  api<PatternCategory>('/admin/pattern-categories', { method: 'POST', body });
export const updateCategory = (id: string, body: Partial<Omit<PatternCategory, 'id'>>) =>
  api<PatternCategory>(`/admin/pattern-categories/${id}`, { method: 'PATCH', body });

export const listColors = () => api<TshirtColor[]>('/admin/colors');
export const createColor = (body: Omit<TshirtColor, 'id'>) =>
  api<TshirtColor>('/admin/colors', { method: 'POST', body });
export const updateColor = (id: string, body: Partial<Omit<TshirtColor, 'id'>>) =>
  api<TshirtColor>(`/admin/colors/${id}`, { method: 'PATCH', body });

export const listFonts = () => api<CatalogFont[]>('/admin/fonts');
export const createFont = (body: {
  name: string;
  family: string;
  filePublicId: string;
  fileFormat: FontFormat;
  fileBytes: number;
  licenseRef: string | null;
  active: boolean;
}) => api<CatalogFont>('/admin/fonts', { method: 'POST', body });
export const updateFont = (id: string, body: Partial<Pick<CatalogFont, 'active' | 'name'>>) =>
  api<CatalogFont>(`/admin/fonts/${id}`, { method: 'PATCH', body });

export const getPriceRules = () => api<PriceRules>('/admin/price-rules');
export const patchPriceRules = (body: Partial<PriceRules>) =>
  api<PriceRules>('/admin/price-rules', { method: 'PATCH', body });

export const listBannedWords = () => api<BannedWord[]>('/admin/banned-words');
export const createBannedWord = (word: string) =>
  api<BannedWord>('/admin/banned-words', { method: 'POST', body: { word } });
export const deleteBannedWord = (id: string) =>
  api<undefined>(`/admin/banned-words/${id}`, { method: 'DELETE' });

export const requestUploadSignature = (kind: 'pattern' | 'font') =>
  api<UploadSignature>('/admin/media/upload-signature', { method: 'POST', body: { kind } });

export type CloudinaryUploadResult = {
  public_id: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
};

export async function uploadToProvider(
  sig: UploadSignature,
  file: File,
): Promise<CloudinaryUploadResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('public_id', sig.publicId);
  form.append('folder', sig.folder);
  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  const json = (await res.json().catch(() => null)) as CloudinaryUploadResult | null;
  if (!res.ok || !json?.public_id) throw new UploadError();
  return json;
}

export class UploadError extends Error {
  constructor() {
    super('upload');
    this.name = 'UploadError';
  }
}

export const readSvgSource = (file: File): Promise<string> => file.text();
