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

/** SP05 → SP07 : alertes paiement (aucune donnée personnelle ni de carte). */
export const PAYMENT_EVENTS = {
  /** Montant reçu ≠ montant dû : paiement `failed`, commande non payée. */
  amountMismatch: 'payment.amount_mismatch',
  /** Succès reçu pour une commande qui n'est plus payable (expirée, annulée, déjà payée) : remboursement manuel. */
  unexpectedSuccess: 'payment.unexpected_success',
  /** Rapport quotidien avec au moins un écart. */
  reconciliationMismatch: 'reconciliation.mismatch',
} as const;

export interface PaymentAmountMismatchEvent {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  expectedXof: number;
  receivedXof: number;
}

export interface PaymentUnexpectedSuccessEvent {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  amountXof: number;
  orderStatus: OrderStatus;
}

export interface ReconciliationMismatchEvent {
  reconciliationId: string;
  date: string;
  provider: string;
  matched: number;
  mismatchCount: number;
}

export type PendingEvent = { name: string; payload: object };
