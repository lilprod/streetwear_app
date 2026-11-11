import * as SecureStore from 'expo-secure-store';

export type Tokens = { accessToken: string; refreshToken: string };

export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

const ACCESS_KEY = 'sw.accessToken';
const REFRESH_KEY = 'sw.refreshToken';

export function createMemoryTokenStore(initial: Tokens | null = null): TokenStore {
  let current = initial;
  return {
    get: async () => current,
    set: async (t) => {
      current = t;
    },
    clear: async () => {
      current = null;
    },
  };
}

/** Jetons dans expo-secure-store (Keystore Android, Keychain iOS), avec cache mémoire. */
export function createSecureTokenStore(): TokenStore {
  let cache: Tokens | null | undefined;
  return {
    async get() {
      if (cache !== undefined) return cache;
      try {
        const [accessToken, refreshToken] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_KEY),
          SecureStore.getItemAsync(REFRESH_KEY),
        ]);
        cache = accessToken && refreshToken ? { accessToken, refreshToken } : null;
      } catch {
        cache = null;
      }
      return cache;
    },
    async set(tokens) {
      cache = tokens;
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
        SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
      ]);
    },
    async clear() {
      cache = null;
      await Promise.all([
        SecureStore.deleteItemAsync(ACCESS_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
      ]).catch(() => undefined);
    },
  };
}

let instance: TokenStore | null = null;
export function getTokenStore(): TokenStore {
  if (!instance) instance = createSecureTokenStore();
  return instance;
}
export function setTokenStoreForTests(store: TokenStore | null): void {
  instance = store;
}
