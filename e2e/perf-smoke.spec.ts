import { test, expect } from '@playwright/test';
import {
  dismissE2EOverlays,
  e2eEndTurn,
  setupFastE2E,
  startTutorialMatch,
  waitForHumanTurn,
} from './helpers';

test.describe('Performance smoke', () => {
  test.beforeEach(async ({ page }) => {
    await setupFastE2E(page);
    await page.addInitScript(() => {
      localStorage.setItem('gs-perf', '1');
    });
  });

  test('render frame p95 stays under budget after simulated turns', async ({ page }) => {
    await page.goto('/?e2e=1');
    await startTutorialMatch(page);

    await e2eEndTurn(page);
    await waitForHumanTurn(page, 2);
    await dismissE2EOverlays(page);
    await e2eEndTurn(page);
    await waitForHumanTurn(page, 3);
    await dismissE2EOverlays(page);
    await e2eEndTurn(page);
    await waitForHumanTurn(page, 4);

    const perf = await page.evaluate(() => {
      const root = (window as unknown as { __gsPerf?: Record<string, { p95?: number; samples?: number }> }).__gsPerf;
      return root?.renderFrameMs ?? null;
    });

    expect(perf).not.toBeNull();
    if (perf && (perf.samples ?? 0) > 0) {
      expect(perf.p95 ?? 999).toBeLessThanOrEqual(20);
    }
  });
});
