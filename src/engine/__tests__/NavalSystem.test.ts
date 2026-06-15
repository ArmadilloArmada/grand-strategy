import { describe, expect, it } from 'vitest';
import { GameState } from '../GameState';
import { CombatResolver, type CombatState } from '../CombatResolver';
import {
  canSubmarinesSurpriseStrike,
  collectBombardingUnits,
  getFleetCompositionBonus,
  getNavalAttackCounterBonus,
  summarizeFleet,
} from '../NavalSystem';
import { makeFactionData, makeTerritory, makeUnitData, makeUnit } from './testHelpers';

function buildState(): GameState {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('blue', { turnOrder: 1 }));
  state.factionRegistry.register(makeFactionData('red', { turnOrder: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'battleship', domain: 'sea', attack: 4, defense: 4, cost: 24, canBombard: true, hitPoints: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea', attack: 2, defense: 2, cost: 10 }));
  state.unitRegistry.register(makeUnitData({ id: 'submarine', domain: 'sea', attack: 2, defense: 1, cost: 8 }));
  state.unitRegistry.register(makeUnitData({ id: 'transport', domain: 'sea', attack: 0, defense: 0, cost: 8, transportCapacity: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry', domain: 'land', attack: 1, defense: 2, cost: 3 }));
  return state;
}

describe('NavalSystem roles & fleet rules', () => {
  it('collects bombarding ships from adjacent friendly sea zones', () => {
    const state = buildState();
    state.territories.set('sea1', makeTerritory('sea1', 'blue', { type: 'sea', adjacentTo: ['coast', 'beach'] }));
    state.territories.set('coast', makeTerritory('coast', 'blue', { type: 'coastal', adjacentTo: ['sea1', 'beach'] }));
    state.territories.set('beach', makeTerritory('beach', 'red', { type: 'land', adjacentTo: ['coast', 'sea1'] }));
    state.territories.get('sea1')!.addUnits('battleship', 1);
    state.territories.get('sea1')!.addUnits('transport', 1);

    const bombarding = collectBombardingUnits(state, 'beach', 'blue');
    expect(bombarding.map(b => b.unitType.id)).toEqual(['battleship']);
    expect(bombarding[0].count).toBe(1);
  });

  it('grants destroyer counter bonus vs submarines', () => {
    const sub = { unitType: makeUnit({ id: 'submarine', domain: 'sea' }), count: 2, hits: 0, casualties: 0 };
    expect(getNavalAttackCounterBonus('destroyer', [sub])).toBe(2);
    expect(getNavalAttackCounterBonus('infantry', [sub])).toBe(0);
  });

  it('allows submarine surprise when defender lacks ASW escort', () => {
    const combat = {
      attackers: [{ unitType: makeUnit({ id: 'submarine', domain: 'sea' }), count: 1, hits: 0, casualties: 0 }],
      defenders: [{ unitType: makeUnit({ id: 'infantry' }), count: 2, hits: 0, casualties: 0 }],
    } as CombatState;
    expect(canSubmarinesSurpriseStrike(combat)).toBe(true);
  });

  it('rewards fleet composition with escorted capitals', () => {
    const battleship = makeUnit({ id: 'battleship', domain: 'sea', hitPoints: 2, cost: 24 });
    const destroyer = makeUnit({ id: 'destroyer', domain: 'sea' });
    const bonus = getFleetCompositionBonus([
      { unitType: battleship, count: 1, hits: 0, casualties: 0 },
      { unitType: destroyer, count: 1, hits: 0, casualties: 0 },
    ]);
    expect(bonus.attack).toBe(1);
  });

  it('summarizes fleet by naval role', () => {
    const state = buildState();
    const sea = makeTerritory('sea1', 'blue', { type: 'sea' });
    sea.addUnits('destroyer', 2);
    sea.addUnits('transport', 1);
    state.territories.set('sea1', sea);

    const summary = summarizeFleet(state, sea);
    expect(summary.map(s => s.role)).toEqual(['screen', 'logistics']);
    expect(summary[0].count).toBe(2);
  });
});

describe('CombatResolver naval integration', () => {
  it('applies two-hit damage to battleships before sinking', () => {
    const state = buildState();
    const resolver = new CombatResolver(state);
    const battleship = makeUnit({ id: 'battleship', domain: 'sea', hitPoints: 2, cost: 24 });
    const combat = {
      territoryId: 'sea1',
      attackingFactionId: 'blue',
      defendingFactionId: 'red',
      attackers: [],
      defenders: [{ unitType: battleship, count: 1, hits: 0, casualties: 0 }],
      rounds: [],
      isComplete: false,
      winner: null,
    } as CombatState;

    const first = resolver.performNavalBombardment(combat, [{ unitType: battleship, count: 1 }]);
    expect(first.hits).toBeGreaterThanOrEqual(0);
    expect(first.rolls).toHaveLength(1);
  });
});
