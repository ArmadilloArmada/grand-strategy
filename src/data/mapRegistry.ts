/**
 * Map registry - central list of available maps.
 *
 * To add a new map:
 * 1. Create assets/maps/your-map.json (same format as grid-world-map.json or tutorial-map.json).
 * 2. For a finer global grid, run `npm run generate:mega-map` (see scripts/generate-mega-world-map.cjs).
 * 3. In main.ts: import the JSON and call registerMap('your_map_id', 'Display Name', importedData).
 * 4. In index.html: add <option value="your_map_id">Display Name</option> to the #map-select dropdown (optional; New Game modal rebuilds from registry).
 */

import type { MapData } from '../loaders/MapLoader';
import type { FactionData } from './Faction';

export interface MapEntry {
  id: string;
  name: string;
  description?: string;
  data: MapData;
  factions?: FactionData[];
}

const MAP_REGISTRY: MapEntry[] = [];

/** Register a map. Call this from main.ts for each map you import. */
export function registerMap(id: string, name: string, data: MapData, description?: string, factions?: FactionData[]): void {
  MAP_REGISTRY.push({ id, name, description, data, factions });
}

/** Get map data by id, or undefined if not found. */
export function getMapById(id: string): MapData | undefined {
  return MAP_REGISTRY.find((m) => m.id === id)?.data;
}

/** Get the full map entry including per-map faction overrides. */
export function getMapEntry(id: string): MapEntry | undefined {
  return MAP_REGISTRY.find((m) => m.id === id);
}

/** List of { id, name } for dropdowns. */
export function getMapList(): { id: string; name: string }[] {
  return MAP_REGISTRY.map((m) => ({ id: m.id, name: m.name }));
}