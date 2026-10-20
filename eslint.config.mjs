import { web } from '@streetwear/config/eslint';

export default [...web, { files: ['**/*.{js,cjs}'], languageOptions: { sourceType: 'commonjs' } }];
