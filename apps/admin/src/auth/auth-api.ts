import type { AdminLoginInput, AdminRole, AdminTotpInput } from '@streetwear/shared';
import { api } from '../lib/api';

export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: { id: string; email: string; name: string; role: AdminRole };
};
export type TotpEnrollment = { secret: string; otpauthUrl: string };
export type LoginResponse =
  | { type: 'session'; session: AdminSession }
  | { type: 'totp_required'; challenge: string; enrollment: TotpEnrollment | null };

export const adminLogin = (input: AdminLoginInput) =>
  api<LoginResponse>('/admin/auth/login', { method: 'POST', body: input, auth: false });

export const adminTotp = (input: AdminTotpInput) =>
  api<AdminSession>('/admin/auth/totp', { method: 'POST', body: input, auth: false });

export const adminRefresh = (refreshToken: string) =>
  api<AdminSession>('/admin/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });

export const adminLogout = (refreshToken: string) =>
  api<undefined>('/admin/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
