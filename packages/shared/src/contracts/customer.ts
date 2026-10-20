import { z } from 'zod';
import { DesignSpecSchema } from '../design-spec/schema';
import { ORDER_STATUSES } from '../order-state-machine';
import {
  OrderPaymentMethodSchema,
  OrderStatusSchema,
  PaymentMethodSchema,
  SizeSchema,
  e164Phone,
  isoDate,
  pageSchema,
  uuid,
  xof,
} from './common';

const phoneOut = z.string().regex(/^\+228\d{8}$/);

// Auth et compte
export const UserSchema = z.object({
  id: uuid,
  phone: phoneOut,
  name: z.string().nullable(),
  email: z.string().email().nullable(),
  createdAt: isoDate,
});
export type User = z.infer<typeof UserSchema>;

export const OtpRequestInputSchema = z.object({ phone: e164Phone }).strict();
export const OtpVerifyInputSchema = z
  .object({
    phone: e164Phone,
    code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres.'),
  })
  .strict();
export const OAuthInputSchema = z.object({ idToken: z.string().min(1) }).strict();
export const RefreshInputSchema = z.object({ refreshToken: z.string().min(1) }).strict();
export const TokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });
export const AuthResultSchema = TokensSchema.extend({ user: UserSchema, isNewUser: z.boolean() });
export const UpdateMeInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().max(254).optional(),
  })
  .strict();
export const PushTokenInputSchema = z
  .object({ token: z.string().min(1).max(512), platform: z.enum(['android', 'ios']) })
  .strict();
export type OtpRequestInput = z.infer<typeof OtpRequestInputSchema>;
export type OtpVerifyInput = z.infer<typeof OtpVerifyInputSchema>;
export type OAuthInput = z.infer<typeof OAuthInputSchema>;
export type RefreshInput = z.infer<typeof RefreshInputSchema>;
export type AuthResult = z.infer<typeof AuthResultSchema>;
export type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;
export type PushTokenInput = z.infer<typeof PushTokenInputSchema>;

// Livraison et retrait
export const DeliveryZoneSummarySchema = z.object({
  id: uuid,
  name: z.string(),
  feeXof: xof,
  delayHours: z.number().int().nonnegative(),
});
export type DeliveryZoneSummary = z.infer<typeof DeliveryZoneSummarySchema>;

export const ResolveZoneQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const StoreSchema = z.object({
  id: uuid,
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  openingHours: z.record(z.string()),
});
export type Store = z.infer<typeof StoreSchema>;
export const PickupSlotSchema = z.object({
  id: uuid,
  startsAt: isoDate,
  endsAt: isoDate,
  remaining: z.number().int().nonnegative(),
});
export type PickupSlot = z.infer<typeof PickupSlotSchema>;
export const SlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.'),
});

export const AddressInputSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    district: z.string().trim().min(1).max(100),
    landmark: z.string().trim().min(1).max(200),
    recipientPhone: e164Phone,
  })
  .strict();
export const AddressUpdateInputSchema = AddressInputSchema.partial();
export const AddressSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  district: z.string(),
  landmark: z.string(),
  recipientPhone: phoneOut,
  id: uuid,
  zone: DeliveryZoneSummarySchema.nullable(),
});
export type AddressInput = z.infer<typeof AddressInputSchema>;
export type Address = z.infer<typeof AddressSchema>;

// Catalogue
export const PatternCategorySchema = z.object({
  id: uuid,
  slug: z.string(),
  name: z.string(),
  position: z.number().int(),
});
export const PatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  origin: z.string(),
  categoryId: z.string(),
  tags: z.array(z.string()),
  priceTier: z.enum(['standard', 'premium']),
  thumbnailUrl: z.string().url(),
  previewUrl: z.string().url(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});
export const TshirtColorSchema = z.object({
  id: z.string(),
  name: z.string(),
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  isDark: z.boolean(),
});
export const FontSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.string(),
  fileUrl: z.string().url(),
});
export { PriceRulesSchema } from '../pricing';
export const AvailabilitySchema = z.object({
  sizes: z.array(z.object({ size: SizeSchema, available: z.boolean() })),
});
export const PatternsQuerySchema = z.object({
  category: z.string().optional(),
  q: z.string().max(100).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const AvailabilityQuerySchema = z.object({ colorId: z.string().min(1) });
export type PatternCategory = z.infer<typeof PatternCategorySchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type TshirtColor = z.infer<typeof TshirtColorSchema>;
export type Font = z.infer<typeof FontSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;

// Designs
const PNG_BASE64_MAX_CHARS = Math.ceil((500 * 1024 * 4) / 3) + 4;
const base64Png = z
  .string()
  .max(PNG_BASE64_MAX_CHARS, 'Image trop volumineuse (500 Ko max).')
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Image base64 invalide.');
export const DesignSchema = z.object({
  id: uuid,
  name: z.string().nullable(),
  spec: DesignSpecSchema,
  isDraft: z.boolean(),
  previewFrontUrl: z.string().url().nullable(),
  previewBackUrl: z.string().url().nullable(),
  unitPriceXof: xof,
  updatedAt: isoDate,
});
export type Design = z.infer<typeof DesignSchema>;
export const CreateDesignInputSchema = z
  .object({ spec: DesignSpecSchema, name: z.string().trim().min(1).max(100).optional() })
  .strict();
export const UpdateDesignInputSchema = z
  .object({
    spec: DesignSpecSchema.optional(),
    name: z.string().trim().min(1).max(100).optional(),
    isDraft: z.boolean().optional(),
  })
  .strict();
export const DesignPreviewsInputSchema = z
  .object({ front: base64Png.optional(), back: base64Png.optional() })
  .strict()
  .refine((v) => v.front !== undefined || v.back !== undefined, {
    message: 'Au moins un aperçu (avant ou arrière) est requis.',
  });
export const DesignsQuerySchema = z.object({
  drafts: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CreateDesignInput = z.infer<typeof CreateDesignInputSchema>;
export type UpdateDesignInput = z.infer<typeof UpdateDesignInputSchema>;
export type DesignPreviewsInput = z.infer<typeof DesignPreviewsInputSchema>;

// Panier
export const CartItemSchema = z.object({
  id: uuid,
  design: DesignSchema,
  size: SizeSchema,
  quantity: z.number().int().min(1).max(50),
  unitPriceXof: xof,
  lineTotalXof: xof,
  available: z.boolean(),
});
export const CartSchema = z.object({
  items: z.array(CartItemSchema),
  subtotalXof: xof,
  itemCount: z.number().int().nonnegative(),
});
export type CartItem = z.infer<typeof CartItemSchema>;
export type Cart = z.infer<typeof CartSchema>;
const quantity = z.number().int().min(1).max(50);
export const AddCartItemInputSchema = z
  .object({ designId: uuid, size: SizeSchema, quantity })
  .strict();
export const UpdateCartItemInputSchema = z
  .object({ size: SizeSchema.optional(), quantity: quantity.optional() })
  .strict();
export const ReceptionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('home'), addressId: uuid }).strict(),
  z.object({ type: z.literal('pickup'), storeId: uuid, slotId: uuid }).strict(),
]);
export const QuoteInputSchema = z.object({ reception: ReceptionInputSchema }).strict();
export const QuoteSchema = z.object({
  subtotalXof: xof,
  deliveryFeeXof: xof,
  totalXof: xof,
  vatIncludedXof: xof,
  estimatedReadyAt: isoDate,
  estimatedDeliveryAt: isoDate.nullable(),
});
export type AddCartItemInput = z.infer<typeof AddCartItemInputSchema>;
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemInputSchema>;
export type ReceptionInput = z.infer<typeof ReceptionInputSchema>;
export type QuoteInput = z.infer<typeof QuoteInputSchema>;
export type Quote = z.infer<typeof QuoteSchema>;

// Commandes
export const IdempotencyKeySchema = z.string().uuid('Idempotency-Key doit être un UUID.');
export const OrderItemSchema = z.object({
  id: uuid,
  design: DesignSchema.pick({ spec: true, previewFrontUrl: true, previewBackUrl: true }),
  colorId: z.string(),
  size: SizeSchema,
  quantity: z.number().int().min(1).max(50),
  unitPriceXof: xof,
  lineTotalXof: xof,
});
export const OrderReceptionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('home'), address: AddressSchema }),
  z.object({ type: z.literal('pickup'), store: StoreSchema, slot: PickupSlotSchema }),
]);
export const OrderHistoryEntrySchema = z.object({ status: OrderStatusSchema, at: isoDate });
export const OrderSchema = z.object({
  id: uuid,
  number: z.string().regex(/^TG-\d{6,}$/),
  status: OrderStatusSchema,
  items: z.array(OrderItemSchema),
  subtotalXof: xof,
  deliveryFeeXof: xof,
  totalXof: xof,
  depositXof: xof.nullable(),
  paymentMethod: z.string(),
  reception: OrderReceptionSchema,
  history: z.array(OrderHistoryEntrySchema),
  expiresAt: isoDate.nullable(),
  createdAt: isoDate,
});
/** `OrderSummary` n'est pas détaillé dans le contrat : sous-ensemble proposé. */
export const OrderSummarySchema = OrderSchema.pick({
  id: true,
  number: true,
  status: true,
  totalXof: true,
  paymentMethod: true,
  createdAt: true,
}).extend({ itemCount: z.number().int().nonnegative() });
export const OrdersPageSchema = pageSchema(OrderSummarySchema);
export const CreateOrderInputSchema = z
  .object({ reception: ReceptionInputSchema, paymentMethod: OrderPaymentMethodSchema })
  .strict();
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderSummary = z.infer<typeof OrderSummarySchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

// Paiements
export const PaymentKindSchema = z.enum(['full', 'deposit', 'balance']);
export const PaymentStatusSchema = z.enum([
  'pending',
  'succeeded',
  'failed',
  'expired',
  'refunded',
]);
export const NextActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve_on_phone'), message: z.string() }),
  z.object({ type: z.literal('redirect'), url: z.string().url() }),
]);
export const CreatePaymentInputSchema = z
  .object({ method: PaymentMethodSchema, payerPhone: e164Phone.optional() })
  .strict()
  .refine((v) => v.method === 'card' || v.payerPhone !== undefined, {
    path: ['payerPhone'],
    message: 'Le numéro payeur est obligatoire pour T-Money et Flooz.',
  });
export const PaymentSchema = z.object({
  paymentId: uuid,
  status: z.literal('pending'),
  amountXof: xof,
  kind: PaymentKindSchema,
  nextAction: NextActionSchema,
});
export const PaymentStatusResponseSchema = z.object({
  paymentId: uuid,
  status: PaymentStatusSchema,
  orderStatus: OrderStatusSchema,
});
export type NextAction = z.infer<typeof NextActionSchema>;
export type CreatePaymentInput = z.infer<typeof CreatePaymentInputSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type PaymentStatusResponse = z.infer<typeof PaymentStatusResponseSchema>;

export { ORDER_STATUSES };
