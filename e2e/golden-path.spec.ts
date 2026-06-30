import { test, expect } from '@playwright/test';
import {
  e2eConfirmAttack,
  e2eEndTurn,
  e2eMove,
  readSnapshot,
  setupFastE2E,
  startTutorialMatch,
  waitForHumanTurn,
} from './helpers';

test.describe('Golden path', () => {
  test.beforeEach(async ({ page }) => {
    await setupFastE2E(page);
  });

  test('Simple Campaign loads with ribbon End Turn and map canvas', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#main-menu-modal')).toBeVisible();
    await page.locator('#btn-quick-simple').click();

    const briefing = page.locator('#btn-start-command');
    await expect(briefing).toBeVisible({ timeout: 30_000 });
    await briefing.click();

    await expect(page.locator('#game-canvas')).toBeVisible();
    await expect(page.locator('.ribbon-center #btn-end-phase')).toBeVisible();
    await expect(page.locator('.ribbon-center #btn-end-phase')).toContainText(/End Turn|End Phase/i);
    await expect(page.locator('#btn-advanced-menu')).toBeVisible();
    await expect(page.locator('#current-faction')).not.toHaveText('—');
  });

  test('Custom game setup defaults to Simple turn style', async ({ page }) => {
    await page.goto('/');

    await page.locator('#btn-new-game').click();
    await expect(page.locator('#new-game-modal')).toBeVisible();

    const turnStyle = page.locator('#turn-style');
    await expect(turnStyle).toHaveValue('quick');
    await expect(turnStyle.locator('option[value="chess"]')).toHaveCount(0);
    await expect(turnStyle.locator('option[value="action"]')).toHaveCount(0);
  });

  test('ribbon End Turn is enabled after briefing', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-quick-simple').click();
    await page.locator('#btn-start-command').click();
    await expect(page.locator('.ribbon-center #btn-end-phase')).toBeEnabled();
  });
});

test.describe('Tutorial smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupFastE2E(page);
  });

  test('captures contested territory and completes a full turn cycle', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startTutorialMatch(page);

    const moveKind = await e2eMove(page, 'player_capital', 'contested_territory', true);
    expect(moveKind).toBe('move');

    let snap = await readSnapshot(page);
    expect(snap.owners.contested_territory).toBe('atlantic_alliance');

    await e2eEndTurn(page);
    snap = await waitForHumanTurn(page, 2);
    expect(snap.turnNumber).toBeGreaterThanOrEqual(2);
    expect(snap.isHumanTurn).toBe(true);
  });

  test('resolves combat on the tutorial map', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startTutorialMatch(page);

    await e2eMove(page, 'player_capital', 'contested_territory', true);
    await e2eEndTurn(page);
    await waitForHumanTurn(page, 2);
    await page.evaluate(() => {
      (window as unknown as { __gsE2E: { dismissE2EOverlays(): void } }).__gsE2E.dismissE2EOverlays();
    });
    await page.evaluate(() => {
      (window as unknown as {
        __gsE2E: { e2eBoostTerritory(territoryId: string, unitTypeId: string, count: number): void };
      }).__gsE2E.e2eBoostTerritory('contested_territory', 'tank', 6);
    });

    const attackKind = await e2eMove(page, 'contested_territory', 'enemy_capital', true);
    expect(attackKind).toBe('attack');

    await page.locator('#btn-confirm-attack').waitFor({ state: 'visible', timeout: 10_000 });
    await e2eConfirmAttack(page);

    const snap = await readSnapshot(page);
    expect(snap.owners.enemy_capital).toBe('atlantic_alliance');
  });
});
