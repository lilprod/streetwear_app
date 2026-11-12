import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FIXTURE_ORDERS, type Order } from '@streetwear/shared';
import { ApiError, type ApiClient } from '../../api/types';
import { sessionStore } from '../../auth/session';
import { setApiForTests } from '../../api';
import { setTokenStoreForTests } from '../../auth/tokens';
import {
  memoryStorage,
  network,
  resetMemoryStorage,
  resetRouter,
  routeParams,
  routerMock,
} from '../../../tests/mocks';
import { signedInApi } from '../../../tests/signedIn';
import { recordFromNotification } from '../notifications/codes';
import { OrderScreen } from './OrderScreen';
import { OrdersScreen } from './OrdersScreen';
import { brandWhatsapp, hasReceipt, openReceipt, whatsappUrl } from './helpers';

jest.setTimeout(20_000);

jest.mock('../notifications/push', () => ({
  promptAfterFirstOrder: jest.fn(async () => 'registered'),
}));

let api: ApiClient;
const orderOf = (i: number): Order => FIXTURE_ORDERS[i] as Order;

beforeEach(async () => {
  resetMemoryStorage();
  resetRouter();
  network.online = true;
  routeParams.id = undefined;
  routeParams.orderId = undefined;
  delete process.env.EXPO_PUBLIC_WHATSAPP_NUMBER;
  ({ api } = await signedInApi());
});
afterAll(() => {
  setApiForTests(null);
  setTokenStoreForTests(null);
  sessionStore.setState({ status: 'anonymous', user: null });
});

async function paidOrder(): Promise<Order> {
  const address = await api.createAddress({
    label: 'Maison',
    lat: 6.1725,
    lng: 1.2314,
    district: 'Tokoin',
    landmark: 'Marché',
    recipientPhone: '+22890123456',
  });
  const created = await api.createOrder(
    { reception: { type: 'home', addressId: address.id }, paymentMethod: 'tmoney' },
    '11111111-1111-4111-8111-111111111111',
  );
  const payment = await api.createPayment(
    created.id,
    { method: 'tmoney', payerPhone: '+22890123456' },
    '22222222-2222-4222-8222-222222222222',
  );
  await api.getPayment(payment.paymentId);
  return api.getOrder(created.id);
}

describe('Orders list', () => {
  it('shows the empty state', async () => {
    await render(<OrdersScreen />);
    expect(await screen.findByText('Aucune commande')).toBeTruthy();
  });

  it('lists orders with status and opens one', async () => {
    jest.spyOn(api, 'listOrders').mockResolvedValue({
      items: [
        {
          id: orderOf(2).id,
          number: orderOf(2).number,
          status: 'paid',
          totalXof: 21000,
          paymentMethod: 'tmoney',
          itemCount: 2,
          createdAt: '2026-11-23T14:02:00Z',
        },
      ],
      nextCursor: null,
    });
    await render(<OrdersScreen />);
    const row = await screen.findByRole('button', {
      name: /^Commande TG-\d+, Payée, 21\s000\sFCFA$/,
    });
    await fireEvent.press(row);
    expect(routerMock.push).toHaveBeenCalledWith(`/orders/${orderOf(2).id}`);
    expect(screen.getByText(/23\/11\/2026/)).toBeTruthy();
  });

  it('offers a retry on error and an offline state', async () => {
    const spy = jest
      .spyOn(api, 'listOrders')
      .mockRejectedValueOnce(new ApiError('NETWORK', 'x'))
      .mockResolvedValue({ items: [], nextCursor: null });
    await render(<OrdersScreen />);
    expect(await screen.findByText('Tu es hors ligne')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aucune commande')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('invites a guest to sign in', async () => {
    sessionStore.setState({ status: 'anonymous', user: null });
    await render(<OrdersScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Se connecter' }));
    expect(routerMock.push).toHaveBeenCalledWith('/purchase/login');
  });
});

describe('Order tracking', () => {
  const show = (order: Order, variant: 'tracking' | 'confirmation' = 'tracking') => {
    jest.spyOn(api, 'getOrder').mockResolvedValue(order);
    routeParams.id = order.id;
    routeParams.orderId = order.id;
    return render(<OrderScreen variant={variant} />);
  };

  it('shows the number, the timeline, dates in Africa/Lome and amounts', async () => {
    await show(orderOf(4));
    expect(await screen.findByText(`Commande ${orderOf(4).number}`)).toBeTruthy();
    expect(screen.getByLabelText('Suivi de la commande')).toBeTruthy();
    expect(screen.getByLabelText('En production, étape en cours')).toBeTruthy();
    expect(screen.getByLabelText(/^Total : /)).toBeTruthy();
  });

  it('shows the pickup code received for the current status only', async () => {
    const order = orderOf(5);
    recordFromNotification(memoryStorage(), {
      body: 'Code de retrait : 123456',
      data: { orderId: order.id, status: 'ready_for_pickup', code: '123456' },
    });
    await show(order);
    expect(await screen.findByText('123 456')).toBeTruthy();
  });

  it('never shows a stale code once the order moved to another step', async () => {
    const order = orderOf(6);
    recordFromNotification(memoryStorage(), {
      body: 'Code de retrait : 123456',
      data: { orderId: order.id, status: 'ready_for_pickup', code: '123456' },
    });
    await show(order);
    await screen.findByText(`Commande ${order.number}`);
    expect(screen.queryByText('123 456')).toBeNull();
    expect(screen.getByText(/Ton code arrive par notification et par SMS/)).toBeTruthy();
  });

  it('offers payment for an unpaid order and no receipt', async () => {
    await show(orderOf(0));
    await fireEvent.press(await screen.findByRole('button', { name: 'Payer cette commande' }));
    expect(routerMock.push).toHaveBeenCalledWith(`/purchase/payment?orderId=${orderOf(0).id}`);
    expect(screen.queryByRole('button', { name: 'Reçu PDF' })).toBeNull();
    expect(hasReceipt('pending_payment')).toBe(false);
  });

  it('says the payment is being confirmed rather than showing a paid order', async () => {
    await show(orderOf(0), 'confirmation');
    expect(await screen.findByText(/Paiement en cours de confirmation/)).toBeTruthy();
    expect(screen.queryByText(/Merci/)).toBeNull();
  });

  it('thanks the customer and asks for push permission on the confirmation of a paid order', async () => {
    const { promptAfterFirstOrder } = jest.requireMock('../notifications/push') as {
      promptAfterFirstOrder: jest.Mock;
    };
    await show(orderOf(2), 'confirmation');
    expect(await screen.findByText(/Merci/)).toBeTruthy();
    expect(promptAfterFirstOrder).toHaveBeenCalled();
  });

  it('hides "Nous écrire" without a configured number, opens WhatsApp with one', async () => {
    await show(orderOf(2));
    await screen.findByText(`Commande ${orderOf(2).number}`);
    expect(screen.queryByRole('button', { name: 'Nous écrire' })).toBeNull();
    process.env.EXPO_PUBLIC_WHATSAPP_NUMBER = '+228 90 00 00 00';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show(orderOf(2));
    await fireEvent.press(await screen.findByRole('button', { name: 'Nous écrire' }));
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/22890000000\?text=Bonjour/),
    );
    expect(brandWhatsapp()).toBe('22890000000');
    expect(whatsappUrl('228', 'a b')).toBe('https://wa.me/228?text=a%20b');
  });

  it('reorders into the cart', async () => {
    const order = await paidOrder();
    routeParams.id = order.id;
    await render(<OrderScreen variant="tracking" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Recommander' }));
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/purchase/cart'));
    expect((await api.getCart()).itemCount).toBe(2);
  });

  it('shows an error with a retry, and the offline state', async () => {
    const get = jest
      .spyOn(api, 'getOrder')
      .mockRejectedValueOnce(new ApiError('NETWORK', 'x'))
      .mockResolvedValue(orderOf(2));
    routeParams.id = orderOf(2).id;
    await render(<OrderScreen variant="tracking" />);
    expect(await screen.findByText('Tu es hors ligne')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(`Commande ${orderOf(2).number}`)).toBeTruthy();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('openReceipt', () => {
  it('writes the PDF bytes then opens the share sheet', async () => {
    const order = await paidOrder();
    const deps = {
      write: jest.fn(async (name: string, bytes: Uint8Array) => {
        expect(new TextDecoder().decode(bytes)).toContain('%PDF');
        return `file:///cache/${name}`;
      }),
      share: jest.fn(async () => undefined),
    };
    await openReceipt(api, order, deps);
    expect(deps.write).toHaveBeenCalledWith(`recu-${order.number}.pdf`, expect.any(Uint8Array));
    expect(deps.share).toHaveBeenCalledWith(`file:///cache/recu-${order.number}.pdf`);
  });
});
