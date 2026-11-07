import type { PrismaClient } from '@prisma/client';
import { SIZES } from '@streetwear/shared';
import { uuidv7 } from '../../common/uuid';

export const SEED_STOCK_ON_HAND = 20;

/** Stock de départ (développement, recette) : ne touche pas aux lignes existantes. */
export async function seedStock(prisma: PrismaClient): Promise<void> {
  const colors = await prisma.tshirtColor.findMany({ select: { id: true } });
  for (const { id: colorId } of colors) {
    for (const size of SIZES) {
      await prisma.stockItem.upsert({
        where: { colorId_size: { colorId, size } },
        create: { id: uuidv7(), colorId, size, onHand: SEED_STOCK_ON_HAND },
        update: {},
      });
    }
  }
}
