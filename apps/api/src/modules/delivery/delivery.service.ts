import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ReceptionInput } from '@streetwear/shared';
import { randomInt } from 'node:crypto';
import { ApiException, notFound } from '../../common/api-exception';
import { hmac } from '../../common/crypto';
import { uuidv7 } from '../../common/uuid';
import { ENV, type Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ZonesService } from './zones.service';

const HOUR = 3_600_000;

export interface ReceptionQuote {
  deliveryFeeXof: number;
  estimatedReadyAt: string;
  estimatedDeliveryAt: string | null;
}

export type Reservation =
  | { type: 'home'; deliveryId: string; feeXof: number; handoverCode: string }
  | { type: 'pickup'; pickupId: string; pickupCode: string };

export interface ReserveContext {
  orderId: string;
  userId: string;
  /** Solde à encaisser à la livraison (paiement à la livraison), sinon absent. */
  codBalanceXof?: number | null;
  now?: Date;
}

export const randomCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

const slotFull = (): ApiException =>
  new ApiException(409, 'SLOT_FULL', 'Ce créneau de retrait est complet. Choisis-en un autre.');

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly zones: ZonesService,
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  codeHash(scope: 'handover' | 'pickup', id: string, code: string): string {
    return hmac(this.env.JWT_SECRET, `${scope}:${id}:${code}`);
  }

  private async homeTarget(
    db: Prisma.TransactionClient | PrismaService,
    addressId: string,
    userId: string,
  ) {
    const address = await db.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw notFound('Adresse');
    const zone = await this.zones.resolve(address.lat, address.lng);
    if (!zone) {
      throw new ApiException(
        422,
        'OUT_OF_ZONE',
        'Nous ne livrons pas encore ici, choisis le retrait en boutique.',
      );
    }
    return { address, zone };
  }

  async quote(
    reception: ReceptionInput,
    userId: string,
    now: Date = new Date(),
  ): Promise<ReceptionQuote> {
    if (reception.type === 'home') {
      const { zone } = await this.homeTarget(this.prisma, reception.addressId, userId);
      const productionHours = await this.settings.get('production_hours');
      const ready = new Date(now.getTime() + productionHours * HOUR);
      return {
        deliveryFeeXof: zone.feeXof,
        estimatedReadyAt: ready.toISOString(),
        estimatedDeliveryAt: new Date(ready.getTime() + zone.delayHours * HOUR).toISOString(),
      };
    }
    const slot = await this.prisma.pickupSlot.findFirst({
      where: { id: reception.slotId, storeId: reception.storeId, store: { active: true } },
    });
    if (!slot || slot.startsAt <= now) throw notFound('Créneau');
    if (slot.booked >= slot.capacity) throw slotFull();
    return {
      deliveryFeeXof: 0,
      estimatedReadyAt: slot.startsAt.toISOString(),
      estimatedDeliveryAt: null,
    };
  }

  /** À appeler dans la transaction de création de commande ; renvoie le code en clair, une seule fois. */
  async reserve(
    reception: ReceptionInput,
    ctx: ReserveContext,
    tx: Prisma.TransactionClient,
  ): Promise<Reservation> {
    const now = ctx.now ?? new Date();
    if (reception.type === 'home') {
      const { address, zone } = await this.homeTarget(tx, reception.addressId, ctx.userId);
      const id = uuidv7();
      const handoverCode = randomCode();
      const productionHours = await this.settings.get('production_hours');
      const scheduledFor = new Date(now.getTime() + (productionHours + zone.delayHours) * HOUR);
      await tx.delivery.create({
        data: {
          id,
          orderId: ctx.orderId,
          zoneId: zone.id,
          feeXof: zone.feeXof,
          scheduledFor,
          handoverCodeHash: this.codeHash('handover', id, handoverCode),
          codBalanceXof: ctx.codBalanceXof ?? null,
          addressSnapshot: {
            id: address.id,
            label: address.label,
            lat: address.lat,
            lng: address.lng,
            district: address.district,
            landmark: address.landmark,
            recipientPhone: address.recipientPhone,
            zone,
          },
        },
      });
      return { type: 'home', deliveryId: id, feeXof: zone.feeXof, handoverCode };
    }

    const exists = await tx.pickupSlot.findFirst({
      where: { id: reception.slotId, storeId: reception.storeId, store: { active: true } },
      select: { id: true },
    });
    if (!exists) throw notFound('Créneau');
    const updated = await tx.$executeRaw`
      UPDATE pickup_slots SET booked = booked + 1
      WHERE id = ${reception.slotId}::uuid AND booked < capacity AND starts_at > ${now}`;
    if (updated === 0) throw slotFull();
    const id = uuidv7();
    const pickupCode = randomCode();
    await tx.pickup.create({
      data: {
        id,
        orderId: ctx.orderId,
        slotId: reception.slotId,
        pickupCodeHash: this.codeHash('pickup', id, pickupCode),
      },
    });
    return { type: 'pickup', pickupId: id, pickupCode };
  }

  /** Libère créneau ou livraison d'une commande annulée ou expirée ; idempotent. */
  async release(orderId: string, tx: Prisma.TransactionClient): Promise<void> {
    const pickup = await tx.pickup.findUnique({ where: { orderId } });
    if (pickup) {
      await tx.pickup.delete({ where: { id: pickup.id } });
      await tx.$executeRaw`UPDATE pickup_slots SET booked = booked - 1 WHERE id = ${pickup.slotId}::uuid AND booked > 0`;
    }
    await tx.delivery.deleteMany({
      where: { orderId, status: { in: ['to_assign', 'assigned'] } },
    });
  }
}
