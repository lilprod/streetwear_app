/**
 * Jeu de données de démonstration pour la recette (jamais en production).
 * Idempotent : relancer le script ne duplique ni comptes, ni clients, ni commandes.
 * Usage : pnpm --filter api db:seed:demo   (voir apps/api/README.md)
 */
import type { PrismaClient } from '@prisma/client';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { seedCatalog } from '../src/catalog/seed';
import { hashPassword } from '../src/common/password';
import { encrypt } from '../src/common/crypto';
import { uuidv7 } from '../src/common/uuid';
import { ENV } from '../src/config/env';
import { DesignsService } from '../src/designs/designs.service';
import { CartService } from '../src/modules/cart/cart.service';
import { DeliveryAdminService } from '../src/modules/delivery/delivery-admin.service';
import { seedDelivery } from '../src/modules/delivery/seed';
import { SlotsService } from '../src/modules/delivery/slots.service';
import { ZonesService } from '../src/modules/delivery/zones.service';
import { seedNotificationTemplates } from '../src/modules/notifications/seed';
import { OrdersService } from '../src/modules/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { seed } from '../src/seed/seed';
import { seedStock } from '../src/modules/stock/seed';
import {
  FIXTURE_STORE,
  VALID_DESIGNS,
  type DesignSpec,
  type OrderStatus,
  type Size,
} from '@streetwear/shared';

export const DEMO_PASSWORD = 'DemoLocal-2026!';
export const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
export const DEMO_DOMAIN = 'demo.streetwear.local';

const TEAM = [
  { role: 'super_admin', name: 'Awa Super Admin' },
  { role: 'order_manager', name: 'Kossi Gestionnaire' },
  { role: 'production', name: 'Yao Production' },
  { role: 'logistics', name: 'Ama Logistique' },
  { role: 'courier', name: 'Koffi Livreur', phone: '+22891000000' },
] as const;

const CUSTOMERS = [
  {
    phone: '+22890000001',
    name: 'Afi Mensah',
    district: 'Tokoin',
    landmark: 'Près de la pharmacie',
  },
  {
    phone: '+22890000002',
    name: 'Kodjo Agbeko',
    district: 'Bè',
    landmark: 'En face du marché de Bè',
  },
  {
    phone: '+22890000003',
    name: 'Esso Tchalla',
    district: 'Adidogomé',
    landmark: 'Derrière le lycée',
  },
  {
    phone: '+22890000004',
    name: 'Yawa Lawson',
    district: 'Nyékonakpoè',
    landmark: 'Rue des Cocotiers',
  },
] as const;

type Path =
  | 'pending'
  | 'paid'
  | 'deposit'
  | 'in_production'
  | 'ready'
  | 'shipped'
  | 'ready_for_pickup'
  | 'delivered'
  | 'cancelled';

const ORDERS: {
  customer: number;
  design: keyof typeof VALID_DESIGNS;
  colorId: string;
  size: Size;
  quantity: number;
  reception: 'home' | 'pickup';
  method: 'tmoney' | 'flooz' | 'card' | 'cod';
  path: Path;
  daysAgo: number;
}[] = [
  {
    customer: 0,
    design: 'patternOnly',
    colorId: 'col-noir',
    size: 'M',
    quantity: 1,
    reception: 'home',
    method: 'tmoney',
    path: 'pending',
    daysAgo: 0,
  },
  {
    customer: 1,
    design: 'patternAndText',
    colorId: 'col-blanc',
    size: 'L',
    quantity: 2,
    reception: 'home',
    method: 'tmoney',
    path: 'paid',
    daysAgo: 1,
  },
  {
    customer: 2,
    design: 'patternOnly',
    colorId: 'col-sable',
    size: 'S',
    quantity: 1,
    reception: 'home',
    method: 'cod',
    path: 'deposit',
    daysAgo: 1,
  },
  {
    customer: 3,
    design: 'patternOnly',
    colorId: 'col-indigo',
    size: 'XL',
    quantity: 1,
    reception: 'pickup',
    method: 'flooz',
    path: 'in_production',
    daysAgo: 2,
  },
  {
    customer: 0,
    design: 'patternAndText',
    colorId: 'col-noir',
    size: 'M',
    quantity: 1,
    reception: 'pickup',
    method: 'tmoney',
    path: 'ready',
    daysAgo: 3,
  },
  {
    customer: 1,
    design: 'patternOnly',
    colorId: 'col-terracotta',
    size: 'L',
    quantity: 3,
    reception: 'home',
    method: 'card',
    path: 'shipped',
    daysAgo: 4,
  },
  {
    customer: 2,
    design: 'patternOnly',
    colorId: 'col-blanc',
    size: 'M',
    quantity: 1,
    reception: 'pickup',
    method: 'tmoney',
    path: 'ready_for_pickup',
    daysAgo: 5,
  },
  {
    customer: 3,
    design: 'patternAndText',
    colorId: 'col-sable',
    size: 'L',
    quantity: 2,
    reception: 'home',
    method: 'flooz',
    path: 'delivered',
    daysAgo: 8,
  },
  {
    customer: 0,
    design: 'patternOnly',
    colorId: 'col-indigo',
    size: 'S',
    quantity: 1,
    reception: 'home',
    method: 'tmoney',
    path: 'cancelled',
    daysAgo: 6,
  },
  {
    customer: 1,
    design: 'patternOnly',
    colorId: 'col-noir',
    size: 'XL',
    quantity: 1,
    reception: 'pickup',
    method: 'tmoney',
    path: 'delivered',
    daysAgo: 12,
  },
];

const key = (n: number) => `00000000-0000-4000-8000-00000000de${String(n).padStart(2, '0')}`;

export function assertNotProduction(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('db:seed:demo est interdit quand NODE_ENV=production.');
  }
}

async function main(): Promise<void> {
  assertNotProduction();
  const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  try {
    const prisma: PrismaClient = app.get(PrismaService);
    const env = app.get(ENV);

    await seed(prisma, {});
    await seedCatalog(prisma);
    await seedDelivery(prisma);
    await seedStock(prisma);
    await seedNotificationTemplates(prisma);

    // Boutique et créneaux sur 7 jours
    await prisma.store.update({
      where: { id: FIXTURE_STORE.id },
      data: {
        name: 'Boutique Streetwear Lomé (démo)',
        address: 'Rue du Commerce, Lomé',
        lat: 6.1375,
        lng: 1.2123,
        openingHours: { 'lun-sam': '09:00-19:00', dim: 'fermé' },
        defaultSlotCapacity: 4,
      },
    });
    await app.get(SlotsService).generate(FIXTURE_STORE.id, { days: 7, capacity: 4 });

    // Équipe : un compte par rôle (mot de passe et TOTP de démonstration, voir README)
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const totpSecret = encrypt(env.JWT_SECRET, DEMO_TOTP_SECRET);
    const team = new Map<string, string>();
    for (const m of TEAM) {
      const email = `${m.role.replace('_', '-')}@${DEMO_DOMAIN}`;
      const row = await prisma.adminUser.upsert({
        where: { email },
        create: { id: uuidv7(), email, name: m.name, role: m.role, passwordHash, totpSecret },
        update: {},
      });
      team.set(m.role, row.id);
      if ('phone' in m) {
        await prisma.courier.upsert({
          where: { adminUserId: row.id },
          create: { id: uuidv7(), adminUserId: row.id, phone: m.phone },
          update: {},
        });
      }
    }
    const courier = await prisma.courier.findFirstOrThrow({
      where: { adminUserId: team.get('courier') as string },
    });
    const staff = { type: 'admin', role: 'super_admin', id: team.get('super_admin') } as const;

    // Clients et adresses
    const zones = app.get(ZonesService);
    const users: { id: string; phone: string; addressId: string }[] = [];
    for (const c of CUSTOMERS) {
      const user = await prisma.user.upsert({
        where: { phone: c.phone },
        create: { id: uuidv7(), phone: c.phone, name: c.name },
        update: {},
      });
      let address = await prisma.address.findFirst({ where: { userId: user.id } });
      if (!address) {
        const point = { lat: 6.145 + users.length * 0.004, lng: 1.215 + users.length * 0.003 };
        const zone = await zones.resolve(point.lat, point.lng);
        address = await prisma.address.create({
          data: {
            id: uuidv7(),
            userId: user.id,
            label: 'Domicile',
            district: c.district,
            landmark: c.landmark,
            recipientPhone: c.phone,
            zoneId: zone?.id ?? null,
            ...point,
          },
        });
      }
      users.push({ id: user.id, phone: c.phone, addressId: address.id });
    }

    // Commandes dans des statuts variés (via les services réels : stock, livraison, historique)
    const orders = app.get(OrdersService);
    const designs = app.get(DesignsService);
    const cart = app.get(CartService);
    const delivery = app.get(DeliveryAdminService);
    const slots = await prisma.pickupSlot.findMany({
      where: { storeId: FIXTURE_STORE.id, startsAt: { gt: new Date(Date.now() + 3_600_000) } },
      orderBy: { startsAt: 'asc' },
      take: 20,
    });
    let created = 0;
    for (const [i, o] of ORDERS.entries()) {
      const idem = key(i + 1);
      if (await prisma.order.findUnique({ where: { idempotencyKey: idem } })) continue;
      const user = users[o.customer] as (typeof users)[number];
      const spec = {
        ...structuredClone(VALID_DESIGNS[o.design] as DesignSpec),
        colorId: o.colorId,
      };
      const { design } = await designs.create(user.id, { spec }, key(100 + i));
      await cart.add(user.id, { designId: design.id, size: o.size, quantity: o.quantity });
      const slot = slots[i % slots.length];
      const reception =
        o.reception === 'home'
          ? { type: 'home' as const, addressId: user.addressId }
          : {
              type: 'pickup' as const,
              storeId: FIXTURE_STORE.id,
              slotId: (slot as { id: string }).id,
            };
      const order = await orders.create(user.id, { reception, paymentMethod: o.method }, idem);
      created += 1;
      const id = order.id;
      const pay = (kind: 'full' | 'deposit') =>
        orders.runInTransaction((tx) =>
          orders.applyPaymentResult(id, { succeeded: true, kind }, tx),
        );
      const items = await prisma.orderItem.findMany({ where: { orderId: id } });
      const printFiles = () =>
        Promise.all(
          items.map((it) =>
            prisma.orderItem.update({
              where: { id: it.id },
              data: {
                printFileFrontUrl: `print-files/demo/${it.id}-front.png`,
                printFileBackUrl: null,
              },
            }),
          ),
        );
      const job = (status: 'queued' | 'ready_to_print' | 'printed') =>
        prisma.productionJob.upsert({
          where: { orderId: id },
          create: {
            id: uuidv7(),
            orderId: id,
            status,
            operatorId: team.get('production') as string,
          },
          update: { status, operatorId: team.get('production') as string },
        });
      const go = (to: OrderStatus, facts: Record<string, boolean> = {}) =>
        orders.transition(id, to, staff, undefined, undefined, { facts });

      if (o.path !== 'pending') await pay(o.path === 'deposit' ? 'deposit' : 'full');
      if (['in_production', 'ready', 'shipped', 'ready_for_pickup', 'delivered'].includes(o.path)) {
        await job('queued');
        await go('in_production');
      }
      if (['ready', 'shipped', 'ready_for_pickup', 'delivered'].includes(o.path)) {
        await printFiles();
        await job('ready_to_print');
        await go('ready');
        await job('printed');
      }
      if (['shipped', 'delivered'].includes(o.path) && o.reception === 'home') {
        const d = await prisma.delivery.findUniqueOrThrow({ where: { orderId: id } });
        await delivery.assign(d.id, courier.id);
        await go('shipped');
        if (o.path === 'delivered') {
          await go('delivered', { requiresHandoverCode: true });
          await prisma.delivery.update({
            where: { id: d.id },
            data: { status: 'delivered', completedAt: new Date() },
          });
        }
      }
      if (['ready_for_pickup', 'delivered'].includes(o.path) && o.reception === 'pickup') {
        await go('ready_for_pickup');
        if (o.path === 'delivered') await go('delivered', { requiresHandoverCode: true });
      }
      if (o.path === 'cancelled') await go('cancelled');

      // Dates réalistes : commande ancienne, livraisons en cours planifiées aujourd'hui
      const createdAt = new Date(Date.now() - o.daysAgo * 86_400_000);
      await prisma.order.update({ where: { id }, data: { createdAt } });
      const d = await prisma.delivery.findUnique({ where: { orderId: id } });
      if (d && !['delivered', 'cancelled'].includes(o.path)) {
        const at = new Date();
        at.setUTCHours(9 + (i % 8), 0, 0, 0);
        await prisma.delivery.update({ where: { id: d.id }, data: { scheduledFor: at } });
      }
    }
    console.log(
      `Seed de démonstration terminé : ${created} commande(s) créée(s), ${ORDERS.length - created} déjà présente(s).`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
