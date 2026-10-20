export type MediaKind = 'pattern' | 'font';

export type UploadSignature = {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  publicId: string;
  signature: string;
  resourceType: 'image' | 'raw';
  allowedFormats: string[];
  maxBytes: number;
};

export interface MediaProvider {
  signUpload(kind: MediaKind): UploadSignature;
  thumbnailUrl(publicId: string): string;
  previewUrl(publicId: string): string;
  fileUrl(publicId: string): string;
  putObject(publicId: string, data: Buffer, contentType: string): Promise<string>;
  delete(publicId: string): Promise<void>;
}

export const MEDIA_PROVIDER = Symbol('MEDIA_PROVIDER');

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const PATTERN_FORMATS = ['png', 'jpg', 'svg'] as const;
export const FONT_FORMATS = ['ttf', 'otf', 'woff2'] as const;
