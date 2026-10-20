import { randomUUID } from 'node:crypto';
import {
  FONT_FORMATS,
  MAX_UPLOAD_BYTES,
  PATTERN_FORMATS,
  type MediaKind,
  type MediaProvider,
  type UploadSignature,
} from './media-provider';

/** Adaptateur factice (dev et tests) : aucun appel réseau, objets conservés en mémoire. */
export class LocalMediaAdapter implements MediaProvider {
  readonly objects = new Map<string, { data: Buffer; contentType: string }>();

  constructor(private readonly baseUrl: string) {}

  signUpload(kind: MediaKind): UploadSignature {
    const folder = kind === 'pattern' ? 'patterns' : 'fonts';
    const publicId = `${folder}/${randomUUID()}`;
    return {
      uploadUrl: `${this.baseUrl}/upload`,
      apiKey: 'local',
      timestamp: Math.floor(Date.now() / 1000),
      folder,
      publicId,
      signature: 'local-signature',
      resourceType: kind === 'pattern' ? 'image' : 'raw',
      allowedFormats: [...(kind === 'pattern' ? PATTERN_FORMATS : FONT_FORMATS)],
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  thumbnailUrl(publicId: string): string {
    return `${this.baseUrl}/${publicId}/thumb.webp`;
  }

  previewUrl(publicId: string): string {
    return `${this.baseUrl}/${publicId}/preview.webp`;
  }

  fileUrl(publicId: string): string {
    return `${this.baseUrl}/${publicId}`;
  }

  putObject(publicId: string, data: Buffer, contentType: string): Promise<string> {
    this.objects.set(publicId, { data, contentType });
    return Promise.resolve(this.fileUrl(publicId));
  }

  delete(publicId: string): Promise<void> {
    this.objects.delete(publicId);
    return Promise.resolve();
  }
}
