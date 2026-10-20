import { DEFAULT_PRINT_ZONES, PrintZonesSchema } from '@streetwear/shared';
import { z } from 'zod';

export const SETTING_SCHEMAS = {
  cod_deposit_percent: z.number().int().min(0).max(100),
  order_expiry_minutes: z.number().int().min(5).max(1440),
  payment_methods_enabled: z
    .array(z.enum(['tmoney', 'flooz', 'card', 'cod']))
    .min(1)
    .refine((v) => new Set(v).size === v.length, 'Moyens de paiement en double.'),
  print_zones: PrintZonesSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;

export interface SettingValues {
  cod_deposit_percent: number;
  order_expiry_minutes: number;
  payment_methods_enabled: ('tmoney' | 'flooz' | 'card' | 'cod')[];
  print_zones: z.infer<typeof PrintZonesSchema>;
}

export const SETTING_DEFAULTS: SettingValues = {
  cod_deposit_percent: 50,
  order_expiry_minutes: 30,
  payment_methods_enabled: ['tmoney', 'flooz', 'card', 'cod'],
  print_zones: DEFAULT_PRINT_ZONES,
};

export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

export const UpdateSettingsInputSchema = z
  .object(SETTING_SCHEMAS)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Aucun réglage à modifier.');
