import type {
  Order,
  OrderStatus,
  OrderSummary,
  Page,
  ReceptionType,
  StatsSummary,
} from '@streetwear/shared';
import { api } from './api';

export type AdminCustomer = { id: string; name: string | null; phone: string | null };
export type AdminOrderSummary = OrderSummary & {
  receptionType: ReceptionType;
  customer: AdminCustomer;
};
export type StatusHistoryEntry = {
  from: OrderStatus | null;
  to: OrderStatus;
  actorType: string;
  actorId: string | null;
  note: string | null;
  at: string;
};
export type AdminOrder = Order & {
  receptionType: ReceptionType;
  vatIncludedXof: number;
  customer: AdminCustomer;
  statusHistory: StatusHistoryEntry[];
  allowedTransitions: OrderStatus[];
};

export type OrdersFilters = {
  status?: OrderStatus;
  receptionType?: ReceptionType;
  paymentMethod?: string;
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
};

export const listOrders = (f: OrdersFilters, signal?: AbortSignal, limit = 20) =>
  api<Page<AdminOrderSummary>>('/admin/orders', { query: { ...f, limit }, signal });
export const getOrder = (id: string) => api<AdminOrder>(`/admin/orders/${id}`);
export const transitionOrder = (
  id: string,
  body: { to: OrderStatus; note?: string; code?: string },
) => api<AdminOrder>(`/admin/orders/${id}/transitions`, { method: 'POST', body });
export const assignOperator = (id: string, operatorId: string) =>
  api<AdminOrder>(`/admin/orders/${id}/assign-operator`, { method: 'POST', body: { operatorId } });
export const getPrintFiles = (itemId: string) =>
  api<{ front?: string; back?: string }>(`/admin/order-items/${itemId}/print-files`);
export const regeneratePrintFiles = (itemId: string) =>
  api<{ status: 'queued' }>(`/admin/order-items/${itemId}/print-files/regenerate`, {
    method: 'POST',
  });
export const getStatusCounts = () => api<StatsSummary>('/admin/stats/summary');
