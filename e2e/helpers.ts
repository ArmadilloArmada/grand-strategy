import type { Page } from '@playwright/test';
import type { E2ESnapshot } from '../src/e2e/browserApi';

export async function setupFastE2E(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
    // Keep strategic events from interrupting smoke tests.
    Math.random = () => 0.99;
  });
}

export async function startTutorialMatch(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { __gsE2E?: unknown }).__gsE2E));
  await page.evaluate(() => {
    (window as unknown as { __gsE2E: { startE2ETutorialMatch(): void } }).__gsE2E.startE2ETutorialMatch();
  });
  await page.locator('#game-canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.ribbon-center #btn-end-phase').waitFor({ state: 'visible' });
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
