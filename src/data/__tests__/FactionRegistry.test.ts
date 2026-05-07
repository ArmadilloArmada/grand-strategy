import { describe, expect, it } from 'vitest';
import { FactionRegistry } from '../Faction';
import { makeFactionData } from '../../engine/__tests__/testHelpers';

function buildRegistry(): FactionRegistry {
  const reg = new FactionRegistry();
  reg.register(makeFactionData('atlantic_alliance', { turnOrder: 1 }));
  reg.register(makeFactionData('eastern_coalition', { turnOrder: 2 }));
  reg.register(makeFactionData('pacific_union', { turnOrder: 3 }));
  reg.register(makeFactionData('southern_federation', { turnOrder: 4 }));
  return reg;
}

describe('FactionRegistry.clear / loadFromData', () => {
  it('clear() drops every faction so consecutive registrations do not stack', () => {
    const reg = buildRegistry();
    expect(reg.getAll()).toHaveLength(4);
    reg.clear();
    expect(reg.getAll()).toHaveLength(0);
  });

  it('loadFromData replaces the previous map factions instead of leaking them', () => {
    const reg = buildRegistry();
    reg.loadFromData([
      makeFactionData('alpha', { turnOrder: 1 }),
      makeFactionData('bravo', { turnOrder: 2 }),
    ]);
    expect(reg.getAll().map(f => f.id).sort()).toEqual(['alpha', 'bravo']);
  });
});

describe('FactionRegistry.getActive', () => {
  it('defaults to every registered faction (isActive = true on construction)', () => {
    const reg = buildRegistry();
    expect(reg.getActive().map(f => f.id)).toEqual([
      'atlantic_alliance',
      'eastern_coalition',
      'pacific_union',
      'southern_federation',
    ]);
  });

  it('honors Faction.isActive flag and skips inactive map factions', () => {
    const reg = buildRegistry();
    // Simulate a 2-player setup: only Atlantic + Eastern selected.
    for (const f of reg.getAll()) {
      f.isActive = f.id === 'atlantic_alliance' || f.id === 'eastern_coalition';
    }
    expect(reg.getActive().map(f => f.id)).toEqual(['atlantic_alliance', 'eastern_coalition']);
  });

  it('excludes defeated factions from getActive() but keeps them in getActiveIncludingDefeated()', () => {
    const reg = buildRegistry();
    const eastern = reg.get('eastern_coalition')!;
    eastern.defeat();
    expect(reg.getActive().map(f => f.id)).not.toContain('eastern_coalition');
    expect(reg.getActiveIncludingDefeated().map(f => f.id)).toContain('eastern_coalition');
  });

  it('returns active factions in turn-order regardless of registration order', () => {
    const reg = new FactionRegistry();
    reg.register(makeFactionData('charlie', { turnOrder: 3 }));
    reg.register(makeFactionData('alpha', { turnOrder: 1 }));
    reg.register(makeFactionData('bravo', { turnOrder: 2 }));
    expect(reg.getActive().map(f => f.id)).toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('Faction.serialize / isActive round-trip', () => {
  it('persists isActive in serialize() output', () => {
    const reg = buildRegistry();
    const eastern = reg.get('eastern_coalition')!;
    eastern.isActive = false;
    const data = eastern.serialize();
    expect(data.isActive).toBe(false);
  });
});
