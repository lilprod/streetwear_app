import { uuidv7 } from '../src/common/uuid';
import { OrdersService } from '../src/modules/orders/orders.service';
import { type TestCtx, createApp, createCustomer, resetDb } from './helpers';

jest.setTimeout(120_000);

describe('expiration d’un retard de plus de 200 commandes (AN-012)', () => {
  let ctx: TestCtx;
  let orders: OrdersService;
  let userId: string;

  beforeAll(async () => {
    ctx = await createApp();
    orders = ctx.app.get(OrdersService);
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetDb(ctx.prisma);
    userId = (await createCustomer(ctx)).user.id;
  });

  const seed = async (count: number): Promise<string[]> => {
    const past = Date.now() - 2 * 60 * 60_000;
    const rows = Array.from({ length: count }, (_, i) => {
      const id = uuidv7();
      return {
        id,
        number: `TG-B${String(i).padStart(5, '0')}${id.slice(-3)}`,
        userId,
        subtotalXof: 10000,
        deliveryFeeXof: 0,
        totalXof: 10000,
        vatIncludedXof: 1525,
        paymentMethod: 'tmoney' as const,
        receptionType: 'home' as const,
        receptionSnapshot: {},
        idempotencyKey: uuidv7(),
        idempotencyHash: 'backlog',
        expiresAt: new Date(past + i * 1000),
      };
    });
    await ctx.prisma.order.createMany({ data: rows });
    return rows.map((r) => r.id);
  };

  const pending = () => ctx.prisma.order.count({ where: { status: 'pending_payment' } });

  it('clears a 450-order backlog in a single pass', async () => {
    await seed(450);
    expect(await orders.expireDue(new Date())).toBe(450);
    expect(await pending()).toBe(0);
    expect(await ctx.prisma.order.count({ where: { status: 'expired' } })).toBe(450);
  });

  it('tries a failing order only once per pass and still expires the others', async () => {
    const ids = await seed(250);
    const poisoned = ids[0] as string;
    const original = orders.transition.bind(orders);
    const spy = jest
      .spyOn(orders, 'transition')
      .mockImplementation((id, ...rest) =>
        id === poisoned ? Promise.reject(new Error('incohérence')) : original(id, ...rest),
      );
    expect(await orders.expireDue(new Date())).toBe(249);
    expect(spy.mock.calls.filter(([id]) => id === poisoned)).toHaveLength(1);
    expect(await pending()).toBe(1);
  });

  it('stops after the time budget and leaves the rest for the next pass', async () => {
    await seed(450);
    expect(await orders.expireDue(new Date(), 200, 0)).toBe(200);
    expect(await pending()).toBe(250);
    expect(await orders.expireDue(new Date())).toBe(250);
  });
});
