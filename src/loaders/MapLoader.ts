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
  /** When true, the east and west map edges connect (world map Pacific wrap). */
  wrapHorizontal?: boolean;
  territories: TerritoryData[];
  startingUnits: StartingUnits[];
}

export interface StartingUnits {
  territoryId: string;
  units: PlacedUnit[];
}

export class MapLoader {
  private readonly strictMapTopology: boolean;

  constructor(private state: GameState) {
    const envStrict = (import.meta as any)?.env?.VITE_STRICT_MAP_TOPOLOGY === '1';
    this.strictMapTopology = Boolean(envStrict);
  }

  /**
   * Load map from JSON data
   */
  loadMap(mapData: MapData): void {
    const startingUnits = mapData.startingUnits ?? [];

    this.state.mapLayout = {
      width: mapData.width,
      height: mapData.height,
      wrapHorizontal: Boolean(mapData.wrapHorizontal),
    };

    // Clear existing territories
    this.state.territories.clear();

    // Create territories
    for (const tData of this.withGeneratedSeaCells(mapData).territories) {
      const territory = new Territory(tData);
      this.state.territories.set(territory.id, territory);
    }

    // Place starting units
    for (const su of startingUnits) {
      const territory = this.state.territories.get(su.territoryId);
      if (territory) {
        for (const unit of su.units) {
          territory.addUnits(unit.unitTypeId, unit.count);
        }
      }
    }

    if (startingUnits.length === 0) {
      this.seedDefaultStartingUnits();
    }
  }

  private withGeneratedSeaCells(mapData: MapData): MapData {
    if (this.strictMapTopology) {
      const issues = this.validateMap(mapData);
      if (issues.length > 0) {
        throw new Error(`Strict map topology enabled; map has ${issues.length} issue(s): ${issues[0]}`);
      }
      const territories = this.cloneTerritories(mapData.territories);
      const cellSize = this.inferGridCellSize(mapData);
      if (cellSize) {
        this.applyGridAdjacency(territories, cellSize, undefined, mapData.wrapHorizontal, mapData.width, mapData.height);
      } else {
        this.ensureCoastalSeaAccess(territories);
      }
      this.ensureBidirectionalAdjacency(territories);
      return { ...mapData, territories };
    }

    const cellSize = this.inferGridCellSize(mapData);
    const territories = this.cloneTerritories(mapData.territories);
    if (!cellSize) {
      this.ensureCoastalSeaAccess(territories);
      this.ensureBidirectionalAdjacency(territories);
      return { ...mapData, territories };
    }

    const occupied = new Map<string, TerritoryData>();
    for (const territory of territories) {
      const key = this.gridKey(territory.polygon[0][0], territory.polygon[0][1], cellSize);
      occupied.set(key, territory);
    }

    const cols = Math.ceil(mapData.width / cellSize);
    const rows = Math.ceil(mapData.height / cellSize);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${col},${row}`;
        if (occupied.has(key)) continue;
        const x = col * cellSize;
        const y = row * cellSize;
        const id = `sea_auto_${row}_${col}`;
        const sea: TerritoryData = {
          id,
          name: 'Sea',
          type: 'sea',
          production: 0,
          adjacentTo: [],
          polygon: [[x, y], [x + cellSize, y], [x + cellSize, y + cellSize], [x, y + cellSize]],
          center: [x + cellSize / 2, y + cellSize / 2],
          owner: null,
          originalOwner: null,
          hasFactory: false,
          isCapital: false,
        };
        territories.push(sea);
        occupied.set(key, sea);
      }
    }

    this.applyGridAdjacency(territories, cellSize, occupied, mapData.wrapHorizontal, mapData.width, mapData.height);

    this.ensureCoastalSeaAccess(territories);
    this.ensureBidirectionalAdjacency(territories);

    return { ...mapData, territories };
  }

  /** Merge 8-way grid neighbors into adjacentTo (orthogonal + diagonal). */
  private applyGridAdjacency(
    territories: TerritoryData[],
    cellSize: number,
    occupied?: Map<string, TerritoryData>,
    wrapHorizontal = false,
    mapWidth?: number,
    mapHeight?: number,
  ): void {
    const index = occupied ?? new Map<string, TerritoryData>();
    if (!occupied) {
      for (const territory of territories) {
        if (territory.polygon.length === 0) continue;
        const key = this.gridKey(territory.polygon[0][0], territory.polygon[0][1], cellSize);
        index.set(key, territory);
      }
    }

    const cols = mapWidth ? Math.round(mapWidth / cellSize) : null;
    const rows = mapHeight ? Math.round(mapHeight / cellSize) : null;
    const offsets: Array<[number, number]> = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];

    for (const territory of territories) {
      if (territory.polygon.length === 0) continue;
      const [x, y] = territory.polygon[0];
      const [col, row] = this.gridCoords(x, y, cellSize);
      const merged = new Set(territory.adjacentTo);
      for (const [dc, dr] of offsets) {
        const nr = row + dr;
        if (rows != null && (nr < 0 || nr >= rows)) continue;
        let nc = col + dc;
        if (cols != null) {
          if (wrapHorizontal) {
            nc = ((nc % cols) + cols) % cols;
          } else if (nc < 0 || nc >= cols) {
            continue;
          }
        }
        const neighbor = index.get(`${nc},${nr}`);
        if (neighbor && neighbor.id !== territory.id) merged.add(neighbor.id);
      }
      territory.adjacentTo = Array.from(merged);
    }
  }

  private cloneTerritories(territories: TerritoryData[]): TerritoryData[] {
    return territories.map(t => ({
      ...t,
      adjacentTo: [...t.adjacentTo],
      polygon: [...t.polygon] as [number, number][],
      center: [...t.center] as [number, number],
    }));
  }

  private inferGridCellSize(mapData: MapData): number | null {
    const sizes = mapData.territories
      .map(t => {
        if (t.polygon.length !== 4) return null;
        const width = Math.abs(t.polygon[1][0] - t.polygon[0][0]);
        const height = Math.abs(t.polygon[2][1] - t.polygon[1][1]);
        return width > 0 && Math.abs(width - height) < 0.01 ? width : null;
      })
      .filter((size): size is number => typeof size === 'number');
    if (sizes.length < mapData.territories.length * 0.8) return null;
    const counts = new Map<number, number>();
    for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
    const [cellSize, count] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (cellSize <= 0 || count < sizes.length * 0.8) return null;
    return cellSize;
  }

  private gridKey(x: number, y: number, cellSize: number): string {
    const [col, row] = this.gridCoords(x, y, cellSize);
    return `${col},${row}`;
  }

  private gridCoords(x: number, y: number, cellSize: number): [number, number] {
    return [Math.round(x / cellSize), Math.round(y / cellSize)];
  }

  private ensureBidirectionalAdjacency(territories: TerritoryData[]): void {
    const byId = new Map(territories.map(t => [t.id, t]));
    for (const territory of territories) {
      territory.adjacentTo = territory.adjacentTo.filter(adjacentId => byId.has(adjacentId));
      for (const adjacentId of territory.adjacentTo) {
        const adjacent = byId.get(adjacentId);
        if (adjacent && !adjacent.adjacentTo.includes(territory.id)) {
          adjacent.adjacentTo.push(territory.id);
        }
      }
    }
  }

  private ensureCoastalSeaAccess(territories: TerritoryData[]): void {
    const seaZones = territories.filter(t => t.type === 'sea');
    if (seaZones.length === 0) return;

    for (const territory of territories) {
      if (territory.type !== 'coastal') continue;
      if (territory.adjacentTo.some(id => seaZones.some(sea => sea.id === id))) continue;

      const nearestSea = seaZones
        .map(sea => ({
          sea,
          distance: Math.hypot(sea.center[0] - territory.center[0], sea.center[1] - territory.center[1]),
        }))
        .sort((a, b) => a.distance - b.distance)[0]?.sea;

      if (nearestSea) {
        territory.adjacentTo.push(nearestSea.id);
        if (!nearestSea.adjacentTo.includes(territory.id)) nearestSea.adjacentTo.push(territory.id);
      }
    }
  }

  private seedDefaultStartingUnits(): void {
    const has = (unitTypeId: string) => !!this.state.unitRegistry.get(unitTypeId);
    for (const faction of this.state.factionRegistry.getAll()) {
      const capital = this.state.territories.get(faction.capital);
      if (capital?.owner === faction.id && capital.isLand()) {
        if (has('infantry')) capital.addUnits('infantry', 3);
        if (has('tank')) capital.addUnits('tank', 1);
        if (has('fighter')) capital.addUnits('fighter', 1);
      }

      const factories = Array.from(this.state.territories.values())
        .filter(t => t.owner === faction.id && t.id !== faction.capital && t.hasFactory && t.isLand())
        .slice(0, 3);
      for (const factory of factories) {
        if (has('infantry')) factory.addUnits('infantry', 2);
        if (has('artillery')) factory.addUnits('artillery', 1);
      }

      const frontLines = Array.from(this.state.territories.values())
        .filter(t =>
          t.owner === faction.id &&
          t.isLand() &&
          t.id !== faction.capital &&
          !t.hasFactory &&
          t.adjacentTo.some(id => {
            const other = this.state.territories.get(id);
            return !!other?.owner && other.owner !== faction.id && other.isLand();
          })
        )
        .slice(0, 4);
      for (const territory of frontLines) {
        if (has('infantry')) territory.addUnits('infantry', 1);
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
    for (const su of mapData.startingUnits ?? []) {
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
