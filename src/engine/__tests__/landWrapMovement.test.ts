import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MovementValidator } from '../MovementValidator';
import { getGridNeighborIds } from '../gridAdjacency';
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

describe('land unit wrap restrictions', () => {
  it('does not let tanks from Washington reach far Pacific tiles in two moves', () => {
    const state = loadWorldMap();
    state.currentFactionId = 'atlantic_alliance';
    const washington = state.territories.get('washington')!;
    washington.owner = 'atlantic_alliance';
    washington.units = [{ unitTypeId: 'tank', count: 5 }];

    const neighbors = getGridNeighborIds(state, washington);
    const farNeighbors = neighbors.filter(id => {
      const t = state.territories.get(id)!;
      return t.center[0] > 800;
    });
    expect(farNeighbors).toEqual([]);

    const validator = new MovementValidator(state);
    const moves = validator.getValidMoves('tank', 'washington', true);
    const farMoves = moves.filter(m => {
      const t = state.territories.get(m.territoryId)!;
      return t.center[0] > 800;
    });
    expect(farMoves).toEqual([]);
    expect(moves.filter(m => !m.isAttack).length).toBeLessThan(40);
  });
});
