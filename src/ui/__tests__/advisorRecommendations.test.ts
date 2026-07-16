import { describe, expect, it } from 'vitest';
import { GameState } from '../../engine/GameState';
import { MobilizationSystem } from '../../engine/MobilizationSystem';
import { MovementValidator } from '../../engine/MovementValidator';
import {
  getMobilizationAdvice,
  getNavalMobilizationAdvice,
  getBestMobilizationTarget,
  getBestMovementSource,
} from '../advisorRecommendations';
import { buildMovementState, makeFactionData, makeUnitData } from '../../engine/__tests__/testHelpers';

function emptyMobilizationState(): GameState {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('player', { capital: 'cap', startingIPCs: 100 }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3 }));
  state.currentFactionId = 'player';
  return state;
}

describe('getNavalMobilizationAdvice', () => {
  it('returns null on non-naval maps', () => {
    const sys = new MobilizationSystem(emptyMobilizationState());
    expect(getNavalMobilizationAdvice(sys, 'grid-europe')).toBeNull();
  });
  it('returns null on naval maps when no coastal option is available', () => {
    const sys = new MobilizationSystem(emptyMobilizationState());
    expect(getNavalMobilizationAdvice(sys, 'grid-pacific')).toBeNull();
  });
});

describe('getMobilizationAdvice', () => {
  it('advises preserving IPCs when nothing can be mobilized', () => {
    const sys = new MobilizationSystem(emptyMobilizationState());
    expect(getMobilizationAdvice(sys, 'grid-europe')).toContain('No affordable mobilization');
  });
});

describe('getBestMobilizationTarget', () => {
  it('returns null when there are no mobilization options', () => {
    const state = emptyMobilizationState();
    const sys = new MobilizationSystem(state);
    expect(getBestMobilizationTarget(sys, state)).toBeNull();
  });
});

describe('getBestMovementSource', () => {
  it('recommends the owned territory that has ready units and legal moves', () => {
    const state = buildMovementState(); // player owns 'a' (2 inf + 1 tank) adjacent to 'b'
    const mv = new MovementValidator(state);
    const rec = getBestMovementSource(state, mv, 'player');
    expect(rec).not.toBeNull();
    expect(rec!.territoryId).toBe('a');
    expect(rec!.moves + rec!.attacks).toBeGreaterThan(0);
  });

  it('returns null for a faction with no ready units', () => {
    const state = buildMovementState();
    const mv = new MovementValidator(state);
    // 'enemy' owns only 'c' with no units.
    expect(getBestMovementSource(state, mv, 'enemy')).toBeNull();
  });
});
