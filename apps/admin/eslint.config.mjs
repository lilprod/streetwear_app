import { web } from '@streetwear/config/eslint';

export default [...web, { files: ['*.config.*'], languageOptions: { sourceType: 'module' } }];
