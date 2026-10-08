/*
 * https://github.com/ziqq/mailchecker
 * Copyright (C) 2026 Anton Ustinoff
 * https://github.com/ziqq/mailchecker/blob/main/LICENSE
 *
 * Playwright configuration for the sandbox suite (`npm run test:sandbox`).
 *
 * Builds and serves the sandbox (`scripts/sandbox.mjs`) and runs `e2e/` in
 * headless Chromium.
 */
import {defineConfig, devices} from '@playwright/test';

/** Sandbox server port. */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {baseURL: `http://127.0.0.1:${PORT}/`, trace: 'retain-on-failure'},
  projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
  webServer: {
    command: `node scripts/sandbox.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
