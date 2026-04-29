/**
 * SupplySystem tests — isInSupply, getSupplyPenalty, and naval blockades.
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { SupplySystem } from '../SupplySystem';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

function buildState(): GameState {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', { capital: 'cap', allies: [] }));
  state.factionRegistry.register(makeFactionData('enemy', { capital: 'enemy_cap', allies: [] }));

  state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea', cost: 8, attack: 3, defense: 3 }));

  // Land chain: cap → city → frontier
  const cap = makeTerritory('cap', 'player', {
    isCapital: true, hasFactory: true, production: 4,
    adjacentTo: ['city', 'coastal_port'],
  });
  const city = makeTerritory('city', 'player', {
    adjacentTo: ['cap', 'frontier'],
  });
  const frontier = makeTerritory('frontier', 'player', {
    adjacentTo: ['city'],
  });
  const isolated = makeTerritory('isolated', 'player', {
    adjacentTo: [],
  });

  // Coastal territory adjacent to two sea zones
  const coastalPort = makeTerritory('coastal_port', 'player', {
    type: 'coastal', adjacentTo: ['cap', 'sea_north', 'sea_south'],
  });
  const seaNorth = makeTerritory('sea_north', null, { type: 'sea', adjacentTo: ['coastal_port'] });
  const seaSouth = makeTerritory('sea_south', null, { type: 'sea', adjacentTo: ['coastal_port'] });

  state.territories.set('cap', cap);
  state.territories.set('city', city);
  state.territories.set('frontier', frontier);
  state.territories.set('isolated', isolated);
  state.territories.set('coastal_port', coastalPort);
  state.territories.set('sea_north', seaNorth);
  state.territories.set('sea_south', seaSouth);

  state.currentFactionId = 'player';
  return state;
}

// ── isInSupply ────────────────────────────────────────────────────────────────

describe('SupplySystem — isInSupply', () => {
  it('capital is always in supply', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.isInSupply('cap', 'player')).toBe(true);
  });

  it('territory adjacent to capital+factory is in supply', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.isInSupply('city', 'player')).toBe(true);
  });

  it('territory two hops from capital via friendly chain is in supply', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.isInSupply('frontier', 'player')).toBe(true);
  });

  it('isolated territory with no path to supply is out of supply', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.isInSupply('isolated', 'player')).toBe(false);
  });

  it('returns false for non-existent territory', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.isInSupply('ghost', 'player')).toBe(false);
  });
});

// ── getSupplyPenalty ──────────────────────────────────────────────────────────

describe('SupplySystem — getSupplyPenalty', () => {
  it('returns zero penalty when in supply', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.getSupplyPenalty('cap', 'player')).toEqual({ attack: 0, defense: 0 });
  });

  it('returns -1 penalty when out of supply', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.getSupplyPenalty('isolated', 'player')).toEqual({ attack: 1, defense: 1 });
  });
});

// ── isNavalBlockaded ──────────────────────────────────────────────────────────

describe('SupplySystem — isNavalBlockaded', () => {
  it('land territory cannot be blockaded', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.isNavalBlockaded('cap', 'player')).toBe(false);
  });

  it('coastal territory with no enemy sea units is not blockaded', () => {
    const state = buildState();
    const sys = new SupplySystem(state);
    expect(sys.isNavalBlockaded('coastal_port', 'player')).toBe(false);
  });

  it('coastal territory is blockaded when all adjacent sea zones are enemy-controlled', () => {
    const state = buildState();
    const sys = new SupplySystem(state);

    // Give enemy ownership + units in BOTH sea zones
    const seaN = state.territories.get('sea_north')!;
    const seaS = state.territories.get('sea_south')!;
    seaN.owner = 'enemy';
    seaN.units.push({ unitTypeId: 'destroyer', count: 1 });
    seaS.owner = 'enemy';
    seaS.units.push({ unitTypeId: 'destroyer', count: 1 });

    state.diplomacyManager.forceWar('player', 'enemy');

    expect(sys.isNavalBlockaded('coastal_port', 'player')).toBe(true);
  });

  it('coastal territory is NOT blockaded when one sea zone remains open', () => {
    const state = buildState();
    const sys = new SupplySystem(state);

    // Only block sea_north
    const seaN = state.territories.get('sea_north')!;
    seaN.owner = 'enemy';
    seaN.units.push({ unitTypeId: 'destroyer', count: 1 });
    state.diplomacyManager.forceWar('player', 'enemy');

    expect(sys.isNavalBlockaded('coastal_port', 'player')).toBe(false);
  });

  it('blockaded territory earns no income in calculateIncome', () => {
    const state = buildState();

    const seaN = state.territories.get('sea_north')!;
    const seaS = state.territories.get('sea_south')!;
    seaN.owner = 'enemy';
    seaN.units.push({ unitTypeId: 'destroyer', count: 1 });
    seaS.owner = 'enemy';
    seaS.units.push({ unitTypeId: 'destroyer', count: 1 });
    state.diplomacyManager.forceWar('player', 'enemy');

    // calculateIncome includes capitalBonusIPCs from GameRules — compare delta instead of absolute.
    // Income with blockade should be exactly (coastal_port.production) less than without.
    const coastalProduction = state.territories.get('coastal_port')!.production;
    const incomeWithBlockade = state.calculateIncome('player');

    // Temporarily remove sea-zone units to measure unblockaded baseline
    seaN.units = [];
    seaS.units = [];
    const incomeWithout = state.calculateIncome('player');

    expect(incomeWithout - incomeWithBlockade).toBe(coastalProduction);
  });
});
