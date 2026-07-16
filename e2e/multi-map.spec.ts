import { test, expect } from '@playwright/test';
import {
  e2eEndTurn,
  e2eQuickLoad,
  e2eQuickSave,
  readSnapshot,
  setupFastE2E,
  startMatch,
  waitForHumanTurn,
} from './helpers';

// Coverage beyond the tutorial map: exercise the full turn loop, multi-faction
// AI turns, and save/load on the 4-faction European Theater (grid) map.
test.describe('European Theater (grid) smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupFastE2E(page);
  });

  test('loads a 4-faction match with a human turn and the ribbon controls', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startMatch(page, {
      mapId: 'grid-europe',
      humanFactions: ['atlantic_alliance'],
      aiOpponents: ['eastern_coalition', 'southern_federation', 'pacific_union'],
    });

    await expect(page.locator('#game-canvas')).toBeVisible();
    await expect(page.locator('.ribbon-center #btn-end-phase')).toBeVisible();
    await expect(page.locator('#current-faction')).not.toHaveText('—');

    const snap = await readSnapshot(page);
    expect(snap.turnNumber).toBe(1);
    expect(snap.isHumanTurn).toBe(true);
    // The active roster spans more than the two-faction tutorial.
    const owners = Object.values(snap.owners).filter((o): o is string => Boolean(o));
    expect(new Set(owners).size).toBeGreaterThanOrEqual(2);
  });

  test('advances a full turn cycle through the AI factions back to the human', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startMatch(page, {
      mapId: 'grid-europe',
      humanFactions: ['atlantic_alliance'],
      aiOpponents: ['eastern_coalition', 'southern_federation', 'pacific_union'],
    });

    await e2eEndTurn(page);
    const snap = await waitForHumanTurn(page, 2);
    expect(snap.turnNumber).toBeGreaterThanOrEqual(2);
    expect(snap.isHumanTurn).toBe(true);
  });

  test('quick save and load preserves territory ownership on a larger map', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startMatch(page, {
      mapId: 'grid-europe',
      humanFactions: ['atlantic_alliance'],
      aiOpponents: ['eastern_coalition', 'southern_federation', 'pacific_union'],
    });

    const before = await readSnapshot(page);
    expect(await e2eQuickSave(page)).toBe(true);

    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __gsE2E?: unknown }).__gsE2E));
    expect(await e2eQuickLoad(page)).toBe(true);

    const after = await readSnapshot(page);
    expect(after.owners).toEqual(before.owners);
    expect(after.turnNumber).toBe(before.turnNumber);
    expect(after.isHumanTurn).toBe(true);
  });
});
