export interface StorageProvider {
  /** Écrase l'objet s'il existe déjà (rendu relancé = même clé). */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** URL de téléchargement signée, valable `ttlSeconds`. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export const SIGNED_URL_TTL_SECONDS = 15 * 60;
