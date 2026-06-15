import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MovementValidator } from '../MovementValidator';
import { DataLoader } from '../../loaders/DataLoader';
import gridWorldMap from '../../../assets/maps/grid-world-map.json';
import unitsData from '../../../assets/units/wwii-units.json';
import factionsData from '../../../assets/factions/world-factions.json';
import type { MapData } from '../../loaders/MapLoader';
import type { FactionData } from '../../data/Faction';
import type { UnitTypeData } from '../../data/Unit';

function loadWorldMap(): GameState {
  const state = new GameState();
  new DataLoader(state).loadBundle({
    units: unitsData as unknown as UnitTypeData[],
    factions: factionsData as FactionData[],
    map: gridWorldMap as unknown as MapData,
  });
  return state;
}

describe('world map horizontal wrap', () => {
  it('loads with wrapHorizontal enabled', () => {
    const state = loadWorldMap();
    expect(state.mapLayout?.wrapHorizontal).toBe(true);
  });

  it('lets a fighter cross the Pacific from alaska toward hawaii', () => {
    const state = loadWorldMap();
    state.currentFactionId = 'atlantic_alliance';
    const alaska = state.territories.get('alaska')!;
    alaska.units = [{ unitTypeId: 'fighter', count: 1 }];

    const validator = new MovementValidator(state);
    const moves = validator.getValidMoves('fighter', 'alaska', false);
    expect(moves.some(m => m.territoryId === 'hawaii')).toBe(true);
  });

  it('lets mech infantry reach wake from mexico across the pacific', () => {
    const state = loadWorldMap();
    state.currentFactionId = 'atlantic_alliance';
    const mexico = state.territories.get('mexico')!;
    mexico.units = [{ unitTypeId: 'mech_infantry', count: 1 }];

    const validator = new MovementValidator(state);
    const moves = validator.getValidMoves('mech_infantry', 'mexico', false);
    expect(moves.some(m => m.territoryId === 'wake_island')).toBe(true);
  });

  it('lets mech infantry advance into the Pacific from California in one turn', () => {
    const state = loadWorldMap();
    state.currentFactionId = 'atlantic_alliance';
    const california = state.territories.get('california')!;
    california.units = [{ unitTypeId: 'mech_infantry', count: 1 }];

    const validator = new MovementValidator(state);
    const moves = validator.getValidMoves('mech_infantry', 'california', false);
    const pacificSea = moves.some(m => {
      const t = state.territories.get(m.territoryId);
      return t?.type === 'sea' && t.center[0] > california.center[0];
    });
    expect(pacificSea).toBe(true);
    expect(moves.some(m => m.territoryId === 'hawaii')).toBe(false);
  });

  it('includes australia and new zealand on the loaded map', () => {
    const state = loadWorldMap();
    expect(state.territories.has('hawaii')).toBe(true);
    expect(state.territories.has('australia_e')).toBe(true);
    expect(state.territories.has('new_zealand')).toBe(true);
  });

  it('places Indonesia south-west of Tokyo and Hawaii east of Tokyo', () => {
    const state = loadWorldMap();
    const tokyo = state.territories.get('tokyo')!;
    const shanghai = state.territories.get('shanghai')!;
    const indonesia = state.territories.get('borneo')!;
    const hawaii = state.territories.get('hawaii')!;

    expect(indonesia.name).toBe('Indonesia');
    expect(indonesia.center[0]).toBeLessThan(tokyo.center[0]);
    expect(indonesia.center[1]).toBeGreaterThan(tokyo.center[1]);
    expect(hawaii.center[0]).toBeGreaterThan(tokyo.center[0]);

    const philippines = state.territories.get('philippines')!;
    expect(philippines.center[0]).toBeGreaterThanOrEqual(tokyo.center[0] - 50);
    expect(philippines.center[1]).toBeGreaterThan(shanghai.center[1]);
  });

  it('keeps Washington tank movement local — no world-wrap shortcuts', () => {
    const state = loadWorldMap();
    state.currentFactionId = 'atlantic_alliance';
    const washington = state.territories.get('washington')!;
    washington.units = [{ unitTypeId: 'tank', count: 1 }];

    const validator = new MovementValidator(state);
    const moves = validator.getValidMoves('tank', 'washington', false);
    const moveIds = moves.filter(m => !m.isAttack).map(m => m.territoryId);

    expect(moveIds.length).toBeGreaterThan(0);
    expect(moveIds.length).toBeLessThan(30);
    expect(moveIds).not.toContain('hawaii');
    expect(moveIds).not.toContain('tokyo');
    expect(moveIds).not.toContain('philippines');
  });
});
