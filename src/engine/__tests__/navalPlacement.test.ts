import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { resolveTerritoryForNavalUnitPlacement, spawnUnitsOnTerritory, sanitizeLandUnitPlacement, sanitizeNavalUnitPlacement, territoryAcceptsNavalUnit } from '../navalPlacement';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

describe('navalPlacement', () => {
  it('territoryAcceptsNavalUnit is sea only', () => {
    expect(territoryAcceptsNavalUnit(makeTerritory('s', null, { type: 'sea' as any }))).toBe(true);
    expect(territoryAcceptsNavalUnit(makeTerritory('c', 'p', { type: 'coastal' as any }))).toBe(false);
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
    expect(resolveTerritoryForNavalUnitPlacement(state, cap, 'destroyer', 'p')?.id).toBe('sea1');
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

  it('spawns naval units in adjacent sea from coastal ports', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'transport', domain: 'sea' as any, transportCapacity: 2 }));
    const cap = makeTerritory('cap', 'p', { type: 'coastal' as any, adjacentTo: ['sea1'] });
    const sea1 = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['cap'] });
    state.territories.set('cap', cap);
    state.territories.set('sea1', sea1);
    expect(resolveTerritoryForNavalUnitPlacement(state, cap, 'transport', 'p')?.id).toBe('sea1');
  });

  it('claims sea zone ownership when spawning naval units', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as any }));
    const cap = makeTerritory('cap', 'p', { type: 'land' as any, adjacentTo: ['sea1'] });
    const sea1 = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['cap'] });
    state.territories.set('cap', cap);
    state.territories.set('sea1', sea1);

    const result = spawnUnitsOnTerritory(state, 'p', 'cap', 'destroyer', 1);
    expect(result.success).toBe(true);
    expect(sea1.owner).toBe('p');
    expect(sea1.units.some(u => u.unitTypeId === 'destroyer')).toBe(true);
  });

  it('never places naval units on pure land via spawnUnitsOnTerritory', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'submarine', domain: 'sea' as any, attack: 2, defense: 1 }));
    const land = makeTerritory('inland', 'p', { type: 'land' as any, adjacentTo: [] });
    state.territories.set('inland', land);

    const result = spawnUnitsOnTerritory(state, 'p', 'inland', 'submarine', 1);
    expect(result.success).toBe(false);
    expect(land.units).toHaveLength(0);
  });

  it('sanitizes naval units stranded on land tiles', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'submarine', domain: 'sea' as any }));
    const land = makeTerritory('inland', 'p', { type: 'land' as any, adjacentTo: ['sea1'] });
    const sea1 = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['inland'] });
    state.territories.set('inland', land);
    state.territories.set('sea1', sea1);
    land.addUnits('submarine', 1);

    expect(sanitizeNavalUnitPlacement(state)).toBe(1);
    expect(land.units).toHaveLength(0);
    expect(sea1.units.some(u => u.unitTypeId === 'submarine')).toBe(true);
  });

  it('sanitizes naval units stranded on coastal tiles', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'cap', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as any }));
    const coastal = makeTerritory('port', 'p', { type: 'coastal' as any, adjacentTo: ['sea1'] });
    const sea1 = makeTerritory('sea1', null, { type: 'sea' as any, adjacentTo: ['port'] });
    state.territories.set('port', coastal);
    state.territories.set('sea1', sea1);
    coastal.addUnits('destroyer', 2);

    expect(sanitizeNavalUnitPlacement(state)).toBe(2);
    expect(coastal.units).toHaveLength(0);
    expect(sea1.getUnitCount('destroyer')).toBe(2);
  });

  it('sanitizes land units stranded on sea tiles', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('p', { capital: 'home', allies: [], startingIPCs: 10 }));
    state.unitRegistry.register(makeUnitData({ id: 'infantry' }));
    const home = makeTerritory('home', 'p', { type: 'land' as any, adjacentTo: ['sea1'] });
    const sea1 = makeTerritory('sea1', 'p', { type: 'sea' as any, adjacentTo: ['home'] });
    state.territories.set('home', home);
    state.territories.set('sea1', sea1);
    sea1.addUnits('infantry', 3);

    expect(sanitizeLandUnitPlacement(state)).toBe(3);
    expect(sea1.units).toHaveLength(0);
    expect(home.getUnitCount('infantry')).toBe(3);
  });
});
