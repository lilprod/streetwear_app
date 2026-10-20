import { z } from 'zod';
import { ADMIN_ROLES } from '../order-state-machine';
import {
  OrderPaymentMethodSchema,
  OrderStatusSchema,
  SizeSchema,
  isoDate,
  uuid,
  xof,
} from './common';
import { AddressSchema } from './customer';

export const AdminRoleSchema = z.enum(ADMIN_ROLES);

export const AdminLoginInputSchema = z
  .object({ email: z.string().email(), password: z.string().min(1).max(200) })
  .strict();
export const AdminTotpInputSchema = z
  .object({ challenge: z.string().min(1), code: z.string().regex(/^\d{6}$/) })
  .strict();
export type AdminLoginInput = z.infer<typeof AdminLoginInputSchema>;
export type AdminTotpInput = z.infer<typeof AdminTotpInputSchema>;

export const AdminOrdersQuerySchema = z.object({
  status: OrderStatusSchema.optional(),
  receptionType: z.enum(['home', 'pickup']).optional(),
  paymentMethod: OrderPaymentMethodSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().max(100).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const TransitionInputSchema = z
  .object({ to: OrderStatusSchema, note: z.string().max(500).optional() })
  .strict();
export const AssignOperatorInputSchema = z.object({ operatorId: uuid }).strict();
export const AssignCourierInputSchema = z.object({ courierId: uuid }).strict();
export const StockMovementInputSchema = z
  .object({
    colorId: z.string().min(1),
    size: SizeSchema,
    type: z.enum(['in', 'adjust']),
    quantity: z
      .number()
      .int()
      .refine((n) => n !== 0, 'La quantité ne peut pas être nulle.'),
    note: z.string().min(1).max(500),
  })
  .strict()
  .refine((v) => v.type === 'adjust' || v.quantity > 0, {
    path: ['quantity'],
    message: 'Une entrée de stock doit avoir une quantité positive.',
  });
export const StockThresholdInputSchema = z
  .object({ alertThreshold: z.number().int().nonnegative() })
  .strict();
export const UploadSignatureInputSchema = z.object({ kind: z.enum(['pattern', 'font']) }).strict();
export const PrintFilesSchema = z.object({
  front: z.string().url().optional(),
  back: z.string().url().optional(),
});
export const StatsSummarySchema = z.object({
  ordersCount: z.number().int().nonnegative(),
  revenueXof: xof,
  averageOrderXof: xof,
  byStatus: z.record(z.number().int().nonnegative()),
  byReception: z.record(z.number().int().nonnegative()),
  topPatterns: z.array(z.object({ id: z.string(), name: z.string(), count: z.number().int() })),
  topColors: z.array(z.object({ id: z.string(), name: z.string(), count: z.number().int() })),
});
export const StatsQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });
export type TransitionInput = z.infer<typeof TransitionInputSchema>;
export type StockMovementInput = z.infer<typeof StockMovementInputSchema>;
export type StatsSummary = z.infer<typeof StatsSummarySchema>;

// Livreur
export const CourierDeliverySchema = z.object({
  id: uuid,
  orderNumber: z.string(),
  customerName: z.string(),
  customerPhone: z.string().regex(/^\+228\d{8}$/),
  address: AddressSchema,
  codBalanceXof: xof.nullable(),
  status: z.string(),
  itemsCount: z.number().int().nonnegative(),
});
export type CourierDelivery = z.infer<typeof CourierDeliverySchema>;
export const CourierCompleteInputSchema = z
  .object({ handoverCode: z.string().regex(/^\d{6}$/), codCollectedXof: xof.optional() })
  .strict();
export const CourierFailInputSchema = z
  .object({
    reason: z.enum(['absent', 'refused', 'unreachable', 'other']),
    note: z.string().max(500).optional(),
  })
  .strict()
  .refine((v) => v.reason !== 'other' || !!v.note?.trim(), {
    path: ['note'],
    message: 'Une note est obligatoire quand le motif est « autre ».',
  });
export const CourierDeliveriesQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type CourierCompleteInput = z.infer<typeof CourierCompleteInputSchema>;
export type CourierFailInput = z.infer<typeof CourierFailInputSchema>;
