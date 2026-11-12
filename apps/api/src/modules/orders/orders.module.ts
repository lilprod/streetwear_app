import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { DesignsModule } from '../../designs/designs.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CartModule } from '../cart/cart.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { ORDER_TRANSITION_PORT } from '../delivery/order-transition.port';
import { ZonesModule } from '../delivery/zones.module';
import { StockModule } from '../stock/stock.module';
import { OrdersTransitionAdapter } from './order-transition.adapter';
import { AdminOrdersController, AdminStatsController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StatsService } from './stats.service';

/** Global : fournit ORDER_TRANSITION_PORT au module livraison (SP06) sans import circulaire. */
@Global()
@Module({
  imports: [CartModule, DesignsModule, StockModule, DeliveryModule, ZonesModule],
  controllers: [OrdersController, AdminOrdersController, AdminStatsController],
  providers: [
    OrdersService,
    StatsService,
    OrdersTransitionAdapter,
    { provide: ORDER_TRANSITION_PORT, useExisting: OrdersTransitionAdapter },
  ],
  exports: [OrdersService, ORDER_TRANSITION_PORT],
})
export class OrdersModule implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.audit.registerLoader('orders', (id) =>
      id
        ? this.prisma.order.findUnique({
            where: { id },
            select: { id: true, number: true, status: true, updatedAt: true },
          })
        : Promise.resolve(null),
    );
  }
}
