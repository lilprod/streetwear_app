import type {
  AdminOperator,
  AdminOrder,
  AdminOrderSummary,
  OrderCounts,
  OrderStatus,
  Page,
  ProductionQueueItem,
  ReceptionType,
} from '@streetwear/shared';
import { api } from './api';

export type {
  AdminOperator,
  AdminOrder,
  AdminOrderSummary,
  OrderCounts,
  ProductionJobStatus,
  ProductionQueueItem,
} from '@streetwear/shared';

export type OrdersFilters = {
  status?: OrderStatus;
  receptionType?: ReceptionType;
  paymentMethod?: string;
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
};
export type OrderCountsFilters = Omit<OrdersFilters, 'status' | 'cursor'>;
export type ProductionQueueStatus = 'to_assign' | 'in_production';

export const listOrders = (f: OrdersFilters, signal?: AbortSignal, limit = 20) =>
  api<Page<AdminOrderSummary>>('/admin/orders', { query: { ...f, limit }, signal });
export const getOrderCounts = (f: OrderCountsFilters, signal?: AbortSignal) =>
  api<OrderCounts>('/admin/orders/counts', { query: { ...f }, signal });
export const getOrder = (id: string) => api<AdminOrder>(`/admin/orders/${id}`);
export const transitionOrder = (
  id: string,
  body: { to: OrderStatus; note?: string; code?: string },
) => api<AdminOrder>(`/admin/orders/${id}/transitions`, { method: 'POST', body });
export const assignOperator = (id: string, operatorId: string) =>
  api<AdminOrder>(`/admin/orders/${id}/assign-operator`, { method: 'POST', body: { operatorId } });
export const listOperators = () => api<{ items: AdminOperator[] }>('/admin/operators');
export const getProductionQueue = (
  status: ProductionQueueStatus,
  cursor?: string,
  signal?: AbortSignal,
  limit = 20,
) =>
  api<Page<ProductionQueueItem>>('/admin/production/queue', {
    query: { status, cursor, limit },
    signal,
  });
export const getPrintFiles = (itemId: string) =>
  api<{ front?: string; back?: string }>(`/admin/order-items/${itemId}/print-files`);
export const regeneratePrintFiles = (itemId: string) =>
  api<{ status: 'queued' }>(`/admin/order-items/${itemId}/print-files/regenerate`, {
    method: 'POST',
  });
