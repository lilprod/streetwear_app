import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalMediaAdapter } from '../src/media/local-media.adapter';
import { MediaAssetLoader } from '../src/modules/production/render/asset-loader';
import { RenderError } from '../src/modules/production/render/render-zone';
import {
  CODE128_PATTERNS,
  code128Modules,
  code128Values,
} from '../src/modules/production/sheet/code128';
import { LocalStorageAdapter } from '../src/modules/production/storage/local-storage.adapter';
import { S3StorageAdapter } from '../src/modules/production/storage/s3-storage.adapter';

describe('Code 128 (production sheet barcode)', () => {
  it('every symbol is 11 modules wide, the stop 13', () => {
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].reduce((a, c) => a + Number(c), 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
  });

  it('encodes start B, data, checksum and stop; modules decode back to the values', () => {
    const text = 'TG-2026-000123';
    const values = code128Values(text);
    const expected = values.slice(1, -2).reduce((s, v, i) => s + v * (i + 1), 104) % 103;
    expect(values.at(-2)).toBe(expected);
    const modules = code128Modules(text);
    expect(modules).toHaveLength(11 * (values.length - 1) + 13);
    const decoded: number[] = [];
    for (let i = 0; i < values.length - 1; i++) {
      const runs: number[] = [];
      let run = 1;
      const chunk = modules.slice(i * 11, i * 11 + 11);
      for (let k = 1; k < chunk.length; k++) {
        if (chunk[k] === chunk[k - 1]) run++;
        else {
          runs.push(run);
          run = 1;
        }
      }
      runs.push(run);
      decoded.push(CODE128_PATTERNS.findIndex((p) => p === runs.join('')));
    }
    expect(decoded).toEqual(values.slice(0, -1));
  });

  it('rejects characters outside ASCII 32-126', () => {
    expect(() => code128Values('É')).toThrow();
  });
});

describe('storage adapters', () => {
  it('local: put overwrites at the same key, get/exists, signed URL, no path traversal', async () => {
    const s = new LocalStorageAdapter(
      mkdtempSync(join(tmpdir(), 'sw-st-')),
      'http://x.test',
      'secret',
    );
    await s.put('print-files/a/b.png', Buffer.from('1'), 'image/png');
    await s.put('print-files/a/b.png', Buffer.from('2'), 'image/png');
    expect((await s.get('print-files/a/b.png')).toString()).toBe('2');
    expect(await s.exists('print-files/a/b.png')).toBe(true);
    expect(await s.exists('print-files/a/none.png')).toBe(false);
    const url = new URL(await s.signedUrl('print-files/a/b.png', 900));
    const expires = Number(url.searchParams.get('expires'));
    expect(url.searchParams.get('sig')).toBe(s.sign('print-files/a/b.png', expires));
    await expect(s.put('../evil', Buffer.from('x'), 'image/png')).rejects.toThrow();
  });

  it('s3: presigns a 15 min URL offline', async () => {
    const s3 = new S3StorageAdapter({
      bucket: 'b',
      region: 'auto',
      endpoint: 'https://r2.example.test',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    });
    const url = new URL(await s3.signedUrl('print-files/a/b.png', 900));
    expect(url.hostname).toBe('r2.example.test');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.pathname).toBe('/b/print-files/a/b.png');
  });
});

describe('MediaAssetLoader', () => {
  it('downloads once then serves from the disk cache; 404 -> typed error', async () => {
    let calls = 0;
    const fetchFn = (async (u: string) => {
      calls++;
      return u.endsWith('/gone')
        ? new Response('', { status: 404 })
        : new Response(Buffer.from('img'), { status: 200 });
    }) as unknown as typeof fetch;
    const loader = new MediaAssetLoader(
      new LocalMediaAdapter('http://media.test'),
      mkdtempSync(join(tmpdir(), 'sw-cache-')),
      fetchFn,
    );
    expect((await loader.loadPattern('patterns/p1')).toString()).toBe('img');
    expect((await loader.loadPattern('patterns/p1')).toString()).toBe('img');
    expect(calls).toBe(1);
    await expect(loader.loadPattern('patterns/gone')).rejects.toBeInstanceOf(RenderError);
    await expect(loader.loadFont('fonts/gone')).rejects.toMatchObject({
      code: 'FONT_ASSET_MISSING',
    });
  });
});
