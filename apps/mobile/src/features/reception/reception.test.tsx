import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FIXTURE_STORE } from '@streetwear/shared';
import { ApiError, type ApiClient } from '../../api/types';
import { sessionStore } from '../../auth/session';
import { setApiForTests } from '../../api';
import { setTokenStoreForTests } from '../../auth/tokens';
import { mapMarker, resetMemoryStorage, resetRouter, routerMock } from '../../../tests/mocks';
import { signedInApi } from '../../../tests/signedIn';
import { AddressEditor } from './AddressEditor';
import { ReceptionScreen } from './ReceptionScreen';
import { QUARTIERS, emptyAddressDraft, pickupDays, validateAddress } from './logic';
import { checkoutStore, resetCheckout } from './store';

jest.setTimeout(20_000);

let api: ApiClient;

beforeEach(async () => {
  resetMemoryStorage();
  resetRouter();
  resetCheckout();
  process.env.EXPO_PUBLIC_MAPS_ENABLED = 'false';
  ({ api } = await signedInApi());
});
afterAll(() => {
  setApiForTests(null);
  setTokenStoreForTests(null);
  sessionStore.setState({ status: 'anonymous', user: null });
});

describe('address validation and helpers', () => {
  it('requires a district, a landmark and a valid Togolese phone', () => {
    const empty = validateAddress(emptyAddressDraft('', true));
    expect(empty).toMatchObject({ ok: false });
    const ok = validateAddress({
      ...emptyAddressDraft('+22890123456', true),
      district: 'Tokoin',
      landmark: 'Près du marché',
    });
    expect(ok).toMatchObject({ ok: true, input: { recipientPhone: '+22890123456' } });
  });

  it('lists the next 7 pickup days in Africa/Lome', () => {
    const days = pickupDays(new Date('2026-11-23T23:30:00Z'));
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe('2026-11-23');
    expect(days[6]?.date).toBe('2026-11-29');
  });
});

describe('Reception screen, delivery without map (degraded mode)', () => {
  it('resolves the zone live, saves the address, quotes and opens the payment', async () => {
    await render(<ReceptionScreen />);
    expect(screen.getByText(/La carte n’est pas disponible/)).toBeTruthy();
    const first = QUARTIERS[0];
    await fireEvent.press(screen.getByRole('button', { name: first?.name ?? '' }));
    expect(await screen.findByText(/Zone : Lomé centre/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText(/Livraison 1\s000\sFCFA/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(/Repère/), 'Près du marché');
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer vers le paiement' }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/purchase/payment'));
    const { reception, quote } = checkoutStore.getState();
    expect(reception).toMatchObject({ type: 'home', zone: { name: 'Lomé centre' } });
    expect(quote?.deliveryFeeXof).toBe(1000);
    expect(await api.listAddresses()).toHaveLength(1);
  });

  it('asks for a landmark before continuing', async () => {
    await render(<ReceptionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: QUARTIERS[0]?.name ?? '' }));
    await screen.findByText(/Zone : /, {}, { timeout: 3000 });
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer vers le paiement' }));
    expect(await screen.findByText('Ajoute un repère pour le livreur.')).toBeTruthy();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('offers the pickup when the point is out of zone, then lets the user choose a slot', async () => {
    jest.spyOn(api, 'resolveZone').mockResolvedValue(null);
    await render(<ReceptionScreen />);
    await fireEvent.press(screen.getByRole('button', { name: QUARTIERS[0]?.name ?? '' }));
    expect(
      await screen.findByText(/On ne livre pas encore à cet endroit/, {}, { timeout: 3000 }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Continuer vers le paiement' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Choisir le retrait en boutique' }));
    expect(await screen.findByText(FIXTURE_STORE.name)).toBeTruthy();
    expect(screen.getByText('lun-sam : 09:00-19:00')).toBeTruthy();
    const slots = await screen.findAllByRole('button', { name: /places? restantes?/ });
    expect(slots.length).toBeGreaterThan(0);
    await fireEvent.press(slots[0] as (typeof slots)[number]);
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer vers le paiement' }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/purchase/payment'));
    const { reception, quote } = checkoutStore.getState();
    expect(reception?.type).toBe('pickup');
    expect(quote?.deliveryFeeXof).toBe(0);
  });

  it('handles SLOT_FULL: message, refreshed slots, no navigation', async () => {
    jest.spyOn(api, 'quoteCart').mockRejectedValue(new ApiError('SLOT_FULL', 'Complet', 409));
    const list = jest.spyOn(api, 'listSlots');
    await render(<ReceptionScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Retrait en boutique' }));
    const slots = await screen.findAllByRole('button', { name: /places? restantes?/ });
    await fireEvent.press(slots[0] as (typeof slots)[number]);
    const calls = list.mock.calls.length;
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer vers le paiement' }));
    expect(
      await screen.findByText('Ce créneau vient d’être pris. Choisis-en un autre.'),
    ).toBeTruthy();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(calls));
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it('shows the offline state with a retry when the store cannot be loaded', async () => {
    jest.spyOn(api, 'listStores').mockRejectedValueOnce(new ApiError('NETWORK', 'x'));
    await render(<ReceptionScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Retrait en boutique' }));
    expect(await screen.findByText('Tu es hors ligne')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(FIXTURE_STORE.name)).toBeTruthy();
  });

  it('reuses a saved address', async () => {
    const saved = await api.createAddress({
      label: 'Maison',
      lat: 6.1725,
      lng: 1.2314,
      district: 'Tokoin',
      landmark: 'Portail bleu',
      recipientPhone: '+22890123456',
    });
    await render(<ReceptionScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Maison · Tokoin' }));
    await screen.findByText(/Zone : /, {}, { timeout: 3000 });
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer vers le paiement' }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/purchase/payment'));
    expect(await api.listAddresses()).toHaveLength(1);
    expect(checkoutStore.getState().reception).toMatchObject({ address: { id: saved.id } });
  });
});

describe('Address editor with the map enabled', () => {
  it('moves the point by dragging the marker and by the keyboard-friendly buttons', async () => {
    process.env.EXPO_PUBLIC_MAPS_ENABLED = 'true';
    const changes: { lat: number; lng: number }[] = [];
    const Harness = () => {
      const [draft, setDraft] = useState(emptyAddressDraft('', true));
      changes.push({ lat: draft.lat, lng: draft.lng });
      return <AddressEditor draft={draft} onChange={setDraft} />;
    };
    await render(<Harness />);
    expect(await screen.findByTestId('map')).toBeTruthy();
    const before = changes[changes.length - 1];
    await fireEvent.press(screen.getByRole('button', { name: 'Déplacer le point vers le nord' }));
    const after = changes[changes.length - 1];
    expect((after?.lat ?? 0) > (before?.lat ?? 0)).toBe(true);
    await act(async () => {
      mapMarker.current?.onDragEnd?.({
        nativeEvent: { coordinate: { latitude: 6.2, longitude: 1.3 } },
      });
    });
    expect(changes[changes.length - 1]).toEqual({ lat: 6.2, lng: 1.3 });
  });
});
