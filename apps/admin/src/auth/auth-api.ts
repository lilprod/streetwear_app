import type { AdminLoginInput, AdminTotpInput } from '@streetwear/shared';
import { api } from '../lib/api';

export type AuthTokens = { accessToken: string; refreshToken?: string };
export type TotpEnrollment = { secret: string; otpauthUrl: string };
export type LoginResponse = { challenge: string; enrollment?: TotpEnrollment } | AuthTokens;

export const isChallenge = (
  r: LoginResponse,
): r is { challenge: string; enrollment?: TotpEnrollment } => 'challenge' in r;

export const adminLogin = (input: AdminLoginInput) =>
  api<LoginResponse>('/admin/auth/login', { method: 'POST', body: input, auth: false });

export const adminTotp = (input: AdminTotpInput) =>
  api<AuthTokens>('/admin/auth/totp', { method: 'POST', body: input, auth: false });
