import { PrismaClient } from '@prisma/client';
import { seed } from '../src/seed/seed';

const prisma = new PrismaClient();

seed(prisma, {
  adminEmail: process.env.SEED_ADMIN_EMAIL,
  adminPassword: process.env.SEED_ADMIN_PASSWORD,
})
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
