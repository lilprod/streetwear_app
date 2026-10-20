import { node } from '@streetwear/config/eslint';

export default [
  ...node,
  { rules: { '@typescript-eslint/consistent-type-imports': 'off' } },
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
];
