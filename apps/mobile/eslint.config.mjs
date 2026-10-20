import { native } from '@streetwear/config/eslint';

export default [
  ...native,
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  { ignores: ['.expo/**', 'expo-env.d.ts'] },
];
