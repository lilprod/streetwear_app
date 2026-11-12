import { createMockApi } from '../../api/mock';
import { createMemoryStorage } from '../../storage/storage';
import {
  CODE_STATUSES,
  codeFor,
  extractCode,
  formatCode,
  recordCode,
  recordFromNotification,
} from './codes';
import {
  promptAfterFirstOrder,
  refreshPushToken,
  routeForResponse,
  type NotificationsModule,
  type PushDeps,
} from './push';

function setup(over: Partial<NotificationsModule> = {}, granted = true) {
  const mod: NotificationsModule = {
    getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[abc]' })),
    ...over,
  };
  const api = createMockApi({ latencyMs: 0 });
  const register = jest.spyOn(api, 'registerPushToken');
  const storage = createMemoryStorage();
  const deps: PushDeps = {
    api,
    storage,
    platform: 'android',
    projectId: 'proj-1',
    load: async () => mod,
  };
  return { mod, deps, register, storage };
}

describe('push registration', () => {
  it('asks for permission after the first order, then registers the token', async () => {
    const { mod, deps, register } = setup();
    expect(await promptAfterFirstOrder(deps)).toBe('registered');
    expect(mod.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mod.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proj-1' });
    expect(register).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]', platform: 'android' });
  });

  it('never asks twice', async () => {
    const { mod, deps } = setup();
    await promptAfterFirstOrder(deps);
    expect(await promptAfterFirstOrder(deps)).toBe('already');
    expect(mod.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not register a token when the user refuses', async () => {
    const { deps, register } = setup({}, false);
    expect(await promptAfterFirstOrder(deps)).toBe('denied');
    expect(register).not.toHaveBeenCalled();
  });

  it('does not prompt at launch: refresh only re-registers an already granted permission', async () => {
    const denied = setup();
    expect(await refreshPushToken(denied.deps)).toBe(false);
    expect(denied.mod.requestPermissionsAsync).not.toHaveBeenCalled();
    const granted = setup({ getPermissionsAsync: jest.fn(async () => ({ granted: true })) });
    expect(await refreshPushToken(granted.deps)).toBe(true);
    expect(granted.register).toHaveBeenCalledTimes(1);
  });

  it('survives a token failure without throwing', async () => {
    const { deps } = setup({
      getExpoPushTokenAsync: jest.fn(async () => {
        throw new Error('no fcm');
      }),
    });
    expect(await promptAfterFirstOrder(deps)).toBe('failed');
  });
});

describe('order codes from notifications', () => {
  const orderId = '00000000-0000-4000-8000-000000000007';

  it('extracts the code from the SP07 push body', () => {
    expect(extractCode('Code de retrait : 123456')).toBe('123456');
    expect(extractCode('Le livreur arrive. Code de remise : 654321')).toBe('654321');
    expect(extractCode('Votre commande est prête')).toBeNull();
    expect(formatCode('123456')).toBe('123 456');
  });

  it('shows only the code received for the current status', () => {
    const storage = createMemoryStorage();
    recordFromNotification(storage, {
      body: 'Code de retrait : 111111',
      data: { orderId, status: 'ready_for_pickup' },
    });
    expect(codeFor(storage, orderId, 'ready_for_pickup')).toBe('111111');
    expect(codeFor(storage, orderId, 'shipped')).toBeNull();
    expect(codeFor(storage, orderId, 'delivered')).toBeNull();
    expect(codeFor(storage, orderId, 'paid')).toBeNull();
  });

  it('replaces the code at the next step and never keeps the earlier one valid', () => {
    const storage = createMemoryStorage();
    recordFromNotification(
      storage,
      { body: 'Code de retrait : 111111', data: { orderId, status: 'ready_for_pickup' } },
      new Date('2026-11-23T10:00:00Z'),
    );
    recordFromNotification(
      storage,
      { body: 'Le livreur arrive. Code de remise : 222222', data: { orderId, status: 'shipped' } },
      new Date('2026-11-23T12:00:00Z'),
    );
    expect(codeFor(storage, orderId, 'shipped')).toBe('222222');
    expect(codeFor(storage, orderId, 'ready_for_pickup')).toBeNull();
  });

  it('keeps the latest code when an older notification is delivered late', () => {
    const storage = createMemoryStorage();
    recordCode(storage, {
      orderId,
      status: 'shipped',
      code: '333333',
      receivedAt: '2026-11-23T12:00:00Z',
    });
    recordCode(storage, {
      orderId,
      status: 'shipped',
      code: '222222',
      receivedAt: '2026-11-23T11:00:00Z',
    });
    expect(codeFor(storage, orderId, 'shipped')).toBe('333333');
  });

  it('prefers data.code when the API provides it and ignores statuses without a code', () => {
    const storage = createMemoryStorage();
    recordFromNotification(storage, {
      body: 'Code de remise : 000000',
      data: { orderId, status: 'shipped', code: '987654' },
    });
    expect(codeFor(storage, orderId, 'shipped')).toBe('987654');
    recordFromNotification(storage, {
      body: 'Code de retrait : 555555',
      data: { orderId, status: 'paid' },
    });
    expect(CODE_STATUSES).not.toContain('paid');
    expect(codeFor(storage, orderId, 'shipped')).toBe('987654');
  });

  it('opens the order when a notification is tapped', () => {
    const storage = createMemoryStorage();
    const route = routeForResponse(
      {
        notification: {
          request: {
            content: {
              body: 'Code de retrait : 424242',
              data: { orderId, status: 'ready_for_pickup' },
            },
          },
        },
      },
      storage,
    );
    expect(route).toBe(`/orders/${orderId}`);
    expect(codeFor(storage, orderId, 'ready_for_pickup')).toBe('424242');
    expect(
      routeForResponse({ notification: { request: { content: { data: {} } } } }, storage),
    ).toBeNull();
  });
});
