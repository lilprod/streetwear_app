export const colors = {
  ink: '#0A0A0A',
  inkSecondary: '#6E6E73',
  inkDisabled: '#8A8A8E',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F5F7',
  surfaceAdmin: '#FAFAFA',
  segmented: '#F2F2F4',
  border: '#EAEAEA',
  borderStrong: '#D4D4D8',
  link: '#0066CC',
  focus: '#0066CC',
  danger: '#A11A1A',
} as const;

export const statusTones = {
  info: { bg: '#E8F1FC', ink: '#0B4F9C' },
  production: { bg: '#FDF1DC', ink: '#8A4B00' },
  success: { bg: '#E3F4EA', ink: '#16613A' },
  shipping: { bg: '#EFEAFB', ink: '#5B3BA3' },
  neutral: { bg: '#F0F0F2', ink: '#4B4B50' },
  danger: { bg: '#FCE8E8', ink: '#A11A1A' },
} as const;
export type StatusTone = keyof typeof statusTones;

export const fonts = {
  sans: 'Geist',
  mono: 'Geist Mono',
} as const;

export const radii = {
  pill: 999,
  previewCard: 24,
  card: 16,
  field: 12,
  segmented: 10,
  admin: 8,
  adminLarge: 12,
} as const;

export const spacing = { unit: 4, mobileMargin: 20, cardInset: 16, touchTarget: 44 } as const;

export const shadows = { segmentedActive: '0 1px 3px rgba(0,0,0,.12)' } as const;

export const focusRing = { width: 2, offset: 2, color: colors.focus } as const;

export const tokens = { colors, statusTones, fonts, radii, spacing, shadows, focusRing } as const;
