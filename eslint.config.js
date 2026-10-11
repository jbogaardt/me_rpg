import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'public/',
      'art/',
      'maps/out/',
      '.claude/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // A game loop and UI glue legitimately use `!` on DOM lookups that index.html guarantees.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Floating promises are bugs in async init code; make them loud.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['tools/**/*.ts', 'maps/**/*.ts', '*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Config files at the repo root aren't part of a tsconfig project.
  { files: ['*.config.{js,ts}'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
