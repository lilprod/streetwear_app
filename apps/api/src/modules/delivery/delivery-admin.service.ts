import { Injectable } from '@nestjs/common';
import type {
  Delivery,
  DeliveryStatus,
  DeliveryZone,
  PickupSlot,
  Prisma,
  Store,
} from '@prisma/client';
import type { AdminCourier, AdminDelivery } from '@streetwear/shared';
import { apiError } from '../../common/api-error';
import { notFound } from '../../common/api-exception';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { dayRange } from './delivery.schemas';
import { SlotsService } from './slots.service';

type Json = Prisma.InputJsonValue;

/** Jamais de `handoverCodeHash` dans les réponses admin. */
const deliveryOut = (d: Delivery) => ({
  id: d.id,
  orderId: d.orderId,
  status: d.status,
  zoneId: d.zoneId,
  feeXof: d.feeXof,
  courierId: d.courierId,
  address: d.addressSnapshot,
  codBalanceXof: d.codBalanceXof,
  codCollectedXof: d.codCollectedXof,
  handoverAttempts: d.handoverAttempts,
  scheduledFor: d.scheduledFor.toISOString(),
  failReason: d.failReason,
  failNote: d.failNote,
});

const zoneOut = (z: DeliveryZone) => ({
  id: z.id,
  name: z.name,
  polygon: z.polygon,
  feeXof: z.feeXof,
  delayHours: z.delayHours,
  active: z.active,
});

const storeOut = (s: Store) => ({
  id: s.id,
  name: s.name,
  address: s.address,
  lat: s.lat,
  lng: s.lng,
  openingHours: s.openingHours,
  defaultSlotCapacity: s.defaultSlotCapacity,
  active: s.active,
});

const slotOut = (s: PickupSlot) => ({
  id: s.id,
  startsAt: s.startsAt.toISOString(),
  endsAt: s.endsAt.toISOString(),
  capacity: s.capacity,
  booked: s.booked,
  remaining: Math.max(0, s.capacity - s.booked),
});

@Injectable()
export class DeliveryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
  ) {}

  async listZones() {
    return (await this.prisma.deliveryZone.findMany({ orderBy: { createdAt: 'asc' } })).map(
      zoneOut,
    );
  }
  async createZone(input: {
    name: string;
    polygon: unknown;
    feeXof: number;
    delayHours: number;
    active?: boolean;
  }) {
    const z = await this.prisma.deliveryZone.create({
      data: { id: uuidv7(), ...input, polygon: input.polygon as Json },
    });
    return zoneOut(z);
  }
  async updateZone(
    id: string,
    input: {
      name?: string;
      polygon?: unknown;
      feeXof?: number;
      delayHours?: number;
      active?: boolean;
    },
  ) {
    await this.zone(id);
    const { polygon, ...rest } = input;
    const z = await this.prisma.deliveryZone.update({
      where: { id },
      data: { ...rest, ...(polygon !== undefined && { polygon: polygon as Json }) },
    });
    return zoneOut(z);
  }
  private async zone(id: string) {
    const z = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!z) throw notFound('Zone');
    return z;
  }

  async listStores() {
    return (await this.prisma.store.findMany({ orderBy: { createdAt: 'asc' } })).map(storeOut);
  }
  async createStore(input: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    openingHours: Record<string, string>;
    defaultSlotCapacity?: number;
    active?: boolean;
  }) {
    return storeOut(await this.prisma.store.create({ data: { id: uuidv7(), ...input } }));
  }
  async updateStore(
    id: string,
    input: {
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
      openingHours?: Record<string, string>;
      defaultSlotCapacity?: number;
      active?: boolean;
    },
  ) {
    await this.store(id);
    return storeOut(await this.prisma.store.update({ where: { id }, data: input }));
  }
  private async store(id: string) {
    const s = await this.prisma.store.findUnique({ where: { id } });
    if (!s) throw notFound('Boutique');
    return s;
  }

  async listSlots(storeId: string, date?: string) {
    await this.store(storeId);
    const rows = await this.prisma.pickupSlot.findMany({
      where: {
        storeId,
        ...(date ? { startsAt: dayRange(date) } : { startsAt: { gte: new Date() } }),
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
    return rows.map(slotOut);
  }
  async generateSlots(storeId: string, input: { days?: number; capacity?: number }) {
    await this.store(storeId);
    return { created: await this.slots.generate(storeId, input) };
  }
  async updateSlot(storeId: string, slotId: string, capacity: number) {
    await this.store(storeId);
    const slot = await this.prisma.pickupSlot.findFirst({ where: { id: slotId, storeId } });
    if (!slot) throw notFound('Créneau');
    if (capacity < slot.booked) {
      throw apiError(
        400,
        'VALIDATION_FAILED',
        'La capacité ne peut pas être inférieure aux places déjà réservées.',
        {
          fieldErrors: { capacity: ['Inférieure aux réservations existantes.'] },
        },
      );
    }
    return slotOut(
      await this.prisma.pickupSlot.update({ where: { id: slotId }, data: { capacity } }),
    );
  }

  async listDeliveries(q: { status?: DeliveryStatus; date?: string }): Promise<{
    items: AdminDelivery[];
  }> {
    const rows = await this.prisma.delivery.findMany({
      where: {
        ...(q.status && { status: q.status }),
        scheduledFor: dayRange(q.date ?? new Date().toISOString().slice(0, 10)),
      },
      include: {
        zone: { select: { id: true, name: true } },
        courier: { select: { id: true, phone: true, adminUserId: true } },
        order: { select: { number: true, user: { select: { name: true, phone: true } } } },
      },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
    });
    const adminIds = [...new Set(rows.flatMap((d) => (d.courier ? [d.courier.adminUserId] : [])))];
    const admins = adminIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const names = new Map(admins.map((a) => [a.id, a.name ?? a.email]));
    return {
      items: rows.map((d) => {
        const a = d.addressSnapshot as {
          label?: string;
          landmark?: string | null;
          lat?: number;
          lng?: number;
          recipientPhone?: string;
        };
        return {
          id: d.id,
          orderId: d.orderId,
          orderNumber: d.order.number,
          status: d.status,
          customerName: d.order.user.name,
          recipientPhone: a.recipientPhone ?? d.order.user.phone ?? '',
          addressLabel: a.label ?? '',
          landmark: a.landmark ?? null,
          lat: a.lat ?? 0,
          lng: a.lng ?? 0,
          zone: d.zone,
          courier: d.courier
            ? {
                id: d.courier.id,
                name: names.get(d.courier.adminUserId) ?? '',
                phone: d.courier.phone,
              }
            : null,
          codBalanceXof: d.codBalanceXof ?? 0,
          scheduledFor: d.scheduledFor.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      }),
    };
  }

  async listCouriers(): Promise<{ items: AdminCourier[] }> {
    const couriers = await this.prisma.courier.findMany({ where: { active: true } });
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: couriers.map((c) => c.adminUserId) }, role: 'courier', active: true },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(admins.map((a) => [a.id, a.name ?? a.email]));
    const items = couriers
      .filter((c) => byId.has(c.adminUserId))
      .map((c) => ({ id: c.id, name: byId.get(c.adminUserId) as string, phone: c.phone }))
      .sort((x, y) => x.name.localeCompare(y.name, 'fr'));
    return { items };
  }

  async assign(id: string, courierId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { id: courierId } });
    if (!courier?.active) throw notFound('Livreur');
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM deliveries WHERE id = ${id}::uuid FOR UPDATE`;
      if (rows.length === 0) throw notFound('Livraison');
      const d = await tx.delivery.findUniqueOrThrow({ where: { id } });
      if (!['to_assign', 'assigned', 'failed'].includes(d.status)) {
        throw apiError(409, 'INVALID_TRANSITION', 'Cette livraison ne peut plus être réaffectée.');
      }
      return deliveryOut(
        await tx.delivery.update({
          where: { id },
          data: {
            courierId,
            status: 'assigned',
            handoverAttempts: 0,
            failReason: null,
            failNote: null,
            completedAt: null,
          },
        }),
      );
    });
  }
}
