import { VALID_DESIGNS, type DesignSpec } from '@streetwear/shared';
import { createMockApi, MOCK_OTP_CODE } from '../../api/mock';
import { ApiError, type ApiClient } from '../../api/types';
import { createMemoryTokenStore } from '../../auth/tokens';
import { sessionStore } from '../../auth/session';
import { memoryStorage, resetMemoryStorage } from '../../../tests/mocks';
import { createDraftsRepo } from '../studio/drafts';
import { createGuestCart } from './guestCart';
import { ensureServerDesign, viewFromGuest } from './purchase';
import {
  addLine,
  cartStore,
  changeQuantity,
  loadCart,
  removeLine,
  resetCartStore,
  syncGuestCartToAccount,
  type CartDeps,
  type NewLine,
} from './store';

const spec = VALID_DESIGNS.patternOnly as DesignSpec;
let api: ApiClient;
let deps: CartDeps;
let authed = false;

const line = (over: Partial<NewLine> = {}): NewLine => ({
  draftLocalId: 'draft-1',
  name: 'Mon design',
  colorHex: '#111111',
  size: 'M',
  quantity: 2,
  unitPriceXof: 11000,
  ...over,
});

async function signIn() {
  await api.requestOtp('+22890123456');
  const result = await api.verifyOtp('+22890123456', MOCK_OTP_CODE);
  authed = true;
  return result;
}

beforeEach(() => {
  resetMemoryStorage();
  resetCartStore();
  authed = false;
  const tokens = createMemoryTokenStore();
  api = createMockApi({ latencyMs: 0, tokens });
  const storage = memoryStorage();
  deps = {
    api,
    guest: createGuestCart(storage),
    repo: createDraftsRepo(storage),
    isAuth: () => authed,
  };
  deps.repo.save({ localId: 'draft-1', spec });
  sessionStore.setState({ status: 'anonymous', user: null, expired: false });
  const original = api.verifyOtp.bind(api);
  api.verifyOtp = async (phone, code) => {
    const res = await original(phone, code);
    await tokens.set({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    return res;
  };
});

describe('guest cart', () => {
  it('adds a line and merges the same design and size', async () => {
    await addLine(line(), deps);
    await addLine(line({ quantity: 3 }), deps);
    await addLine(line({ size: 'L' }), deps);
    const { view } = cartStore.getState();
    expect(view.lines.map((l) => [l.size, l.quantity])).toEqual([
      ['M', 5],
      ['L', 2],
    ]);
    expect(view.subtotalXof).toBe(11000 * 7);
    expect(view.itemCount).toBe(7);
  });

  it('caps a line at 50 and keeps the quantity at least 1', async () => {
    await addLine(line({ quantity: 45 }), deps);
    await addLine(line({ quantity: 20 }), deps);
    const id = cartStore.getState().view.lines[0]?.id as string;
    expect(cartStore.getState().view.lines[0]?.quantity).toBe(50);
    await changeQuantity(id, 0, deps);
    expect(cartStore.getState().view.lines[0]?.quantity).toBe(1);
    await changeQuantity(id, 99, deps);
    expect(cartStore.getState().view.lines[0]?.quantity).toBe(50);
  });

  it('removes lines and survives a reload from storage', async () => {
    await addLine(line(), deps);
    await addLine(line({ size: 'XL' }), deps);
    await loadCart(deps);
    expect(cartStore.getState().view.lines).toHaveLength(2);
    await removeLine(cartStore.getState().view.lines[0]?.id as string, deps);
    expect(cartStore.getState().view.lines).toHaveLength(1);
    expect(deps.guest.list()).toHaveLength(1);
  });

  it('totals come from the shared pricing function', () => {
    const view = viewFromGuest([
      { ...line(), id: 'a', size: 'M', quantity: 3, unitPriceXof: 12000 },
      { ...line(), id: 'b', size: 'S', quantity: 1, unitPriceXof: 9500 },
    ]);
    expect(view.subtotalXof).toBe(45500);
    expect(view.lines[0]?.lineTotalXof).toBe(36000);
  });
});

describe('account cart', () => {
  it('creates the design on the server and adds the line to the API cart', async () => {
    await signIn();
    await addLine(line(), deps);
    const { view } = cartStore.getState();
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]).toMatchObject({ size: 'M', quantity: 2, available: true });
    expect(deps.repo.get('draft-1')?.serverId).toBeTruthy();
    expect(view.subtotalXof).toBe((view.lines[0]?.unitPriceXof ?? 0) * 2);
  });

  it('flags a sold-out size as unavailable and keeps the line', async () => {
    await signIn();
    await addLine(line({ size: '3XL' }), deps);
    expect(cartStore.getState().view.lines[0]).toMatchObject({ size: '3XL', available: false });
  });

  it('updates quantity and removes lines through the API', async () => {
    await signIn();
    await addLine(line(), deps);
    const id = cartStore.getState().view.lines[0]?.id as string;
    await changeQuantity(id, 7, deps);
    expect(cartStore.getState().view.lines[0]?.quantity).toBe(7);
    await removeLine(id, deps);
    expect(cartStore.getState().view.lines).toHaveLength(0);
  });

  it('surfaces a failed action without losing the cart', async () => {
    await signIn();
    await addLine(line(), deps);
    const failing = {
      ...deps,
      api: { ...api, updateCartItem: () => Promise.reject(new Error('x')) },
    };
    await changeQuantity(cartStore.getState().view.lines[0]?.id as string, 3, failing);
    expect(cartStore.getState().actionFailed).toBe(true);
    expect(cartStore.getState().view.lines[0]?.quantity).toBe(2);
    expect(cartStore.getState().busyId).toBeNull();
  });

  it('reports a network error on load and recovers on retry', async () => {
    await signIn();
    const down = {
      ...deps,
      api: {
        ...api,
        getCart: () => Promise.reject(new ApiError('NETWORK', 'Pas de connexion.')),
      },
    };
    await loadCart(down);
    expect(cartStore.getState()).toMatchObject({ status: 'error', offline: true });
    await loadCart(deps);
    expect(cartStore.getState().status).toBe('ready');
  });

  it('merges the guest cart into the account after sign-in', async () => {
    await addLine(line(), deps);
    await addLine(line({ size: 'L', quantity: 4 }), deps);
    await signIn();
    expect(await syncGuestCartToAccount(deps)).toBe(true);
    const { view } = cartStore.getState();
    expect(view.lines.map((l) => [l.size, l.quantity]).sort()).toEqual([
      ['L', 4],
      ['M', 2],
    ]);
    expect(deps.guest.list()).toHaveLength(0);
  });

  it('keeps unsent guest lines and flags the failure when the merge breaks midway', async () => {
    await addLine(line(), deps);
    await addLine(line({ size: 'L' }), deps);
    await signIn();
    let calls = 0;
    const flaky = {
      ...deps,
      api: {
        ...api,
        addCartItem: (input: Parameters<ApiClient['addCartItem']>[0]) => {
          calls += 1;
          return calls === 1 ? api.addCartItem(input) : Promise.reject(new Error('x'));
        },
      },
    };
    expect(await syncGuestCartToAccount(flaky)).toBe(false);
    expect(cartStore.getState().mergeFailed).toBe(true);
    expect(deps.guest.list()).toHaveLength(1);
  });

  it('quotes the cart through the shared pricing', async () => {
    await signIn();
    await addLine(line(), deps);
    const cart = await api.getCart();
    const quote = await api.quoteCart({
      type: 'pickup',
      storeId: '00000000-0000-4000-8000-000000000700',
      slotId: '00000000-0000-4000-8000-000000000701',
    });
    expect(quote.subtotalXof).toBe(cart.subtotalXof);
    expect(quote.totalXof).toBe(cart.subtotalXof);
    const home = await api.quoteCart({
      type: 'home',
      addressId: '00000000-0000-4000-8000-000000000801',
    });
    expect(home.totalXof).toBe(cart.subtotalXof + home.deliveryFeeXof);
    expect(home.deliveryFeeXof).toBeGreaterThan(0);
  });
});

describe('ensureServerDesign', () => {
  it('fails with NOT_FOUND for an unknown draft and NETWORK when offline', async () => {
    await signIn();
    await expect(ensureServerDesign(api, deps.repo, 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const offline: ApiClient = {
      ...api,
      createDesign: () => Promise.reject(new ApiError('NETWORK', 'Pas de connexion.')),
    };
    await expect(ensureServerDesign(offline, deps.repo, 'draft-1')).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(deps.repo.get('draft-1')?.serverId).toBeNull();
  });
});
