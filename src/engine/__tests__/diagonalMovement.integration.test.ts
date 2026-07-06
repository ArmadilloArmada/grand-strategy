import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MovementValidator } from '../MovementValidator';
import { inferGridCellSize, getGridNeighborIds } from '../gridAdjacency';
import { DataLoader } from '../../loaders/DataLoader';
import gridSkirmish from '../../../assets/maps/grid-skirmish.json';
import unitsData from '../../../assets/units/wwii-units.json';
import { SKIRMISH_FACTIONS } from '../../data/mapFactions';
import type { MapData } from '../../loaders/MapLoader';
import type { FactionData } from '../../data/Faction';
import type { UnitTypeData } from '../../data/Unit';

function loadSkirmish(): GameState {
  const state = new GameState();
  new DataLoader(state).loadBundle({
    units: unitsData as unknown as UnitTypeData[],
    factions: SKIRMISH_FACTIONS as FactionData[],
    map: gridSkirmish as unknown as MapData,
  });
  return state;
}

function gridColRow(territory: { polygon: [number, number][] }, cellSize: number): [number, number] {
  return [Math.round(territory.polygon[0][0] / cellSize), Math.round(territory.polygon[0][1] / cellSize)];
}

describe('diagonal movement on loaded grid maps', () => {
  it('infers grid cell size and diagonal adjacency after map load', () => {
    const state = loadSkirmish();
    expect(inferGridCellSize(state)).toBe(50);

    const land = [...state.territories.values()].find(t => t.type === 'land' && t.owner);
    expect(land).toBeTruthy();

    const cellSize = inferGridCellSize(state)!;
    const [col, row] = gridColRow(land!, cellSize);
    const diagonalIds = getGridNeighborIds(state, land!).filter(id => {
      const t = state.territories.get(id);
      if (!t) return false;
      const [c2, r2] = gridColRow(t, cellSize);
      return Math.abs(c2 - col) === 1 && Math.abs(r2 - row) === 1;
    });
    expect(diagonalIds.length).toBeGreaterThan(0);
  });

  it('allows land, sea, and air units to reach diagonal neighbors', () => {
    const state = loadSkirmish();
    state.currentFactionId = SKIRMISH_FACTIONS[0].id;
    const cellSize = inferGridCellSize(state)!;

    const ownedLand = [...state.territories.values()].find(t => t.owner === state.currentFactionId && t.isLand());
    expect(ownedLand).toBeTruthy();

    const [col, row] = gridColRow(ownedLand!, cellSize);
    let diagonalFriendly: string | undefined;
    for (const id of getGridNeighborIds(state, ownedLand!)) {
      const t = state.territories.get(id);
      if (!t || t.owner !== state.currentFactionId) continue;
      const [c2, r2] = gridColRow(t, cellSize);
      if (Math.abs(c2 - col) === 1 && Math.abs(r2 - row) === 1) {
        diagonalFriendly = id;
        break;
      }
    }

    ownedLand!.units = [
      { unitTypeId: 'infantry', count: 2 },
      { unitTypeId: 'tank', count: 1 },
      { unitTypeId: 'fighter', count: 1 },
    ];

    const validator = new MovementValidator(state);
    if (diagonalFriendly) {
      for (const unitTypeId of ['infantry', 'tank', 'fighter'] as const) {
        const moves = validator.getValidMoves(unitTypeId, ownedLand!.id, false);
        expect(moves.some(m => m.territoryId === diagonalFriendly && !m.isAttack)).toBe(true);
      }
    }

    const ownedSea = [...state.territories.values()].find(t => t.owner === state.currentFactionId && t.type === 'sea');
    if (ownedSea) {
      ownedSea.units = [{ unitTypeId: 'destroyer', count: 1 }];
      const [sc, sr] = gridColRow(ownedSea, cellSize);
      const diagonalSea = getGridNeighborIds(state, ownedSea).find(id => {
        const t = state.territories.get(id);
        if (!t || t.type !== 'sea') return false;
        const [c2, r2] = gridColRow(t, cellSize);
        return Math.abs(c2 - sc) === 1 && Math.abs(r2 - sr) === 1;
      });
      if (diagonalSea) {
        const moves = validator.getValidMoves('destroyer', ownedSea.id, false);
        expect(moves.some(m => m.territoryId === diagonalSea && !m.isAttack)).toBe(true);
      }
    }
  });
});
