import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { newLayerId } from '../studio/model';
import { ApiError, type ApiClient } from '../../api/types';
import { sessionStore } from '../../auth/session';
import { setApiForTests } from '../../api';
import { setTokenStoreForTests } from '../../auth/tokens';
import { resetMemoryStorage, resetRouter, routeParams, routerMock } from '../../../tests/mocks';
import { signedInApi } from '../../../tests/signedIn';
import { checkoutStore, resetCheckout, setCheckout } from '../reception/store';
import { PaymentScreen } from './PaymentScreen';
import { paymentStore, resetPayment } from './flow';

jest.setTimeout(20_000);

let api: ApiClient;

async function prepareHome(over: { payDelayMs?: number } = {}) {
  ({ api } = await signedInApi(over));
  const address = await api.createAddress({
    label: 'Maison',
    lat: 6.1725,
    lng: 1.2314,
    district: 'Tokoin',
    landmark: 'Près du marché',
    recipientPhone: '+22890123456',
  });
  const quote = await api.quoteCart({ type: 'home', addressId: address.id });
  setCheckout({
    reception: { type: 'home', address, zone: address.zone as NonNullable<typeof address.zone> },
    quote,
  });
  return quote;
}

beforeEach(() => {
  resetMemoryStorage();
  resetRouter();
  resetCheckout();
  resetPayment();
});
afterEach(() => resetPayment());
afterAll(() => {
  setApiForTests(null);
  setTokenStoreForTests(null);
  sessionStore.setState({ status: 'anonymous', user: null });
});

const payButton = () => screen.getByRole('button', { name: /^Payer \d/ });

describe('Payment screen', () => {
  it('shows the quote from the API and creates a single payment on a double press', async () => {
    const quote = await prepareHome();
    const createPayment = jest.spyOn(api, 'createPayment');
    const createOrder = jest.spyOn(api, 'createOrder');
    await render(<PaymentScreen />);
    expect(screen.getByLabelText(/^Total : /)).toBeTruthy();
    expect(quote.totalXof).toBeGreaterThan(0);
    const button = payButton();
    await fireEvent.press(button);
    await fireEvent.press(button);
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/purchase\/confirmation\?orderId=/),
      ),
    );
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect((await api.listOrders()).items).toHaveLength(1);
  });

  it('shows "Valide sur ton téléphone" while the API still says pending, and never a paid state', async () => {
    await prepareHome({ payDelayMs: 999_999_999 });
    await render(<PaymentScreen />);
    await fireEvent.press(payButton());
    expect((await screen.findAllByText('Valide sur ton téléphone')).length).toBeGreaterThan(0);
    expect(routerMock.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(paymentStore.getState().phase.name).toBe('waiting'));
  });

  it('refuses an invalid payer number', async () => {
    await prepareHome();
    await render(<PaymentScreen />);
    await fireEvent.changeText(screen.getByLabelText('Numéro qui paie'), '12');
    await fireEvent.press(payButton());
    expect(await screen.findByText('Numéro invalide. Il faut 8 chiffres.')).toBeTruthy();
  });

  it('offers "Réessayer" after a failed payment', async () => {
    await prepareHome();
    await render(<PaymentScreen />);
    await fireEvent.changeText(screen.getByLabelText('Numéro qui paie'), '90 12 34 00');
    await fireEvent.press(payButton());
    expect(await screen.findByText(/Le paiement n’a pas abouti/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Numéro qui paie'), '90 12 34 56');
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalled());
  });

  it('pays only a deposit for cash on delivery', async () => {
    await prepareHome();
    await render(<PaymentScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Payer à la livraison' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Payer l’acompte' }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalled());
    const orders = await api.listOrders();
    const order = await api.getOrder(orders.items[0]?.id as string);
    expect(order.status).toBe('deposit_paid');
  });

  it('resumes an existing unpaid order from its identifier', async () => {
    await prepareHome();
    const order = await api.createOrder(
      {
        reception: { type: 'home', addressId: (await api.listAddresses())[0]?.id as string },
        paymentMethod: 'flooz',
      },
      newLayerId(),
    );
    resetCheckout();
    routeParams.orderId = order.id;
    await render(<PaymentScreen />);
    expect(await screen.findByText('Moyen choisi à la commande : Flooz.')).toBeTruthy();
    await act(async () => undefined);
    await fireEvent.press(payButton());
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(`/purchase/confirmation?orderId=${order.id}`),
    );
  });

  it('sends the user back to choose another slot when the slot was taken', async () => {
    await prepareHome();
    jest.spyOn(api, 'createOrder').mockRejectedValue(new ApiError('SLOT_FULL', 'Complet', 409));
    await render(<PaymentScreen />);
    await fireEvent.press(payButton());
    expect(await screen.findByText(/Ce créneau vient d’être pris/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choisir un autre créneau' }));
    expect(routerMock.replace).toHaveBeenCalledWith('/purchase/reception');
    expect(checkoutStore.getState().preferredMode).toBe('pickup');
  });

  it('asks to choose a reception first when nothing is pending', async () => {
    await signedInApi();
    await render(<PaymentScreen />);
    expect(screen.getByText('Rien à payer')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retour au panier' }));
    expect(routerMock.replace).toHaveBeenCalledWith('/purchase/cart');
  });
});
