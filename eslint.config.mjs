/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['build/**', 'build-safari/**', 'build-sandbox/**', 'dist/**', 'node_modules/**', 'test-results/**']},
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    extends: [tseslint.configs.recommended],
    languageOptions: {globals: {...globals.browser, ...globals.webextensions}},
    rules: {'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error'},
  },
  {
    // Solid assigns `let element!: T` through `ref={element}`.
    files: ['src/**/*.tsx'],
    rules: {'no-unassigned-vars': 'off'},
  },
  {
    files: ['src/background/**/*.ts'],
    languageOptions: {globals: {...globals.serviceworker, ...globals.webextensions}},
  },
  {
    files: ['*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'e2e/**/*.mjs'],
    languageOptions: {globals: globals.node},
  },
  {
    // `page.evaluate` callbacks run in the browser.
    files: ['e2e/**/*.mjs'],
    languageOptions: {globals: {...globals.node, ...globals.browser}},
  },
);
