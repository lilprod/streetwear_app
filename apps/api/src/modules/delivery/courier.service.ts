import { Inject, Injectable } from '@nestjs/common';
import type { Courier, Delivery } from '@prisma/client';
import type { CourierDelivery, CourierCompleteInput, CourierFailInput } from '@streetwear/shared';
import { timingSafeEqual } from 'node:crypto';
import { apiError } from '../../common/api-error';
import { ApiException, notFound } from '../../common/api-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService } from './delivery.service';
import { dayRange } from './delivery.schemas';
import { ORDER_TRANSITION_PORT, type OrderTransitionPort } from './order-transition.port';

export const MAX_HANDOVER_ATTEMPTS = 5;

type Outcome =
  { kind: 'ok'; delivery: Delivery } | { kind: 'wrong'; remaining: number } | { kind: 'locked' };

const invalidState = (): ApiException =>
  new ApiException(409, 'INVALID_TRANSITION', "Cette livraison n'est pas dans le bon état.");

@Injectable()
export class CourierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: DeliveryService,
    @Inject(ORDER_TRANSITION_PORT) private readonly orders: OrderTransitionPort,
  ) {}

  private async courierOf(adminUserId: string): Promise<Courier> {
    const courier = await this.prisma.courier.findUnique({ where: { adminUserId } });
    if (!courier?.active) {
      throw apiError(403, 'FORBIDDEN', "Aucun profil livreur actif n'est associé à ce compte.");
    }
    return courier;
  }

  private async view(d: Delivery): Promise<CourierDelivery> {
    const o = await this.orders.courierView(d.orderId);
    return {
      id: d.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      address: d.addressSnapshot as CourierDelivery['address'],
      codBalanceXof: d.codBalanceXof,
      status: d.status,
      itemsCount: o.itemsCount,
    };
  }

  async list(adminUserId: string, date?: string): Promise<CourierDelivery[]> {
    const courier = await this.courierOf(adminUserId);
    const day = dayRange(date ?? new Date().toISOString().slice(0, 10));
    const rows = await this.prisma.delivery.findMany({
      where: {
        courierId: courier.id,
        OR: [
          { scheduledFor: day },
          { status: { in: ['assigned', 'in_progress'] }, scheduledFor: { lt: day.lt } },
        ],
      },
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(rows.map((d) => this.view(d)));
  }

  /** Charge et verrouille la course d'un livreur ; 404 si elle appartient à un autre. */
  private async lock(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    id: string,
    courierId: string,
  ): Promise<Delivery> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM deliveries WHERE id = ${id}::uuid AND courier_id = ${courierId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw notFound('Livraison');
    return tx.delivery.findUniqueOrThrow({ where: { id } });
  }

  async start(adminUserId: string, id: string): Promise<CourierDelivery> {
    const courier = await this.courierOf(adminUserId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await this.lock(tx, id, courier.id);
      if (d.status !== 'assigned') throw invalidState();
      return tx.delivery.update({
        where: { id },
        data: { status: 'in_progress', startedAt: new Date() },
      });
    });
    return this.view(updated);
  }

  async complete(
    adminUserId: string,
    id: string,
    input: CourierCompleteInput,
  ): Promise<CourierDelivery> {
    const courier = await this.courierOf(adminUserId);
    const outcome = await this.prisma.$transaction(async (tx): Promise<Outcome> => {
      const d = await this.lock(tx, id, courier.id);
      if (d.status !== 'in_progress') throw invalidState();
      if (d.handoverAttempts >= MAX_HANDOVER_ATTEMPTS) return { kind: 'locked' };
      const expected = Buffer.from(d.handoverCodeHash);
      const given = Buffer.from(this.deliveries.codeHash('handover', d.id, input.handoverCode));
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        const attempts = d.handoverAttempts + 1;
        await tx.delivery.update({ where: { id }, data: { handoverAttempts: attempts } });
        return { kind: 'wrong', remaining: MAX_HANDOVER_ATTEMPTS - attempts };
      }
      if (d.codBalanceXof !== null && input.codCollectedXof !== d.codBalanceXof) {
        throw apiError(
          400,
          'COD_AMOUNT_MISMATCH',
          'Le montant encaissé doit être égal au solde à payer à la livraison.',
        );
      }
      await this.orders.transition(
        d.orderId,
        'delivered',
        { type: 'admin', role: 'courier', id: adminUserId },
        {
          receptionType: 'home',
          handoverCodeVerified: true,
          codCollectedXof: input.codCollectedXof ?? null,
        },
        tx,
      );
      const delivery = await tx.delivery.update({
        where: { id },
        data: {
          status: 'delivered',
          codCollectedXof: d.codBalanceXof === null ? null : input.codCollectedXof,
          completedAt: new Date(),
        },
      });
      return { kind: 'ok', delivery };
    });
    if (outcome.kind === 'locked') {
      throw apiError(
        403,
        'HANDOVER_CODE_LOCKED',
        'Trop de codes erronés : contactez la logistique pour débloquer cette livraison.',
      );
    }
    if (outcome.kind === 'wrong') {
      throw apiError(400, 'HANDOVER_CODE_INVALID', 'Code de remise incorrect.', {
        remainingAttempts: outcome.remaining,
      });
    }
    return this.view(outcome.delivery);
  }

  async fail(adminUserId: string, id: string, input: CourierFailInput): Promise<CourierDelivery> {
    const courier = await this.courierOf(adminUserId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const d = await this.lock(tx, id, courier.id);
      if (d.status !== 'assigned' && d.status !== 'in_progress') throw invalidState();
      await this.orders.transition(
        d.orderId,
        'delivery_failed',
        { type: 'admin', role: 'courier', id: adminUserId },
        { receptionType: 'home', note: input.note },
        tx,
      );
      return tx.delivery.update({
        where: { id },
        data: {
          status: 'failed',
          failReason: input.reason,
          failNote: input.note ?? null,
          completedAt: new Date(),
        },
      });
    });
    return this.view(updated);
  }
}
