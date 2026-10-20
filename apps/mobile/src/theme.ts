export const colors = {
  ink: '#0A0A0A',
  inkSecondary: '#6E6E73',
  inkDisabled: '#8A8A8E',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F5F7',
  segmented: '#F2F2F4',
  border: '#EAEAEA',
  borderStrong: '#D4D4D8',
  link: '#0066CC',
  focus: '#0066CC',
  danger: '#A11A1A',
  dangerBg: '#FCE8E8',
} as const;

export const fonts = {
  regular: 'Geist_400Regular',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_500Medium',
} as const;

export const radius = { pill: 999, card: 16, preview: 24, field: 12, segmented: 10 } as const;
export const MIN_TARGET = 44;
export const MAX_FONT_SCALE = 1.3;
