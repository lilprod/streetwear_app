import { getTokenStore } from '../auth/tokens';
import { createHttpApi } from './http';
import { createMockApi } from './mock';
import type { ApiClient } from './types';

export * from './types';

export type ApiMode = 'mock' | 'http';

export const apiMode = (): ApiMode =>
  process.env.EXPO_PUBLIC_API_MODE === 'mock' ? 'mock' : 'http';

export const apiBaseUrl = (): string =>
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

let instance: ApiClient | null = null;
let sessionExpiredHandler: (() => void) | null = null;

/** Appelé quand le rafraîchissement du jeton échoue définitivement (session perdue). */
export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function createApi(mode: ApiMode = apiMode()): ApiClient {
  return mode === 'mock'
    ? createMockApi({ tokens: getTokenStore() })
    : createHttpApi({
        baseUrl: apiBaseUrl(),
        tokens: getTokenStore(),
        onSessionExpired: () => sessionExpiredHandler?.(),
      });
}

export function getApi(): ApiClient {
  instance ??= createApi();
  return instance;
}

export function setApiForTests(api: ApiClient | null): void {
  instance = api;
}
