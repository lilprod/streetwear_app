import { Injectable } from '@nestjs/common';
import type { CartItem as CartItemRow, Design as DesignRow, Prisma } from '@prisma/client';
import {
  CART_LINE_MAX_QUANTITY,
  computeCartTotals,
  computeCodDepositXof,
  type AddCartItemInput,
  type Cart,
  type CartItem,
  type DesignSpec,
  type Quote,
  type ReceptionInput,
  type UpdateCartItemInput,
} from '@streetwear/shared';
import { ApiException, notFound } from '../../common/api-exception';
import { uuidv7 } from '../../common/uuid';
import { DesignsService } from '../../designs/designs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryService } from '../delivery/delivery.service';
import { SettingsService } from '../settings/settings.service';
import { StockService, stockKey } from '../stock/stock.service';

export type CartLineRow = CartItemRow & { design: DesignRow };

const tooMany = (): ApiException =>
  new ApiException(
    400,
    'VALIDATION_FAILED',
    `${CART_LINE_MAX_QUANTITY} pièces maximum par ligne.`,
    {
      fieldErrors: { quantity: [`${CART_LINE_MAX_QUANTITY} pièces maximum par ligne.`] },
    },
  );

export const emptyCart = (): ApiException =>
  new ApiException(400, 'VALIDATION_FAILED', 'Ton panier est vide.');

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly designs: DesignsService,
    private readonly stock: StockService,
    private readonly delivery: DeliveryService,
    private readonly settings: SettingsService,
  ) {}

  private async cartId(userId: string): Promise<string> {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { id: uuidv7(), userId },
      update: {},
      select: { id: true },
    });
    return cart.id;
  }

  async lines(userId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    return db.cartItem.findMany({
      where: { cart: { userId } },
      include: { design: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async get(userId: string): Promise<Cart> {
    const rows = await this.lines(userId);
    if (rows.length === 0) return { items: [], subtotalXof: 0, itemCount: 0 };
    const designs = await this.designs.toDtos(rows.map((r) => r.design));
    const colorOf = (r: CartLineRow) => (r.design.spec as unknown as DesignSpec).colorId;
    const demand = new Map<string, number>();
    for (const r of rows) {
      const k = stockKey(colorOf(r), r.size);
      demand.set(k, (demand.get(k) ?? 0) + r.quantity);
    }
    const available = await this.stock.availability(
      rows.map((r) => ({ colorId: colorOf(r), size: r.size })),
    );
    const items: CartItem[] = rows.map((r, i) => {
      const design = designs[i] as CartItem['design'];
      const k = stockKey(colorOf(r), r.size);
      return {
        id: r.id,
        design,
        size: r.size as CartItem['size'],
        quantity: r.quantity,
        unitPriceXof: design.unitPriceXof,
        lineTotalXof: design.unitPriceXof * r.quantity,
        available: (available.get(k) ?? 0) >= (demand.get(k) ?? 0),
      };
    });
    const totals = computeCartTotals(items, 0);
    return { items, subtotalXof: totals.subtotalXof, itemCount: totals.itemCount };
  }

  async add(userId: string, input: AddCartItemInput): Promise<Cart> {
    const design = await this.prisma.design.findFirst({ where: { id: input.designId, userId } });
    if (!design) throw notFound('Design');
    await this.addLines(userId, [input], false);
    return this.get(userId);
  }

  /** Ajoute des lignes en fusionnant même design + même taille ; `cap` plafonne à 50 au lieu de refuser. */
  async addLines(
    userId: string,
    lines: readonly { designId: string; size: string; quantity: number }[],
    cap: boolean,
  ): Promise<void> {
    const cartId = await this.cartId(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
      for (const l of lines) {
        const existing = await tx.cartItem.findUnique({
          where: { cartId_designId_size: { cartId, designId: l.designId, size: l.size } },
        });
        let quantity = (existing?.quantity ?? 0) + l.quantity;
        if (quantity > CART_LINE_MAX_QUANTITY) {
          if (!cap) throw tooMany();
          quantity = CART_LINE_MAX_QUANTITY;
        }
        if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity } });
        else
          await tx.cartItem.create({
            data: { id: uuidv7(), cartId, designId: l.designId, size: l.size, quantity },
          });
      }
      await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    });
  }

  async update(userId: string, itemId: string, input: UpdateCartItemInput): Promise<Cart> {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
      if (!item) throw notFound('Ligne du panier');
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${item.cartId}::uuid FOR UPDATE`;
      const size = input.size ?? item.size;
      const quantity = input.quantity ?? item.quantity;
      if (size !== item.size) {
        const twin = await tx.cartItem.findUnique({
          where: { cartId_designId_size: { cartId: item.cartId, designId: item.designId, size } },
        });
        if (twin) {
          const merged = twin.quantity + quantity;
          if (merged > CART_LINE_MAX_QUANTITY) throw tooMany();
          await tx.cartItem.delete({ where: { id: item.id } });
          await tx.cartItem.update({ where: { id: twin.id }, data: { quantity: merged } });
          return;
        }
      }
      await tx.cartItem.update({ where: { id: item.id }, data: { size, quantity } });
    });
    return this.get(userId);
  }

  async remove(userId: string, itemId: string): Promise<Cart> {
    const { count } = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cart: { userId } },
    });
    if (count === 0) throw notFound('Ligne du panier');
    return this.get(userId);
  }

  async quote(userId: string, reception: ReceptionInput, now = new Date()): Promise<Quote> {
    const cart = await this.get(userId);
    if (cart.items.length === 0) throw emptyCart();
    const r = await this.delivery.quote(reception, userId, now);
    const totals = computeCartTotals(cart.items, r.deliveryFeeXof);
    const percent = await this.settings.get('cod_deposit_percent');
    return {
      subtotalXof: totals.subtotalXof,
      deliveryFeeXof: totals.deliveryFeeXof,
      totalXof: totals.totalXof,
      vatIncludedXof: totals.vatIncludedXof,
      codDepositXof: computeCodDepositXof(totals.totalXof, percent),
      estimatedReadyAt: r.estimatedReadyAt,
      estimatedDeliveryAt: r.estimatedDeliveryAt,
    };
  }
}
