/**
 * MobilizationSystem tests
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MobilizationSystem } from '../MobilizationSystem';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

function buildState() {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', {
    capital: 'cap',
    allies: [],
    startingIPCs: 100,
  }));

  // Register basic unit types
  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3, attack: 1, defense: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'tank', cost: 6, attack: 3, defense: 3 }));
  state.unitRegistry.register(makeUnitData({ id: 'artillery', cost: 4, attack: 2, defense: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'fighter', cost: 10, attack: 3, defense: 4, domain: 'air' }));

  state.currentFactionId = 'player';

  return state;
}

describe('MobilizationSystem — getMobilizationOptions', () => {
  it('returns no options when there are no territories', () => {
    const state = buildState();
    const sys = new MobilizationSystem(state);
    expect(sys.getMobilizationOptions()).toHaveLength(0);
  });

  it('returns options only for territories owned by current faction', () => {
    const state = buildState();
    const friendly = makeTerritory('friendly', 'player', { production: 2 });
    const enemy = makeTerritory('enemy', 'opponent', { production: 2 });
    state.territories.set('friendly', friendly);
    state.territories.set('enemy', enemy);

    const sys = new MobilizationSystem(state);
    const opts = sys.getMobilizationOptions();
    expect(opts).toHaveLength(1);
    expect(opts[0].territory.id).toBe('friendly');
  });

  it('excludes sea territories', () => {
    const state = buildState();
    const sea = makeTerritory('sea1', 'player', { production: 0, type: 'sea' } as any);
    state.territories.set('sea1', sea);

    const sys = new MobilizationSystem(state);
    expect(sys.getMobilizationOptions()).toHaveLength(0);
  });

  it('sorts factory options before capital before land', () => {
    const state = buildState();
    const land = makeTerritory('land1', 'player', { production: 2, hasFactory: false, isCapital: false });
    const cap = makeTerritory('cap', 'player', { production: 3, hasFactory: false, isCapital: true });
    const factory = makeTerritory('factory1', 'player', { production: 4, hasFactory: true, isCapital: false });
    state.territories.set('land1', land);
    state.territories.set('cap', cap);
    state.territories.set('factory1', factory);

    const sys = new MobilizationSystem(state);
    const opts = sys.getMobilizationOptions();
    // factory should come first
    expect(opts[0].type).toBe('factory');
  });
});

describe('MobilizationSystem — getTerritoryMobilization types', () => {
  it('factory territory produces factory type with tank+artillery+infantry', () => {
    const state = buildState();
    const t = makeTerritory('fact', 'player', { production: 2, hasFactory: true });
    state.territories.set('fact', t);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(t);
    expect(opt.type).toBe('factory');
    expect(opt.units.some(u => u.unitTypeId === 'tank')).toBe(true);
    expect(opt.units.some(u => u.unitTypeId === 'artillery')).toBe(true);
  });

  it('capital territory (non-factory) produces capital type with fighter', () => {
    const state = buildState();
    const t = makeTerritory('capital', 'player', { production: 2, hasFactory: false, isCapital: true });
    state.territories.set('capital', t);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(t);
    expect(opt.type).toBe('capital');
    expect(opt.units.some(u => u.unitTypeId === 'fighter')).toBe(true);
  });

  it('regular land territory produces land type with infantry', () => {
    const state = buildState();
    const t = makeTerritory('land1', 'player', { production: 2, hasFactory: false, isCapital: false });
    state.territories.set('land1', t);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(t);
    expect(opt.type).toBe('land');
    expect(opt.units.some(u => u.unitTypeId === 'infantry')).toBe(true);
  });

  it('coastal territory with sea access includes destroyer and marines', () => {
    const state = buildState();
    const sea = makeTerritory('sea1', null, { type: 'sea' as any, production: 0 });
    const coastal = makeTerritory('coast1', 'player', {
      type: 'coastal' as any,
      production: 2,
      hasFactory: false,
      isCapital: false,
      adjacentTo: ['sea1'],
    });
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', cost: 10, domain: 'sea' as any }));
    state.unitRegistry.register(makeUnitData({ id: 'marines', cost: 5, domain: 'land' as any, attack: 2, defense: 2, requiredTransport: true }));
    state.territories.set('sea1', sea);
    state.territories.set('coast1', coastal);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(coastal);
    expect(opt.type).toBe('coastal');
    expect(opt.units.some(u => u.unitTypeId === 'destroyer')).toBe(true);
    expect(opt.units.some(u => u.unitTypeId === 'marines')).toBe(true);
  });

  it('coastal mobilization places naval units in adjacent sea', () => {
    const state = buildState();
    const sea = makeTerritory('sea1', null, {
      type: 'sea' as any,
      production: 0,
      adjacentTo: ['coast1'],
    });
    const coastal = makeTerritory('coast1', 'player', {
      type: 'coastal' as any,
      production: 2,
      hasFactory: false,
      isCapital: false,
      adjacentTo: ['sea1'],
    });
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', cost: 10, domain: 'sea' as any }));
    state.unitRegistry.register(makeUnitData({ id: 'marines', cost: 5, domain: 'land' as any, attack: 2, defense: 2, requiredTransport: true }));
    state.territories.set('sea1', sea);
    state.territories.set('coast1', coastal);

    const sys = new MobilizationSystem(state);
    sys.mobilize('coast1');

    expect(sea.units.some(u => u.unitTypeId === 'destroyer')).toBe(true);
    expect(coastal.units.some(u => u.unitTypeId === 'infantry')).toBe(true);
    expect(coastal.units.some(u => u.unitTypeId === 'destroyer')).toBe(false);
    expect(sea.owner).toBe('player');
  });

  it('capital with sea access includes naval units and spawns them at sea', () => {
    const state = buildState();
    const sea = makeTerritory('sea1', null, {
      type: 'sea' as any,
      production: 0,
      adjacentTo: ['cap'],
    });
    const cap = makeTerritory('cap', 'player', {
      production: 3,
      hasFactory: false,
      isCapital: true,
      adjacentTo: ['sea1'],
    });
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', cost: 10, domain: 'sea' as any }));
    state.unitRegistry.register(makeUnitData({ id: 'marines', cost: 5, domain: 'land' as any, attack: 2, defense: 2, requiredTransport: true }));
    state.unitRegistry.register(makeUnitData({ id: 'cruiser', cost: 14, domain: 'sea' as any }));
    state.territories.set('sea1', sea);
    state.territories.set('cap', cap);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(cap);
    expect(opt.type).toBe('capital');
    expect(opt.units.some(u => u.unitTypeId === 'destroyer')).toBe(true);
    expect(opt.units.some(u => u.unitTypeId === 'marines')).toBe(true);

    const result = sys.mobilize('cap');
    expect(result.success).toBe(true);
    expect(sea.units.some(u => u.unitTypeId === 'destroyer')).toBe(true);
    expect(sea.owner).toBe('player');
  });

  it('factory with sea access includes naval units', () => {
    const state = buildState();
    const sea = makeTerritory('sea1', null, {
      type: 'sea' as any,
      production: 0,
      adjacentTo: ['fact'],
    });
    const factory = makeTerritory('fact', 'player', {
      production: 2,
      hasFactory: true,
      isCapital: false,
      adjacentTo: ['sea1'],
    });
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', cost: 10, domain: 'sea' as any }));
    state.unitRegistry.register(makeUnitData({ id: 'marines', cost: 5, domain: 'land' as any, attack: 2, defense: 2, requiredTransport: true }));
    state.territories.set('sea1', sea);
    state.territories.set('fact', factory);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(factory);
    expect(opt.type).toBe('factory');
    expect(opt.units.some(u => u.unitTypeId === 'destroyer')).toBe(true);
    expect(opt.units.some(u => u.unitTypeId === 'marines')).toBe(true);
  });

  it('does not swap faction unique unit on factory mobilization', () => {
    const state = buildState();
    state.unitRegistry.register(makeUnitData({
      id: 'marine',
      cost: 5,
      domain: 'land',
      factionId: 'player',
    }));
    const factory = makeTerritory('fact', 'player', { production: 2, hasFactory: true });
    state.territories.set('fact', factory);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(factory);
    expect(opt.units.some(u => u.unitTypeId === 'marine')).toBe(false);
    expect(opt.units.some(u => u.unitTypeId === 'infantry')).toBe(true);
  });

  it('canMobilize is false when faction lacks IPCs', () => {
    const state = buildState();
    const faction = state.factionRegistry.get('player')!;
    // Drain all IPCs
    faction.spendIPCs(faction.ipcs);

    const t = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', t);

    const sys = new MobilizationSystem(state);
    const opt = sys.getTerritoryMobilization(t);
    expect(opt.canMobilize).toBe(false);
    expect(opt.reason).toMatch(/IPCs/);
  });
});

describe('MobilizationSystem — mobilize()', () => {
  it('successful mobilization deducts IPCs', () => {
    const state = buildState();
    const faction = state.factionRegistry.get('player')!;
    const land = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', land);

    const sys = new MobilizationSystem(state);
    const beforeIPCs = faction.ipcs;
    const result = sys.mobilize('land1');
    expect(result.success).toBe(true);
    expect(faction.ipcs).toBeLessThan(beforeIPCs);
  });

  it('successful mobilization adds units to territory', () => {
    const state = buildState();
    const land = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', land);

    const sys = new MobilizationSystem(state);
    sys.mobilize('land1');
    expect(land.units.length).toBeGreaterThan(0);
  });

  it('mobilize returns failure for non-existent territory', () => {
    const state = buildState();
    const sys = new MobilizationSystem(state);
    const result = sys.mobilize('nonexistent');
    expect(result.success).toBe(false);
  });

  it('mobilize returns failure for enemy territory', () => {
    const state = buildState();
    const enemy = makeTerritory('enemy', 'opponent', { production: 2 });
    state.territories.set('enemy', enemy);

    const sys = new MobilizationSystem(state);
    const result = sys.mobilize('enemy');
    expect(result.success).toBe(false);
  });

  it('cannot mobilize same territory twice in one turn', () => {
    const state = buildState();
    const land = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', land);

    const sys = new MobilizationSystem(state);
    sys.mobilize('land1');
    const second = sys.mobilize('land1');
    expect(second.success).toBe(false);
    expect(second.reason).toMatch(/Already mobilized/);
  });
});

describe('MobilizationSystem — tracking helpers', () => {
  it('wasMobilized returns false before mobilization', () => {
    const state = buildState();
    const land = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', land);

    const sys = new MobilizationSystem(state);
    expect(sys.wasMobilized('land1')).toBe(false);
  });

  it('wasMobilized returns true after mobilization', () => {
    const state = buildState();
    const land = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', land);

    const sys = new MobilizationSystem(state);
    sys.mobilize('land1');
    expect(sys.wasMobilized('land1')).toBe(true);
  });

  it('getMobilizationCount increments correctly', () => {
    const state = buildState();
    const land1 = makeTerritory('land1', 'player', { production: 2 });
    const land2 = makeTerritory('land2', 'player', { production: 2 });
    state.territories.set('land1', land1);
    state.territories.set('land2', land2);

    const sys = new MobilizationSystem(state);
    expect(sys.getMobilizationCount()).toBe(0);
    sys.mobilize('land1');
    expect(sys.getMobilizationCount()).toBe(1);
    sys.mobilize('land2');
    expect(sys.getMobilizationCount()).toBe(2);
  });

  it('resetForNewTurn clears mobilization tracking', () => {
    const state = buildState();
    const land = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', land);

    const sys = new MobilizationSystem(state);
    sys.mobilize('land1');
    sys.resetForNewTurn();
    expect(sys.wasMobilized('land1')).toBe(false);
    expect(sys.getMobilizationCount()).toBe(0);
  });
});

describe('MobilizationSystem — serialize / restore', () => {
  it('serialize captures mobilized territories', () => {
    const state = buildState();
    const land = makeTerritory('land1', 'player', { production: 2 });
    state.territories.set('land1', land);

    const sys = new MobilizationSystem(state);
    sys.mobilize('land1');
    const data = sys.serialize();
    expect(data.mobilizedThisTurn).toContain('land1');
  });

  it('restore reconstructs mobilized set', () => {
    const state = buildState();
    const sys = new MobilizationSystem(state);
    sys.restore({ mobilizedThisTurn: ['land1', 'land2'] });
    expect(sys.wasMobilized('land1')).toBe(true);
    expect(sys.wasMobilized('land2')).toBe(true);
    expect(sys.getMobilizationCount()).toBe(2);
  });
});
