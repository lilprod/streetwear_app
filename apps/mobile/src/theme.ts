import { colors as tokenColors, radii, spacing, statusTones } from '@streetwear/ui-tokens';

export const colors = {
  ...tokenColors,
  dangerBg: statusTones.danger.bg,
} as const;

export { statusTones };

export const fonts = {
  regular: 'Geist_400Regular',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_500Medium',
} as const;

export const radius = {
  pill: radii.pill,
  card: radii.card,
  preview: radii.previewCard,
  field: radii.field,
  segmented: radii.segmented,
} as const;
export const MIN_TARGET = spacing.touchTarget;
export const SCREEN_MARGIN = spacing.mobileMargin;
export const MAX_FONT_SCALE = 1.3;
