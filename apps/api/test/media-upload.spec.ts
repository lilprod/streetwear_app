import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CloudinaryMediaAdapter, cloudinarySign } from '../src/media/cloudinary-media.adapter';
import { LocalMediaAdapter } from '../src/media/local-media.adapter';
import { MediaUploadController } from '../src/media/media-upload.controller';
import { MEDIA_PROVIDER, MAX_UPLOAD_BYTES } from '../src/media/media-provider';
import { type AuthHeader, buildApp } from './helpers';

const png = (w: number, h: number): Buffer => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const SVG = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect/></svg>',
);
const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60)]);

describe('local media upload (POST /v1/admin/media/upload)', () => {
  let app: INestApplication;
  let media: LocalMediaAdapter;
  let adminAuth: (r: 'super_admin' | 'production') => AuthHeader;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const built = await buildApp();
    app = built.app;
    adminAuth = built.adminAuth;
    media = app.get<LocalMediaAdapter>(MEDIA_PROVIDER);
  });
  afterAll(async () => {
    await app.close();
  });

  type Sig = Awaited<ReturnType<typeof sign>>;
  async function sign(kind: 'pattern' | 'font' = 'pattern') {
    const res = await http()
      .post('/v1/admin/media/upload-signature')
      .set(...adminAuth('super_admin'))
      .send({ kind })
      .expect(200);
    return res.body as {
      uploadUrl: string;
      apiKey: string;
      timestamp: number;
      folder: string;
      publicId: string;
      signature: string;
      maxBytes: number;
    };
  }

  function upload(
    sig: Sig,
    file: Buffer | null,
    over: Record<string, string | undefined> = {},
    filename = 'x.png',
  ) {
    const fields: Record<string, string | undefined> = {
      api_key: sig.apiKey,
      timestamp: String(sig.timestamp),
      signature: sig.signature,
      public_id: sig.publicId,
      folder: sig.folder,
      ...over,
    };
    let req = http().post('/v1/admin/media/upload');
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) req = req.field(k, v);
    if (file) req = req.attach('file', file, { filename, contentType: 'image/png' });
    return req;
  }

  it('signs for the API itself and accepts a signed PNG, SVG and font without any bearer token', async () => {
    const sig = await sign();
    expect(sig.uploadUrl).toBe('/v1/admin/media/upload');
    expect(sig.signature).not.toBe('local-signature');
    const res = await upload(sig, png(640, 480)).expect(200);
    expect(res.body).toEqual({
      public_id: sig.publicId,
      format: 'png',
      bytes: 33,
      width: 640,
      height: 480,
    });
    expect(media.objects.get(sig.publicId)?.contentType).toBe('image/png');

    const s2 = await sign();
    const svg = await upload(s2, SVG, {}, 'a.svg').expect(200);
    expect(svg.body).toMatchObject({ format: 'svg', width: 40, height: 20 });

    const s3 = await sign('font');
    const font = await upload(s3, WOFF2, {}, 'f.woff2').expect(200);
    expect(font.body).toMatchObject({ public_id: s3.publicId, format: 'woff2' });
    expect(font.body.width).toBeUndefined();
  });

  it('refuses a missing, forged, foreign or replayed-with-other-id signature', async () => {
    const sig = await sign();
    const other = await sign();
    for (const over of [
      { signature: undefined },
      { signature: 'f'.repeat(40) },
      { signature: sig.signature.slice(0, -1) + (sig.signature.endsWith('0') ? '1' : '0') },
      { public_id: other.publicId },
      { timestamp: String(sig.timestamp + 1) },
      { api_key: 'cloudinary' },
      { public_id: undefined },
    ]) {
      const res = await upload(sig, png(2, 2), over).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
    expect(media.objects.has(other.publicId)).toBe(false);
  });

  it('refuses an expired signature and a timestamp far in the future', async () => {
    const sig = await sign();
    const at = (ts: number) =>
      upload(sig, png(2, 2), {
        timestamp: String(ts),
        signature: cloudinarySign({ public_id: sig.publicId, timestamp: ts }, media.secret),
      });
    const now = Math.floor(Date.now() / 1000);
    await at(now - 601).expect(401);
    await at(now + 3600).expect(401);
    await at(now - 30).expect(200);
  });

  it('refuses forbidden formats whatever the filename or MIME type says', async () => {
    const cases: [string, Buffer, 'pattern' | 'font', string][] = [
      ['gif', Buffer.from('GIF89a' + 'x'.repeat(40)), 'pattern', 'a.png'],
      ['html', Buffer.from('<html><script>alert(1)</script></html>'), 'pattern', 'a.svg'],
      ['svg-lookalike', Buffer.from('<div><svg></svg></div>'), 'pattern', 'a.svg'],
      ['exe', Buffer.from('MZ' + 'x'.repeat(60)), 'pattern', 'a.png'],
      ['png as font', png(2, 2), 'font', 'a.woff2'],
      ['woff2 as pattern', WOFF2, 'pattern', 'a.png'],
      ['truncated png', png(2, 2).subarray(0, 12), 'pattern', 'a.png'],
    ];
    for (const [, file, kind, name] of cases) {
      const sig = await sign(kind);
      const res = await upload(sig, file, {}, name).expect(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { reasons: ['FORMAT_NOT_ALLOWED'] },
      });
      expect(media.objects.has(sig.publicId)).toBe(false);
    }
  });

  it('refuses a file over the size limit and an empty request', async () => {
    const sig = await sign();
    const big = Buffer.concat([png(2, 2), Buffer.alloc(MAX_UPLOAD_BYTES)]);
    const res = await upload(sig, big).expect(400);
    expect(res.body.error.details.reasons).toEqual(['FILE_TOO_LARGE']);
    expect(media.objects.has(sig.publicId)).toBe(false);
    const none = await upload(sig, null).expect(400);
    expect(none.body.error.details.reasons).toEqual(['FILE_REQUIRED']);
    await http().post('/v1/admin/media/upload').send({ a: 1 }).expect(401);
  }, 30_000);

  it('ignores the client filename and refuses path traversal in public_id or folder', async () => {
    const sig = await sign();
    const res = await upload(sig, png(2, 2), {}, '../../../etc/passwd.png').expect(200);
    expect(res.body.public_id).toBe(sig.publicId);
    expect(
      [...media.objects.keys()].every((k) => /^(patterns|fonts)\/[0-9a-f-]{36}$/.test(k)),
    ).toBe(true);

    for (const publicId of [
      '../../etc/passwd',
      'patterns/../../x',
      'patterns/x',
      'patterns/' + 'a'.repeat(36),
      '/patterns/' + sig.publicId.slice(9),
    ]) {
      const ts = Math.floor(Date.now() / 1000);
      await upload(sig, png(2, 2), {
        public_id: publicId,
        timestamp: String(ts),
        signature: cloudinarySign({ public_id: publicId, timestamp: ts }, media.secret),
      }).expect(401);
    }
    await upload(sig, png(2, 2), { folder: 'fonts' }).expect(401);
    expect(media.objects.has('../../etc/passwd')).toBe(false);
  });

  it('is not served when the provider is not local', async () => {
    const ctl = new MediaUploadController(
      new CloudinaryMediaAdapter({ cloudName: 'demo', apiKey: 'k', apiSecret: 's' }),
    );
    await expect(ctl.upload({ body: {} } as never)).rejects.toMatchObject({ status: 404 });
  });

  it('keeps the signature route behind the admin roles', async () => {
    await http().post('/v1/admin/media/upload-signature').send({ kind: 'pattern' }).expect(401);
    await http()
      .post('/v1/admin/media/upload-signature')
      .set(...adminAuth('production'))
      .send({ kind: 'pattern' })
      .expect(403);
  });
});
