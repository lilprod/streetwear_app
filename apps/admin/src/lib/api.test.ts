import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api, configureApi } from './api';
import { sessionFromApi, withRefreshedTokens } from '../auth/session';
import { DEMO_ACCOUNTS, demoSession } from '../mocks/handlers';

function demoFallback(): never {
  throw new Error('compte de démo absent');
}

const unauthorized = () =>
  HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Expirée.' } }, { status: 401 });

describe('api : refresh sur 401', () => {
  it('rafraîchit une fois puis rejoue la requête', async () => {
    let calls = 0;
    server.use(
      http.get('*/v1/ping', () => (++calls === 1 ? unauthorized() : HttpResponse.json({ ok: 1 }))),
    );
    const refresh = vi.fn().mockResolvedValue('new');
    configureApi({ getToken: () => 'old', refresh, onUnauthorized: vi.fn() });
    await expect(api('/ping')).resolves.toEqual({ ok: 1 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('déconnecte si le refresh échoue', async () => {
    server.use(http.get('*/v1/ping', unauthorized));
    const onUnauthorized = vi.fn();
    configureApi({
      getToken: () => 'old',
      refresh: () => Promise.resolve(null),
      onUnauthorized,
    });
    await expect(api('/ping')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

const admin = DEMO_ACCOUNTS.find((a) => a.role === 'super_admin') ?? demoFallback();

describe('session', () => {
  it('le refresh ne prolonge pas les 8 h', () => {
    const first = sessionFromApi(demoSession(admin), 1000);
    const next = withRefreshedTokens(first, demoSession(admin));
    expect(next.expiresAt).toBe(first.expiresAt);
    expect(first.name).toBe('admin');
  });
});
