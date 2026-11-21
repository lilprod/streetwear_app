import { native } from '@streetwear/config/eslint';

export default [
  ...native,
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  {
    // Scripts exécutés par Maestro (GraalJS) : globales fournies par l'outil.
    files: ['e2e/scripts/*.js'],
    languageOptions: {
      globals: {
        http: 'readonly',
        json: 'readonly',
        output: 'writable',
        PHONE: 'readonly',
        OTP_SERVER: 'readonly',
      },
    },
  },
  { ignores: ['.expo/**', 'expo-env.d.ts'] },
];
