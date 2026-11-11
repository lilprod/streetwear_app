import type { PrismaClient } from '@prisma/client';
import { uuidv7 } from '../../common/uuid';
import { TEMPLATE_DEFAULTS } from './templates';

/** Idempotent : ne remplace jamais un modèle déjà modifié depuis le back-office. */
export async function seedNotificationTemplates(prisma: PrismaClient): Promise<void> {
  for (const t of TEMPLATE_DEFAULTS) {
    await prisma.notificationTemplate.upsert({
      where: { key_channel: { key: t.key, channel: t.channel } },
      create: { id: uuidv7(), key: t.key, channel: t.channel, title: t.title, body: t.body },
      update: {},
    });
  }
}
