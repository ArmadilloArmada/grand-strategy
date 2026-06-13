import { describe, it, expect } from 'vitest';
import { GameState } from '../../engine/GameState';
import { TurnManager } from '../../engine/TurnManager';
import { buildMoveForMoveView } from '../hud/MoveForMoveHUD';
import { makeFactionData, makeTerritory } from '../../engine/__tests__/testHelpers';

describe('MoveForMoveHUD view', () => {
  it('labels build phase with Done Building action', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('alpha', { turnOrder: 1 }));
    state.factionRegistry.register(makeFactionData('beta', { turnOrder: 2 }));
    state.territories.set('alpha_cap', makeTerritory('alpha_cap', 'alpha', { isCapital: true }));
    const tm = new TurnManager(state);
    tm.setTurnStyle('move_for_move');
    tm.startGame();

    const view = buildMoveForMoveView(state, tm);
    expect(view.macroPhase).toBe('build');
    expect(view.endButtonLabel).toBe('Done Building');
    expect(view.canPass).toBe(false);
  });

  it('enables pass during human move segment', () => {
    const state = new GameState();
    const human = makeFactionData('alpha', { turnOrder: 1 } as Partial<import('../../data/Faction').FactionData>);
    state.factionRegistry.register(human);
    state.factionRegistry.get('alpha')!.controlledBy = 'human';
    state.factionRegistry.register(makeFactionData('beta', { turnOrder: 2 }));
    state.territories.set('alpha_cap', makeTerritory('alpha_cap', 'alpha', { isCapital: true, adjacentTo: ['beta_cap'] }));
    state.territories.set('beta_cap', makeTerritory('beta_cap', 'beta', { isCapital: true, adjacentTo: ['alpha_cap'] }));
    state.territories.get('alpha_cap')!.addUnits('infantry', 2);

    const tm = new TurnManager(state);
    tm.setTurnStyle('move_for_move');
    tm.startGame();
    tm.advancePhase();

    const view = buildMoveForMoveView(state, tm);
    expect(view.macroPhase).toBe('move');
    expect(view.canPass).toBe(true);
    expect(view.endButtonLabel).toBe('Finish Move Round');
  });
});
