import { z } from 'zod';
import { PaymentMethodSchema, isoDate, uuid, xof } from './common';
import { PaymentKindSchema, PaymentStatusSchema } from './customer';

export const AdminPaymentsQuerySchema = z.object({
  status: PaymentStatusSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminPaymentsQuery = z.infer<typeof AdminPaymentsQuerySchema>;

export const AdminPaymentSchema = z.object({
  id: uuid,
  orderId: uuid,
  orderNumber: z.string(),
  provider: z.string(),
  method: PaymentMethodSchema,
  kind: PaymentKindSchema,
  amountXof: xof,
  status: PaymentStatusSchema,
  providerRef: z.string().nullable(),
  /** Masqué : `+228 90 •• •• 56`. */
  payerPhone: z.string().nullable(),
  failureReason: z.string().nullable(),
  confirmedAt: isoDate.nullable(),
  createdAt: isoDate,
});
export type AdminPayment = z.infer<typeof AdminPaymentSchema>;

export const RECONCILIATION_MISMATCH_TYPES = [
  'missing_payment',
  'missing_at_provider',
  'status_mismatch',
  'amount_mismatch',
] as const;
export const ReconciliationMismatchSchema = z.object({
  type: z.enum(RECONCILIATION_MISMATCH_TYPES),
  providerRef: z.string(),
  paymentId: uuid.nullable(),
  orderNumber: z.string().nullable(),
  providerStatus: z.string().nullable(),
  paymentStatus: PaymentStatusSchema.nullable(),
  providerAmountXof: xof.nullable(),
  paymentAmountXof: xof.nullable(),
});
export type ReconciliationMismatch = z.infer<typeof ReconciliationMismatchSchema>;

export const ReconciliationsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const ReconciliationSchema = z.object({
  id: uuid,
  /** Jour civil Africa/Lome, `YYYY-MM-DD`. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provider: z.string(),
  matched: z.number().int().nonnegative(),
  mismatchCount: z.number().int().nonnegative(),
  mismatches: z.array(ReconciliationMismatchSchema),
  createdAt: isoDate,
});
export type Reconciliation = z.infer<typeof ReconciliationSchema>;
