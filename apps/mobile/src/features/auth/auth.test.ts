import { createMockApi, MOCK_OTP_CODE } from '../../api/mock';
import { ApiError, type ApiClient } from '../../api/types';
import { createMemoryTokenStore, setTokenStoreForTests, type TokenStore } from '../../auth/tokens';
import { bootstrapSession, endSession, expireSession, sessionStore } from '../../auth/session';
import { memoryStorage, resetMemoryStorage } from '../../../tests/mocks';
import {
  checkProfile,
  describeLoginError,
  formatPhoneInput,
  requestCode,
  saveProfile,
  signInWithProvider,
  toE164,
  verifyCode,
} from './flow';

let tokens: TokenStore;
let api: ApiClient;

beforeEach(() => {
  resetMemoryStorage();
  tokens = createMemoryTokenStore();
  setTokenStoreForTests(tokens);
  api = createMockApi({ latencyMs: 0, tokens });
  sessionStore.setState({ status: 'booting', user: null, expired: false });
});

describe('phone formatting', () => {
  it('groups digits by two and caps at 8 digits', () => {
    expect(formatPhoneInput('90123456')).toBe('90 12 34 56');
    expect(formatPhoneInput('9012')).toBe('90 12');
    expect(formatPhoneInput('901234567890')).toBe('90 12 34 56');
  });
  it('drops a pasted country code', () => {
    expect(formatPhoneInput('+228 90 12 34 56')).toBe('90 12 34 56');
    expect(formatPhoneInput('0022890123456')).toBe('90 12 34 56');
  });
  it('builds the E.164 number or refuses short numbers', () => {
    expect(toE164('90 12 34 56')).toBe('+22890123456');
    expect(toE164('90 12 34')).toBeNull();
  });
});

describe('OTP sign-in', () => {
  it('stores tokens and opens the session after a valid code', async () => {
    await requestCode(api, '90 12 34 56');
    const result = await verifyCode(api, '90 12 34 56', MOCK_OTP_CODE);
    expect(result.isNewUser).toBe(true);
    expect(result.user.phone).toBe('+22890123456');
    expect(await tokens.get()).toEqual({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    expect(sessionStore.getState()).toMatchObject({ status: 'authenticated' });
  });

  it('refuses an invalid number before calling the API', async () => {
    const spy = jest.spyOn(api, 'requestOtp');
    await expect(requestCode(api, '90 12')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports OTP_INVALID with a retryable message', async () => {
    await requestCode(api, '90 12 34 56');
    const error = await verifyCode(api, '90 12 34 56', '000000').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('OTP_INVALID');
    expect(describeLoginError(error)).toEqual({
      message: 'Code incorrect ou expiré.',
      needsNewCode: false,
    });
    expect(sessionStore.getState().status).toBe('booting');
  });

  it('locks after 5 wrong codes with OTP_ATTEMPTS_EXCEEDED and asks for a new code', async () => {
    await requestCode(api, '90 12 34 56');
    let last: unknown;
    for (let i = 0; i < 5; i += 1) {
      last = await verifyCode(api, '90 12 34 56', '000000').catch((e: unknown) => e);
    }
    expect((last as ApiError).code).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect(describeLoginError(last).needsNewCode).toBe(true);
    await expect(verifyCode(api, '90 12 34 56', MOCK_OTP_CODE)).rejects.toMatchObject({
      code: 'OTP_ATTEMPTS_EXCEEDED',
    });
    await requestCode(api, '90 12 34 56');
    await expect(verifyCode(api, '90 12 34 56', MOCK_OTP_CODE)).resolves.toBeTruthy();
  });

  it('shows the remaining wait when the SMS quota is reached', async () => {
    for (let i = 0; i < 3; i += 1) await requestCode(api, '90 12 34 56');
    const error = await requestCode(api, '90 12 34 56').catch((e: unknown) => e);
    expect((error as ApiError).code).toBe('RATE_LIMITED');
    expect(describeLoginError(error).message).toBe('Trop de demandes, réessaie dans 60 min.');
  });

  it('maps network failures and unknown errors to readable messages', () => {
    expect(describeLoginError(new ApiError('NETWORK', 'x')).message).toContain('Pas de connexion');
    expect(describeLoginError(new Error('boom')).message).toContain('Connexion impossible');
    expect(describeLoginError(new ApiError('RATE_LIMITED', 'x', 429)).message).toBe(
      'Trop de demandes, réessaie plus tard.',
    );
  });

  it('rejects codes that are not 6 digits', async () => {
    await expect(verifyCode(api, '90 12 34 56', '12345')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('social sign-in and profile', () => {
  it('opens a session from an Apple id token without a phone number', async () => {
    const result = await signInWithProvider(api, 'apple', 'apple-id-token');
    expect(result.user.phone).toBeNull();
    expect(sessionStore.getState().status).toBe('authenticated');
  });

  it('rejects a bad id token', async () => {
    await expect(signInWithProvider(api, 'google', 'invalid')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('validates name and e-mail then saves the profile', async () => {
    expect(checkProfile('  ', '')).toEqual({ error: 'name' });
    expect(checkProfile('Afi', 'pas-un-mail')).toEqual({ error: 'email' });
    expect(checkProfile(' Afi ', '')).toEqual({ name: 'Afi' });
    await requestCode(api, '90 12 34 56');
    await verifyCode(api, '90 12 34 56', MOCK_OTP_CODE);
    const user = await saveProfile(api, 'Afi', 'afi@example.com');
    expect(user).toMatchObject({ name: 'Afi', email: 'afi@example.com' });
    expect(sessionStore.getState().user?.name).toBe('Afi');
  });
});

describe('session lifecycle', () => {
  it('restores the session from secure storage at launch', async () => {
    await requestCode(api, '90 12 34 56');
    const result = await verifyCode(api, '90 12 34 56', MOCK_OTP_CODE);
    sessionStore.setState({ status: 'booting', user: null, expired: false });
    await bootstrapSession({ api, tokens, storage: memoryStorage() });
    expect(sessionStore.getState()).toMatchObject({ status: 'authenticated' });
    expect(sessionStore.getState().user?.id).toBe(result.user.id);
  });

  it('starts anonymous when no token is stored', async () => {
    await bootstrapSession({ api, tokens, storage: memoryStorage() });
    expect(sessionStore.getState().status).toBe('anonymous');
  });

  it('stays signed in when the profile cannot be fetched offline', async () => {
    await tokens.set({ accessToken: 'mock-access-1', refreshToken: 'mock-refresh-1' });
    const offlineApi = {
      ...api,
      getMe: () => Promise.reject(new ApiError('NETWORK', 'Pas de connexion.')),
    };
    await bootstrapSession({ api: offlineApi, tokens, storage: memoryStorage() });
    expect(sessionStore.getState().status).toBe('authenticated');
  });

  it('clears tokens and cached profile on sign-out', async () => {
    await requestCode(api, '90 12 34 56');
    await verifyCode(api, '90 12 34 56', MOCK_OTP_CODE);
    await endSession({ api, tokens, storage: memoryStorage() });
    expect(await tokens.get()).toBeNull();
    expect(sessionStore.getState()).toMatchObject({ status: 'anonymous', user: null });
    expect(memoryStorage().getString('session:user')).toBeUndefined();
  });

  it('flags an expired session so the account tab can invite to sign in again', () => {
    sessionStore.setState({ status: 'authenticated' });
    expireSession();
    expect(sessionStore.getState()).toMatchObject({ status: 'anonymous', expired: true });
  });
});

describe('mock API requires a session for protected routes', () => {
  it('returns UNAUTHENTICATED for the cart and designs when signed out', async () => {
    await expect(api.getCart()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(api.listDesigns()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(api.listColors()).resolves.toBeTruthy();
  });
});
