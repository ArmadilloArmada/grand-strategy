/**
 * Dev / Playwright automation hooks. Attached when `?e2e=1` or in Vite dev builds.
 */

export interface E2ESnapshot {
  turnNumber: number;
  phase: string;
  currentFactionId: string;
  isHumanTurn: boolean;
  owners: Record<string, string | null>;
}

export interface E2EHost {
  startE2ETutorialMatch(): void;
  readE2ESnapshot(): E2ESnapshot;
  runE2EUnitAction(fromId: string, toId: string, allTypes?: boolean): 'move' | 'attack' | 'invalid';
  runE2EConfirmAttack(): void;
  runE2EEndTurn(): void;
  dismissE2EOverlays(): void;
  e2eBoostTerritory(territoryId: string, unitTypeId: string, count: number): void;
}

export function shouldAttachE2EBrowserApi(): boolean {
  if (typeof globalThis.location === 'undefined') return false;
  try {
    if (new URLSearchParams(globalThis.location.search).has('e2e')) return true;
  } catch {
    return false;
  }
  // Vite dev builds expose HMR; production bundles omit the test API unless ?e2e=1.
  return typeof (import.meta as { hot?: unknown }).hot !== 'undefined';
}

export function attachE2EBrowserApi(host: E2EHost): void {
  if (!shouldAttachE2EBrowserApi()) return;
  (globalThis as unknown as { __gsE2E?: E2EHost }).__gsE2E = host;
}
