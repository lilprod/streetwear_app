import type { AdminRole, Page } from '@streetwear/shared';
import { api } from './api';

export type AdminAccount = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  active: boolean;
  totpEnabled: boolean;
  createdAt: string;
};
export type CreateAccountInput = {
  email: string;
  name?: string;
  password: string;
  role: AdminRole;
  phone?: string;
};
export type AccountPatch = {
  name?: string | null;
  role?: AdminRole;
  active?: boolean;
  password?: string;
  resetTotp?: true;
  phone?: string;
};
export type AuditEntry = {
  id: string;
  adminUserId: string | null;
  adminEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};
export type AuditFilters = { entity?: string; entityId?: string };

export const listAccounts = (cursor?: string, signal?: AbortSignal) =>
  api<Page<AdminAccount>>('/admin/users', { query: { cursor, limit: 20 }, signal });
export const createAccount = (body: CreateAccountInput) =>
  api<AdminAccount>('/admin/users', { method: 'POST', body });
export const updateAccount = (id: string, body: AccountPatch) =>
  api<AdminAccount>(`/admin/users/${id}`, { method: 'PATCH', body });
export const listAuditLogs = (f: AuditFilters, cursor?: string, signal?: AbortSignal) =>
  api<Page<AuditEntry>>('/admin/audit-logs', { query: { ...f, cursor, limit: 20 }, signal });
