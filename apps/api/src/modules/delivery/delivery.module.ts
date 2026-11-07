import { Module, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CourierService } from './courier.service';
import { DeliveryAdminService } from './delivery-admin.service';
import {
  CourierController,
  DeliveryAdminController,
  DeliveryPublicController,
} from './delivery.controllers';
import { DeliveryService } from './delivery.service';
import { SlotsService } from './slots.service';
import { ZonesModule } from './zones.module';

@Module({
  imports: [ZonesModule],
  controllers: [DeliveryPublicController, DeliveryAdminController, CourierController],
  providers: [
    DeliveryService,
    DeliveryAdminService,
    CourierService,
    SlotsService,
    // ORDER_TRANSITION_PORT est fourni par OrdersModule (global, SP04).
  ],
  exports: [DeliveryService, SlotsService],
})
export class DeliveryModule implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const p = this.prisma;
    const byId =
      (find: (id: string) => Promise<unknown>) =>
      (id: string | undefined): Promise<unknown> =>
        id ? find(id) : Promise.resolve(null);
    this.audit.registerLoader(
      'delivery-zones',
      byId((id) => p.deliveryZone.findUnique({ where: { id } })),
    );
    this.audit.registerLoader(
      'stores',
      byId((id) => p.store.findUnique({ where: { id } })),
    );
    this.audit.registerLoader(
      'deliveries',
      byId(async (id) => {
        const d = await p.delivery.findUnique({ where: { id } });
        return d && { ...d, handoverCodeHash: undefined };
      }),
    );
  }
}
