import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { formatLome, type DesignSpec } from '@streetwear/shared';
import { ApiException, notFound } from '../../common/api-exception';
import { uuidv7 } from '../../common/uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService, type TransitionActor } from '../orders/orders.service';
import { RENDER_QUEUE, type RenderQueue } from './render/render.queue';
import { renderProductionSheet, type SheetItem } from './sheet/production-sheet';
import {
  SIGNED_URL_TTL_SECONDS,
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage/storage-provider';

type Tx = Prisma.TransactionClient;

const PRODUCIBLE = ['paid', 'deposit_paid', 'in_production'] as const;
const OPERATOR_ROLES = ['production', 'super_admin'] as const;

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @Inject(RENDER_QUEUE) private readonly queue: RenderQueue,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Branche la précondition `requiresOperator` de la machine à états (SP04). */
  registerChecks(): void {
    this.orders.registerPreconditionCheck('requiresOperator', async (orderId, tx) => {
      const job = await tx.productionJob.findUnique({
        where: { orderId },
        select: { operatorId: true },
      });
      return !!job?.operatorId;
    });
  }

  private async ensureJob(tx: Tx | PrismaService, orderId: string): Promise<void> {
    await tx.$executeRaw`INSERT INTO production_jobs (id, order_id, status, created_at, updated_at)
      VALUES (${uuidv7()}::uuid, ${orderId}::uuid, 'queued', now(), now())
      ON CONFLICT (order_id) DO NOTHING`;
  }

  /** Commande payée : crée le travail de production et met un rendu en file par ligne. */
  async onPaid(orderId: string): Promise<void> {
    await this.ensureJob(this.prisma, orderId);
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const i of items) await this.queue.enqueue(i.id);
  }

  async onReady(orderId: string): Promise<void> {
    await this.prisma.productionJob.updateMany({
      where: { orderId, status: 'ready_to_print' },
      data: { status: 'printed' },
    });
  }

  async assignOperator(orderId: string, operatorId: string, actor: TransitionActor) {
    const operator = await this.prisma.adminUser.findUnique({
      where: { id: operatorId },
      select: { id: true, active: true, role: true },
    });
    if (
      !operator ||
      !operator.active ||
      !(OPERATOR_ROLES as readonly string[]).includes(operator.role)
    ) {
      throw new ApiException(422, 'OPERATOR_INVALID', 'Cet opérateur ne peut pas être affecté.');
    }
    await this.orders.runInTransaction(async (tx) => {
      const [order] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      if (!order) throw notFound('Commande');
      await this.ensureJob(tx, orderId);
      await tx.productionJob.update({ where: { orderId }, data: { operatorId } });
      if (order.status !== 'in_production') {
        await this.orders.transition(orderId, 'in_production', actor, 'Opérateur affecté', tx);
      }
    });
    return this.orders.adminGet(orderId, actor);
  }

  private async itemOrThrow(itemId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        orderId: true,
        printFileFrontUrl: true,
        printFileBackUrl: true,
        order: { select: { status: true } },
      },
    });
    if (!item) throw notFound('Ligne de commande');
    return item;
  }

  async printFiles(itemId: string): Promise<{ front?: string; back?: string }> {
    const item = await this.itemOrThrow(itemId);
    const out: { front?: string; back?: string } = {};
    if (item.printFileFrontUrl) {
      out.front = await this.storage.signedUrl(item.printFileFrontUrl, SIGNED_URL_TTL_SECONDS);
    }
    if (item.printFileBackUrl) {
      out.back = await this.storage.signedUrl(item.printFileBackUrl, SIGNED_URL_TTL_SECONDS);
    }
    return out;
  }

  async regenerate(itemId: string): Promise<{ status: 'queued' }> {
    const item = await this.itemOrThrow(itemId);
    if (!(PRODUCIBLE as readonly string[]).includes(item.order.status)) {
      throw new ApiException(
        409,
        'ORDER_NOT_PRODUCIBLE',
        'Les fichiers ne peuvent être régénérés que pour une commande payée en cours de production.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.ensureJob(tx, item.orderId);
      await tx.$queryRaw`SELECT 1 FROM production_jobs WHERE order_id = ${item.orderId}::uuid FOR UPDATE`;
      await tx.productionJob.updateMany({
        where: { orderId: item.orderId, status: { in: ['failed', 'ready_to_print'] } },
        data: { status: 'queued', error: null },
      });
    });
    await this.queue.enqueue(itemId);
    return { status: 'queued' };
  }

  private async preview(key: string | null, colorHex: string): Promise<Buffer | undefined> {
    if (!key) return undefined;
    try {
      const png = await this.storage.get(key);
      const art = await sharp(png)
        .resize({ width: 440, withoutEnlargement: true })
        .png()
        .toBuffer();
      const meta = await sharp(art).metadata();
      return await sharp({
        create: {
          width: meta.width ?? 1,
          height: meta.height ?? 1,
          channels: 4,
          background: colorHex,
        },
      })
        .composite([{ input: art }])
        .png()
        .toBuffer();
    } catch {
      return undefined;
    }
  }

  async productionSheet(orderId: string): Promise<{ number: string; pdf: Buffer }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { color: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        delivery: { select: { scheduledFor: true } },
      },
    });
    if (!order) throw notFound('Commande');
    const job = await this.prisma.productionJob.findUnique({ where: { orderId } });
    const operator = job?.operatorId
      ? await this.prisma.adminUser.findUnique({
          where: { id: job.operatorId },
          select: { name: true, email: true },
        })
      : null;
    const snapshot = order.receptionSnapshot as {
      type?: string;
      store?: { name?: string };
      slot?: { startsAt?: string };
      address?: { district?: string };
    };
    const promisedAt =
      order.delivery?.scheduledFor ??
      (snapshot.slot?.startsAt ? new Date(snapshot.slot.startsAt) : null);
    const receptionLabel =
      snapshot.type === 'pickup'
        ? `Retrait en boutique (${snapshot.store?.name ?? 'boutique'})` +
          (snapshot.slot?.startsAt ? ` — ${formatLome(snapshot.slot.startsAt)}` : '')
        : `Livraison à domicile${snapshot.address?.district ? ` (${snapshot.address.district})` : ''}`;

    const items: SheetItem[] = [];
    let index = 0;
    for (const i of order.items) {
      index++;
      const spec = i.designSnapshot as unknown as DesignSpec;
      items.push({
        index,
        colorName: i.color.name,
        colorHex: i.color.hex,
        size: i.size,
        quantity: i.quantity,
        hasFront: (spec.zones.front?.layers.length ?? 0) > 0,
        hasBack: (spec.zones.back?.layers.length ?? 0) > 0,
        front: await this.preview(i.printFileFrontUrl, i.color.hex),
        back: await this.preview(i.printFileBackUrl, i.color.hex),
      });
    }
    const pdf = await renderProductionSheet({
      number: order.number,
      createdAt: order.createdAt,
      promisedAt,
      receptionLabel,
      operatorLabel: operator ? (operator.name ?? operator.email) : null,
      items,
    });
    return { number: order.number, pdf };
  }
}
