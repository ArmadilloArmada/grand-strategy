import type { Page } from '@playwright/test';
import type { E2ESnapshot } from '../src/e2e/browserApi';

export async function setupFastE2E(page: Page, options?: { tacticalBattles?: boolean }): Promise<void> {
  await page.addInitScript((opts) => {
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
      tacticalBattles: opts?.tacticalBattles ?? false,
      battleAnimations: false,
      battleNarratives: false,
      confirmEndTurn: false,
      midGameObjectives: false,
      commanderProgression: false,
    }));
    // Keep strategic events from interrupting smoke tests.
    Math.random = () => 0.99;
  }, { tacticalBattles: options?.tacticalBattles ?? false });
}

export async function startTutorialMatch(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __gsE2E?: unknown }).__gsE2E));
  await page.evaluate(() => {
    (window as unknown as { __gsE2E: { startE2ETutorialMatch(): void } }).__gsE2E.startE2ETutorialMatch();
  });
  await page.locator('#game-canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.ribbon-center #btn-end-phase').waitFor({ state: 'visible' });
}

export async function startCampaignMission(page: Page, campaignId: string, missionId: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __gsE2E?: unknown }).__gsE2E));
  await page.evaluate(({ campaign, mission }) => {
    (window as unknown as {
      __gsE2E: { startE2ECampaignMission(campaignId: string, missionId: string): void };
    }).__gsE2E.startE2ECampaignMission(campaign, mission);
  }, { campaign: campaignId, mission: missionId });
  await page.locator('#game-canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#campaign-objectives-panel').waitFor({ state: 'visible', timeout: 10_000 });
}

export async function e2eQuickSave(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return (window as unknown as { __gsE2E: { runE2EQuickSave(): boolean } }).__gsE2E.runE2EQuickSave();
  });
}

export async function e2eQuickLoad(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return (window as unknown as { __gsE2E: { runE2EQuickLoad(): boolean } }).__gsE2E.runE2EQuickLoad();
  });
}

export async function dismissE2EOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __gsE2E: { dismissE2EOverlays(): void } }).__gsE2E.dismissE2EOverlays();
  });
}

export async function completeVictoryToCampaignDebrief(page: Page): Promise<void> {
  const mainMenuBtn = page.locator('#btn-victory-main-menu');
  await mainMenuBtn.waitFor({ state: 'visible', timeout: 15_000 });
  await mainMenuBtn.click();
  await page.locator('#campaign-debriefing-overlay').waitFor({ state: 'visible', timeout: 10_000 });
}

export async function readSnapshot(page: Page): Promise<E2ESnapshot> {
  return page.evaluate(() => {
    return (window as unknown as { __gsE2E: { readE2ESnapshot(): E2ESnapshot } }).__gsE2E.readE2ESnapshot();
  });
}

export async function waitForHumanTurn(page: Page, turnNumber: number, timeoutMs = 90_000): Promise<E2ESnapshot> {
  await page.waitForFunction(
    (targetTurn) => {
      const api = (window as unknown as { __gsE2E?: { readE2ESnapshot(): E2ESnapshot } }).__gsE2E;
      if (!api) return false;
      const snap = api.readE2ESnapshot();
      return snap.isHumanTurn && snap.turnNumber >= targetTurn;
    },
    turnNumber,
    { timeout: timeoutMs },
  );
  return readSnapshot(page);
}

export async function e2eMove(
  page: Page,
  fromId: string,
  toId: string,
  allTypes = true,
): Promise<'move' | 'attack' | 'invalid'> {
  return page.evaluate(
    ({ from, to, all }) => {
      return (window as unknown as {
        __gsE2E: { runE2EUnitAction(fromId: string, toId: string, allTypes?: boolean): 'move' | 'attack' | 'invalid' };
      }).__gsE2E.runE2EUnitAction(from, to, all);
    },
    { from: fromId, to: toId, all: allTypes },
  );
}

export async function e2eConfirmAttack(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as unknown as {
      __gsE2E: { dismissE2EOverlays(): void; runE2EConfirmAttack(): void };
    }).__gsE2E;
    api.dismissE2EOverlays();
    api.runE2EConfirmAttack();
  });
  await page.locator('#combat-modal').waitFor({ state: 'hidden', timeout: 60_000 });
}

export async function e2eEndTurn(page: Page): Promise<void> {
  await page.evaluate(() => {
    const api = (window as unknown as {
      __gsE2E: { dismissE2EOverlays(): void; runE2EEndTurn(): void };
    }).__gsE2E;
    api.dismissE2EOverlays();
    api.runE2EEndTurn();
  });
}
