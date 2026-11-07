import type { Size } from '@streetwear/shared';

/** Fournie par SP04 (`StockService` : disponible = on_hand − reserved > 0). */
export interface StockReader {
  availableBySize(colorId: string): Promise<Record<Size, boolean>>;
}
export const STOCK_READER = Symbol('STOCK_READER');
