import { Skia } from '@shopify/react-native-skia';
import { DEFAULT_PRINT_ZONES } from '@streetwear/shared';
import type { Side } from './model';

export const SHIRT_W_MM = 560;
export const SHIRT_H_MM = 700;

const FRONT_D =
  'M220 10 L100 45 L0 180 L70 225 L110 190 L110 690 Q110 700 120 700 L440 700 Q450 700 450 690 L450 190 L490 225 L560 180 L460 45 L340 10 Q280 100 220 10 Z';
const BACK_D =
  'M220 10 L100 45 L0 180 L70 225 L110 190 L110 690 Q110 700 120 700 L440 700 Q450 700 450 690 L450 190 L490 225 L560 180 L460 45 L340 10 Q280 40 220 10 Z';

const NECK_OFFSET_MM: Record<Side, number> = { front: 70, back: 90 };

export const zoneOrigin = (side: Side) => ({
  x: (SHIRT_W_MM - DEFAULT_PRINT_ZONES[side].widthMm) / 2,
  y: NECK_OFFSET_MM[side],
});

const cache: Partial<Record<Side, ReturnType<typeof Skia.Path.MakeFromSVGString>>> = {};

export function shirtPath(side: Side) {
  if (!cache[side]) cache[side] = Skia.Path.MakeFromSVGString(side === 'front' ? FRONT_D : BACK_D);
  return cache[side] ?? Skia.Path.Make();
}
