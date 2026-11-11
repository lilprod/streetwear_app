import { useEffect, type EffectCallback } from 'react';
import { createMemoryStorage } from '../src/storage/storage';

let memory = createMemoryStorage();
export const memoryStorage = () => memory;
export const resetMemoryStorage = () => {
  memory = createMemoryStorage();
};

export const routerMock = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => true),
};
export const routeParams: Record<string, string | undefined> = {};
export const resetRouter = () => {
  for (const fn of Object.values(routerMock)) fn.mockClear();
  routerMock.canGoBack.mockReturnValue(true);
  for (const k of Object.keys(routeParams)) routeParams[k] = undefined;
};
export const useFocusEffectMock = (cb: EffectCallback) => {
  useEffect(cb, [cb]);
};

export const network = { online: true };
export const useNetInfoMock = () => ({
  isConnected: network.online,
  isInternetReachable: network.online,
});
