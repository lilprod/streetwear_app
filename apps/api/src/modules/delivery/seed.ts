import type { PrismaClient } from '@prisma/client';
import { FIXTURE_STORE, FIXTURE_ZONES } from '@streetwear/shared';

const rect = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
});

/**
 * Polygones APPROXIMATIFS (rectangles imbriqués autour de Lomé, [longitude, latitude]),
 * à redessiner et faire valider par la marque. La zone la plus petite contenant un point l'emporte.
 */
export const SEED_ZONES = [
  { name: 'Lomé centre', polygon: rect(1.195, 6.128, 1.265, 6.17), feeXof: 1000, delayHours: 24 },
  { name: 'Lomé périphérie', polygon: rect(1.14, 6.12, 1.3, 6.25), feeXof: 1500, delayHours: 48 },
  { name: 'Grand Lomé', polygon: rect(1.1, 6.1, 1.45, 6.35), feeXof: 2500, delayHours: 48 },
] as const;

/** Idempotent : ne remplace jamais les zones ou la boutique modifiées par la marque. */
export async function seedDelivery(prisma: PrismaClient): Promise<void> {
  for (const [i, z] of SEED_ZONES.entries()) {
    const id = (FIXTURE_ZONES[i] as { id: string }).id;
    await prisma.deliveryZone.upsert({ where: { id }, create: { id, ...z }, update: {} });
  }
  await prisma.store.upsert({
    where: { id: FIXTURE_STORE.id },
    create: {
      id: FIXTURE_STORE.id,
      name: '[Nom de la boutique]',
      address: '[Adresse de la boutique], Lomé',
      lat: 6.1375,
      lng: 1.2123,
      openingHours: { 'lun-sam': '09:00-19:00', dim: 'fermé' },
    },
    update: {},
  });
}
