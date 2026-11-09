import { describe, expect, it } from 'vitest';
import {
  AdminPaymentSchema,
  AdminPaymentsQuerySchema,
  ReconciliationSchema,
  ReconciliationsQuerySchema,
} from './admin-payments';

const payment = {
  id: '01a1be80-4c5c-7ced-a7a3-8b5c5a477e98',
  orderId: '01a1be80-4c37-74f8-8e0f-3f039f0b1c88',
  orderNumber: 'TG-000124',
  provider: 'fake',
  method: 'tmoney',
  kind: 'full',
  amountXof: 12000,
  status: 'succeeded',
  providerRef: 'fk_1',
  payerPhone: '+228 90 •• •• 56',
  failureReason: null,
  confirmedAt: '2026-11-09T08:00:00.000Z',
  createdAt: '2026-11-09T07:59:00.000Z',
};

describe('contrats admin paiements (SP05)', () => {
  it('requête : limite par défaut, statut et dates validés', () => {
    expect(AdminPaymentsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(AdminPaymentsQuerySchema.safeParse({ status: 'paid' }).success).toBe(false);
    expect(AdminPaymentsQuerySchema.safeParse({ from: '2026-11-09' }).success).toBe(false);
    expect(AdminPaymentsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(ReconciliationsQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5 });
  });

  it('paiement : montant entier, méthode connue', () => {
    expect(AdminPaymentSchema.parse(payment)).toEqual(payment);
    expect(AdminPaymentSchema.safeParse({ ...payment, amountXof: 12.5 }).success).toBe(false);
    expect(AdminPaymentSchema.safeParse({ ...payment, method: 'cod' }).success).toBe(false);
  });

  it('rapprochement : date civile et écarts typés', () => {
    const r = {
      id: payment.id,
      date: '2026-11-08',
      provider: 'fake',
      matched: 3,
      mismatchCount: 1,
      mismatches: [
        {
          type: 'missing_at_provider',
          providerRef: 'fk_1',
          paymentId: payment.id,
          orderNumber: 'TG-000124',
          providerStatus: null,
          paymentStatus: 'succeeded',
          providerAmountXof: null,
          paymentAmountXof: 12000,
        },
      ],
      createdAt: payment.createdAt,
    };
    expect(ReconciliationSchema.parse(r)).toEqual(r);
    expect(ReconciliationSchema.safeParse({ ...r, date: '2026-11-08T00:00:00Z' }).success).toBe(
      false,
    );
    expect(
      ReconciliationSchema.safeParse({ ...r, mismatches: [{ ...r.mismatches[0], type: 'other' }] })
        .success,
    ).toBe(false);
  });
});
