import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', '.trace/**', 'output/**', 'fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'tests/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 299, skipBlankLines: false, skipComments: false }],
      'max-len': [
        'error',
        { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreUrls: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', console: 'readonly',
      },
    },
  },
);
