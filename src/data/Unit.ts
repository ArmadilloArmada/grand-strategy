/**
 * Unit - Defines unit types and their properties
 */

export type UnitDomain = 'land' | 'sea' | 'air';

export interface UnitTypeData {
  id: string;
  name: string;
  attack: number;      // Hits on dice roll <= this value (1-6)
  defense: number;     // Hits on dice roll <= this value (1-6)
  movement: number;    // Movement points per turn
  cost: number;        // IPCs to produce
  domain: UnitDomain;
  hitPoints: number;   // Usually 1, but battleships have 2
  canBlitz: boolean;   // Can move through empty enemy territory
  canBombard: boolean; // Naval bombardment ability
  canStrategicBomb: boolean; // Can bomb factories
  transportCapacity: number; // How many land units it can carry (0 = can't transport)
  requiredTransport: boolean; // Needs transport to move over sea
}

export class UnitType {
  public readonly id: string;
  public readonly name: string;
  public readonly attack: number;
  public readonly defense: number;
  public readonly movement: number;
  public readonly cost: number;
  public readonly domain: UnitDomain;
  public readonly hitPoints: number;
  public readonly canBlitz: boolean;
  public readonly canBombard: boolean;
  public readonly canStrategicBomb: boolean;
  public readonly transportCapacity: number;
  public readonly requiredTransport: boolean;

  constructor(data: UnitTypeData) {
    this.id = data.id;
    this.name = data.name;
    this.attack = data.attack;
    this.defense = data.defense;
    this.movement = data.movement;
    this.cost = data.cost;
    this.domain = data.domain;
    this.hitPoints = data.hitPoints;
    this.canBlitz = data.canBlitz;
    this.canBombard = data.canBombard;
    this.canStrategicBomb = data.canStrategicBomb;
    this.transportCapacity = data.transportCapacity;
    this.requiredTransport = data.requiredTransport;
  }

  /**
   * Check if this unit can enter a territory type
   */
  canEnter(territoryType: 'land' | 'sea' | 'coastal'): boolean {
    switch (this.domain) {
      case 'land':
        return territoryType === 'land' || territoryType === 'coastal';
      case 'sea':
        return territoryType === 'sea' || territoryType === 'coastal';
      case 'air':
        return true; // Air units can go anywhere
    }
  }

  /**
   * Check if this unit can attack
   */
  canAttack(): boolean {
    return this.attack > 0;
  }

  /**
   * Check if this unit can defend
   */
  canDefend(): boolean {
    return this.defense > 0;
  }

  /**
   * Serialize for save/load
   */
  serialize(): UnitTypeData {
    return {
      id: this.id,
      name: this.name,
      attack: this.attack,
      defense: this.defense,
      movement: this.movement,
      cost: this.cost,
      domain: this.domain,
      hitPoints: this.hitPoints,
      canBlitz: this.canBlitz,
      canBombard: this.canBombard,
      canStrategicBomb: this.canStrategicBomb,
      transportCapacity: this.transportCapacity,
      requiredTransport: this.requiredTransport,
    };
  }
}

/**
 * Unit registry - stores all available unit types
 */
export class UnitRegistry {
  private units: Map<string, UnitType> = new Map();

  /**
   * Register a new unit type
   */
  register(data: UnitTypeData): void {
    this.units.set(data.id, new UnitType(data));
  }

  /**
   * Get a unit type by ID
   */
  get(id: string): UnitType | undefined {
    return this.units.get(id);
  }

  /**
   * Get all unit types
   */
  getAll(): UnitType[] {
    return Array.from(this.units.values());
  }

  /**
   * Get units by domain
   */
  getByDomain(domain: UnitDomain): UnitType[] {
    return this.getAll().filter(u => u.domain === domain);
  }

  /**
   * Load unit definitions from data array
   */
  loadFromData(unitDefs: UnitTypeData[]): void {
    for (const def of unitDefs) {
      this.register(def);
    }
  }
}