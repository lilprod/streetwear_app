import { web } from '@streetwear/config/eslint';

export default [
  ...web,
  { files: ['**/*.{js,cjs}'], languageOptions: { sourceType: 'commonjs' } },
  {
    // Scripts exécutés par Maestro (GraalJS) : globales fournies par l'outil.
    files: ['apps/mobile/e2e/scripts/*.js'],
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
];
