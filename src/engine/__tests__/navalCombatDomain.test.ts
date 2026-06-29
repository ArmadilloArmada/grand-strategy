import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { CombatResolver } from '../CombatResolver';
import {
  canUnitEngageTarget,
  getLandAntiNavalAttack,
  getLandAntiNavalDefense,
} from '../NavalSystem';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

describe('naval combat domain rules', () => {
  it('infantry can engage ships at reduced power; artillery at full', () => {
    const infantry = makeUnitData({ id: 'infantry', domain: 'land' as const, attack: 2, defense: 2 });
    const artillery = makeUnitData({ id: 'artillery', domain: 'land' as const, canBombard: true, attack: 3 });
    const destroyer = makeUnitData({ id: 'destroyer', domain: 'sea' as const });

    expect(canUnitEngageTarget(infantry as any, destroyer as any)).toBe(true);
    expect(canUnitEngageTarget(destroyer as any, infantry as any)).toBe(true);
    expect(canUnitEngageTarget(artillery as any, destroyer as any)).toBe(true);
    expect(getLandAntiNavalAttack(infantry as any, 2)).toBe(1);
    expect(getLandAntiNavalAttack(artillery as any, 3)).toBe(3);
    expect(getLandAntiNavalDefense(infantry as any, 2)).toBe(1);
  });

  it('pulls offshore fleet into coastal defense', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('atk', { capital: 'src', allies: [], startingIPCs: 10 }));
    state.factionRegistry.register(makeFactionData('def', { capital: 'coast', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'infantry' }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as const, attack: 2, defense: 2 }));

    const src = makeTerritory('src', 'atk', { type: 'land' as const, adjacentTo: ['coast'] });
    const coast = makeTerritory('coast', 'def', { type: 'coastal' as const, adjacentTo: ['src', 'sea1'] });
    const sea1 = makeTerritory('sea1', 'def', { type: 'sea' as const, adjacentTo: ['coast'] });
    state.territories.set('src', src);
    state.territories.set('coast', coast);
    state.territories.set('sea1', sea1);
    sea1.addUnits('destroyer', 3);

    const resolver = new CombatResolver(state);
    const combat = resolver.initiateCombat('coast', 'atk', [{ unitTypeId: 'infantry', count: 5 }], 'src');

    expect(combat).not.toBeNull();
    expect(combat!.defenders.some(d => d.unitType.id === 'destroyer' && d.stationedTerritoryId === 'sea1')).toBe(true);
  });

  it('infantry generates penalized attack rolls against offshore destroyers', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('atk', { capital: 'src', allies: [], startingIPCs: 10 }));
    state.factionRegistry.register(makeFactionData('def', { capital: 'coast', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'infantry' }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as const, attack: 2, defense: 2 }));

    const src = makeTerritory('src', 'atk', { type: 'land' as const, adjacentTo: ['coast'] });
    const coast = makeTerritory('coast', 'def', { type: 'coastal' as const, adjacentTo: ['src', 'sea1'] });
    const sea1 = makeTerritory('sea1', 'def', { type: 'sea' as const, adjacentTo: ['coast'] });
    state.territories.set('src', src);
    state.territories.set('coast', coast);
    state.territories.set('sea1', sea1);
    sea1.addUnits('destroyer', 3);

    const resolver = new CombatResolver(state);
    const combat = resolver.initiateCombat('coast', 'atk', [{ unitTypeId: 'infantry', count: 5 }], 'src');
    expect(combat).not.toBeNull();
    expect(combat!.defenders.every(d => d.unitType.domain === 'sea')).toBe(true);

    const result = resolver.resolveCombatRound(combat!);
    expect(result.attackerRolls.length).toBeGreaterThan(0);
    expect(result.defenderRolls.length).toBeGreaterThan(0);
  });

  it('coastal strike fleet performs shore bombardment before strategic rounds', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('atk', { capital: 'sea1', allies: [], startingIPCs: 10 }));
    state.factionRegistry.register(makeFactionData('def', { capital: 'coast', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'infantry' }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as const, attack: 2, defense: 2 }));

    const sea1 = makeTerritory('sea1', 'atk', { type: 'sea' as const, adjacentTo: ['coast'] });
    const coast = makeTerritory('coast', 'def', { type: 'coastal' as const, adjacentTo: ['sea1'] });
    state.territories.set('sea1', sea1);
    state.territories.set('coast', coast);
    coast.addUnits('infantry', 4);

    const resolver = new CombatResolver(state);
    const combat = resolver.initiateCombat(
      'coast',
      'atk',
      [{ unitTypeId: 'destroyer', count: 3 }],
      'sea1',
    );
    expect(combat).not.toBeNull();

    const preCombat = resolver.runPreCombatPhases(combat!);
    expect(preCombat.shoreBombardment?.rolls.length).toBe(3);
  });
});
