import { PrismaClient } from '@prisma/client';
import { seedCatalog } from '../src/catalog/seed';
import { seedDelivery } from '../src/modules/delivery/seed';
import { seedStock } from '../src/modules/stock/seed';
import { seedNotificationTemplates } from '../src/modules/notifications/seed';
import { seed } from '../src/seed/seed';

const prisma = new PrismaClient();

seed(prisma, {
  adminEmail: process.env.SEED_ADMIN_EMAIL,
  adminPassword: process.env.SEED_ADMIN_PASSWORD,
})
  .then(() => seedCatalog(prisma))
  .then(() => seedDelivery(prisma))
  .then(() => seedStock(prisma))
  .then(() => seedNotificationTemplates(prisma))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
