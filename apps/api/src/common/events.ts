import type { OrderActorType, OrderStatus, ReceptionType } from '@streetwear/shared';

/** Événements internes (docs/architecture.md). Les charges utiles ne sont jamais journalisées. */
export const EVENTS = {
  orderCreated: 'order.created',
  orderStatusChanged: 'order.status_changed',
  orderExpired: 'order.expired',
  designOrdered: 'design.ordered',
  stockBelowThreshold: 'stock.below_threshold',
} as const;

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  number: string;
  totalXof: number;
  receptionType: ReceptionType;
  /** Code de remise (livraison) ou de retrait, en clair, transmis une seule fois aux notifications. */
  handoverCode?: string;
  pickupCode?: string;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  userId: string;
  number: string;
  from: OrderStatus;
  to: OrderStatus;
  actorType: OrderActorType;
  actorId: string | null;
}

export interface OrderExpiredEvent {
  orderId: string;
  userId: string;
  number: string;
}

export interface DesignOrderedEvent {
  orderId: string;
  orderItemId: string;
  designId: string | null;
}

export interface StockBelowThresholdEvent {
  stockItemId: string;
  colorId: string;
  size: string;
  available: number;
  alertThreshold: number;
}

export type PendingEvent = { name: string; payload: object };
