import { SizeSchema, type Size } from '@streetwear/shared';
import type { KeyValueStorage } from '../../storage/storage';

/** Ligne de panier d'un visiteur non connecté ; envoyée à l'API à la connexion. */
export type GuestLine = {
  id: string;
  draftLocalId: string;
  name: string | null;
  colorHex: string;
  size: Size;
  quantity: number;
  unitPriceXof: number;
};

const KEY = 'cart:guest';
export const MAX_LINE_QUANTITY = 50;

export type GuestCart = ReturnType<typeof createGuestCart>;

export function createGuestCart(storage: Pick<KeyValueStorage, 'getString' | 'set' | 'remove'>) {
  const read = (): GuestLine[] => {
    const raw = storage.getString(KEY);
    if (!raw) return [];
    try {
      const data = JSON.parse(raw) as GuestLine[];
      return data.filter(
        (l) =>
          SizeSchema.safeParse(l.size).success &&
          Number.isInteger(l.quantity) &&
          Number.isInteger(l.unitPriceXof),
      );
    } catch {
      return [];
    }
  };
  const write = (lines: GuestLine[]) =>
    lines.length ? storage.set(KEY, JSON.stringify(lines)) : storage.remove(KEY);

  return {
    list: read,
    /** Même design et même taille : les quantités s'additionnent (plafond 50). */
    add(line: Omit<GuestLine, 'id'>): GuestLine[] {
      const lines = read();
      const twin = lines.find((l) => l.draftLocalId === line.draftLocalId && l.size === line.size);
      if (twin) {
        twin.quantity = Math.min(MAX_LINE_QUANTITY, twin.quantity + line.quantity);
        twin.unitPriceXof = line.unitPriceXof;
      } else {
        lines.push({ ...line, id: `g-${line.draftLocalId}-${line.size}` });
      }
      write(lines);
      return lines;
    },
    setQuantity(id: string, quantity: number): GuestLine[] {
      const lines = read().map((l) =>
        l.id === id ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, Math.max(1, quantity)) } : l,
      );
      write(lines);
      return lines;
    },
    remove(id: string): GuestLine[] {
      const lines = read().filter((l) => l.id !== id);
      write(lines);
      return lines;
    },
    clear: () => storage.remove(KEY),
  };
}
