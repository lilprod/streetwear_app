import type {
  Address,
  AdminStockItem,
  CourierCompleteInput,
  CourierDelivery,
  CourierFailInput,
  StockMovementInput,
} from '@streetwear/shared';
import { api } from './api';

export type { AdminStockItem, CourierDelivery } from '@streetwear/shared';

// Types absents de packages/shared : alignés sur apps/api/src/modules/delivery/delivery-admin.service.ts.
export type GeoPolygon =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

export type DeliveryStatus = 'to_assign' | 'assigned' | 'in_progress' | 'delivered' | 'failed';
export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  'to_assign',
  'assigned',
  'in_progress',
  'delivered',
  'failed',
];

export type AdminDelivery = {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  zoneId: string;
  feeXof: number;
  courierId: string | null;
  address: Address;
  codBalanceXof: number | null;
  codCollectedXof: number | null;
  handoverAttempts: number;
  scheduledFor: string;
  failReason: string | null;
  failNote: string | null;
};

export type AdminZone = {
  id: string;
  name: string;
  polygon: GeoPolygon;
  feeXof: number;
  delayHours: number;
  active: boolean;
};
export type ZoneInput = Omit<AdminZone, 'id'>;

export type AdminStore = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  openingHours: Record<string, string>;
  defaultSlotCapacity: number;
  active: boolean;
};
export type StoreInput = Omit<AdminStore, 'id'>;

export type AdminSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  remaining: number;
};

/** Route proposée (absente du contrat) : GET /admin/couriers. */
export type AdminCourier = { id: string; name: string; phone: string };

export const listDeliveries = (q: { status?: DeliveryStatus; date?: string }) =>
  api<AdminDelivery[]>('/admin/deliveries', { query: q });
export const assignCourier = (id: string, courierId: string) =>
  api<AdminDelivery>(`/admin/deliveries/${id}/assign`, { method: 'POST', body: { courierId } });
export const listCouriers = () => api<{ items: AdminCourier[] }>('/admin/couriers');

export const listZones = () => api<AdminZone[]>('/admin/delivery-zones');
export const createZone = (body: ZoneInput) =>
  api<AdminZone>('/admin/delivery-zones', { method: 'POST', body });
export const updateZone = (id: string, body: Partial<ZoneInput>) =>
  api<AdminZone>(`/admin/delivery-zones/${id}`, { method: 'PATCH', body });

export const listStores = () => api<AdminStore[]>('/admin/stores');
export const createStore = (body: StoreInput) =>
  api<AdminStore>('/admin/stores', { method: 'POST', body });
export const updateStore = (id: string, body: Partial<StoreInput>) =>
  api<AdminStore>(`/admin/stores/${id}`, { method: 'PATCH', body });
export const listSlots = (storeId: string, date?: string) =>
  api<AdminSlot[]>(`/admin/stores/${storeId}/slots`, { query: { date } });
export const generateSlots = (storeId: string, body: { days?: number; capacity?: number }) =>
  api<{ created: number }>(`/admin/stores/${storeId}/slots`, { method: 'POST', body });
export const updateSlot = (storeId: string, slotId: string, capacity: number) =>
  api<AdminSlot>(`/admin/stores/${storeId}/slots/${slotId}`, {
    method: 'PATCH',
    body: { capacity },
  });

export const listStock = () => api<AdminStockItem[]>('/admin/stock');
export const moveStock = (body: StockMovementInput) =>
  api<AdminStockItem>('/admin/stock/movements', { method: 'POST', body });
export const setStockThreshold = (id: string, alertThreshold: number) =>
  api<AdminStockItem>(`/admin/stock/${id}`, { method: 'PATCH', body: { alertThreshold } });

export const listCourierDeliveries = (date?: string) =>
  api<CourierDelivery[]>('/courier/deliveries', { query: { date } });
export const startDelivery = (id: string) =>
  api<CourierDelivery>(`/courier/deliveries/${id}/start`, { method: 'POST' });
export const completeDelivery = (id: string, body: CourierCompleteInput) =>
  api<CourierDelivery>(`/courier/deliveries/${id}/complete`, { method: 'POST', body });
export const failDelivery = (id: string, body: CourierFailInput) =>
  api<CourierDelivery>(`/courier/deliveries/${id}/fail`, { method: 'POST', body });
