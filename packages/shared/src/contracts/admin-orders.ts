import { z } from 'zod';
import { AdminOrdersQuerySchema } from './admin';
import { OrderStatusSchema, SizeSchema, isoDate, uuid, xof } from './common';
import { OrderSchema, OrderSummarySchema } from './customer';

export const PRODUCTION_JOB_STATUSES = [
  'queued',
  'rendering',
  'ready_to_print',
  'printed',
  'failed',
] as const;
export const ProductionJobStatusSchema = z.enum(PRODUCTION_JOB_STATUSES);
export type ProductionJobStatus = z.infer<typeof ProductionJobStatusSchema>;

const ReceptionTypeSchema = z.enum(['home', 'pickup']);
const AdminCustomerSchema = z.object({
  id: uuid,
  name: z.string().nullable(),
  phone: z.string().nullable(),
});

export const AdminOrderSummarySchema = OrderSummarySchema.extend({
  receptionType: ReceptionTypeSchema,
  customer: AdminCustomerSchema,
});
export type AdminOrderSummary = z.infer<typeof AdminOrderSummarySchema>;

export const AdminOrderSchema = OrderSchema.extend({
  receptionType: ReceptionTypeSchema,
  customer: AdminCustomerSchema,
  vatIncludedXof: xof,
  statusHistory: z.array(
    z.object({
      from: OrderStatusSchema.nullable(),
      to: OrderStatusSchema,
      actorType: z.string(),
      note: z.string().nullable(),
      at: isoDate,
    }),
  ),
  allowedTransitions: z.array(OrderStatusSchema),
  production: z
    .object({
      status: ProductionJobStatusSchema,
      operator: z.object({ id: uuid, name: z.string() }).nullable(),
      error: z.string().nullable(),
      items: z.array(z.object({ itemId: uuid, front: z.boolean(), back: z.boolean() })),
    })
    .nullable(),
  delivery: z
    .object({
      status: z.string(),
      courier: z.object({ id: uuid, name: z.string(), phone: z.string() }).nullable(),
    })
    .nullable(),
  payments: z.array(
    z.object({
      id: uuid,
      method: z.string(),
      status: z.string(),
      amountXof: xof,
      createdAt: isoDate,
    }),
  ),
});
export type AdminOrder = z.infer<typeof AdminOrderSchema>;

export const OrderCountsSchema = z.record(OrderStatusSchema, z.number().int().nonnegative());
export type OrderCounts = z.infer<typeof OrderCountsSchema>;
export const AdminOrderCountsQuerySchema = AdminOrdersQuerySchema.omit({
  status: true,
  cursor: true,
  limit: true,
});

export const ProductionQueueQuerySchema = z.object({
  status: z.enum(['to_assign', 'in_production']),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProductionQueueQuery = z.infer<typeof ProductionQueueQuerySchema>;

export const ProductionQueueItemSchema = z.object({
  orderId: uuid,
  orderNumber: z.string(),
  status: OrderStatusSchema,
  receptionType: ReceptionTypeSchema,
  paidAt: isoDate,
  itemsCount: z.number().int().nonnegative(),
  production: z
    .object({
      status: ProductionJobStatusSchema,
      operator: z.object({ id: uuid, name: z.string() }).nullable(),
    })
    .nullable(),
});
export type ProductionQueueItem = z.infer<typeof ProductionQueueItemSchema>;

export const AdminStockItemSchema = z.object({
  id: uuid,
  colorId: z.string(),
  colorName: z.string(),
  size: SizeSchema,
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  alertThreshold: z.number().int(),
  belowThreshold: z.boolean(),
});
export type AdminStockItem = z.infer<typeof AdminStockItemSchema>;

export const AdminOperatorSchema = z.object({
  id: uuid,
  name: z.string(),
  email: z.string(),
  role: z.enum(['production', 'super_admin']),
});
export type AdminOperator = z.infer<typeof AdminOperatorSchema>;
