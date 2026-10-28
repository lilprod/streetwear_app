import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type CourierOrderStatus = 'delivered' | 'delivery_failed';

export interface CourierOrderView {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  itemsCount: number;
}

/**
 * Port vers `OrdersService` (SP04). Toute transition de commande passe par
 * `OrdersService.transition` ; SP06 ne touche jamais au statut d'une commande directement.
 * SP04 remplacera `FakeOrderTransitionPort` en fournissant ORDER_TRANSITION_PORT.
 */
export interface OrderTransitionPort {
  transition(
    orderId: string,
    to: CourierOrderStatus,
    actor: { type: 'admin'; role: 'courier'; id: string },
    context: {
      receptionType: 'home';
      note?: string;
      handoverCodeVerified?: boolean;
      codCollectedXof?: number | null;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void>;
  courierView(orderId: string): Promise<CourierOrderView>;
}

export const ORDER_TRANSITION_PORT = Symbol('ORDER_TRANSITION_PORT');

/** Adaptateur factice (aucune commande n'existe tant que SP04 n'est pas fusionné) : enregistre les appels. */
@Injectable()
export class FakeOrderTransitionPort implements OrderTransitionPort {
  readonly calls: { orderId: string; to: CourierOrderStatus; codCollectedXof?: number | null }[] =
    [];

  async transition(
    orderId: string,
    to: CourierOrderStatus,
    _actor: { type: 'admin'; role: 'courier'; id: string },
    context: { codCollectedXof?: number | null },
  ): Promise<void> {
    this.calls.push({ orderId, to, codCollectedXof: context.codCollectedXof });
  }

  async courierView(orderId: string): Promise<CourierOrderView> {
    return {
      orderNumber: `SW-${orderId.slice(-8).toUpperCase()}`,
      customerName: 'Client',
      customerPhone: '+22890000000',
      itemsCount: 1,
    };
  }
}
