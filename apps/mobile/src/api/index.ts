import { createHttpApi } from './http';
import { createMockApi } from './mock';
import type { ApiClient } from './types';

export * from './types';

export type ApiMode = 'mock' | 'http';

export const apiMode = (): ApiMode =>
  process.env.EXPO_PUBLIC_API_MODE === 'mock' ? 'mock' : 'http';

let instance: ApiClient | null = null;

export function getApi(): ApiClient {
  if (!instance) {
    instance =
      apiMode() === 'mock'
        ? createMockApi()
        : createHttpApi({ baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/v1' });
  }
  return instance;
}

export function setApiForTests(api: ApiClient | null): void {
  instance = api;
}
