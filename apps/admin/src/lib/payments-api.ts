import type { AdminPayment, Page, Reconciliation } from '@streetwear/shared';
import { api } from './api';

export type PaymentsFilters = { status?: AdminPayment['status']; from?: string; to?: string };

export const listPayments = (f: PaymentsFilters, cursor?: string, signal?: AbortSignal) =>
  api<Page<AdminPayment>>('/admin/payments', { query: { ...f, cursor, limit: 20 }, signal });

export const listReconciliations = (cursor?: string, signal?: AbortSignal) =>
  api<Page<Reconciliation>>('/admin/reconciliations', { query: { cursor, limit: 20 }, signal });
