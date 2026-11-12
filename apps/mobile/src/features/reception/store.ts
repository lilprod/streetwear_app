import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { Address, DeliveryZoneSummary, PickupSlot, Quote, Store } from '@streetwear/shared';

export type ReceptionChoice =
  | { type: 'home'; address: Address; zone: DeliveryZoneSummary }
  | { type: 'pickup'; store: Store; slot: PickupSlot };

export type CheckoutState = {
  reception: ReceptionChoice | null;
  quote: Quote | null;
  /** Mode demandé par l'écran Paiement quand il renvoie vers la réception (ex. créneau complet). */
  preferredMode: 'home' | 'pickup' | null;
};

const initial: CheckoutState = { reception: null, quote: null, preferredMode: null };

export const checkoutStore = createStore<CheckoutState>(() => initial);
export const useCheckout = <T>(selector: (s: CheckoutState) => T): T =>
  useStore(checkoutStore, selector);
export const setCheckout = (patch: Partial<CheckoutState>): void => checkoutStore.setState(patch);
export const resetCheckout = (): void => checkoutStore.setState(initial, true);
