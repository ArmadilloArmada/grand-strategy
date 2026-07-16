import { describe, expect, it } from 'vitest';
import { FactionRegistry } from '../Faction';
import { COLORBLIND_PALETTE, colorblindEntryForTurnOrder } from '../colorblindPalette';
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

describe('FactionRegistry colorblind palette', () => {
  it('leaves base colors untouched when colorblind mode is off (default)', () => {
    const reg = buildRegistry();
    const atlantic = reg.get('atlantic_alliance')!;
    expect(reg.isColorblindMode()).toBe(false);
    expect(atlantic.color).toBe('#ff0000');
    expect(atlantic.colorLight).toBe('#ff8888');
  });

  it('remaps colors by turn order to the Okabe-Ito palette when enabled', () => {
    const reg = buildRegistry();
    reg.setColorblindMode(true);
    for (const faction of reg.getAll()) {
      const entry = colorblindEntryForTurnOrder(faction.turnOrder);
      expect(faction.color).toBe(entry.color);
      expect(faction.colorLight).toBe(entry.colorLight);
    }
    // Distinct factions get distinct colors.
    const colors = reg.getAll().map(f => f.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('restores original colors when colorblind mode is turned back off', () => {
    const reg = buildRegistry();
    reg.setColorblindMode(true);
    reg.setColorblindMode(false);
    const atlantic = reg.get('atlantic_alliance')!;
    expect(atlantic.color).toBe('#ff0000');
    expect(atlantic.colorLight).toBe('#ff8888');
  });

  it('applies the palette to factions registered after enabling the mode', () => {
    const reg = new FactionRegistry();
    reg.setColorblindMode(true);
    reg.register(makeFactionData('late', { turnOrder: 2 }));
    expect(reg.get('late')!.color).toBe(colorblindEntryForTurnOrder(2).color);
  });

  it('wraps around when there are more factions than palette entries', () => {
    const wrap = colorblindEntryForTurnOrder(COLORBLIND_PALETTE.length + 1);
    expect(wrap).toEqual(COLORBLIND_PALETTE[0]);
  });

  it('serialize() persists the original base color, not the palette override', () => {
    const reg = buildRegistry();
    reg.setColorblindMode(true);
    const data = reg.get('atlantic_alliance')!.serialize();
    expect(data.color).toBe('#ff0000');
    expect(data.colorLight).toBe('#ff8888');
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
