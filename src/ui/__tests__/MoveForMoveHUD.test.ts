import { describe, it, expect } from 'vitest';
import { GameState } from '../../engine/GameState';
import { TurnManager } from '../../engine/TurnManager';
import { buildMoveForMoveView } from '../hud/MoveForMoveHUD';
import { makeFactionData, makeTerritory } from '../../engine/__tests__/testHelpers';

describe('MoveForMoveHUD view', () => {
  it('allows freeform build messaging on play phase', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('alpha', { turnOrder: 1 }));
    state.factionRegistry.register(makeFactionData('beta', { turnOrder: 2 }));
    state.factionRegistry.get('alpha')!.controlledBy = 'human';
    state.territories.set('alpha_cap', makeTerritory('alpha_cap', 'alpha', { isCapital: true }));
    const tm = new TurnManager(state);
    tm.setTurnStyle('move_for_move');
    tm.startGame();

    const view = buildMoveForMoveView(state, tm);
    expect(view.endButtonLabel).toBe('End Turn');
    expect(view.contextLine).toContain('Build anytime');
    expect(view.canPass).toBe(true);
  });

  it('enables pass and end turn for human on play phase', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('alpha', { turnOrder: 1 }));
    state.factionRegistry.register(makeFactionData('beta', { turnOrder: 2 }));
    state.territories.set('alpha_cap', makeTerritory('alpha_cap', 'alpha', { isCapital: true, adjacentTo: ['beta_cap'] }));
    state.territories.set('beta_cap', makeTerritory('beta_cap', 'beta', { isCapital: true, adjacentTo: ['alpha_cap'] }));
    state.territories.get('alpha_cap')!.addUnits('infantry', 2);
    state.factionRegistry.get('alpha')!.controlledBy = 'human';

    const tm = new TurnManager(state);
    tm.setTurnStyle('move_for_move');
    tm.startGame();

    const view = buildMoveForMoveView(state, tm);
    expect(view.canPass).toBe(true);
    expect(view.canEndTurn).toBe(true);
    expect(view.isTurnOwner).toBe(true);
  });
});
