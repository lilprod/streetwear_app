import { createMemoryTokenStore } from '../auth/tokens';
import { apiMode, createApi, getApi, setApiForTests } from './index';
import { createHttpApi } from './http';
import { ApiError } from './types';

const json = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const errorBody = (code: string, message = 'Erreur', details?: unknown) => ({
  error: { code, message, details },
});

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  phone: '+22890123456',
  name: null,
  email: null,
  createdAt: '2026-11-01T10:00:00Z',
};

describe('http client: token refresh', () => {
  it('refreshes once on 401, stores the new tokens and retries the request', async () => {
    const tokens = createMemoryTokenStore({ accessToken: 'old', refreshToken: 'r1' });
    const calls: { url: string; auth?: string }[] = [];
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, auth: headers.Authorization });
      if (url.endsWith('/auth/refresh')) {
        return json(200, { accessToken: 'new', refreshToken: 'r2' });
      }
      return headers.Authorization === 'Bearer new'
        ? json(200, USER)
        : json(401, errorBody('UNAUTHENTICATED'));
    });
    const api = createHttpApi({
      baseUrl: 'http://api.test/v1',
      tokens,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(api.getMe()).resolves.toMatchObject({ id: USER.id });
    expect(await tokens.get()).toEqual({ accessToken: 'new', refreshToken: 'r2' });
    expect(calls.map((c) => c.url.replace('http://api.test/v1', ''))).toEqual([
      '/me',
      '/auth/refresh',
      '/me',
    ]);
    expect(calls[1]?.auth).toBeUndefined();
  });

  it('shares a single refresh between concurrent requests', async () => {
    const tokens = createMemoryTokenStore({ accessToken: 'old', refreshToken: 'r1' });
    let refreshes = 0;
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return json(200, { accessToken: 'new', refreshToken: 'r2' });
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new' ? json(200, USER) : json(401, errorBody('UNAUTHENTICATED'));
    });
    const api = createHttpApi({
      baseUrl: 'http://api.test/v1',
      tokens,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await Promise.all([api.getMe(), api.getMe(), api.getMe()]);
    expect(refreshes).toBe(1);
  });

  it('clears the session and notifies when the refresh token is rejected', async () => {
    const tokens = createMemoryTokenStore({ accessToken: 'old', refreshToken: 'dead' });
    const onSessionExpired = jest.fn();
    const fetchImpl = jest.fn(async () => json(401, errorBody('UNAUTHENTICATED')));
    const api = createHttpApi({
      baseUrl: 'http://api.test/v1',
      tokens,
      onSessionExpired,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(api.getMe()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(await tokens.get()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails because the network is down', async () => {
    const tokens = createMemoryTokenStore({ accessToken: 'old', refreshToken: 'r1' });
    const onSessionExpired = jest.fn();
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('Network request failed');
      return json(401, errorBody('UNAUTHENTICATED'));
    });
    const api = createHttpApi({
      baseUrl: 'http://api.test/v1',
      tokens,
      onSessionExpired,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(api.getMe()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(await tokens.get()).toEqual({ accessToken: 'old', refreshToken: 'r1' });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not try to refresh anonymous auth requests and exposes error details', async () => {
    const tokens = createMemoryTokenStore({ accessToken: 'old', refreshToken: 'r1' });
    const fetchImpl = jest.fn(async () =>
      json(429, errorBody('RATE_LIMITED', 'Trop de demandes', { retryAfterMinutes: 42 })),
    );
    const api = createHttpApi({
      baseUrl: 'http://api.test/v1',
      tokens,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const error = await api.requestOtp('+22890123456').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toEqual({ retryAfterMinutes: 42 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const headers = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('rejects responses that do not match the shared contract', async () => {
    const fetchImpl = jest.fn(async () => json(200, { id: 'x' }));
    const api = createHttpApi({
      baseUrl: 'http://api.test/v1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(api.getCart()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('mock / real API switch', () => {
  const original = process.env.EXPO_PUBLIC_API_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_API_MODE;
    else process.env.EXPO_PUBLIC_API_MODE = original;
    setApiForTests(null);
  });

  it('uses the fixtures in mock mode without any network call', async () => {
    process.env.EXPO_PUBLIC_API_MODE = 'mock';
    const spy = jest.spyOn(globalThis, 'fetch');
    expect(apiMode()).toBe('mock');
    const colors = await getApi().listColors();
    expect(colors.length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('switches to the HTTP client when the mode is not mock', async () => {
    delete process.env.EXPO_PUBLIC_API_MODE;
    expect(apiMode()).toBe('http');
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json(200, []) as unknown as Response);
    await createApi().listColors();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain('/catalog/colors');
    spy.mockRestore();
  });

  it('caches one client until it is reset', () => {
    process.env.EXPO_PUBLIC_API_MODE = 'mock';
    expect(getApi()).toBe(getApi());
  });
});
