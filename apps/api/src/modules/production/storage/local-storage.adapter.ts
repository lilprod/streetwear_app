import { createHmac } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import type { StorageProvider } from './storage-provider';

/** Adaptateur disque local (dev et tests) : aucun appel réseau. */
export class LocalStorageAdapter implements StorageProvider {
  constructor(
    private readonly rootDir: string,
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  private path(key: string): string {
    const full = normalize(join(this.rootDir, key));
    if (!full.startsWith(normalize(this.rootDir) + sep))
      throw new Error('Clé de stockage invalide');
    return full;
  }

  async put(key: string, data: Buffer, _contentType?: string): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async exists(key: string): Promise<boolean> {
    return stat(this.path(key)).then(
      () => true,
      () => false,
    );
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    return Promise.resolve(
      `${this.baseUrl}/${key}?expires=${expires}&sig=${this.sign(key, expires)}`,
    );
  }

  sign(key: string, expires: number): string {
    return createHmac('sha256', this.secret).update(`${key}:${expires}`).digest('hex');
  }
}
