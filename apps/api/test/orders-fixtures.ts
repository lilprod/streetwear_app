import { EventEmitter2 } from '@nestjs/event-emitter';
import { FIXTURE_STORE, VALID_DESIGNS, type DesignSpec, type Size } from '@streetwear/shared';
import request from 'supertest';
import { EVENTS } from '../src/common/events';
import { uuidv7 } from '../src/common/uuid';
import { seedDelivery } from '../src/modules/delivery/seed';
import { SettingsService } from '../src/modules/settings/settings.service';
import { type AppOptions, type AuthHeader, buildApp } from './helpers';

export const TOKOIN = { lat: 6.145, lng: 1.215 };
export const SEA = { lat: 6.0, lng: 1.22 };

export type Built = Awaited<ReturnType<typeof buildApp>>;

/** Contexte de test commandes : app, événements capturés, fabriques de données. */
export async function ordersCtx(opts: AppOptions = {}) {
  const built = await buildApp(opts);
  const { app, prisma } = built;
  await prisma.$executeRawUnsafe(
    'TRUNCATE production_jobs, stock_movements, stock_items, order_status_history, order_items, deliveries, pickups, orders, cart_items, carts, pickup_slots, stores, couriers, delivery_zones CASCADE',
  );
  await seedDelivery(prisma);
  const settings = app.get(SettingsService);
  await prisma.setting.deleteMany();
  settings.clearCache();
  const events: { name: string; payload: Record<string, unknown> }[] = [];
  const emitter = app.get(EventEmitter2);
  for (const name of Object.values(EVENTS)) {
    emitter.on(name, (payload: Record<string, unknown>) => events.push({ name, payload }));
  }
  const http = () => request(app.getHttpServer());

  let slotSeq = 0;
  const slot = async (capacity = 4) => {
    const startsAt = new Date(Date.now() + 5 * 86_400_000 + 3_600_000 * ++slotSeq);
    return prisma.pickupSlot.create({
      data: {
        id: uuidv7(),
        storeId: FIXTURE_STORE.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        capacity,
      },
    });
  };

  const address = (userId: string, p: { lat: number; lng: number } = TOKOIN) =>
    prisma.address.create({
      data: {
        id: uuidv7(),
        userId,
        label: 'Maison',
        district: 'Tokoin',
        landmark: 'Près du marché',
        recipientPhone: '+22890123456',
        ...p,
      },
    });

  const setStock = (colorId: string, size: string, onHand: number, alertThreshold = 0) =>
    prisma.stockItem.upsert({
      where: { colorId_size: { colorId, size } },
      create: { id: uuidv7(), colorId, size, onHand, reserved: 0, alertThreshold },
      update: { onHand, reserved: 0, alertThreshold },
    });

  const stockOf = (colorId: string, size: string) =>
    prisma.stockItem.findUniqueOrThrow({ where: { colorId_size: { colorId, size } } });

  const design = async (
    auth: AuthHeader,
    spec: DesignSpec = VALID_DESIGNS.patternOnly as DesignSpec,
  ) => {
    const res = await http()
      .post('/v1/designs')
      .set(...auth)
      .send({ spec })
      .expect(201);
    return res.body as { id: string; unitPriceXof: number };
  };

  const withColor = (colorId: string, base = 'patternOnly'): DesignSpec => ({
    ...(structuredClone(VALID_DESIGNS[base]) as DesignSpec),
    colorId,
  });

  const addToCart = async (auth: AuthHeader, designId: string, size: Size, quantity = 1) =>
    http()
      .post('/v1/cart/items')
      .set(...auth)
      .send({ designId, size, quantity })
      .expect(200);

  /** Client avec adresse, un design au panier ; renvoie de quoi commander. */
  const shopper = async (
    opts: { colorId?: string; size?: Size; quantity?: number; base?: string } = {},
  ) => {
    const c = await built.newCustomer();
    const addr = await address(c.id);
    const d = await design(c.auth, withColor(opts.colorId ?? 'col-noir', opts.base));
    await addToCart(c.auth, d.id, opts.size ?? 'M', opts.quantity ?? 1);
    return { ...c, addressId: addr.id, design: d };
  };

  const placeOrder = (auth: AuthHeader, body: object, key: string = uuidv7()) =>
    http()
      .post('/v1/orders')
      .set(...auth)
      .set('Idempotency-Key', key)
      .send(body);

  return {
    ...built,
    http,
    events,
    settings,
    slot,
    address,
    setStock,
    stockOf,
    design,
    withColor,
    addToCart,
    shopper,
    placeOrder,
  };
}

export type OrdersCtx = Awaited<ReturnType<typeof ordersCtx>>;
