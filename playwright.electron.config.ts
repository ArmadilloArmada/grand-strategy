import { defineConfig } from '@playwright/test';

/**
 * Desktop Electron smoke — no Vite webServer.
 * Run after `npm run build` (or `npm run pack` for packaged exe path).
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'electron-desktop.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
});
