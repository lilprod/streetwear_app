import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';
import tseslint from 'typescript-eslint';

const ignores = ['**/dist/**', '**/build/**', '**/.expo/**', '**/coverage/**', '**/generated/**'];

const base = [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];

const reactConfig = {
  files: ['**/*.{jsx,tsx}'],
  plugins: { react, 'react-hooks': reactHooks },
  languageOptions: { globals: { ...globals.browser } },
  settings: { react: { version: 'detect' } },
  rules: {
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
    ...reactHooks.configs.recommended.rules,
  },
};

export const node = [...base];
export const web = [...base, reactConfig];
export const native = [
  ...base,
  reactConfig,
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'react-native': reactNative },
    rules: { 'react-native/no-unused-styles': 'error' },
  },
];

export default node;
