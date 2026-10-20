import { z } from 'zod';
import { ORDER_STATUSES } from '../order-state-machine';
import { normalizeTgPhone } from '../phone';

export const xof = z.number().int().nonnegative();
export const isoDate = z.string().datetime({ message: 'Date ISO 8601 UTC attendue.' });
export const uuid = z.string().uuid();
export const e164Phone = z.string().transform((v, ctx) => {
  const n = normalizeTgPhone(v);
  if (!n) {
    ctx.addIssue({ code: 'custom', message: 'Numéro de téléphone togolais invalide.' });
    return z.NEVER;
  }
  return n;
});

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
export const SizeSchema = z.enum(SIZES);
export type Size = z.infer<typeof SizeSchema>;

export const OrderStatusSchema = z.enum(ORDER_STATUSES);

export const PaymentMethodSchema = z.enum(['tmoney', 'flooz', 'card']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export const OrderPaymentMethodSchema = z.enum(['tmoney', 'flooz', 'card', 'cod']);
export type OrderPaymentMethod = z.infer<typeof OrderPaymentMethodSchema>;

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_TRANSITION',
  'OUT_OF_STOCK',
  'SLOT_FULL',
  'ORDER_NOT_PAYABLE',
  'IDEMPOTENCY_CONFLICT',
  'TEXT_REJECTED',
  'PATTERN_INACTIVE',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const PageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export type Page<T> = { items: T[]; nextCursor: string | null };

export const HealthSchema = z.object({
  status: z.literal('ok'),
  db: z.literal('ok'),
  redis: z.literal('ok'),
});
