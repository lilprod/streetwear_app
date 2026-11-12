import { VALID_DESIGNS, type DesignSpec, type ReceptionInput } from '@streetwear/shared';
import { createMockApi, MOCK_OTP_CODE } from '../../api/mock';
import { ApiError, type ApiClient } from '../../api/types';
import { createMemoryTokenStore } from '../../auth/tokens';
import { createMemoryStorage } from '../../storage/storage';
import {
  loadAttempt,
  paymentStore,
  recheckPayment,
  resetPayment,
  resumePayment,
  startPayment,
  type PayDeps,
  type PayInput,
  type PayPhase,
} from './flow';

const spec = VALID_DESIGNS.patternOnly as DesignSpec;
const PHONE = '+22890123456';

type Harness = {
  api: ApiClient;
  deps: PayDeps;
  clock: { t: number };
  calls: { createOrder: string[]; createPayment: string[]; getPayment: number };
  home: ReceptionInput;
};

async function harness(
  over: {
    wrap?: (api: ApiClient) => Partial<ApiClient>;
    payDelayMs?: number;
    slotRaced?: boolean;
  } = {},
): Promise<Harness> {
  const clock = { t: Date.now() };
  const tokens = createMemoryTokenStore();
  const base = createMockApi({
    latencyMs: 0,
    now: () => new Date(clock.t),
    tokens,
    payDelayMs: over.payDelayMs ?? 0,
    slotRaced: over.slotRaced ? () => true : undefined,
  });
  await base.requestOtp(PHONE);
  const auth = await base.verifyOtp(PHONE, MOCK_OTP_CODE);
  await tokens.set({ accessToken: auth.accessToken, refreshToken: auth.refreshToken });
  const design = await base.createDesign({ spec });
  await base.addCartItem({ designId: design.id, size: 'M', quantity: 2 });
  const address = await base.createAddress({
    label: 'Maison',
    lat: 6.1725,
    lng: 1.2314,
    district: 'Tokoin',
    landmark: 'Près du marché',
    recipientPhone: PHONE,
  });
  const calls = { createOrder: [] as string[], createPayment: [] as string[], getPayment: 0 };
  const wrapped: ApiClient = {
    ...base,
    createOrder: (input, key) => {
      calls.createOrder.push(key);
      return base.createOrder(input, key);
    },
    createPayment: (id, input, key) => {
      calls.createPayment.push(key);
      return base.createPayment(id, input, key);
    },
    getPayment: (id) => {
      calls.getPayment += 1;
      return base.getPayment(id);
    },
  };
  const api: ApiClient = { ...wrapped, ...(over.wrap?.(wrapped) ?? {}) };
  const deps: PayDeps = {
    api,
    storage: createMemoryStorage(),
    now: () => clock.t,
    sleep: (ms) => {
      clock.t += ms;
      return Promise.resolve();
    },
    openCardPage: jest.fn(() => Promise.resolve()),
    intervalMs: 3000,
    timeoutMs: 120_000,
  };
  return { api, deps, clock, calls, home: { type: 'home', addressId: address.id } };
}

const input = (h: Harness, over: Partial<PayInput> = {}): PayInput => ({
  reception: h.home,
  orderMethod: 'tmoney',
  payWith: 'tmoney',
  payerPhone: PHONE,
  ...over,
});

const phase = (): PayPhase => paymentStore.getState().phase;

beforeEach(() => resetPayment());

describe('payment flow', () => {
  it('creates a single payment when "Payer" is pressed twice (same Idempotency-Key)', async () => {
    const h = await harness();
    const first = startPayment(input(h), h.deps);
    const second = startPayment(input(h), h.deps);
    await Promise.all([first, second]);
    expect(h.calls.createOrder).toHaveLength(1);
    expect(h.calls.createPayment).toHaveLength(1);
    expect((await h.api.listOrders()).items).toHaveLength(1);
    expect(phase().name).toBe('succeeded');
  });

  it('replays the same keys after a network failure instead of creating a second payment', async () => {
    let fail = true;
    const h = await harness({
      wrap: (api) => ({
        createPayment: (id, body, key) => {
          if (fail) {
            fail = false;
            return api.createPayment(id, body, key).then(() => {
              throw new ApiError('NETWORK', 'Pas de connexion.');
            });
          }
          return api.createPayment(id, body, key);
        },
      }),
    });
    await startPayment(input(h), h.deps);
    expect(phase()).toMatchObject({ name: 'error', action: null });
    await startPayment(input(h), h.deps);
    const [k1, k2] = h.calls.createPayment;
    expect(k1).toBeDefined();
    expect(k2).toBe(k1);
    expect(h.calls.createOrder).toHaveLength(1);
    expect(phase().name).toBe('succeeded');
    const attempt = loadAttempt(h.deps.storage);
    expect(attempt).toBeNull();
  });

  it('finds the right status after a network cut during the wait', async () => {
    let down = 0;
    const seen: PayPhase[] = [];
    const unsub = paymentStore.subscribe((s) => seen.push(s.phase));
    const h = await harness({
      wrap: (api) => ({
        getPayment: (id) => {
          if (down < 4) {
            down += 1;
            return Promise.reject(new ApiError('NETWORK', 'Pas de connexion.'));
          }
          return api.getPayment(id);
        },
      }),
    });
    await startPayment(input(h), h.deps);
    unsub();
    expect(seen.some((p) => p.name === 'waiting' && p.offline)).toBe(true);
    expect(phase().name).toBe('succeeded');
  });

  it('resumes the wait after an app restart', async () => {
    const h = await harness({ payDelayMs: 600_000 });
    const short: PayDeps = { ...h.deps, timeoutMs: 6000 };
    await startPayment(input(h), short);
    expect(phase().name).toBe('timeout');
    resetPayment();
    const attempt = loadAttempt(h.deps.storage);
    expect(attempt?.paymentId).toBeTruthy();
    h.clock.t += 700_000;
    await resumePayment(attempt?.orderId as string, h.deps);
    expect(phase().name).toBe('succeeded');
  });

  it('times out after 2 minutes, polling every 3 seconds, then allows a new check', async () => {
    const h = await harness({ payDelayMs: 999_999_999 });
    await startPayment(input(h), h.deps);
    expect(phase().name).toBe('timeout');
    expect(h.calls.getPayment).toBe(41);
    const timeout = phase();
    if (timeout.name !== 'timeout') throw new Error('timeout expected');
    h.clock.t += 5;
    await recheckPayment(timeout.orderId, { ...h.deps, timeoutMs: 6000 });
    expect(phase().name).toBe('timeout');
  });

  it('never reports success while the API says pending', async () => {
    const h = await harness({ payDelayMs: 999_999_999 });
    await startPayment(input(h), h.deps);
    expect(phase().name).not.toBe('succeeded');
  });

  it('offers a retry after a failure with a fresh payment key on the same order', async () => {
    const h = await harness();
    await startPayment(input(h, { payerPhone: '+22890123400' }), h.deps);
    expect(phase().name).toBe('failed');
    await startPayment(input(h, { payerPhone: PHONE }), h.deps);
    expect(phase().name).toBe('succeeded');
    expect(h.calls.createOrder).toHaveLength(1);
    expect(h.calls.createPayment).toHaveLength(2);
    expect(h.calls.createPayment[0]).not.toBe(h.calls.createPayment[1]);
  });

  it('opens the card page then waits for the API status', async () => {
    const h = await harness();
    await startPayment(
      input(h, { orderMethod: 'card', payWith: 'card', payerPhone: undefined }),
      h.deps,
    );
    expect(h.deps.openCardPage).toHaveBeenCalledWith(expect.stringContaining('https://'));
    expect(phase().name).toBe('succeeded');
  });

  it('pays the deposit for cash on delivery', async () => {
    const h = await harness();
    await startPayment(input(h, { orderMethod: 'cod', payWith: 'flooz' }), h.deps);
    const state = phase();
    if (state.name !== 'succeeded') throw new Error('succeeded expected');
    const order = await h.api.getOrder(state.orderId);
    expect(order.status).toBe('deposit_paid');
    expect(order.depositXof).toBeGreaterThan(0);
  });

  it('surfaces SLOT_FULL so the user can pick another slot', async () => {
    const h = await harness({ slotRaced: true });
    const store = (await h.api.listStores())[0];
    const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const slot = (await h.api.listSlots(store?.id as string, day))[0];
    await startPayment(
      input(h, {
        reception: { type: 'pickup', storeId: store?.id as string, slotId: slot?.id as string },
      }),
      h.deps,
    );
    expect(phase()).toMatchObject({ name: 'error', action: 'chooseSlot' });
  });

  it('joins the payment already in progress (payment_pending)', async () => {
    const h = await harness({ payDelayMs: 5000 });
    await startPayment(input(h), { ...h.deps, timeoutMs: 3000 });
    expect(phase().name).toBe('timeout');
    h.deps.storage.remove('payment:attempt');
    const orders = await h.api.listOrders();
    await startPayment(
      { orderId: orders.items[0]?.id, orderMethod: 'tmoney', payWith: 'tmoney', payerPhone: PHONE },
      h.deps,
    );
    expect(phase().name).toBe('succeeded');
  });
});
