/**
 * EspionageSystem tests — operation execution, cooldowns, history, and effect types.
 */
import { describe, it, expect, vi } from 'vitest';
import { GameState } from '../GameState';
import { EspionageSystem } from '../EspionageSystem';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

function buildState(): { state: GameState; espionage: EspionageSystem } {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', { capital: 'home', allies: [], startingIPCs: 50 }));
  state.factionRegistry.register(makeFactionData('enemy', { capital: 'enemy_cap', allies: [], startingIPCs: 50 }));

  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3 }));

  const home = makeTerritory('home', 'player', { isCapital: true, production: 5, hasFactory: true, adjacentTo: [] });
  const enemyCap = makeTerritory('enemy_cap', 'enemy', { isCapital: true, production: 3, hasFactory: true, adjacentTo: [] });
  const enemyFactory = makeTerritory('efactory', 'enemy', { hasFactory: true, production: 2, adjacentTo: [] });

  state.territories.set('home', home);
  state.territories.set('enemy_cap', enemyCap);
  state.territories.set('efactory', enemyFactory);

  state.currentFactionId = 'player';
  state.turnNumber = 1;

  // Mark factions as at war
  state.diplomacyManager.forceWar('player', 'enemy');

  state.factionRegistry.get('player')!.ipcs = 50;
  state.factionRegistry.get('enemy')!.ipcs = 50;

  const espionage = new EspionageSystem(state);
  state.systems.espionageSystem = espionage;

  return { state, espionage };
}

// ── Validation guards ──────────────────────────────────────────────────────────

describe('EspionageSystem — validation', () => {
  it('rejects unknown operation type', () => {
    const { espionage } = buildState();
    const result = espionage.executeOperation('player', 'enemy', 'unknown_op' as any);
    expect(result.success).toBe(false);
    expect(result.detail).toMatch(/unknown operation/i);
  });

  it('rejects when initiator faction is unknown', () => {
    const { espionage } = buildState();
    const result = espionage.executeOperation('ghost', 'enemy', 'steal_intel');
    expect(result.success).toBe(false);
    expect(result.detail).toMatch(/invalid faction/i);
  });

  it('rejects when target faction is unknown', () => {
    const { espionage } = buildState();
    const result = espionage.executeOperation('player', 'ghost', 'steal_intel');
    expect(result.success).toBe(false);
  });

  it('rejects when player cannot afford the operation cost', () => {
    const { state, espionage } = buildState();
    state.factionRegistry.get('player')!.ipcs = 0;
    const result = espionage.executeOperation('player', 'enemy', 'steal_intel'); // costs 5
    expect(result.success).toBe(false);
    expect(result.detail).toMatch(/insufficient/i);
  });
});

// ── IPC deduction ─────────────────────────────────────────────────────────────

describe('EspionageSystem — IPC deduction', () => {
  it('deducts operation cost from initiator regardless of success', () => {
    const { state, espionage } = buildState();
    // Force a deterministic outcome by mocking Math.random
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.7 → success for steal_intel
    const before = state.factionRegistry.get('player')!.ipcs;
    espionage.executeOperation('player', 'enemy', 'steal_intel'); // cost 5
    const after = state.factionRegistry.get('player')!.ipcs;
    expect(before - after).toBe(5);
    vi.restoreAllMocks();
  });
});

// ── Cooldowns ─────────────────────────────────────────────────────────────────

describe('EspionageSystem — cooldowns', () => {
  it('getCooldownUntil returns 0 initially', () => {
    const { espionage } = buildState();
    expect(espionage.getCooldownUntil('player')).toBe(0);
  });

  it('blocks a second op on the same turn', () => {
    const { state, espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    espionage.executeOperation('player', 'enemy', 'steal_intel'); // sets cooldown to turn+1=2
    state.factionRegistry.get('player')!.ipcs = 50; // restore for second attempt
    const result = espionage.executeOperation('player', 'enemy', 'steal_intel');
    expect(result.success).toBe(false);
    expect(result.detail).toMatch(/recover/i);
    vi.restoreAllMocks();
  });

  it('allows op on the turn AFTER cooldown expires', () => {
    const { state, espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    espionage.executeOperation('player', 'enemy', 'steal_intel');
    state.turnNumber = 2; // advance past cooldown (cooldown was set to 2)
    state.factionRegistry.get('player')!.ipcs = 50;
    const result = espionage.executeOperation('player', 'enemy', 'steal_intel');
    // Should not be blocked by cooldown (may succeed or fail based on mock)
    expect(result.detail).not.toMatch(/recover/i);
    vi.restoreAllMocks();
  });
});

// ── History ───────────────────────────────────────────────────────────────────

describe('EspionageSystem — history', () => {
  it('getHistory returns empty array initially', () => {
    const { espionage } = buildState();
    expect(espionage.getHistory('player')).toHaveLength(0);
  });

  it('records one entry after executing an operation', () => {
    const { espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    espionage.executeOperation('player', 'enemy', 'steal_intel');
    const history = espionage.getHistory('player');
    expect(history).toHaveLength(1);
    expect(history[0].opType).toBe('steal_intel');
    expect(history[0].targetFactionId).toBe('enemy');
    vi.restoreAllMocks();
  });

  it('caps history at 10 entries', () => {
    const { state, espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    for (let turn = 1; turn <= 12; turn++) {
      state.turnNumber = turn;
      state.factionRegistry.get('player')!.ipcs = 50;
      espionage.executeOperation('player', 'enemy', 'steal_intel');
    }
    expect(espionage.getHistory('player').length).toBeLessThanOrEqual(10);
    vi.restoreAllMocks();
  });

  it('getHistory respects the limit parameter', () => {
    const { state, espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    for (let turn = 1; turn <= 5; turn++) {
      state.turnNumber = turn;
      state.factionRegistry.get('player')!.ipcs = 50;
      espionage.executeOperation('player', 'enemy', 'steal_intel');
    }
    expect(espionage.getHistory('player', 3)).toHaveLength(3);
    vi.restoreAllMocks();
  });
});

// ── Economic disruption effect ─────────────────────────────────────────────────

describe('EspionageSystem — economic_disruption effect', () => {
  it('transfers IPCs from target to initiator on success', () => {
    const { state, espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0); // always success
    const enemyBefore = state.factionRegistry.get('enemy')!.ipcs;
    const playerBefore = state.factionRegistry.get('player')!.ipcs;
    espionage.executeOperation('player', 'enemy', 'economic_disruption'); // cost 15, success transfers 15%
    const stolen = Math.floor(enemyBefore * 0.15);
    expect(state.factionRegistry.get('enemy')!.ipcs).toBe(enemyBefore - stolen);
    expect(state.factionRegistry.get('player')!.ipcs).toBe(playerBefore - 15 + stolen);
    vi.restoreAllMocks();
  });
});

// ── Intel reveal effect ────────────────────────────────────────────────────────

describe('EspionageSystem — steal_intel effect', () => {
  it('marks enemy territories as revealed for 3 turns on success', () => {
    const { espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    espionage.executeOperation('player', 'enemy', 'steal_intel');
    expect(espionage.isIntelRevealed('enemy_cap')).toBe(true);
    vi.restoreAllMocks();
  });

  it('intel expires after the reveal window', () => {
    const { state, espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    espionage.executeOperation('player', 'enemy', 'steal_intel');
    state.turnNumber = 5; // past turn 1+3=4
    expect(espionage.isIntelRevealed('enemy_cap')).toBe(false);
    vi.restoreAllMocks();
  });
});

// ── Propaganda effect ─────────────────────────────────────────────────────────

describe('EspionageSystem — propaganda_campaign effect', () => {
  it('raises enemy war weariness by 20 on success', () => {
    const { state, espionage } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const enemy = state.factionRegistry.get('enemy')!;
    const before = enemy.warWeariness ?? 0;
    espionage.executeOperation('player', 'enemy', 'propaganda_campaign');
    expect(enemy.warWeariness).toBe(Math.min(100, before + 20));
    vi.restoreAllMocks();
  });
});
