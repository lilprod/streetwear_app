import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError, type ApiClient } from '../../api/types';
import { sessionStore } from '../../auth/session';
import { setApiForTests } from '../../api';
import { getTokenStore, setTokenStoreForTests } from '../../auth/tokens';
import { AccountScreen } from '../auth/AccountScreen';
import { memoryStorage, resetMemoryStorage, resetRouter, routerMock } from '../../../tests/mocks';
import { signedInApi } from '../../../tests/signedIn';
import { recordCode } from '../notifications/codes';
import { AddressesScreen } from './AddressesScreen';
import { DeleteAccountScreen } from './DeleteAccountScreen';
import { LegalScreen } from './LegalScreen';
import { ProfileScreen } from './ProfileScreen';

jest.setTimeout(20_000);

let api: ApiClient;

beforeEach(async () => {
  resetMemoryStorage();
  resetRouter();
  process.env.EXPO_PUBLIC_MAPS_ENABLED = 'false';
  ({ api } = await signedInApi({}, false));
});
afterAll(() => {
  setApiForTests(null);
  setTokenStoreForTests(null);
  sessionStore.setState({ status: 'anonymous', user: null });
});

describe('Account menu', () => {
  it('links to profile, addresses, designs, orders, legal texts and deletion', async () => {
    await render(<AccountScreen />);
    for (const [label, route] of [
      ['Mon profil', '/account/profile'],
      ['Mes adresses', '/account/addresses'],
      ['Mes designs', '/designs'],
      ['Mes commandes', '/orders'],
      ['Mentions légales', '/account/legal'],
      ['Conditions générales de vente', '/account/terms'],
      ['Supprimer mon compte', '/account/delete'],
    ] as const) {
      await fireEvent.press(screen.getByRole('button', { name: label }));
      expect(routerMock.push).toHaveBeenCalledWith(route);
    }
  });

  it('shows only the legal links to a guest', async () => {
    sessionStore.setState({ status: 'anonymous', user: null });
    await render(<AccountScreen />);
    expect(screen.queryByRole('button', { name: 'Mes adresses' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer mon compte' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mentions légales' })).toBeTruthy();
  });
});

describe('Profile', () => {
  it('saves the name and the email, validating the email first', async () => {
    await render(<ProfileScreen />);
    await fireEvent.changeText(screen.getByLabelText('Nom'), 'Ama Koffi');
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'pas-un-mail');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Cet e-mail ne semble pas valide.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'ama@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Profil enregistré.')).toBeTruthy();
    expect(sessionStore.getState().user).toMatchObject({
      name: 'Ama Koffi',
      email: 'ama@example.com',
    });
    expect(screen.getByText('+228 90 12 34 56')).toBeTruthy();
  });
});

describe('Addresses', () => {
  const input = {
    label: 'Maison',
    lat: 6.1725,
    lng: 1.2314,
    district: 'Tokoin',
    landmark: 'Portail bleu',
    recipientPhone: '+22890123456',
  };

  it('shows the empty state, then adds an address', async () => {
    await render(<AddressesScreen />);
    expect(await screen.findByText('Aucune adresse')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter une adresse' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tokoin' }));
    await fireEvent.changeText(screen.getByLabelText(/Repère/), 'Près du marché');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer l’adresse' }));
    expect(await screen.findByText('Tokoin, Près du marché')).toBeTruthy();
    expect(await api.listAddresses()).toHaveLength(1);
  });

  it('asks for confirmation before deleting', async () => {
    const saved = await api.createAddress(input);
    await render(<AddressesScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Supprimer l’adresse Maison' }),
    );
    expect(await api.listAddresses()).toHaveLength(1);
    expect(screen.getByText('Supprimer cette adresse ?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Oui, supprimer' }));
    expect(await screen.findByText('Aucune adresse')).toBeTruthy();
    expect(await api.listAddresses()).toEqual([]);
    expect(saved.id).toBeTruthy();
  });

  it('edits an address', async () => {
    await api.createAddress(input);
    await render(<AddressesScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Modifier l’adresse Maison' }));
    await fireEvent.changeText(screen.getByLabelText(/Repère/), 'Derrière la pharmacie');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer l’adresse' }));
    expect(await screen.findByText('Tokoin, Derrière la pharmacie')).toBeTruthy();
  });

  it('shows an error with a retry and an offline state', async () => {
    jest.spyOn(api, 'listAddresses').mockRejectedValueOnce(new ApiError('NETWORK', 'x'));
    await render(<AddressesScreen />);
    expect(await screen.findByText('Tu es hors ligne')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucune adresse')).toBeTruthy();
  });
});

describe('Account deletion', () => {
  it('keeps the button disabled until the word is typed', async () => {
    const del = jest.spyOn(api, 'deleteMe');
    await render(<DeleteAccountScreen />);
    const button = () =>
      screen.getByRole('button', { name: 'Supprimer définitivement mon compte' });
    expect(button().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.changeText(screen.getByLabelText('Écris SUPPRIMER pour confirmer'), 'supprim');
    expect(button().props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button());
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes the account, wipes local traces and signs out', async () => {
    recordCode(memoryStorage(), {
      orderId: 'o',
      status: 'shipped',
      code: '123456',
      receivedAt: '2026-11-23T10:00:00Z',
    });
    const del = jest.spyOn(api, 'deleteMe');
    await render(<DeleteAccountScreen />);
    await fireEvent.changeText(
      screen.getByLabelText('Écris SUPPRIMER pour confirmer'),
      'supprimer',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Supprimer définitivement mon compte' }),
    );
    await waitFor(() => expect(sessionStore.getState().status).toBe('anonymous'));
    expect(del).toHaveBeenCalledTimes(1);
    expect(await getTokenStore().get()).toBeNull();
    expect(memoryStorage().getString('order-codes')).toBeUndefined();
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'));
  });

  it('keeps the session when the deletion fails', async () => {
    jest.spyOn(api, 'deleteMe').mockRejectedValue(new ApiError('NETWORK', 'x'));
    await render(<DeleteAccountScreen />);
    await fireEvent.changeText(
      screen.getByLabelText('Écris SUPPRIMER pour confirmer'),
      'SUPPRIMER',
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Supprimer définitivement mon compte' }),
    );
    expect(await screen.findByText('Suppression impossible. Réessaie.')).toBeTruthy();
    expect(sessionStore.getState().status).toBe('authenticated');
  });
});

describe('Legal texts', () => {
  it.each([
    ['mentions', 'Mentions légales'],
    ['terms', 'Conditions générales de vente'],
  ] as const)('%s are marked as provisional', async (kind, title) => {
    await render(<LegalScreen kind={kind} />);
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.getByText('Texte provisoire, à remplacer avant la publication.')).toBeTruthy();
  });
});
