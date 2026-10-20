import { node } from '@streetwear/config/eslint';

export default [...node, { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } }];
