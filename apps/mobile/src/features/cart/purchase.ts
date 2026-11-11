import { computeCartTotals, type Cart, type Size } from '@streetwear/shared';
import { ApiError, type ApiClient, type ApiErrorCode } from '../../api/types';
import { t } from '../../i18n/fr';
import type { DraftsRepo } from '../studio/drafts';
import { syncDrafts } from '../studio/sync';
import type { GuestCart, GuestLine } from './guestCart';

/** Garantit que le brouillon existe côté serveur et renvoie l'identifiant du design. */
export async function ensureServerDesign(
  api: ApiClient,
  repo: DraftsRepo,
  localId: string,
): Promise<string> {
  const rec = repo.get(localId);
  if (!rec) throw new ApiError('NOT_FOUND', t('purchase.size.error.noDraft'), 404);
  if (rec.serverId && !rec.dirty) return rec.serverId;
  const res = await syncDrafts(api, repo);
  const next = repo.get(localId);
  if (next?.serverId && !next.dirty) return next.serverId;
  if (res.offline) throw new ApiError('NETWORK', t('api.network'));
  throw new ApiError(
    (next?.syncError as ApiErrorCode | null) ?? 'SERVICE_UNAVAILABLE',
    t('api.unavailable'),
  );
}

export type CartLineView = {
  id: string;
  name: string | null;
  colorHex: string | null;
  previewUrl: string | null;
  size: Size;
  quantity: number;
  unitPriceXof: number;
  lineTotalXof: number;
  available: boolean;
};

export type CartView = { lines: CartLineView[]; subtotalXof: number; itemCount: number };

export function viewFromServer(cart: Cart): CartView {
  return {
    lines: cart.items.map((i) => ({
      id: i.id,
      name: i.design.name,
      colorHex: null,
      previewUrl: i.design.previewFrontUrl,
      size: i.size,
      quantity: i.quantity,
      unitPriceXof: i.unitPriceXof,
      lineTotalXof: i.lineTotalXof,
      available: i.available,
    })),
    subtotalXof: cart.subtotalXof,
    itemCount: cart.itemCount,
  };
}

export function viewFromGuest(lines: GuestLine[]): CartView {
  const totals = computeCartTotals(lines, 0);
  return {
    lines: lines.map((l) => ({
      id: l.id,
      name: l.name,
      colorHex: l.colorHex,
      previewUrl: null,
      size: l.size,
      quantity: l.quantity,
      unitPriceXof: l.unitPriceXof,
      lineTotalXof: l.unitPriceXof * l.quantity,
      available: true,
    })),
    subtotalXof: totals.subtotalXof,
    itemCount: totals.itemCount,
  };
}

/** Envoie les lignes du visiteur vers le panier du compte ; chaque ligne réussie est retirée du local. */
export async function mergeGuestCart(
  api: ApiClient,
  repo: DraftsRepo,
  guest: GuestCart,
): Promise<void> {
  for (const line of guest.list()) {
    const designId = await ensureServerDesign(api, repo, line.draftLocalId);
    await api.addCartItem({ designId, size: line.size, quantity: line.quantity });
    guest.remove(line.id);
  }
}
