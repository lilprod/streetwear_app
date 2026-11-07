import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CourierOrderStatus,
  CourierOrderView,
  OrderTransitionPort,
} from '../delivery/order-transition.port';
import { OrdersService } from './orders.service';

/** Implémentation réelle du port SP06, adossée à `OrdersService.transition`. */
@Injectable()
export class OrdersTransitionAdapter implements OrderTransitionPort {
  constructor(private readonly orders: OrdersService) {}

  async transition(
    orderId: string,
    to: CourierOrderStatus,
    actor: { type: 'admin'; role: 'courier'; id: string },
    context: { receptionType: 'home'; note?: string; handoverCodeVerified?: boolean },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await this.orders.transition(orderId, to, actor, context.note, tx, {
      facts: { requiresHandoverCode: context.handoverCodeVerified === true },
    });
  }

  courierView(orderId: string): Promise<CourierOrderView> {
    return this.orders.courierView(orderId);
  }
}
