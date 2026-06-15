/**
 * Grid helpers — square grid maps use 8-directional adjacency (orthogonal + diagonal).
 * Map JSON may only list orthogonal links; these helpers infer diagonals from cell layout.
 * World maps may set wrapHorizontal so the Pacific connects left↔right edges.
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';
import type { UnitType } from '../data/Unit';
import { usesImplicitAmphibious } from './unitMovementRules';

const DIAGONAL_OFFSETS: Array<[number, number]> = [
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

const ORTHOGONAL_OFFSETS: Array<[number, number]> = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
];

const ALL_OFFSETS: Array<[number, number]> = [...ORTHOGONAL_OFFSETS, ...DIAGONAL_OFFSETS];

function gridCoords(x: number, y: number, cellSize: number): [number, number] {
  return [Math.round(x / cellSize), Math.round(y / cellSize)];
}

function resolveGridDimensions(state: GameState, cellSize: number): { cols: number; rows: number } | null {
  const layout = state.mapLayout;
  if (layout?.width && layout?.height) {
    return {
      cols: Math.round(layout.width / cellSize),
      rows: Math.round(layout.height / cellSize),
    };
  }

  let maxCol = 0;
  let maxRow = 0;
  for (const territory of state.territories.values()) {
    if (territory.polygon.length === 0) continue;
    const [col, row] = gridCoords(territory.polygon[0][0], territory.polygon[0][1], cellSize);
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
  }
  if (maxCol === 0 && maxRow === 0) return null;
  return { cols: maxCol + 1, rows: maxRow + 1 };
}

export function mapWrapsHorizontally(state: GameState): boolean {
  return Boolean(state.mapLayout?.wrapHorizontal);
}

/** Whether horizontal wrap applies for this unit leaving the given territory. */
export function shouldAllowHorizontalWrap(
  state: GameState,
  unitType: UnitType,
  fromTerritory: Territory,
): boolean {
  if (!mapWrapsHorizontally(state)) return false;
  if (unitType.domain === 'air' || unitType.domain === 'sea') return true;
  if (fromTerritory.type === 'sea' && usesImplicitAmphibious(unitType)) return true;
  return false;
}

export interface GridNeighborOptions {
  allowHorizontalWrap?: boolean;
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

function neighborGridCells(
  col: number,
  row: number,
  dims: { cols: number; rows: number } | null,
  wrapHorizontal: boolean,
): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (const [dc, dr] of ALL_OFFSETS) {
    const nr = row + dr;
    if (dims && (nr < 0 || nr >= dims.rows)) continue;
    let nc = col + dc;
    if (dims) {
      if (wrapHorizontal) {
        nc = ((nc % dims.cols) + dims.cols) % dims.cols;
      } else if (nc < 0 || nc >= dims.cols) {
        continue;
      }
    }
    cells.push([nc, nr]);
  }
  return cells;
}

/** Orthogonal map adjacency plus diagonal grid neighbors on uniform square grid maps. */
export function getTerritoryNeighborIds(state: GameState, territory: Territory): string[] {
  return getGridNeighborIds(state, territory);
}

/** Whether two territories share an edge or diagonal on a grid map (or explicit link otherwise). */
export function areTerritoriesNeighbors(
  state: GameState,
  from: Territory,
  to: Territory,
): boolean {
  if (from.id === to.id) return true;
  return getGridNeighborIds(state, from).includes(to.id);
}

export function getGridNeighborIds(
  state: GameState,
  territory: Territory,
  options: GridNeighborOptions = {},
): string[] {
  const reachable = new Set(territory.adjacentTo);
  const cellSize = inferGridCellSize(state);
  if (!cellSize || territory.polygon.length === 0) {
    return Array.from(reachable);
  }

  const index = buildGridIndex(state, cellSize);
  const [col, row] = gridCoords(territory.polygon[0][0], territory.polygon[0][1], cellSize);
  const dims = resolveGridDimensions(state, cellSize);
  const wrapHorizontal = Boolean(options.allowHorizontalWrap && mapWrapsHorizontally(state));

  for (const [nc, nr] of neighborGridCells(col, row, dims, wrapHorizontal)) {
    const neighborId = index.get(`${nc},${nr}`);
    if (neighborId) reachable.add(neighborId);
  }

  return Array.from(reachable);
}

/** Sea zones orthogonally or diagonally adjacent — includes Pacific wrap from sea tiles. */
export function getNavalReachNeighborIds(state: GameState, territory: Territory): string[] {
  const allowWrap = mapWrapsHorizontally(state) && territory.type === 'sea';
  return getGridNeighborIds(state, territory, { allowHorizontalWrap: allowWrap });
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
