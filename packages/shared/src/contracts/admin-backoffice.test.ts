import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES } from '../order-state-machine';
import { QuoteSchema, OrderSchema } from './customer';
import { StatsQuerySchema } from './admin';
import {
  AdminCourierSchema,
  AdminDeliverySchema,
  StatsSummarySchema,
  ShopSettingsSchema,
} from './admin-backoffice';

const id = '01a1be80-4c5c-7ced-a7a3-8b5c5a477e98';

describe('contrats admin complémentaires', () => {
  it('valide AdminDelivery et AdminCourier', () => {
    const courier = { id, name: 'Koffi', phone: '+22891000000' };
    expect(AdminCourierSchema.safeParse(courier).success).toBe(true);
    const delivery = {
      id,
      orderId: id,
      orderNumber: 'TG-000001',
      status: 'assigned',
      customerName: null,
      recipientPhone: '+22890123456',
      addressLabel: 'Maison',
      landmark: null,
      lat: 6.1,
      lng: 1.2,
      zone: { id, name: 'Lomé centre' },
      courier,
      codBalanceXof: 0,
      scheduledFor: null,
      updatedAt: '2026-11-12T10:00:00.000Z',
    };
    expect(AdminDeliverySchema.safeParse(delivery).success).toBe(true);
    expect(AdminDeliverySchema.safeParse({ ...delivery, codBalanceXof: 1.5 }).success).toBe(false);
  });

  it('valide StatsSummary avec tous les statuts et refuse les montants décimaux', () => {
    const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    const stats = {
      from: '2026-10-14T00:00:00.000Z',
      to: '2026-11-12T23:59:59.999Z',
      ordersCount: 3,
      revenueXof: 30000,
      averageOrderXof: 10000,
      byStatus,
      byReception: { home: 2, pickup: 1 },
      topPatterns: [{ id: 'p', name: 'Kente', count: 2 }],
      topColors: [{ id: 'c', name: 'Noir', hex: '#111111', count: 2 }],
    };
    expect(StatsSummarySchema.safeParse(stats).success).toBe(true);
    expect(StatsSummarySchema.safeParse({ ...stats, revenueXof: 10.5 }).success).toBe(false);
  });

  it('accepte une date ou un instant pour la période des statistiques', () => {
    expect(
      StatsQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-12T23:59:59.999Z' }).success,
    ).toBe(true);
    expect(StatsQuerySchema.safeParse({ from: 'hier' }).success).toBe(false);
  });

  it('Quote et Order portent les nouveaux champs', () => {
    expect(QuoteSchema.shape.codDepositXof).toBeDefined();
    expect(OrderSchema.shape.estimatedReadyAt.isNullable()).toBe(true);
    expect(OrderSchema.shape.estimatedDeliveryAt.isNullable()).toBe(true);
  });

  it('valide les réglages boutique', () => {
    expect(
      ShopSettingsSchema.safeParse({
        cod_deposit_percent: 50,
        order_expiry_minutes: 30,
        payment_methods_enabled: ['tmoney', 'cod'],
      }).success,
    ).toBe(true);
  });
});
