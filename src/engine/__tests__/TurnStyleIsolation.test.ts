/**
 * Ensures move-for-move mechanics do not leak into other turn styles.
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { TurnManager } from '../TurnManager';
import { getPhasesForStyle, isMoveForMoveStyle } from '../TurnStyleManager';
import type { TurnStyle } from '../GameConfig';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

const NON_MFM_STYLES: TurnStyle[] = ['classic', 'quick', 'spectator', 'action', 'civilization', 'chess'];

function buildTwoFactionState(): { state: GameState; tm: TurnManager } {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('alpha', { capital: 'alpha_cap', turnOrder: 1, allies: [], startingIPCs: 10 }));
  state.factionRegistry.register(makeFactionData('beta', { capital: 'beta_cap', turnOrder: 2, allies: [], startingIPCs: 10 }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3, attack: 1, defense: 2 }));
  state.territories.set('alpha_cap', makeTerritory('alpha_cap', 'alpha', { isCapital: true, production: 3, hasFactory: true, adjacentTo: ['beta_cap'] }));
  state.territories.set('beta_cap', makeTerritory('beta_cap', 'beta', { isCapital: true, production: 3, hasFactory: true, adjacentTo: ['alpha_cap'] }));
  return { state, tm: new TurnManager(state) };
}

describe('Turn style isolation', () => {
  it.each(NON_MFM_STYLES)('%s is not flagged as move-for-move', (style) => {
    expect(isMoveForMoveStyle(style)).toBe(false);
  });

  it.each(NON_MFM_STYLES)('%s never activates alternating move segment on phase advance', (style) => {
    const { state, tm } = buildTwoFactionState();
    tm.setTurnStyle(style);
    tm.startGame();

    expect(tm.isMoveForMoveSegmentActive()).toBe(false);
    expect(tm.moveForMoveTurnOwnerId).toBeNull();

    const phases = getPhasesForStyle(style);
    const maxSteps = phases.length + 2;
    for (let i = 0; i < maxSteps; i++) {
      tm.advancePhase();
      expect(tm.isMoveForMoveSegmentActive()).toBe(false);
      expect(tm.moveForMoveTurnOwnerId).toBeNull();
      if (state.currentFactionId !== 'alpha') break;
    }
  });

  it('quick build advances to move on same faction without segment owner', () => {
    const { state, tm } = buildTwoFactionState();
    tm.setTurnStyle('quick');
    tm.startGame();

    expect(state.currentPhase).toBe('build');
    tm.advancePhase();
    expect(state.currentPhase as string).toBe('move');
    expect(tm.isMoveForMoveSegmentActive()).toBe(false);
    expect(state.currentFactionId).toBe('alpha');
  });

  it('classic advances purchase to combat_move on same faction', () => {
    const { state, tm } = buildTwoFactionState();
    tm.setTurnStyle('classic');
    tm.startGame();

    expect(state.currentPhase).toBe('purchase');
    tm.advancePhase();
    expect(state.currentPhase).toBe('combat_move');
    expect(tm.isMoveForMoveSegmentActive()).toBe(false);
    expect(state.currentFactionId).toBe('alpha');
  });

  it('passMoveForMoveTurn is a no-op when segment inactive', () => {
    const { tm } = buildTwoFactionState();
    tm.setTurnStyle('quick');
    tm.startGame();
    tm.passMoveForMoveTurn();
    expect(tm.isMoveForMoveSegmentActive()).toBe(false);
  });

  it('move_for_move uses a single play phase with freeform segment', () => {
    const { state, tm } = buildTwoFactionState();
    tm.setTurnStyle('move_for_move');
    tm.startGame();

    expect(getPhasesForStyle('move_for_move')).toEqual(['play']);
    expect(state.currentPhase as string).toBe('play');
    expect(tm.isMoveForMoveSegmentActive()).toBe(true);
    expect(tm.moveForMoveTurnOwnerId).toBe('alpha');
  });

  it('move_for_move end turn advances faction and keeps play phase', () => {
    const { state, tm } = buildTwoFactionState();
    state.territories.get('alpha_cap')!.addUnits('infantry', 2);
    tm.setTurnStyle('move_for_move');
    tm.startGame();

    const ipcsBefore = state.factionRegistry.get('alpha')!.ipcs;
    tm.advancePhase();

    expect(state.currentFactionId).toBe('beta');
    expect(state.currentPhase as string).toBe('play');
    expect(tm.moveForMoveTurnOwnerId).toBe('beta');
    expect(state.factionRegistry.get('alpha')!.ipcs).toBeGreaterThan(ipcsBefore);
  });
});
