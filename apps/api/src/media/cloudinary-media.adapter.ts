import { createHash, randomUUID } from 'node:crypto';
import {
  FONT_FORMATS,
  MAX_UPLOAD_BYTES,
  PATTERN_FORMATS,
  type MediaKind,
  type MediaProvider,
  type UploadSignature,
} from './media-provider';

export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

export function cloudinarySign(params: Record<string, string | number>, secret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1')
    .update(toSign + secret)
    .digest('hex');
}

export class CloudinaryMediaAdapter implements MediaProvider {
  constructor(private readonly cfg: CloudinaryConfig) {}

  private get base(): string {
    return `https://res.cloudinary.com/${this.cfg.cloudName}`;
  }

  signUpload(kind: MediaKind): UploadSignature {
    const folder = kind === 'pattern' ? 'patterns' : 'fonts';
    const resourceType = kind === 'pattern' ? 'image' : 'raw';
    const publicId = `${folder}/${randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cfg.cloudName}/${resourceType}/upload`,
      apiKey: this.cfg.apiKey,
      timestamp,
      folder,
      publicId,
      signature: cloudinarySign({ public_id: publicId, timestamp }, this.cfg.apiSecret),
      resourceType,
      allowedFormats: [...(kind === 'pattern' ? PATTERN_FORMATS : FONT_FORMATS)],
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  thumbnailUrl(publicId: string): string {
    return `${this.base}/image/upload/c_fill,w_300,h_300,f_webp,q_auto:low/${publicId}`;
  }

  previewUrl(publicId: string): string {
    return `${this.base}/image/upload/c_limit,w_1200,f_webp,q_auto/${publicId}`;
  }

  fileUrl(publicId: string): string {
    return `${this.base}/raw/upload/${publicId}`;
  }

  async putObject(publicId: string, data: Buffer, contentType: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(data)], { type: contentType }));
    form.set('public_id', publicId);
    form.set('timestamp', String(timestamp));
    form.set('api_key', this.cfg.apiKey);
    form.set('signature', cloudinarySign({ public_id: publicId, timestamp }, this.cfg.apiSecret));
    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cfg.cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
    const json = (await res.json()) as { secure_url: string };
    return json.secure_url;
  }

  async delete(publicId: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: this.cfg.apiKey,
      signature: cloudinarySign({ public_id: publicId, timestamp }, this.cfg.apiSecret),
    });
    const res = await fetch(`https://api.cloudinary.com/v1_1/${this.cfg.cloudName}/image/destroy`, {
      method: 'POST',
      body,
    });
    if (!res.ok) throw new Error(`Cloudinary delete failed (${res.status})`);
  }
}
