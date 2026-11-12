import type { NotificationChannel, NotificationTemplate, ShopSettings } from '@streetwear/shared';
import { api } from './api';

export type {
  NotificationChannel,
  NotificationTemplate,
  PaymentMethodSetting,
  ShopSettings,
} from '@streetwear/shared';
export type SettingsPatch = Partial<ShopSettings>;

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
