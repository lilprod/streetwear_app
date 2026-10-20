import { useFont, type SkFont } from '@shopify/react-native-skia';

export const FONT_BASE_SIZE = 100;

/* eslint-disable @typescript-eslint/no-require-imports */
const bebas = require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf');
const anton = require('@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf');
const marker = require('@expo-google-fonts/permanent-marker/400Regular/PermanentMarker_400Regular.ttf');
/* eslint-enable @typescript-eslint/no-require-imports */

export type StudioFonts = Record<string, SkFont | null>;

/** Polices du catalogue embarquées (même famille que `Font.family`). */
export function useStudioFonts(): StudioFonts {
  return {
    'Bebas Neue': useFont(bebas, FONT_BASE_SIZE),
    Anton: useFont(anton, FONT_BASE_SIZE),
    'Permanent Marker': useFont(marker, FONT_BASE_SIZE),
  };
}
