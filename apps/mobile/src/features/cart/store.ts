import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Size } from '@streetwear/shared';
import { getApi } from '../../api';
import { ApiError, type ApiClient } from '../../api/types';
import { isAuthenticated } from '../../auth/session';
import { getStorage } from '../../storage';
import { createDraftsRepo, type DraftsRepo } from '../studio/drafts';
import { createGuestCart, type GuestCart } from './guestCart';
import {
  ensureServerDesign,
  mergeGuestCart,
  viewFromGuest,
  viewFromServer,
  type CartView,
} from './purchase';

export type CartDeps = {
  api: ApiClient;
  guest: GuestCart;
  repo: DraftsRepo;
  isAuth: () => boolean;
};

export function defaultCartDeps(): CartDeps {
  const storage = getStorage();
  return {
    api: getApi(),
    guest: createGuestCart(storage),
    repo: createDraftsRepo(storage),
    isAuth: isAuthenticated,
  };
}

export type CartState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  offline: boolean;
  view: CartView;
  busyId: string | null;
  actionFailed: boolean;
  mergeFailed: boolean;
};

const emptyView: CartView = { lines: [], subtotalXof: 0, itemCount: 0 };
const initial: CartState = {
  status: 'idle',
  offline: false,
  view: emptyView,
  busyId: null,
  actionFailed: false,
  mergeFailed: false,
};

export const cartStore = createStore<CartState>(() => initial);
export const useCart = <T>(selector: (s: CartState) => T): T => useStore(cartStore, selector);
export const resetCartStore = (): void => cartStore.setState(initial, true);

const set = (patch: Partial<CartState>) => cartStore.setState(patch);

export async function loadCart(deps: CartDeps = defaultCartDeps()): Promise<void> {
  if (!deps.isAuth()) {
    set({ status: 'ready', offline: false, view: viewFromGuest(deps.guest.list()) });
    return;
  }
  set({ status: 'loading' });
  try {
    set({ status: 'ready', offline: false, view: viewFromServer(await deps.api.getCart()) });
  } catch (e) {
    set({ status: 'error', offline: e instanceof ApiError && e.isNetwork });
  }
}

export async function changeQuantity(
  id: string,
  quantity: number,
  deps: CartDeps = defaultCartDeps(),
): Promise<void> {
  set({ busyId: id, actionFailed: false });
  try {
    if (deps.isAuth()) {
      const cart = await deps.api.updateCartItem(id, { quantity });
      set({ view: viewFromServer(cart) });
    } else {
      set({ view: viewFromGuest(deps.guest.setQuantity(id, quantity)) });
    }
  } catch {
    set({ actionFailed: true });
  } finally {
    set({ busyId: null });
  }
}

export async function removeLine(id: string, deps: CartDeps = defaultCartDeps()): Promise<void> {
  set({ busyId: id, actionFailed: false });
  try {
    if (deps.isAuth()) set({ view: viewFromServer(await deps.api.removeCartItem(id)) });
    else set({ view: viewFromGuest(deps.guest.remove(id)) });
  } catch {
    set({ actionFailed: true });
  } finally {
    set({ busyId: null });
  }
}

export type NewLine = {
  draftLocalId: string;
  name: string | null;
  colorHex: string;
  size: Size;
  quantity: number;
  unitPriceXof: number;
};

/** Ajoute une ligne : panier du compte si connecté, panier local sinon. Lève ApiError en cas d'échec. */
export async function addLine(line: NewLine, deps: CartDeps = defaultCartDeps()): Promise<void> {
  if (deps.isAuth()) {
    const designId = await ensureServerDesign(deps.api, deps.repo, line.draftLocalId);
    const cart = await deps.api.addCartItem({
      designId,
      size: line.size,
      quantity: line.quantity,
    });
    set({ status: 'ready', offline: false, view: viewFromServer(cart) });
  } else {
    set({ status: 'ready', offline: false, view: viewFromGuest(deps.guest.add(line)) });
  }
}

/** Après la connexion : le panier local rejoint le compte, puis le panier du compte est chargé. */
export async function syncGuestCartToAccount(deps: CartDeps = defaultCartDeps()): Promise<boolean> {
  set({ mergeFailed: false });
  try {
    await mergeGuestCart(deps.api, deps.repo, deps.guest);
  } catch {
    set({ mergeFailed: true });
    await loadCart(deps);
    return false;
  }
  await loadCart(deps);
  return true;
}
