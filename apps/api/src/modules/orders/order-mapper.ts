import type {
  Order as OrderRow,
  OrderItem as OrderItemRow,
  OrderStatusHistory,
} from '@prisma/client';
import type { DesignSpec, Order, OrderSummary } from '@streetwear/shared';

export type OrderWithRelations = OrderRow & {
  items: OrderItemRow[];
  history: OrderStatusHistory[];
};

export const toSummary = (
  o: OrderRow & { items: Pick<OrderItemRow, 'quantity'>[] },
): OrderSummary => ({
  id: o.id,
  number: o.number,
  status: o.status,
  totalXof: o.totalXof,
  paymentMethod: o.paymentMethod,
  itemCount: o.items.reduce((n, i) => n + i.quantity, 0),
  createdAt: o.createdAt.toISOString(),
});

export function toOrder(o: OrderWithRelations): Order {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    items: o.items.map((i) => ({
      id: i.id,
      design: {
        spec: i.designSnapshot as unknown as DesignSpec,
        previewFrontUrl: i.previewFrontUrl,
        previewBackUrl: i.previewBackUrl,
      },
      colorId: i.colorId,
      size: i.size as Order['items'][number]['size'],
      quantity: i.quantity,
      unitPriceXof: i.unitPriceXof,
      lineTotalXof: i.unitPriceXof * i.quantity,
    })),
    subtotalXof: o.subtotalXof,
    deliveryFeeXof: o.deliveryFeeXof,
    totalXof: o.totalXof,
    depositXof: o.depositXof,
    paymentMethod: o.paymentMethod,
    reception: o.receptionSnapshot as unknown as Order['reception'],
    history: o.history.map((h) => ({ status: h.toStatus, at: h.createdAt.toISOString() })),
    expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
    estimatedReadyAt: o.estimatedReadyAt ? o.estimatedReadyAt.toISOString() : null,
    estimatedDeliveryAt: o.estimatedDeliveryAt ? o.estimatedDeliveryAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
  };
}

export const ORDER_INCLUDE = {
  items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  history: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
};

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString('base64url');
}

export function decodeCursor(cursor: string): [Date, string] | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string') {
      const d = new Date(v[0]);
      if (!Number.isNaN(d.getTime()) && /^[0-9a-f-]{36}$/i.test(v[1])) return [d, v[1]];
    }
  } catch {
    /* curseur invalide */
  }
  return null;
}
