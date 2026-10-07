import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['build/**', 'dist/**', 'node_modules/**']},
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    languageOptions: {globals: {...globals.browser, ...globals.webextensions}},
    rules: {'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error'},
  },
  {
    files: ['src/background/**/*.ts'],
    languageOptions: {globals: {...globals.serviceworker, ...globals.webextensions}},
  },
  {
    files: ['*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {globals: globals.node},
  },
);
