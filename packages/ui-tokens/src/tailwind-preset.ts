import { colors, fonts, radii, shadows, statusTones } from './index';

const px = (n: number) => `${n}px`;

export const tailwindPreset = {
  theme: {
    extend: {
      colors: {
        ...colors,
        status: Object.fromEntries(
          Object.entries(statusTones).flatMap(([tone, v]) => [
            [`${tone}-bg`, v.bg],
            [`${tone}-ink`, v.ink],
          ]),
        ),
      },
      fontFamily: {
        sans: [fonts.sans, 'system-ui', 'sans-serif'],
        mono: [fonts.mono, 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: px(radii.card),
        field: px(radii.field),
        segmented: px(radii.segmented),
        admin: px(radii.admin),
        'admin-lg': px(radii.adminLarge),
      },
      boxShadow: { segmented: shadows.segmentedActive },
    },
  },
};

export default tailwindPreset;
