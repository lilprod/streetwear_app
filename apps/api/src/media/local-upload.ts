import { timingSafeEqual } from 'node:crypto';
import { apiError } from '../common/api-error';
import { cloudinarySign } from './cloudinary-media.adapter';
import { FONT_FORMATS, MAX_UPLOAD_BYTES, PATTERN_FORMATS } from './media-provider';

export const UPLOAD_TTL_SECONDS = 600;
const CLOCK_SKEW_SECONDS = 60;
const PUBLIC_ID =
  /^(patterns|fonts)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type UploadFields = {
  apiKey?: string;
  timestamp?: string;
  signature?: string;
  publicId?: string;
  folder?: string;
};
export type UploadResult = {
  public_id: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  data: Buffer;
  contentType: string;
};

const unauthorized = () =>
  apiError(401, 'UNAUTHENTICATED', "Signature d'upload invalide ou expirée.");
const invalid = (reason: string, message: string) =>
  apiError(400, 'VALIDATION_FAILED', message, { reasons: [reason] });

export function verifyUploadSignature(
  f: UploadFields,
  secret: string,
  now: Date = new Date(),
): { publicId: string; folder: string } {
  const ts = Number(f.timestamp);
  if (!f.publicId || !f.signature || !Number.isInteger(ts) || f.apiKey !== 'local') {
    throw unauthorized();
  }
  const expected = Buffer.from(cloudinarySign({ public_id: f.publicId, timestamp: ts }, secret));
  const given = Buffer.from(f.signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw unauthorized();
  const age = Math.floor(now.getTime() / 1000) - ts;
  if (age > UPLOAD_TTL_SECONDS || age < -CLOCK_SKEW_SECONDS) throw unauthorized();
  if (!PUBLIC_ID.test(f.publicId)) throw unauthorized();
  const folder = f.publicId.split('/')[0] as string;
  if (f.folder !== undefined && f.folder !== folder) throw unauthorized();
  return { publicId: f.publicId, folder };
}

type Sniffed = { format: string; width: number; height: number; contentType: string };
type Size = { width: number; height: number };

function pngSize(b: Buffer): Size | null {
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function jpegSize(b: Buffer): Size | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] as number;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function svgSize(text: string): Size {
  const vb = /viewBox\s*=\s*"\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i.exec(text);
  const w = vb ? Number(vb[1]) : NaN;
  const h = vb ? Number(vb[2]) : NaN;
  return Number.isFinite(w) && w > 0 && h > 0
    ? { width: Math.round(w), height: Math.round(h) }
    : { width: 1000, height: 1000 };
}

const SVG_START = /^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i;

/** Détecte le format par signature binaire ; le nom ou le type MIME du client ne comptent pas. */
export function sniff(data: Buffer, folder: string): Sniffed {
  const head4 = data.subarray(0, 4);
  if (folder === 'patterns') {
    if (head4.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
      const s = pngSize(data);
      if (s) return { format: 'png', ...s, contentType: 'image/png' };
    }
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      const s = jpegSize(data);
      if (s) return { format: 'jpg', ...s, contentType: 'image/jpeg' };
    }
    const head = data.subarray(0, 4096).toString('utf8');
    const text = (head.charCodeAt(0) === 0xfeff ? head.slice(1) : head).trimStart();
    if (SVG_START.test(text)) {
      return { format: 'svg', ...svgSize(text), contentType: 'image/svg+xml' };
    }
  } else {
    const t = data.toString('latin1', 0, 4);
    if (t === 'wOF2') return { format: 'woff2', width: 0, height: 0, contentType: 'font/woff2' };
    if (t === 'OTTO') return { format: 'otf', width: 0, height: 0, contentType: 'font/otf' };
    if (head4.equals(Buffer.from([0, 1, 0, 0])) || t === 'true') {
      return { format: 'ttf', width: 0, height: 0, contentType: 'font/ttf' };
    }
  }
  const allowed = folder === 'patterns' ? PATTERN_FORMATS : FONT_FORMATS;
  throw invalid(
    'FORMAT_NOT_ALLOWED',
    `Format de fichier refusé. Formats acceptés : ${allowed.join(', ')}.`,
  );
}

export function acceptUpload(
  fields: UploadFields,
  file: Buffer | undefined,
  secret: string,
  now?: Date,
): UploadResult {
  const { publicId, folder } = verifyUploadSignature(fields, secret, now);
  if (!file || file.length === 0) throw invalid('FILE_REQUIRED', 'Aucun fichier reçu.');
  if (file.length > MAX_UPLOAD_BYTES) throw invalid('FILE_TOO_LARGE', 'Fichier trop volumineux.');
  const s = sniff(file, folder);
  return {
    public_id: publicId,
    format: s.format,
    bytes: file.length,
    width: s.width,
    height: s.height,
    data: file,
    contentType: s.contentType,
  };
}
