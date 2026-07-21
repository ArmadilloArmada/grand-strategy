/**
 * Browser multiplayer lobby UI confidence check (ship checklist §4 optional).
 */
import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { setupFastE2E } from './helpers';

const root = path.resolve(__dirname, '..');
const PORT = 3847;

function waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.addEventListener('open', () => {
        ws.close();
        resolve();
      });
      ws.addEventListener('error', () => {
        ws.close();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Multiplayer server did not open on ${port}`));
          return;
        }
        setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

test.describe('Multiplayer lobby UI', () => {
  let server: ChildProcess | null = null;

  test.beforeAll(async () => {
    server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'ignore',
    });
    await waitForPort(PORT);
  });

  test.afterAll(async () => {
    if (server && !server.killed) {
      server.kill();
    }
  });

  test('opens lobby browser, creates lobby, and shows host controls', async ({ page }) => {
    await setupFastE2E(page);
    await page.goto('/');
    await expect(page.locator('#main-menu-modal')).toBeVisible();
    await page.locator('#btn-online-multiplayer').click();

    await expect(page.locator('#mp-modal')).toBeVisible();
    await expect(page.locator('#mp-create')).toBeVisible();
    await expect(page.locator('#mp-status')).toHaveClass(/mp-status-connected/, { timeout: 10_000 });

    await page.locator('#mp-player-name').fill('ShipSmokeHost');
    await page.locator('#mp-lobby-name').fill('Ship Smoke Lobby');
    await page.locator('#mp-create').click();

    await expect(page.locator('.mp-lobby-header h3')).toHaveText('Ship Smoke Lobby', { timeout: 10_000 });
    await expect(page.locator('#mp-ready')).toBeVisible();
    await expect(page.locator('#mp-start')).toBeVisible();
    await expect(page.locator('#mp-leave')).toBeVisible();
    await expect(page.locator('.mp-player-row')).toContainText('ShipSmokeHost');
  });
});
