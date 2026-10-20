import { Injectable } from '@nestjs/common';
import { SIZES, type Size } from '@streetwear/shared';

/** Fournie par SP04 (stock réel : disponible = on_hand − reserved). */
export interface StockReader {
  availableBySize(colorId: string): Promise<Record<Size, boolean>>;
}
export const STOCK_READER = Symbol('STOCK_READER');

@Injectable()
export class AllAvailableStockReader implements StockReader {
  availableBySize(): Promise<Record<Size, boolean>> {
    return Promise.resolve(
      Object.fromEntries(SIZES.map((s) => [s, true])) as Record<Size, boolean>,
    );
  }
}
