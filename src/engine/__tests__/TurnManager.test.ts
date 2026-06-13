/**
 * TurnManager tests — season cycling, victory detection, faction cycling, income collection.
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { TurnManager } from '../TurnManager';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

// ── helpers ──────────────────────────────────────────────────────────────────

function buildTwoFactionState(): { state: GameState; tm: TurnManager } {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('alpha', { capital: 'alpha_cap', turnOrder: 1, allies: [], startingIPCs: 10 }));
  state.factionRegistry.register(makeFactionData('beta',  { capital: 'beta_cap',  turnOrder: 2, allies: [], startingIPCs: 10 }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3, attack: 1, defense: 2 }));

  const alphaCap = makeTerritory('alpha_cap', 'alpha', { isCapital: true, production: 3, hasFactory: true, adjacentTo: ['beta_cap'] });
  const betaCap  = makeTerritory('beta_cap',  'beta',  { isCapital: true, production: 3, hasFactory: true, adjacentTo: ['alpha_cap'] });
  state.territories.set('alpha_cap', alphaCap);
  state.territories.set('beta_cap', betaCap);

  const tm = new TurnManager(state);
  return { state, tm };
}

// ── Season cycling ────────────────────────────────────────────────────────────

describe('TurnManager — season cycling', () => {
  it('starts in spring on turn 1', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    expect(state.currentSeason).toBe('spring');
  });

  it('advances to summer after TURNS_PER_SEASON full rounds', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    // 3 full rounds (each round = all factions)
    for (let i = 0; i < 3; i++) {
      // advance through all phases for each faction
      while (state.getCurrentFaction()?.id === 'alpha') tm.advancePhase();
      while (state.getCurrentFaction()?.id === 'beta') tm.advancePhase();
    }
    // Turn 4 should be summer
    expect(state.turnNumber).toBe(4);
    expect(state.currentSeason).toBe('summer');
  });

  it('cycles all four seasons', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    const seen = new Set<string>();
    seen.add(state.currentSeason);

    // Run up to 50 rounds or until all seasons seen
    let safetyBreak = 0;
    while (seen.size < 4 && safetyBreak++ < 200) {
      while (state.getCurrentFaction()?.id === 'alpha') tm.advancePhase();
      while (state.getCurrentFaction()?.id === 'beta') tm.advancePhase();
      seen.add(state.currentSeason);
    }
    expect([...seen].sort()).toEqual(['autumn', 'spring', 'summer', 'winter']);
  });
});

// ── Faction cycling ───────────────────────────────────────────────────────────

describe('TurnManager — faction cycling', () => {
  it('starts with the first faction in turn order', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    expect(state.currentFactionId).toBe('alpha');
  });

  it('moves to the next faction after all phases complete', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    while (state.getCurrentFaction()?.id === 'alpha') tm.advancePhase();
    expect(state.currentFactionId).toBe('beta');
  });

  it('wraps back to first faction after the last faction finishes', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    while (state.getCurrentFaction()?.id === 'alpha') tm.advancePhase();
    while (state.getCurrentFaction()?.id === 'beta') tm.advancePhase();
    expect(state.currentFactionId).toBe('alpha');
    expect(state.turnNumber).toBe(2);
  });

  it('increments turnNumber only after all factions have gone', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    expect(state.turnNumber).toBe(1);
    while (state.getCurrentFaction()?.id === 'alpha') tm.advancePhase();
    expect(state.turnNumber).toBe(1); // still 1 after only alpha finishes
    while (state.getCurrentFaction()?.id === 'beta') tm.advancePhase();
    expect(state.turnNumber).toBe(2);
  });
});

// ── Income collection ─────────────────────────────────────────────────────────

describe('TurnManager — income collection', () => {
  it('collects income at the start of income phase', () => {
    const { state, tm } = buildTwoFactionState();
    tm.startGame();
    const faction = state.factionRegistry.get('alpha')!;
    const ipcsBefore = faction.ipcs;

    // Advance alpha all the way through to income
    while (state.getCurrentFaction()?.id === 'alpha') tm.advancePhase();

    expect(faction.ipcs).toBeGreaterThan(ipcsBefore);
  });

  it('income equals sum of owned territory production', () => {
    const { state, tm } = buildTwoFactionState();
    // Give alpha an extra territory worth 5
    const extra = makeTerritory('extra', 'alpha', { production: 5, adjacentTo: [] });
    state.territories.set('extra', extra);

    tm.startGame();
    const faction = state.factionRegistry.get('alpha')!;
    const ipcsBefore = faction.ipcs;

    while (state.getCurrentFaction()?.id === 'alpha') tm.advancePhase();

    const expectedIncome = 3 + 5 + state.rules.capitalBonusIPCs; // alpha_cap(3) + extra(5) + capital bonus
    expect(faction.ipcs).toBe(ipcsBefore + expectedIncome);
  });
});

// ── Victory detection ─────────────────────────────────────────────────────────

describe('TurnManager — victory detection', () => {
  it('detects capital victory when required capitals are held', () => {
    const { state, tm } = buildTwoFactionState();
    // With only 2 factions there is only 1 enemy capital — lower the requirement
    (state.rules as any).victoryCapitalsRequired = 1;
    // Give alpha beta's capital
    state.territories.get('beta_cap')!.owner = 'alpha';

    const winner = tm.checkVictory();
    expect(winner?.id).toBe('alpha');
  });

  it('returns null when no faction has won', () => {
    const { tm } = buildTwoFactionState();
    const winner = tm.checkVictory();
    expect(winner).toBeNull();
  });

  it('detects economic victory', () => {
    const { state, tm } = buildTwoFactionState();
    (state.rules as any).victoryType = 'economic';
    (state.rules as any).victoryIPCThreshold = 50;
    state.factionRegistry.get('alpha')!.ipcs = 50;

    const winner = tm.checkVictory();
    expect(winner?.id).toBe('alpha');
  });

  it('detects territorial victory', () => {
    const { state, tm } = buildTwoFactionState();
    (state.rules as any).victoryType = 'territorial';
    (state.rules as any).victoryTerritoryCount = 2;
    // alpha already owns both territories
    state.territories.get('beta_cap')!.owner = 'alpha';

    const winner = tm.checkVictory();
    expect(winner?.id).toBe('alpha');
  });
});

// ── Turn style ────────────────────────────────────────────────────────────────

describe('TurnManager — turn style phases', () => {
  it('classic style includes purchase phase', () => {
    const { tm } = buildTwoFactionState();
    tm.setTurnStyle('classic');
    expect(tm.getPhases()[0]).toBe('purchase');
  });

  it('quick style produces fewer phases than classic', () => {
    const { tm } = buildTwoFactionState();
    tm.setTurnStyle('classic');
    const classicLen = tm.getPhases().length;
    tm.setTurnStyle('quick');
    expect(tm.getPhases().length).toBeLessThan(classicLen);
  });

  it('move_for_move enters alternating move segment after the active faction finishes build', () => {
    const { state, tm } = buildTwoFactionState();
    state.territories.get('alpha_cap')!.addUnits('infantry', 3);
    state.territories.get('beta_cap')!.addUnits('infantry', 3);
    tm.setTurnStyle('move_for_move');
    tm.startGame();
    expect(state.currentPhase).toBe('build');
    expect(state.currentFactionId).toBe('alpha');

    tm.advancePhase();
    expect(state.currentPhase).toBe('move');
    expect(tm.isMoveForMoveSegmentActive()).toBe(true);
    expect(tm.moveForMoveTurnOwnerId).toBe('alpha');
  });
});
