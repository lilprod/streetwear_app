import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalMediaAdapter } from '../../../media/local-media.adapter';
import type { MediaProvider } from '../../../media/media-provider';
import { RenderError } from './render-zone';

/** Source des fichiers pleine résolution (motifs, polices) nécessaires au rendu. */
export interface AssetLoader {
  loadPattern(publicId: string): Promise<Buffer>;
  loadFont(publicId: string): Promise<Buffer>;
}

export const ASSET_LOADER = Symbol('ASSET_LOADER');

/** Télécharge via `MediaProvider.fileUrl` avec cache disque (clé = hash du publicId). */
export class MediaAssetLoader implements AssetLoader {
  constructor(
    private readonly media: MediaProvider,
    private readonly cacheDir: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  loadPattern(publicId: string): Promise<Buffer> {
    return this.load(publicId, 'PATTERN_ASSET_MISSING');
  }

  loadFont(publicId: string): Promise<Buffer> {
    return this.load(publicId, 'FONT_ASSET_MISSING');
  }

  private async load(
    publicId: string,
    missing: 'PATTERN_ASSET_MISSING' | 'FONT_ASSET_MISSING',
  ): Promise<Buffer> {
    const file = join(this.cacheDir, createHash('sha256').update(publicId).digest('hex'));
    try {
      return await readFile(file);
    } catch {
      // pas en cache
    }
    let data: Buffer;
    const local = this.media instanceof LocalMediaAdapter ? this.media.objects.get(publicId) : null;
    if (local) {
      data = local.data;
    } else {
      let res: Response;
      try {
        res = await this.fetchFn(this.media.fileUrl(publicId));
      } catch {
        throw new RenderError(missing, `Fichier ${publicId} injoignable.`);
      }
      if (!res.ok)
        throw new RenderError(missing, `Fichier ${publicId} introuvable (${res.status}).`);
      data = Buffer.from(await res.arrayBuffer());
    }
    await mkdir(this.cacheDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, file);
    return data;
  }
}
