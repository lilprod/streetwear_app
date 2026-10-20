import type { PrismaClient } from '@prisma/client';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../common/password';
import { uuidv7 } from '../common/uuid';
import { SETTING_DEFAULTS } from '../modules/settings/settings.schemas';

export interface SeedOptions {
  adminEmail?: string;
  adminPassword?: string;
}

/** Idempotent : ne remplace ni les réglages ni le super admin existants. */
export async function seed(prisma: PrismaClient, opts: SeedOptions): Promise<void> {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: {},
    });
  }
  if (opts.adminEmail && opts.adminPassword) {
    if (opts.adminPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `SEED_ADMIN_PASSWORD doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
      );
    }
    const email = opts.adminEmail.toLowerCase();
    const exists = await prisma.adminUser.findUnique({ where: { email } });
    if (!exists) {
      await prisma.adminUser.create({
        data: {
          id: uuidv7(),
          email,
          name: 'Super admin',
          role: 'super_admin',
          passwordHash: await hashPassword(opts.adminPassword),
        },
      });
    }
  }
}
