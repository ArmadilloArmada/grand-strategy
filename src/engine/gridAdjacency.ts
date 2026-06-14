/**
 * Grid helpers for naval range — ships can engage shore tiles diagonally
 * on square grid maps even when map data only lists orthogonal adjacency.
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';

const DIAGONAL_OFFSETS: Array<[number, number]> = [
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

function gridCoords(x: number, y: number, cellSize: number): [number, number] {
  return [Math.round(x / cellSize), Math.round(y / cellSize)];
}

/** Infer uniform square cell size from loaded territory polygons. */
export function inferGridCellSize(state: GameState): number | null {
  const territories = Array.from(state.territories.values());
  const sizes = territories
    .map(t => {
      if (t.polygon.length !== 4) return null;
      const width = Math.abs(t.polygon[1][0] - t.polygon[0][0]);
      const height = Math.abs(t.polygon[2][1] - t.polygon[1][1]);
      return width > 0 && Math.abs(width - height) < 0.01 ? width : null;
    })
    .filter((size): size is number => typeof size === 'number');

  if (sizes.length < territories.length * 0.8) return null;

  const counts = new Map<number, number>();
  for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  const [cellSize, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  if (cellSize <= 0 || count < sizes.length * 0.8) return null;
  return cellSize;
}

function buildGridIndex(state: GameState, cellSize: number): Map<string, string> {
  const index = new Map<string, string>();
  for (const territory of state.territories.values()) {
    if (territory.polygon.length === 0) continue;
    const [col, row] = gridCoords(territory.polygon[0][0], territory.polygon[0][1], cellSize);
    index.set(`${col},${row}`, territory.id);
  }
  return index;
}

/** Orthogonal map adjacency plus diagonal grid neighbors (for naval gun range). */
export function getNavalReachNeighborIds(state: GameState, territory: Territory): string[] {
  const reachable = new Set(territory.adjacentTo);
  const cellSize = inferGridCellSize(state);
  if (!cellSize || territory.polygon.length === 0) {
    return Array.from(reachable);
  }

  const index = buildGridIndex(state, cellSize);
  const [col, row] = gridCoords(territory.polygon[0][0], territory.polygon[0][1], cellSize);

  for (const [dc, dr] of DIAGONAL_OFFSETS) {
    const neighborId = index.get(`${col + dc},${row + dr}`);
    if (neighborId) reachable.add(neighborId);
  }

  return Array.from(reachable);
}

export function isNavalReachNeighbor(
  state: GameState,
  from: Territory,
  to: Territory,
): boolean {
  if (from.id === to.id) return false;
  return getNavalReachNeighborIds(state, from).includes(to.id);
}

/** Sea zones orthogonally or diagonally adjacent to a territory (for shore bombardment). */
export function getNavalReachSeaZones(state: GameState, territory: Territory): Territory[] {
  return getNavalReachNeighborIds(state, territory)
    .map(id => state.territories.get(id))
    .filter((t): t is Territory => !!t && t.type === 'sea');
}
