import { normalizeTgPhone, type AuthResult, type User } from '@streetwear/shared';
import { ApiError, type ApiClient, type OAuthProvider } from '../../api/types';
import { startSession, updateSessionUser } from '../../auth/session';
import { t } from '../../i18n/fr';

/** `901234567890` -> `90 12 34 56` : chiffres seuls, 8 maximum, indicatif collé ignoré. */
export function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00228')) digits = digits.slice(5);
  else if (digits.startsWith('228') && digits.length > 8) digits = digits.slice(3);
  return digits
    .slice(0, 8)
    .replace(/(\d{2})(?=\d)/g, '$1 ')
    .trim();
}

export const toE164 = (input: string): string | null => normalizeTgPhone(`+228${input}`);

export type LoginFailure = { message: string; needsNewCode: boolean };

export function describeLoginError(e: unknown): LoginFailure {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'OTP_INVALID':
        return { message: t('login.code.invalid'), needsNewCode: false };
      case 'OTP_ATTEMPTS_EXCEEDED':
        return { message: t('login.code.exceeded'), needsNewCode: true };
      case 'RATE_LIMITED': {
        const minutes = (e.details as { retryAfterMinutes?: unknown } | undefined)
          ?.retryAfterMinutes;
        return {
          message:
            typeof minutes === 'number' ? t('login.rate', { n: minutes }) : t('login.rate.unknown'),
          needsNewCode: false,
        };
      }
      case 'VALIDATION_FAILED':
        return { message: t('login.phone.invalid'), needsNewCode: false };
      case 'NETWORK':
      case 'TIMEOUT':
        return { message: t('login.error.network'), needsNewCode: false };
      default:
        return { message: t('login.error.generic'), needsNewCode: false };
    }
  }
  return { message: t('login.error.generic'), needsNewCode: false };
}

export async function requestCode(api: ApiClient, phoneInput: string): Promise<void> {
  const phone = toE164(phoneInput);
  if (!phone) throw new ApiError('VALIDATION_FAILED', t('login.phone.invalid'), 400);
  await api.requestOtp(phone);
}

export async function verifyCode(
  api: ApiClient,
  phoneInput: string,
  code: string,
): Promise<AuthResult> {
  const phone = toE164(phoneInput);
  if (!phone || !/^\d{6}$/.test(code)) {
    throw new ApiError('VALIDATION_FAILED', t('login.code.format'), 400);
  }
  const result = await api.verifyOtp(phone, code);
  await startSession(result);
  return result;
}

export async function signInWithProvider(
  api: ApiClient,
  provider: OAuthProvider,
  idToken: string,
): Promise<AuthResult> {
  const result = await api.oauthSignIn(provider, idToken);
  await startSession(result);
  return result;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProfileCheck = { name?: string; email?: string; error?: 'name' | 'email' };

export function checkProfile(name: string, email: string): ProfileCheck {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'name' };
  const mail = email.trim();
  if (mail && !EMAIL.test(mail)) return { error: 'email' };
  return { name: trimmed, ...(mail ? { email: mail } : {}) };
}

export async function saveProfile(api: ApiClient, name: string, email?: string): Promise<User> {
  const user = await api.updateMe({ name, ...(email ? { email } : {}) });
  updateSessionUser(user);
  return user;
}
