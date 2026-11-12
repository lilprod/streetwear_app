import { z } from 'zod';
import { AdminRoleSchema } from './admin';
import { OrderStatusSchema, isoDate, uuid, xof } from './common';

// Livraisons et livreurs (SP06)
export const DELIVERY_STATUSES = [
  'to_assign',
  'assigned',
  'in_progress',
  'delivered',
  'failed',
] as const;
export const DeliveryStatusSchema = z.enum(DELIVERY_STATUSES);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const AdminCourierSchema = z.object({ id: uuid, name: z.string(), phone: z.string() });
export type AdminCourier = z.infer<typeof AdminCourierSchema>;

export const AdminDeliverySchema = z.object({
  id: uuid,
  orderId: uuid,
  orderNumber: z.string(),
  status: z.string(),
  customerName: z.string().nullable(),
  recipientPhone: z.string(),
  addressLabel: z.string(),
  landmark: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  zone: z.object({ id: uuid, name: z.string() }).nullable(),
  courier: AdminCourierSchema.nullable(),
  codBalanceXof: xof,
  scheduledFor: isoDate.nullable(),
  updatedAt: isoDate,
});
export type AdminDelivery = z.infer<typeof AdminDeliverySchema>;
export const AdminDeliveriesSchema = z.object({ items: z.array(AdminDeliverySchema) });

export const GeoPolygonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(z.number()))) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(z.array(z.array(z.number())))),
  }),
]);
export type GeoPolygon = z.infer<typeof GeoPolygonSchema>;

export const AdminZoneSchema = z.object({
  id: uuid,
  name: z.string(),
  polygon: GeoPolygonSchema,
  feeXof: xof,
  delayHours: z.number().int().nonnegative(),
  active: z.boolean(),
});
export type AdminZone = z.infer<typeof AdminZoneSchema>;

export const AdminStoreSchema = z.object({
  id: uuid,
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  openingHours: z.record(z.string()),
  defaultSlotCapacity: z.number().int().positive(),
  active: z.boolean(),
});
export type AdminStore = z.infer<typeof AdminStoreSchema>;

export const AdminSlotSchema = z.object({
  id: uuid,
  startsAt: isoDate,
  endsAt: isoDate,
  capacity: z.number().int().nonnegative(),
  booked: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});
export type AdminSlot = z.infer<typeof AdminSlotSchema>;

// Statistiques (tableau de bord)
export const StatsSummarySchema = z.object({
  from: isoDate,
  to: isoDate,
  ordersCount: z.number().int().nonnegative(),
  revenueXof: xof,
  averageOrderXof: xof,
  byStatus: z.record(OrderStatusSchema, z.number().int().nonnegative()),
  byReception: z.object({
    home: z.number().int().nonnegative(),
    pickup: z.number().int().nonnegative(),
  }),
  topPatterns: z
    .array(z.object({ id: z.string(), name: z.string(), count: z.number().int() }))
    .max(10),
  topColors: z.array(
    z.object({ id: z.string(), name: z.string(), hex: z.string(), count: z.number().int() }),
  ),
});
export type StatsSummary = z.infer<typeof StatsSummarySchema>;

// Catalogue (SP03)
export const PRICE_TIERS = ['standard', 'premium'] as const;
export const PriceTierSchema = z.enum(PRICE_TIERS);

export const CatalogPatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  origin: z.string(),
  categoryId: z.string(),
  tags: z.array(z.string()),
  priceTier: PriceTierSchema,
  thumbnailUrl: z.string(),
  previewUrl: z.string(),
  widthPx: z.number().int(),
  heightPx: z.number().int(),
  imagePublicId: z.string(),
  rightsHolder: z.string().nullable(),
  rightsProofUrl: z.string().nullable(),
  active: z.boolean(),
});
export type CatalogPattern = z.infer<typeof CatalogPatternSchema>;

export const AdminTshirtColorSchema = z.object({
  id: z.string(),
  name: z.string(),
  hex: z.string(),
  isDark: z.boolean(),
  active: z.boolean(),
  position: z.number().int(),
});
export type AdminTshirtColor = z.infer<typeof AdminTshirtColorSchema>;

export const CatalogFontSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string(),
  filePublicId: z.string(),
  fileUrl: z.string(),
  licenseRef: z.string().nullable(),
  active: z.boolean(),
});
export type CatalogFont = z.infer<typeof CatalogFontSchema>;

export const BannedWordSchema = z.object({ id: z.string(), word: z.string() });
export type BannedWord = z.infer<typeof BannedWordSchema>;

export const UploadSignatureSchema = z.object({
  uploadUrl: z.string(),
  apiKey: z.string(),
  timestamp: z.number().int(),
  folder: z.string(),
  publicId: z.string(),
  signature: z.string(),
  resourceType: z.enum(['image', 'raw']),
  allowedFormats: z.array(z.string()),
  maxBytes: z.number().int().positive(),
});
export type UploadSignature = z.infer<typeof UploadSignatureSchema>;

export const PATTERN_FORMATS = ['png', 'jpg', 'svg'] as const;
export const FONT_FORMATS = ['ttf', 'otf', 'woff2'] as const;
export type PatternFormat = (typeof PATTERN_FORMATS)[number];
export type FontFormat = (typeof FONT_FORMATS)[number];

// Comptes et audit (SP02)
export const AdminAccountSchema = z.object({
  id: uuid,
  email: z.string(),
  name: z.string().nullable(),
  role: AdminRoleSchema,
  active: z.boolean(),
  totpEnabled: z.boolean(),
  createdAt: isoDate,
});
export type AdminAccount = z.infer<typeof AdminAccountSchema>;

export const AuditEntrySchema = z.object({
  id: z.string(),
  adminUserId: z.string().nullable(),
  adminEmail: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
  createdAt: isoDate,
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// Réglages et modèles de notifications
export const PaymentMethodSettingSchema = z.enum(['tmoney', 'flooz', 'card', 'cod']);
export type PaymentMethodSetting = z.infer<typeof PaymentMethodSettingSchema>;
export const ShopSettingsSchema = z.object({
  cod_deposit_percent: z.number(),
  order_expiry_minutes: z.number(),
  payment_methods_enabled: z.array(PaymentMethodSettingSchema),
});
export type ShopSettings = z.infer<typeof ShopSettingsSchema>;

export const NotificationChannelSchema = z.enum(['push', 'sms', 'email']);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;
export const NotificationTemplateSchema = z.object({
  key: z.string(),
  channel: NotificationChannelSchema,
  title: z.string().nullable(),
  body: z.string(),
  active: z.boolean(),
  variables: z.array(z.string()),
  preview: z.object({ title: z.string().nullable(), body: z.string() }),
  smsMaxLength: z.number().int().nullable(),
  updatedAt: isoDate,
});
export type NotificationTemplate = z.infer<typeof NotificationTemplateSchema>;
