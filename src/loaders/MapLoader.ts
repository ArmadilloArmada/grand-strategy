/**
 * MapLoader - Loads map data from JSON files
 */

import { Territory, TerritoryData, PlacedUnit } from '../data/Territory';
import { GameState } from '../engine/GameState';

export interface MapData {
  name: string;
  version: string;
  width: number;
  height: number;
  territories: TerritoryData[];
  startingUnits: StartingUnits[];
}

export interface StartingUnits {
  territoryId: string;
  units: PlacedUnit[];
}

export class MapLoader {
  constructor(private state: GameState) {}

  /**
   * Load map from JSON data
   */
  loadMap(mapData: MapData): void {
    // Clear existing territories
    this.state.territories.clear();

    // Create territories
    for (const tData of mapData.territories) {
      const territory = new Territory(tData);
      this.state.territories.set(territory.id, territory);
    }

    // Place starting units
    for (const su of mapData.startingUnits) {
      const territory = this.state.territories.get(su.territoryId);
      if (territory) {
        for (const unit of su.units) {
          territory.addUnits(unit.unitTypeId, unit.count);
        }
      }
    }
  }

  /**
   * Load map from URL
   */
  async loadMapFromURL(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load map: ${response.statusText}`);
    }
    const mapData = await response.json() as MapData;
    this.loadMap(mapData);
  }

  /**
   * Validate map data
   */
  validateMap(mapData: MapData): string[] {
    const errors: string[] = [];

    // Check for required fields
    if (!mapData.name) errors.push('Map name is required');
    if (!mapData.territories || mapData.territories.length === 0) {
      errors.push('Map must have at least one territory');
    }

    // Check territory references
    const territoryIds = new Set(mapData.territories.map(t => t.id));
    
    for (const territory of mapData.territories) {
      for (const adjId of territory.adjacentTo) {
        if (!territoryIds.has(adjId)) {
          errors.push(`Territory ${territory.id} references unknown adjacent territory ${adjId}`);
        }
      }

      // Check bidirectional adjacency
      for (const adjId of territory.adjacentTo) {
        const adjTerritory = mapData.territories.find(t => t.id === adjId);
        if (adjTerritory && !adjTerritory.adjacentTo.includes(territory.id)) {
          errors.push(`Adjacency not bidirectional: ${territory.id} <-> ${adjId}`);
        }
      }
    }

    // Check starting units reference valid territories
    for (const su of mapData.startingUnits) {
      if (!territoryIds.has(su.territoryId)) {
        errors.push(`Starting units reference unknown territory ${su.territoryId}`);
      }
    }

    return errors;
  }

  /**
   * Get territory at a point (for click detection)
   */
  getTerritoryAtPoint(x: number, y: number): Territory | null {
    for (const territory of this.state.territories.values()) {
      if (this.isPointInPolygon(x, y, territory.polygon)) {
        return territory;
      }
    }
    return null;
  }

  /**
   * Point-in-polygon test using ray casting
   */
  private isPointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
}