import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { resolveTerritoryForNavalUnitPlacement, territoryAcceptsNavalUnit } from '../navalPlacement';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

describe('navalPlacement', () => {
  it('territoryAcceptsNavalUnit is sea or coastal only', () => {
    expect(territoryAcceptsNavalUnit(makeTerritory('s', null, { type: 'sea' as any }))).toBe(true);
    expect(territoryAcceptsNavalUnit(makeTerritory('c', 'p', { type: 'coastal' as any }))).toBe(true);
    expect(territoryAcceptsNavalUnit(makeTerritory('l', 'p', { type: 'land' as any }))).toBe(false);
  });

  it('returns preferred tile for land units', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'infantry' }));
    const cap = makeTerritory('cap', 'p', { type: 'land' as any, adjacentTo: ['sea1'] });
    const sea = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['cap'] });
    state.territories.set('cap', cap);
    state.territories.set('sea1', sea);
    expect(resolveTerritoryForNavalUnitPlacement(state, cap, 'infantry', 'p')?.id).toBe('cap');
  });

  it('redirects naval spawn from inland capital to adjacent owned coastal', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as any, cost: 8 }));
    const cap = makeTerritory('cap', 'p', { type: 'land' as any, adjacentTo: ['port'] });
    const port = makeTerritory('port', 'p', { type: 'coastal' as any, adjacentTo: ['cap', 'sea1'] });
    const sea1 = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['port'] });
    state.territories.set('cap', cap);
    state.territories.set('port', port);
    state.territories.set('sea1', sea1);
    const spawn = resolveTerritoryForNavalUnitPlacement(state, cap, 'destroyer', 'p');
    expect(spawn?.id).toBe('port');
  });

  it('redirects to neutral adjacent sea when no owned coastal', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as any }));
    const cap = makeTerritory('cap', 'p', { type: 'land' as any, adjacentTo: ['sea1'] });
    const sea1 = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['cap'] });
    state.territories.set('cap', cap);
    state.territories.set('sea1', sea1);
    const spawn = resolveTerritoryForNavalUnitPlacement(state, cap, 'destroyer', 'p');
    expect(spawn?.id).toBe('sea1');
  });

  it('keeps naval spawn on coastal capital', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'transport', domain: 'sea' as any, transportCapacity: 2 }));
    const cap = makeTerritory('cap', 'p', { type: 'coastal' as any, adjacentTo: ['sea1'] });
    const sea1 = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['cap'] });
    state.territories.set('cap', cap);
    state.territories.set('sea1', sea1);
    expect(resolveTerritoryForNavalUnitPlacement(state, cap, 'transport', 'p')?.id).toBe('cap');
  });
});
