import { PrismaClient } from '@prisma/client';
import { seedCatalog } from '../src/catalog/seed';

const prisma = new PrismaClient();

seedCatalog(prisma)
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
