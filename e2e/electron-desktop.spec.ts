/**
 * Electron desktop ship smoke: main menu, resize HUD, save/load, relaunch load.
 * Requires `npm run build` first. Prefers packaged `release/win-unpacked` when present.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  dismissE2EOverlays,
  e2eQuickLoad,
  e2eQuickSave,
  startTutorialMatch,
} from './helpers';

const root = path.resolve(__dirname, '..');
const userDataDir = path.join(root, 'tmp', 'electron-desktop-userdata');
const unpackedExe = [
  path.join(root, 'release', 'win-unpacked', 'Grand Strategy.exe'),
  path.join(root, 'release', 'win-unpacked', 'grand-strategy.exe'),
].find(p => fs.existsSync(p));

function resetUserData(): void {
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
}

async function launchApp(): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    GS_E2E: '1',
    ELECTRON_ENABLE_LOGGING: '1',
  };

  if (unpackedExe) {
    return electron.launch({
      executablePath: unpackedExe,
      args: [`--user-data-dir=${userDataDir}`],
      env,
      cwd: path.dirname(unpackedExe),
    });
  }

  return electron.launch({
    args: [root, `--user-data-dir=${userDataDir}`],
    env,
    cwd: root,
  });
}

async function applyFastSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    const key = 'grand-strategy-settings';
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(localStorage.getItem(key) ?? '{}');
    } catch {
      settings = {};
    }
    localStorage.setItem(key, JSON.stringify({
      ...settings,
      gameSpeed: 'fast',
      tacticalBattles: false,
      battleAnimations: false,
      battleNarratives: false,
      confirmEndTurn: false,
      midGameObjectives: false,
      commanderProgression: false,
    }));
    Math.random = () => 0.99;
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
}

async function firstPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await applyFastSettings(page);
  return page;
}

test.describe.configure({ mode: 'serial' });

test.describe('Electron desktop smoke', () => {
  test('reaches main menu, survives resize, save/load, and relaunch load', async () => {
    resetUserData();

    let app = await launchApp();
    try {
      const page = await firstPage(app);

      await expect(page.locator('#main-menu-modal')).toBeVisible({ timeout: 60_000 });
      await expect(page.locator('#btn-quick-simple')).toBeVisible();

      await page.setViewportSize({ width: 900, height: 640 });
      await expect(page.locator('#btn-quick-simple')).toBeVisible();
      const box = await page.locator('#btn-quick-simple').boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThan(20);
      expect(box!.height).toBeGreaterThan(10);

      await startTutorialMatch(page);
      await expect(page.locator('#btn-end-phase')).toBeVisible();
      await expect(page.locator('#btn-menu')).toBeVisible();

      await page.setViewportSize({ width: 720, height: 520 });
      await expect(page.locator('#btn-end-phase')).toBeVisible();
      await expect(page.locator('#btn-menu')).toBeVisible();
      const endBox = await page.locator('#btn-end-phase').boundingBox();
      expect(endBox).toBeTruthy();
      expect(endBox!.width).toBeGreaterThan(10);

      expect(await e2eQuickSave(page)).toBe(true);
      expect(await e2eQuickLoad(page)).toBe(true);
      await dismissE2EOverlays(page);
      await expect(page.locator('#game-canvas')).toBeVisible();
      await expect(page.locator('#btn-end-phase')).toBeVisible();
    } finally {
      await app.close();
    }

    app = await launchApp();
    try {
      const page = await firstPage(app);
      await expect(page.locator('#main-menu-modal')).toBeVisible({ timeout: 60_000 });
      await page.waitForFunction(() => Boolean((window as unknown as { __gsE2E?: unknown }).__gsE2E));
      expect(await e2eQuickLoad(page)).toBe(true);
      await dismissE2EOverlays(page);
      await expect(page.locator('#game-canvas')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#btn-end-phase')).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
