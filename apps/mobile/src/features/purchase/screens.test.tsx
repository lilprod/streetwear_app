import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  FIXTURE_PATTERNS,
  FIXTURE_PATTERNS_BY_ID,
  FIXTURE_PRICE_RULES,
  VALID_DESIGNS,
  computeUnitPriceXof,
  formatXof,
  type DesignSpec,
} from '@streetwear/shared';
import { setApiForTests } from '../../api';
import { createMockApi, MOCK_OTP_CODE } from '../../api/mock';
import { ApiError, type ApiClient } from '../../api/types';
import { sessionStore, startSession } from '../../auth/session';
import { createMemoryTokenStore, setTokenStoreForTests } from '../../auth/tokens';
import {
  memoryStorage,
  network,
  resetMemoryStorage,
  resetRouter,
  routeParams,
  routerMock,
} from '../../../tests/mocks';
import { LoginScreen } from '../auth/LoginScreen';
import { AccountScreen } from '../auth/AccountScreen';
import { CartScreen } from '../cart/CartScreen';
import { createGuestCart } from '../cart/guestCart';
import { addLine, resetCartStore } from '../cart/store';
import { HomeScreen } from '../home/HomeScreen';
import { createDraftsRepo } from '../studio/drafts';
import { ConfirmationPlaceholder, PaymentPlaceholder, ReceptionPlaceholder } from './placeholders';
import { SizeScreen } from './SizeScreen';

const spec = VALID_DESIGNS.patternOnly as DesignSpec;
let api: ApiClient;

beforeEach(() => {
  resetMemoryStorage();
  resetCartStore();
  resetRouter();
  network.online = true;
  const tokens = createMemoryTokenStore();
  setTokenStoreForTests(tokens);
  api = createMockApi({ latencyMs: 0, tokens });
  setApiForTests(api);
  sessionStore.setState({ status: 'anonymous', user: null, expired: false });
  createDraftsRepo(memoryStorage()).save({ localId: 'draft-1', spec, name: 'Mon kente' });
});

afterAll(() => {
  setApiForTests(null);
  setTokenStoreForTests(null);
});

async function signedIn() {
  await api.requestOtp('+22890123456');
  const result = await api.verifyOtp('+22890123456', MOCK_OTP_CODE);
  await startSession(result);
}

describe('Size and quantity screen', () => {
  const unit = computeUnitPriceXof(spec, FIXTURE_PRICE_RULES, FIXTURE_PATTERNS_BY_ID);

  it('shows sold-out sizes struck through and unselectable', async () => {
    routeParams.draft = 'draft-1';
    await render(<SizeScreen />);
    const soldOut = await screen.findByRole('button', { name: 'Taille 3XL, épuisée' });
    expect(soldOut.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Épuisé')).toBeTruthy();
    await fireEvent.press(soldOut);
    expect(
      screen.getByRole('button', { name: 'Ajouter au panier' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('shows the unit price and the live total from the shared pricing', async () => {
    routeParams.draft = 'draft-1';
    await render(<SizeScreen />);
    await screen.findByRole('button', { name: 'Taille M' });
    expect(screen.getByLabelText(`Prix unitaire TTC : ${formatXof(unit)}`)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    expect(screen.getByLabelText(`Total TTC : ${formatXof(unit * 3)}`)).toBeTruthy();
  });

  it('keeps the quantity between 1 and 50', async () => {
    routeParams.draft = 'draft-1';
    await render(<SizeScreen />);
    await screen.findByRole('button', { name: 'Taille M' });
    expect(
      screen.getByRole('button', { name: 'Diminuer la quantité' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    for (let i = 0; i < 60; i += 1) {
      await fireEvent.press(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    }
    expect(screen.getByLabelText('Quantité : 50')).toBeTruthy();
    expect(screen.getByText('Maximum 50 par ligne.')).toBeTruthy();
  });

  it('adds the line to the guest cart and opens the cart', async () => {
    routeParams.draft = 'draft-1';
    await render(<SizeScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Taille L' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Ajouter au panier' }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/purchase/cart'));
    expect(createGuestCart(memoryStorage()).list()).toMatchObject([
      { size: 'L', quantity: 2, unitPriceXof: unit, draftLocalId: 'draft-1' },
    ]);
  });

  it('warns when availability cannot be checked offline but still lets the user continue', async () => {
    routeParams.draft = 'draft-1';
    api.getAvailability = () => Promise.reject(new ApiError('NETWORK', 'Pas de connexion.'));
    await render(<SizeScreen />);
    expect(await screen.findByText('Disponibilité non vérifiée, hors ligne.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Taille S' }));
    expect(
      screen.getByRole('button', { name: 'Ajouter au panier' }).props.accessibilityState,
    ).toMatchObject({ disabled: false });
  });

  it('shows an error when the draft does not exist', async () => {
    routeParams.draft = 'inconnu';
    await render(<SizeScreen />);
    expect(await screen.findByText('Ce design est introuvable.')).toBeTruthy();
  });

  it('offers to retry when the catalog cannot be loaded', async () => {
    routeParams.draft = 'draft-1';
    const listPatterns = jest
      .spyOn(api, 'listPatterns')
      .mockRejectedValueOnce(new ApiError('NETWORK', 'Pas de connexion.'));
    await render(<SizeScreen />);
    expect(await screen.findByText('Impossible de charger les tailles.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('button', { name: 'Taille M' })).toBeTruthy();
    listPatterns.mockRestore();
  });
});

describe('Cart screen', () => {
  const guestLine = {
    draftLocalId: 'draft-1',
    name: 'Mon kente',
    colorHex: '#111111',
    size: 'M' as const,
    quantity: 2,
    unitPriceXof: 12000,
  };

  it('shows the empty state with a way to the studio', async () => {
    await render(<CartScreen />);
    expect(await screen.findByText('Ton panier est vide')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Créer un design' }));
    expect(routerMock.navigate).toHaveBeenCalledWith('/studio');
  });

  it('lists guest lines, totals and sends the guest to the login step', async () => {
    await addLine(guestLine);
    await render(<CartScreen />);
    expect(await screen.findByText('Mon kente')).toBeTruthy();
    expect(screen.getByLabelText(`Sous-total : ${formatXof(24000)}`)).toBeTruthy();
    expect(screen.getByText('Tu te connectes avant de payer.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Continuer' }));
    expect(routerMock.push).toHaveBeenCalledWith('/purchase/login?next=reception');
  });

  it('changes the quantity and removes a line', async () => {
    await addLine(guestLine);
    await render(<CartScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Augmenter la quantité' }));
    expect(await screen.findByLabelText(`Sous-total : ${formatXof(36000)}`)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer Mon kente du panier' }));
    expect(await screen.findByText('Ton panier est vide')).toBeTruthy();
  });

  it('flags unavailable lines and blocks the order until they are removed', async () => {
    await signedIn();
    await addLine({ ...guestLine, size: '3XL' });
    await render(<CartScreen />);
    expect(
      await screen.findByText('Indisponible. Retire cette ligne pour continuer.'),
    ).toBeTruthy();
    expect(screen.getByText('Retire les lignes indisponibles pour continuer.')).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Continuer' });
    expect(next.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(next);
    expect(routerMock.push).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Retirer Design sans nom du panier' }),
    );
    expect(await screen.findByText('Ton panier est vide')).toBeTruthy();
  });

  it('goes straight to the reception step when signed in', async () => {
    await signedIn();
    await addLine(guestLine);
    await render(<CartScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Continuer' }));
    expect(routerMock.push).toHaveBeenCalledWith('/purchase/reception');
  });

  it('shows an error with a retry button, then the cart', async () => {
    await signedIn();
    await addLine(guestLine);
    const getCart = jest
      .spyOn(api, 'getCart')
      .mockRejectedValueOnce(new ApiError('SERVICE_UNAVAILABLE', 'Indisponible', 503));
    await render(<CartScreen />);
    expect(await screen.findByText('Impossible de charger ton panier.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Design sans nom')).toBeTruthy();
    getCart.mockRestore();
  });

  it('says so when the phone is offline and the cart cannot load', async () => {
    await signedIn();
    network.online = false;
    jest.spyOn(api, 'getCart').mockRejectedValue(new ApiError('NETWORK', 'Pas de connexion.'));
    await render(<CartScreen />);
    expect(await screen.findByText('Tu es hors ligne')).toBeTruthy();
    expect(
      screen.getByText('Hors ligne. Certaines informations peuvent être anciennes.'),
    ).toBeTruthy();
  });
});

describe('Login screen', () => {
  const typePhone = async () => {
    await fireEvent.changeText(screen.getByLabelText('Numéro de téléphone'), '90123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Recevoir le code' }));
  };

  it('refuses a number that is not 8 digits', async () => {
    await render(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText('Numéro de téléphone'), '9012');
    await fireEvent.press(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(
      screen.getAllByText('Le numéro doit avoir 8 chiffres après +228.').length,
    ).toBeGreaterThan(0);
  });

  it('formats the number while typing and asks for the code', async () => {
    await render(<LoginScreen />);
    await typePhone();
    expect(await screen.findByText('Code à 6 chiffres envoyé au +228 90 12 34 56.')).toBeTruthy();
    const field = screen.getByLabelText('Code à 6 chiffres');
    expect(field.props.textContentType).toBe('oneTimeCode');
    expect(field.props.autoComplete).toBe('sms-otp');
  });

  it('shows OTP_INVALID and lets the user retry', async () => {
    await render(<LoginScreen />);
    await typePhone();
    await fireEvent.changeText(await screen.findByLabelText('Code à 6 chiffres'), '000000');
    expect(await screen.findByText('Code incorrect ou expiré.')).toBeTruthy();
    expect(sessionStore.getState().status).toBe('anonymous');
  });

  it('shows OTP_ATTEMPTS_EXCEEDED after five wrong codes and accepts a new code', async () => {
    await render(<LoginScreen />);
    await typePhone();
    for (let i = 0; i < 5; i += 1) {
      await fireEvent.changeText(await screen.findByLabelText('Code à 6 chiffres'), '000000');
      await waitFor(() => expect(screen.getByLabelText('Code à 6 chiffres').props.value).toBe(''));
    }
    expect(await screen.findByText('Trop d’essais. Demande un nouveau code.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Renvoyer le code' }));
    expect(await screen.findByText('Nouveau code envoyé.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Code à 6 chiffres'), MOCK_OTP_CODE);
    expect(await screen.findByText('Comment t’appelles-tu ?')).toBeTruthy();
  });

  it('signs in, asks for the name, merges the guest cart and continues to reception', async () => {
    routeParams.next = 'reception';
    await addLine({
      draftLocalId: 'draft-1',
      name: 'Mon kente',
      colorHex: '#111111',
      size: 'M',
      quantity: 2,
      unitPriceXof: 12000,
    });
    await render(<LoginScreen />);
    await typePhone();
    await fireEvent.changeText(await screen.findByLabelText('Code à 6 chiffres'), MOCK_OTP_CODE);
    await fireEvent.changeText(await screen.findByLabelText('Nom'), 'Afi');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/purchase/reception'));
    expect(sessionStore.getState()).toMatchObject({ status: 'authenticated' });
    expect(sessionStore.getState().user?.name).toBe('Afi');
    expect(createGuestCart(memoryStorage()).list()).toHaveLength(0);
    expect((await api.getCart()).items).toHaveLength(1);
  });

  it('requires a name and a valid e-mail', async () => {
    await render(<LoginScreen />);
    await typePhone();
    await fireEvent.changeText(await screen.findByLabelText('Code à 6 chiffres'), MOCK_OTP_CODE);
    await fireEvent.press(await screen.findByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Entre ton nom.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Nom'), 'Afi');
    await fireEvent.changeText(screen.getByLabelText('E-mail (facultatif)'), 'oups');
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Cet e-mail ne semble pas valide.')).toBeTruthy();
  });

  it('explains a network failure when sending the code', async () => {
    jest.spyOn(api, 'requestOtp').mockRejectedValue(new ApiError('NETWORK', 'x'));
    await render(<LoginScreen />);
    await typePhone();
    expect(
      await screen.findByText('Pas de connexion. Vérifie ton réseau et réessaie.'),
    ).toBeTruthy();
  });

  it('hides the Google button until a provider is registered', async () => {
    await render(<LoginScreen />);
    expect(screen.queryByRole('button', { name: 'Continuer avec Google' })).toBeNull();
  });
});

describe('Account tab', () => {
  it('invites a guest to sign in and lets a signed-in user sign out', async () => {
    await render(<AccountScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Se connecter' }));
    expect(routerMock.push).toHaveBeenCalledWith('/purchase/login');
    await act(async () => {
      await signedIn();
    });
    expect(await screen.findByText('Connecté : +228 90 12 34 56')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Se déconnecter' }));
    await waitFor(() => expect(sessionStore.getState().status).toBe('anonymous'));
  });

  it('tells the user when the session expired', async () => {
    sessionStore.setState({ expired: true });
    await render(<AccountScreen />);
    expect(screen.getByText('Ta session a expiré. Reconnecte-toi.')).toBeTruthy();
  });
});

describe('Home screen', () => {
  it('shows the featured patterns and opens the studio', async () => {
    await render(<HomeScreen />);
    const first = FIXTURE_PATTERNS[0];
    expect(first).toBeDefined();
    const tile = await screen.findByRole('button', {
      name: new RegExp(`^Motif ${first?.name ?? ''}, origine`),
    });
    await fireEvent.press(tile);
    expect(routerMock.navigate).toHaveBeenCalledWith('/studio');
  });

  it('resumes the last draft', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Reprendre le brouillon Mon kente' }),
    );
    expect(routerMock.navigate).toHaveBeenCalledWith({
      pathname: '/studio',
      params: { draft: 'draft-1' },
    });
  });

  it('offers a retry when the collection cannot load', async () => {
    const list = jest
      .spyOn(api, 'listPatterns')
      .mockRejectedValueOnce(new ApiError('SERVICE_UNAVAILABLE', 'x', 503));
    await render(<HomeScreen />);
    expect(await screen.findByText('Impossible de charger les motifs.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      (await screen.findAllByRole('button', { name: /^Motif .*, origine/ })).length,
    ).toBeGreaterThan(0);
    list.mockRestore();
  });

  it('says so when offline with no cached catalog', async () => {
    network.online = false;
    jest.spyOn(api, 'listPatterns').mockRejectedValue(new ApiError('NETWORK', 'x'));
    await render(<HomeScreen />);
    expect(await screen.findByText('Connecte-toi à Internet pour voir les motifs.')).toBeTruthy();
    expect(screen.getByText('Tu es hors ligne')).toBeTruthy();
  });
});

describe('Purchase stack placeholders', () => {
  it.each([
    ['Réception', ReceptionPlaceholder],
    ['Paiement', PaymentPlaceholder],
    ['Confirmation', ConfirmationPlaceholder],
  ])('%s is navigable', async (title, Component) => {
    await render(<Component />);
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'Retour' }));
    expect(routerMock.back).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Retour à l’accueil' }));
    expect(routerMock.replace).toHaveBeenCalledWith('/');
  });
});
