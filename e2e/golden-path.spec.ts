import { test, expect } from '@playwright/test';

test.describe('Golden path', () => {
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
