import { api } from './api';

export type PaymentMethodSetting = 'tmoney' | 'flooz' | 'card' | 'cod';
export type ShopSettings = {
  cod_deposit_percent: number;
  order_expiry_minutes: number;
  payment_methods_enabled: PaymentMethodSetting[];
};
export type SettingsPatch = Partial<ShopSettings>;

export type NotificationChannel = 'push' | 'sms' | 'email';
export type NotificationTemplate = {
  key: string;
  channel: NotificationChannel;
  title: string | null;
  body: string;
  active: boolean;
  variables: string[];
  preview: { title: string | null; body: string };
  smsMaxLength: number | null;
  updatedAt: string;
};
export type TemplatePatch = {
  key: string;
  channel: NotificationChannel;
  title?: string | null;
  body?: string;
  active?: boolean;
};

export const getSettings = (signal?: AbortSignal) =>
  api<ShopSettings>('/admin/settings', { signal });
export const patchSettings = (body: SettingsPatch) =>
  api<ShopSettings>('/admin/settings', { method: 'PATCH', body });

export const listTemplates = (signal?: AbortSignal) =>
  api<{ items: NotificationTemplate[] }>('/admin/notification-templates', { signal });
export const patchTemplate = (body: TemplatePatch) =>
  api<NotificationTemplate>('/admin/notification-templates', { method: 'PATCH', body });
