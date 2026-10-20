import type { Config } from 'tailwindcss';
import { tailwindPreset } from '@streetwear/ui-tokens/tailwind';

export default {
  presets: [tailwindPreset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
} satisfies Config;
