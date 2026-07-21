import { test, expect } from '@playwright/test';
import {
  dismissE2EOverlays,
  e2eEndTurn,
  e2eQuickLoad,
  e2eQuickSave,
  readE2EActiveFactionCount,
  runE2EMobilize,
  setupFastE2E,
  startTutorialMatch,
  startTwoFactionMatch,
  waitForHumanTurn,
} from './helpers';

test.describe('Ship smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupFastE2E(page);
  });

  test('mobilizes capital on tutorial map', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startTutorialMatch(page);

    const result = await runE2EMobilize(page);
    expect(result).toBe('mobilized');

    const sameTurn = await runE2EMobilize(page);
    expect(sameTurn).toBe('none');

    await e2eEndTurn(page);
    await waitForHumanTurn(page, 2);
    await dismissE2EOverlays(page);

    const turn2 = await runE2EMobilize(page);
    expect(turn2).toBe('mobilized');
  });

  test('two-faction setup scopes turn order, panel, victory, diplomacy, and espionage', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startTwoFactionMatch(page);

    const count = await readE2EActiveFactionCount(page);
    expect(count).toBe(2);

    await expect(page.locator('#turn-order .turn-order-item')).toHaveCount(2);
    await expect(page.locator('#faction-panel-content .faction-row')).toHaveCount(2);
    await expect(page.locator('#victory-bars .victory-bar')).toHaveCount(2);

    await page.evaluate(() => {
      (window as unknown as { __hudInstance: { showDiplomacyModal(): void } }).__hudInstance.showDiplomacyModal();
    });
    await expect(page.locator('#diplomacy-modal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#diplomacy-relations > div')).toHaveCount(1);
    await page.locator('#btn-close-diplomacy').click();

    await page.evaluate(() => {
      (window as unknown as { __hudInstance: { showEspionageModal(): void } }).__hudInstance.showEspionageModal();
    });
    await expect(page.locator('#espionage-modal')).not.toHaveClass(/hidden/);
    const enemyIds = await page.locator('#espionage-modal [data-enemy-id]').evaluateAll(els =>
      [...new Set(els.map(el => el.getAttribute('data-enemy-id')).filter(Boolean))],
    );
    expect(enemyIds).toHaveLength(1);
  });

  test('save/load preserves two-faction active set', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startTwoFactionMatch(page);

    expect(await e2eQuickSave(page)).toBe(true);
    expect(await e2eQuickLoad(page)).toBe(true);
    await dismissE2EOverlays(page);

    expect(await readE2EActiveFactionCount(page)).toBe(2);
    await expect(page.locator('#turn-order .turn-order-item')).toHaveCount(2);
    await expect(page.locator('#faction-panel-content .faction-row')).toHaveCount(2);
  });
});
