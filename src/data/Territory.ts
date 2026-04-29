/**
 * Territory - Represents a single territory on the map
 */

export type ResourceType = 'oil' | 'steel' | 'food' | 'uranium' | 'rare_earth' | null;
export type TerrainType = 'plains' | 'forest' | 'mountain' | 'desert' | 'jungle' | 'arctic' | 'urban' | 'coastal';

export interface TerritoryData {
  id: string;
  name: string;
  type: "land" | "sea" | "coastal";
  production: number;
  adjacentTo: string[];
  polygon: [number, number][];
  center: [number, number];
  owner: string | null;
  originalOwner: string | null;
  hasFactory: boolean;
  isCapital: boolean;
  bombedUntilTurn?: number; // Strategic bombing: factory disabled until this turn
  fortificationLevel?: 0 | 1 | 2;
  // Strategic enhancements
  resource?: ResourceType;
  terrain?: TerrainType;
  victoryPoints?: number; // Key strategic locations worth extra VPs
  defenseBonus?: number; // Natural defensive terrain bonus
}

export type CommanderAbilityType = 'blitz' | 'inspire' | 'fortify' | 'rally';

export interface CommanderAbility {
  type: CommanderAbilityType;
  name: string;
  description: string;
  cooldownTurns: number;
  lastUsedTurn?: number;
}

export type CommanderTraitId =
  | 'iron_discipline'   // +1 defense for all units
  | 'aggressive_push'   // +1 attack for all units
  | 'veteran_eye'       // veteran bonus doubled
  | 'last_stand'        // +2 defense when own unit count < 3
  | 'shock_doctrine'    // +1 attack in round 1 only
  | 'supply_master'     // ignores out-of-supply penalty
  | 'legendary'         // +1 attack AND +1 defense (level 5 only)
  | 'air_coordination'; // +1 to air unit attack/defense in same combat

export interface CommanderTrait {
  id: CommanderTraitId;
  name: string;
  description: string;
}

export interface Commander {
  id: string;
  name: string;
  attackBonus: number;
  defenseBonus: number;
  factionId: string;
  ability?: CommanderAbility;
  // Progression fields (default 0/1/[] for legacy commanders)
  xp?: number;
  level?: number;
  battlesWon?: number;
  battlesLost?: number;
  traits?: CommanderTrait[];
}

export interface PlacedUnit {
  unitTypeId: string;
  count: number;
  veteranCount?: number; // Battles survived; adds +1 attack/defense when > 0
  movedCount?: number; // Units that have already moved/attacked this turn
  commander?: Commander; // Named general attached to this unit stack
  batteredUntilTurn?: number; // After retreat: -1 attack until this turn passes
}

export class Territory {
  public readonly id: string;
  public readonly name: string;
  public readonly type: "land" | "sea" | "coastal";
  public readonly production: number;
  public readonly adjacentTo: string[];
  public readonly polygon: [number, number][];
  public readonly center: [number, number];
  public readonly originalOwner: string | null;
  public readonly hasFactory: boolean;
  public readonly isCapital: boolean;
  public readonly resource: ResourceType;
  public readonly terrain: TerrainType;
  public readonly victoryPoints: number;
  public readonly defenseBonus: number;

  public owner: string | null;
  public units: PlacedUnit[] = [];
  public bombedUntilTurn: number = 0; // 0 = not bombed; factory disabled until turn N
  public fortificationLevel: 0 | 1 | 2 = 0; // 0 = none, 1 = earthworks, 2 = bunker complex

  constructor(data: TerritoryData) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.production = data.production;
    this.adjacentTo = data.adjacentTo;
    this.polygon = data.polygon;
    this.center = data.center;
    this.owner = data.owner;
    this.originalOwner = data.originalOwner;
    this.hasFactory = data.hasFactory;
    this.isCapital = data.isCapital;
    this.bombedUntilTurn = (data as any).bombedUntilTurn ?? 0;
    this.fortificationLevel = (data as any).fortificationLevel ?? 0;
    // Strategic properties with defaults
    this.resource = data.resource ?? null;
    this.terrain = data.terrain ?? 'plains';
    this.victoryPoints = data.victoryPoints ?? (data.isCapital ? 5 : data.hasFactory ? 2 : 0);
    this.defenseBonus = data.defenseBonus ?? this.calculateDefaultDefenseBonus(data.terrain);
  }

  private calculateDefaultDefenseBonus(terrain?: TerrainType): number {
    switch (terrain) {
      case 'mountain': return 2;
      case 'forest': return 1;
      case 'jungle': return 1;
      case 'urban': return 2;
      case 'desert': return -1; // Harder to defend in open desert
      default: return 0;
    }
  }

  /**
   * Get strategic value of this territory (for AI evaluation)
   */
  getStrategicValue(): number {
    let value = this.production;
    if (this.isCapital) value += 10;
    if (this.hasFactory) value += 5;
    if (this.resource) value += 3;
    value += this.victoryPoints;
    return value;
  }

  /**
   * Check if this territory is adjacent to another
   */
  isAdjacentTo(territoryId: string): boolean {
    return this.adjacentTo.includes(territoryId);
  }

  /**
   * Get total unit count in this territory
   */
  getTotalUnitCount(): number {
    return this.units.reduce((sum, u) => sum + u.count, 0);
  }

  /**
   * Get count of a specific unit type
   */
  getUnitCount(unitTypeId: string): number {
    const found = this.units.find((u) => u.unitTypeId === unitTypeId);
    return found ? found.count : 0;
  }

  /**
   * Get count of units that can still act this turn (haven't moved/attacked)
   */
  getAvailableUnitCount(unitTypeId: string): number {
    const found = this.units.find((u) => u.unitTypeId === unitTypeId);
    if (!found) return 0;
    return Math.max(0, found.count - (found.movedCount || 0));
  }

  /**
   * Mark units as having acted this turn
   */
  markUnitsActed(unitTypeId: string, count: number): void {
    const found = this.units.find((u) => u.unitTypeId === unitTypeId);
    if (found) {
      found.movedCount = (found.movedCount || 0) + count;
    }
  }

  /**
   * Reset all units' acted status (called at start of faction's turn)
   */
  resetActedUnits(): void {
    for (const unit of this.units) {
      unit.movedCount = 0;
    }
  }

  /**
   * Add units to this territory
   */
  addUnits(unitTypeId: string, count: number): void {
    const existing = this.units.find((u) => u.unitTypeId === unitTypeId);
    if (existing) {
      existing.count += count;
    } else {
      this.units.push({ unitTypeId, count });
    }
  }

  /**
   * Remove units from this territory
   */
  removeUnits(unitTypeId: string, count: number): boolean {
    const existing = this.units.find((u) => u.unitTypeId === unitTypeId);
    if (!existing || existing.count < count) {
      return false;
    }
    existing.count -= count;
    if (existing.count === 0) {
      this.units = this.units.filter((u) => u.unitTypeId !== unitTypeId);
    }
    return true;
  }

  /**
   * Check if territory is controlled by a faction
   */
  isControlledBy(factionId: string): boolean {
    return this.owner === factionId;
  }

  /**
   * Check if this is a land territory
   */
  isLand(): boolean {
    return this.type === "land" || this.type === "coastal";
  }

  /**
   * Check if this is a sea zone
   */
  isSea(): boolean {
    return this.type === "sea";
  }

  /**
   * Serialize for save/load
   */
  serialize(): TerritoryData & { units: PlacedUnit[] } {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      production: this.production,
      adjacentTo: this.adjacentTo,
      polygon: this.polygon,
      center: this.center,
      owner: this.owner,
      originalOwner: this.originalOwner,
      hasFactory: this.hasFactory,
      isCapital: this.isCapital,
      bombedUntilTurn: this.bombedUntilTurn,
      fortificationLevel: this.fortificationLevel,
      resource: this.resource,
      terrain: this.terrain,
      victoryPoints: this.victoryPoints,
      defenseBonus: this.defenseBonus,
      units: this.units.map(u => ({ ...u })),
    };
  }

  /** Factory is disabled this turn due to strategic bombing */
  isFactoryDisabled(currentTurn: number): boolean {
    return this.hasFactory && this.bombedUntilTurn > 0 && currentTurn <= this.bombedUntilTurn;
  }
}