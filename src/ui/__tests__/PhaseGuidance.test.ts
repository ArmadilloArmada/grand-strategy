/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GameState } from '../../engine/GameState';
import { MovementValidator } from '../../engine/MovementValidator';
import { MobilizationSystem } from '../../engine/MobilizationSystem';
import { PhaseGuidance } from '../PhaseGuidance';
import { makeFactionData, makeTerritory } from '../../engine/__tests__/testHelpers';

function makeGuidance(): { state: GameState; guidance: PhaseGuidance } {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('atlantic_alliance', {
    name: 'Atlantic Alliance',
    capital: 'washington',
  }));
  state.currentFactionId = 'atlantic_alliance';
  state.territories.set('washington', makeTerritory('washington', 'atlantic_alliance', { name: 'Washington' }));
  const guidance = new PhaseGuidance(
    state,
    new MovementValidator(state),
    new MobilizationSystem(state),
  );
  return { state, guidance };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PhaseGuidance', () => {
  it('returns stable phase toast copy', () => {
    const { guidance } = makeGuidance();

    expect(guidance.getPhaseToast('purchase')).toBe('Click Mobilize to buy units');
    expect(guidance.getPhaseToast('unknown')).toBeNull();
  });

  it('returns first-turn tips only on turn one', () => {
    const { guidance } = makeGuidance();

    expect(guidance.getFirstTurnTip(1, 'combat_move')?.tipId).toBe('first-turn-combat_move');
    expect(guidance.getFirstTurnTip(2, 'combat_move')).toBeNull();
  });

  it('hides context helper for AI turns', () => {
    const { state, guidance } = makeGuidance();
    document.body.innerHTML = `
      <div id="context-helper" class="context-helper">
        <span id="context-helper-text"></span>
      </div>
    `;
    const faction = state.factionRegistry.get('atlantic_alliance');

    const tip = guidance.updateContextHelper({
      phase: 'move',
      faction,
      territory: undefined,
      isHumanTurn: false,
      isBuildPhase: false,
      isMovementPhase: false,
      isCombatPhase: false,
      isEndPhase: false,
    });

    expect(tip).toBeNull();
    expect(document.getElementById('context-helper')?.className).toContain('hidden');
    expect(document.getElementById('context-helper-text')?.textContent).toBe('');
  });

  it('surfaces combat guidance when battles are pending', () => {
    const { state, guidance } = makeGuidance();
    document.body.innerHTML = `
      <div id="context-helper" class="context-helper">
        <span id="context-helper-text"></span>
      </div>
    `;
    state.pendingMoves.push({} as any);

    const tip = guidance.updateContextHelper({
      phase: 'combat',
      faction: state.factionRegistry.get('atlantic_alliance'),
      territory: undefined,
      isHumanTurn: true,
      isBuildPhase: false,
      isMovementPhase: false,
      isCombatPhase: true,
      isEndPhase: false,
    });

    expect(tip?.tipId).toBe('combat');
    expect(document.getElementById('context-helper-text')?.textContent).toContain('1 battle to resolve');
  });

  it('suggests coastal transport mobilization on sea-heavy maps without lift', () => {
    const { state, guidance } = makeGuidance();
    document.body.innerHTML = `
      <div id="context-helper" class="context-helper">
        <span id="context-helper-text"></span>
      </div>
    `;
    for (let i = 0; i < 8; i++) {
      state.territories.set(`sea_${i}`, makeTerritory(`sea_${i}`, null, { type: 'sea', name: `Sea ${i}` }));
    }
    state.territories.set('port', makeTerritory('port', 'atlantic_alliance', {
      type: 'coastal',
      name: 'Port',
      production: 2,
      adjacentTo: ['sea_0'],
    }));
    state.factionRegistry.get('atlantic_alliance')!.ipcs = 20;

    const tip = guidance.updateContextHelper({
      phase: 'purchase',
      faction: state.factionRegistry.get('atlantic_alliance'),
      territory: undefined,
      isHumanTurn: true,
      isBuildPhase: true,
      isMovementPhase: false,
      isCombatPhase: false,
      isEndPhase: false,
    });

    expect(tip?.tipId).toBe('mobilize');
    expect(document.getElementById('context-helper-text')?.textContent).toMatch(/self-embark|marines/i);
  });

  it('hints at all-unit-types mode for mixed stacks', () => {
    const { state, guidance } = makeGuidance();
    document.body.innerHTML = `
      <div id="context-helper" class="context-helper">
        <span id="context-helper-text"></span>
      </div>
    `;
    state.territories.get('washington')!.addUnits('infantry', 3);
    state.territories.get('washington')!.addUnits('tank', 2);

    const tip = guidance.updateContextHelper({
      phase: 'move',
      faction: state.factionRegistry.get('atlantic_alliance'),
      territory: state.territories.get('washington'),
      isHumanTurn: true,
      isBuildPhase: false,
      isMovementPhase: true,
      isCombatPhase: false,
      isEndPhase: false,
      activeStackLabel: 'Washington: All unit types (2 move, 0 attack)',
      selectAllTypes: true,
      readyStackCount: 2,
    });

    expect(tip?.tipId).toBe('movement');
    expect(tip?.message).toMatch(/All unit types selected/i);
  });
});
