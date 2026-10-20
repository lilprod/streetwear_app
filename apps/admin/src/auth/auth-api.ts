import type {
  AdminLoginInput,
  AdminLoginResult,
  AdminSession,
  AdminTotpInput,
} from '@streetwear/shared';
import { api } from '../lib/api';

export type TotpEnrollment = NonNullable<
  Extract<AdminLoginResult, { type: 'totp_required' }>['enrollment']
>;
export type LoginResponse = AdminLoginResult;
export type { AdminSession };

export const adminLogin = (input: AdminLoginInput) =>
  api<LoginResponse>('/admin/auth/login', { method: 'POST', body: input, auth: false });

export const adminTotp = (input: AdminTotpInput) =>
  api<AdminSession>('/admin/auth/totp', { method: 'POST', body: input, auth: false });

export const adminRefresh = (refreshToken: string) =>
  api<AdminSession>('/admin/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });

export const adminLogout = (refreshToken: string) =>
  api<undefined>('/admin/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
