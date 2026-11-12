import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  type PipeTransform,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AssignCourierInputSchema,
  CourierCompleteInputSchema,
  CourierDeliveriesQuerySchema,
  CourierFailInputSchema,
  ResolveZoneQuerySchema,
  SlotsQuerySchema,
} from '@streetwear/shared';
import type { z } from 'zod';
import { notFound } from '../../common/api-exception';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentAdmin } from '../auth/current.decorators';
import type { AdminPrincipal } from '../auth/auth.types';
import { AdminAuthGuard } from '../auth/guards';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CourierService } from './courier.service';
import { DeliveryAdminService } from './delivery-admin.service';
import * as S from './delivery.schemas';
import { dayRange } from './delivery.schemas';
import { ZonesService } from './zones.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UuidParam: PipeTransform<string, string> = {
  transform(value: string): string {
    if (!UUID.test(value)) throw notFound();
    return value;
  },
};

type Out<T extends { _output: unknown }> = T['_output'];
type Q<T extends z.ZodTypeAny> = z.output<T>;

@ApiTags('delivery')
@Controller()
export class DeliveryPublicController {
  constructor(
    private readonly zones: ZonesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('delivery/zones/resolve')
  async resolve(@Query(new ZodPipe(ResolveZoneQuerySchema)) q: Q<typeof ResolveZoneQuerySchema>) {
    const zone = await this.zones.resolve(q.lat, q.lng);
    if (!zone) throw notFound('Zone de livraison');
    return zone;
  }

  @Get('stores')
  async stores() {
    const rows = await this.prisma.store.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      openingHours: s.openingHours,
    }));
  }

  @Get('stores/:id/slots')
  async slots(
    @Param('id', UuidParam) id: string,
    @Query(new ZodPipe(SlotsQuerySchema)) q: Q<typeof SlotsQuerySchema>,
  ) {
    const store = UUID.test(id)
      ? await this.prisma.store.findFirst({ where: { id, active: true } })
      : null;
    if (!store) throw notFound('Boutique');
    const rows = await this.prisma.pickupSlot.findMany({
      where: { storeId: id, startsAt: { ...dayRange(q.date), gt: new Date() } },
      orderBy: { startsAt: 'asc' },
    });
    return rows
      .filter((s) => s.booked < s.capacity)
      .map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        remaining: s.capacity - s.booked,
      }));
  }
}

@ApiTags('admin-delivery')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminAuthGuard)
@Roles('logistics', 'super_admin')
export class DeliveryAdminController {
  constructor(private readonly svc: DeliveryAdminService) {}

  @Get('delivery-zones')
  zones() {
    return this.svc.listZones();
  }
  @Post('delivery-zones')
  createZone(@Body(new ZodPipe(S.ZoneInputSchema)) body: Out<typeof S.ZoneInputSchema>) {
    return this.svc.createZone(body);
  }
  @Patch('delivery-zones/:id')
  updateZone(
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(S.ZonePatchSchema)) body: Out<typeof S.ZonePatchSchema>,
  ) {
    return this.svc.updateZone(id, body);
  }

  @Get('stores')
  stores() {
    return this.svc.listStores();
  }
  @Post('stores')
  createStore(@Body(new ZodPipe(S.StoreInputSchema)) body: Out<typeof S.StoreInputSchema>) {
    return this.svc.createStore(body);
  }
  @Patch('stores/:id')
  updateStore(
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(S.StorePatchSchema)) body: Out<typeof S.StorePatchSchema>,
  ) {
    return this.svc.updateStore(id, body);
  }

  @Get('stores/:id/slots')
  slots(
    @Param('id', UuidParam) id: string,
    @Query(new ZodPipe(S.AdminSlotsQuerySchema)) q: Out<typeof S.AdminSlotsQuerySchema>,
  ) {
    return this.svc.listSlots(id, q.date);
  }
  @Post('stores/:id/slots')
  generate(
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(S.GenerateSlotsInputSchema)) body: Out<typeof S.GenerateSlotsInputSchema>,
  ) {
    return this.svc.generateSlots(id, body);
  }
  @Patch('stores/:id/slots/:slotId')
  updateSlot(
    @Param('id', UuidParam) id: string,
    @Param('slotId', UuidParam) slotId: string,
    @Body(new ZodPipe(S.SlotPatchSchema)) body: Out<typeof S.SlotPatchSchema>,
  ) {
    return this.svc.updateSlot(id, slotId, body.capacity);
  }

  @Get('deliveries')
  deliveries(
    @Query(new ZodPipe(S.AdminDeliveriesQuerySchema)) q: Out<typeof S.AdminDeliveriesQuerySchema>,
  ) {
    return this.svc.listDeliveries(q);
  }
  @Get('couriers')
  couriers() {
    return this.svc.listCouriers();
  }
  @Post('deliveries/:id/assign')
  @HttpCode(200)
  assign(
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(AssignCourierInputSchema)) body: Q<typeof AssignCourierInputSchema>,
  ) {
    return this.svc.assign(id, body.courierId);
  }
}

@ApiTags('courier')
@ApiBearerAuth()
@Controller('courier')
@UseGuards(AdminAuthGuard)
@Roles('courier')
export class CourierController {
  constructor(private readonly svc: CourierService) {}

  @Get('deliveries')
  list(
    @CurrentAdmin() admin: AdminPrincipal,
    @Query(new ZodPipe(CourierDeliveriesQuerySchema)) q: Q<typeof CourierDeliveriesQuerySchema>,
  ) {
    return this.svc.list(admin.id, q.date);
  }
  @Post('deliveries/:id/start')
  @HttpCode(200)
  start(@CurrentAdmin() admin: AdminPrincipal, @Param('id', UuidParam) id: string) {
    return this.svc.start(admin.id, id);
  }
  @Post('deliveries/:id/complete')
  @HttpCode(200)
  complete(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(CourierCompleteInputSchema)) body: Q<typeof CourierCompleteInputSchema>,
  ) {
    return this.svc.complete(admin.id, id, body);
  }
  @Post('deliveries/:id/fail')
  @HttpCode(200)
  fail(
    @CurrentAdmin() admin: AdminPrincipal,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(CourierFailInputSchema)) body: Q<typeof CourierFailInputSchema>,
  ) {
    return this.svc.fail(admin.id, id, body);
  }
}
