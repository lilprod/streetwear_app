import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type StockMovementType } from '@prisma/client';
import { SIZES, type Size, type StockMovementInput } from '@streetwear/shared';
import { ApiException, notFound } from '../../common/api-exception';
import { EVENTS, type PendingEvent, type StockBelowThresholdEvent } from '../../common/events';
import { uuidv7 } from '../../common/uuid';
import type { StockReader } from '../../catalog/stock-reader';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface StockLine {
  colorId: string;
  size: string;
  quantity: number;
}

export interface StockShortage {
  colorId: string;
  size: string;
  requested: number;
  available: number;
}

type LockedRow = {
  id: string;
  color_id: string;
  size: string;
  on_hand: number;
  reserved: number;
  alert_threshold: number;
};

export interface AdminStockItem {
  id: string;
  colorId: string;
  colorName: string;
  size: string;
  onHand: number;
  reserved: number;
  available: number;
  alertThreshold: number;
  belowThreshold: boolean;
}

export const stockKey = (colorId: string, size: string): string => `${colorId}|${size}`;

const SIZE_ORDER = new Map<string, number>(SIZES.map((s, i) => [s, i]));

/** Regroupe les lignes par (couleur, taille). */
export function aggregate(lines: readonly StockLine[]): StockLine[] {
  const byKey = new Map<string, StockLine>();
  for (const l of lines) {
    const k = stockKey(l.colorId, l.size);
    const cur = byKey.get(k);
    if (cur) cur.quantity += l.quantity;
    else byKey.set(k, { ...l });
  }
  return [...byKey.values()];
}

@Injectable()
export class StockService implements StockReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async availableBySize(colorId: string): Promise<Record<Size, boolean>> {
    const rows = await this.prisma.stockItem.findMany({ where: { colorId } });
    const out = Object.fromEntries(SIZES.map((s) => [s, false])) as Record<Size, boolean>;
    for (const r of rows) if (r.onHand - r.reserved > 0) out[r.size as Size] = true;
    return out;
  }

  /** Disponible (on_hand − reserved) par clé `couleur|taille`, sans verrou (affichage). */
  async availability(
    keys: readonly { colorId: string; size: string }[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (keys.length === 0) return map;
    const rows = await this.prisma.stockItem.findMany({
      where: { OR: keys.map((k) => ({ colorId: k.colorId, size: k.size })) },
    });
    for (const r of rows) map.set(stockKey(r.colorId, r.size), r.onHand - r.reserved);
    return map;
  }

  /** Verrouille les lignes de stock (ordre stable, évite les interblocages). */
  private async lock(tx: Tx, keys: readonly { colorId: string; size: string }[]) {
    if (keys.length === 0) return new Map<string, LockedRow>();
    const tuples = Prisma.join(keys.map((k) => Prisma.sql`(${k.colorId}, ${k.size})`));
    const rows = await tx.$queryRaw<LockedRow[]>`
      SELECT id::text, color_id, size, on_hand, reserved, alert_threshold FROM stock_items
      WHERE (color_id, size) IN (${tuples}) ORDER BY id FOR UPDATE`;
    return new Map(rows.map((r) => [stockKey(r.color_id, r.size), r]));
  }

  private async lockById(tx: Tx, ids: string[]): Promise<LockedRow[]> {
    if (ids.length === 0) return [];
    return tx.$queryRaw<LockedRow[]>`
      SELECT id::text, color_id, size, on_hand, reserved, alert_threshold FROM stock_items
      WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`;
  }

  private alertIfCrossed(row: LockedRow, onHand: number, reserved: number, out: PendingEvent[]) {
    const before = row.on_hand - row.reserved;
    const after = onHand - reserved;
    if (before >= row.alert_threshold && after < row.alert_threshold) {
      const payload: StockBelowThresholdEvent = {
        stockItemId: row.id,
        colorId: row.color_id,
        size: row.size,
        available: after,
        alertThreshold: row.alert_threshold,
      };
      out.push({ name: EVENTS.stockBelowThreshold, payload });
    }
  }

  private async apply(
    tx: Tx,
    row: LockedRow,
    delta: { onHand: number; reserved: number },
    movement: {
      type: StockMovementType;
      quantity: number;
      orderId?: string;
      adminUserId?: string;
      note?: string;
    },
    events: PendingEvent[],
  ): Promise<LockedRow> {
    const onHand = row.on_hand + delta.onHand;
    const reserved = row.reserved + delta.reserved;
    await tx.stockItem.update({ where: { id: row.id }, data: { onHand, reserved } });
    await tx.stockMovement.create({
      data: {
        id: uuidv7(),
        stockItemId: row.id,
        type: movement.type,
        quantity: movement.quantity,
        orderId: movement.orderId ?? null,
        adminUserId: movement.adminUserId ?? null,
        note: movement.note ?? null,
      },
    });
    this.alertIfCrossed(row, onHand, reserved, events);
    return { ...row, on_hand: onHand, reserved };
  }

  /**
   * Réserve le stock d'une commande (SELECT … FOR UPDATE), dans la transaction de création de
   * commande. Renvoie les ruptures (rien n'est réservé dans ce cas) ; l'appelant lève OUT_OF_STOCK.
   */
  async reserve(
    orderId: string,
    lines: readonly StockLine[],
    tx: Tx,
    events: PendingEvent[],
  ): Promise<StockShortage[]> {
    const wanted = aggregate(lines);
    const locked = await this.lock(tx, wanted);
    const shortages: StockShortage[] = [];
    for (const l of wanted) {
      const row = locked.get(stockKey(l.colorId, l.size));
      const available = row ? row.on_hand - row.reserved : 0;
      if (available < l.quantity)
        shortages.push({ ...l, requested: l.quantity, available: Math.max(available, 0) });
    }
    if (shortages.length > 0) return shortages;
    for (const l of wanted) {
      const row = locked.get(stockKey(l.colorId, l.size)) as LockedRow;
      await this.apply(
        tx,
        row,
        { onHand: 0, reserved: l.quantity },
        { type: 'reserve', quantity: l.quantity, orderId },
        events,
      );
    }
    return [];
  }

  /** Quantités encore réservées (reserve − release − out) par ligne de stock pour une commande. */
  private async netByItem(tx: Tx, orderId: string) {
    const rows = await tx.stockMovement.groupBy({
      by: ['stockItemId', 'type'],
      where: { orderId },
      _sum: { quantity: true },
    });
    const reserved = new Map<string, number>();
    const out = new Map<string, number>();
    for (const r of rows) {
      const q = r._sum.quantity ?? 0;
      const cur = reserved.get(r.stockItemId) ?? 0;
      if (r.type === 'reserve') reserved.set(r.stockItemId, cur + q);
      else if (r.type === 'release' || r.type === 'out') reserved.set(r.stockItemId, cur - q);
      if (r.type === 'out') out.set(r.stockItemId, (out.get(r.stockItemId) ?? 0) + q);
      if (r.type === 'adjust') out.set(r.stockItemId, (out.get(r.stockItemId) ?? 0) - q);
    }
    return { reserved, out };
  }

  /** Libère la réservation restante d'une commande (expiration, annulation) ; idempotent. */
  async releaseOrder(orderId: string, tx: Tx, events: PendingEvent[]): Promise<void> {
    const { reserved } = await this.netByItem(tx, orderId);
    const ids = [...reserved].filter(([, q]) => q > 0).map(([id]) => id);
    for (const row of await this.lockById(tx, ids)) {
      const q = reserved.get(row.id) as number;
      await this.apply(
        tx,
        row,
        { onHand: 0, reserved: -q },
        { type: 'release', quantity: q, orderId },
        events,
      );
    }
  }

  /** Paiement confirmé : réservation → sortie (on_hand et reserved diminuent) ; idempotent. */
  async commitOrder(orderId: string, tx: Tx, events: PendingEvent[]): Promise<void> {
    const { reserved } = await this.netByItem(tx, orderId);
    const ids = [...reserved].filter(([, q]) => q > 0).map(([id]) => id);
    for (const row of await this.lockById(tx, ids)) {
      const q = reserved.get(row.id) as number;
      await this.apply(
        tx,
        row,
        { onHand: -q, reserved: -q },
        { type: 'out', quantity: q, orderId },
        events,
      );
    }
  }

  /** Annulation après paiement (avant production) : les pièces sorties reviennent en stock (ajustement). */
  async restockOrder(orderId: string, tx: Tx, events: PendingEvent[], adminUserId?: string) {
    await this.releaseOrder(orderId, tx, events);
    const { out } = await this.netByItem(tx, orderId);
    const ids = [...out].filter(([, q]) => q > 0).map(([id]) => id);
    for (const row of await this.lockById(tx, ids)) {
      const q = out.get(row.id) as number;
      await this.apply(
        tx,
        row,
        { onHand: q, reserved: 0 },
        { type: 'adjust', quantity: q, orderId, adminUserId, note: 'Annulation de commande' },
        events,
      );
    }
  }

  // ---- Back-office ----

  async list(): Promise<AdminStockItem[]> {
    const rows = await this.prisma.stockItem.findMany({ include: { color: true } });
    return rows
      .map((r) => this.toAdmin(r, r.color.name))
      .sort(
        (a, b) =>
          a.colorName.localeCompare(b.colorName, 'fr') ||
          (SIZE_ORDER.get(a.size) ?? 0) - (SIZE_ORDER.get(b.size) ?? 0),
      );
  }

  async move(input: StockMovementInput, adminUserId: string): Promise<AdminStockItem> {
    const color = await this.prisma.tshirtColor.findUnique({ where: { id: input.colorId } });
    if (!color) throw notFound('Couleur');
    const events: PendingEvent[] = [];
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO stock_items (id, color_id, size, on_hand, reserved, alert_threshold, updated_at)
        VALUES (${uuidv7()}::uuid, ${input.colorId}, ${input.size}, 0, 0, 5, now())
        ON CONFLICT (color_id, size) DO NOTHING`;
      const row = (await this.lock(tx, [input])).get(
        stockKey(input.colorId, input.size),
      ) as LockedRow;
      if (row.on_hand + input.quantity < row.reserved) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          'Ajustement impossible : le stock deviendrait inférieur aux pièces réservées.',
          { fieldErrors: { quantity: [`Minimum autorisé : ${row.reserved - row.on_hand}.`] } },
        );
      }
      await this.apply(
        tx,
        row,
        { onHand: input.quantity, reserved: 0 },
        { type: input.type, quantity: input.quantity, adminUserId, note: input.note },
        events,
      );
      return row.id;
    });
    this.emit(events);
    return this.getAdmin(id);
  }

  async setThreshold(id: string, alertThreshold: number): Promise<AdminStockItem> {
    const row = await this.prisma.stockItem.findUnique({ where: { id } });
    if (!row) throw notFound('Article de stock');
    const available = row.onHand - row.reserved;
    await this.prisma.stockItem.update({ where: { id }, data: { alertThreshold } });
    if (available >= row.alertThreshold && available < alertThreshold) {
      const payload: StockBelowThresholdEvent = {
        stockItemId: id,
        colorId: row.colorId,
        size: row.size,
        available,
        alertThreshold,
      };
      this.emit([{ name: EVENTS.stockBelowThreshold, payload }]);
    }
    return this.getAdmin(id);
  }

  async getAdmin(id: string): Promise<AdminStockItem> {
    const row = await this.prisma.stockItem.findUnique({ where: { id }, include: { color: true } });
    if (!row) throw notFound('Article de stock');
    return this.toAdmin(row, row.color.name);
  }

  private toAdmin(
    r: {
      id: string;
      colorId: string;
      size: string;
      onHand: number;
      reserved: number;
      alertThreshold: number;
    },
    colorName: string,
  ): AdminStockItem {
    const available = r.onHand - r.reserved;
    return {
      id: r.id,
      colorId: r.colorId,
      colorName,
      size: r.size,
      onHand: r.onHand,
      reserved: r.reserved,
      available,
      alertThreshold: r.alertThreshold,
      belowThreshold: available < r.alertThreshold,
    };
  }

  emit(events: readonly PendingEvent[]): void {
    for (const e of events) this.events.emit(e.name, e.payload);
  }
}

export const outOfStock = (items: unknown[]): ApiException =>
  new ApiException(
    409,
    'OUT_OF_STOCK',
    'Certaines tailles ne sont plus disponibles dans la quantité demandée.',
    { items },
  );
