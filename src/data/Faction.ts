/**
 * Faction - Represents a playable faction/nation
 */

export interface FactionBonus {
  ipcPerFactory?: number;      // Extra IPCs per factory (e.g. +1)
  infantryDefenseBonus?: number;
  armorAttackBonus?: number;
  unitCostDiscount?: number;   // Percent discount on unit cost
  movementBonus?: number;      // +1 movement for land/air
}

export interface FactionData {
  id: string;
  name: string;
  color: string;        // Hex color for map display
  colorLight: string;   // Lighter shade for highlights
  capital: string;      // Territory ID of capital
  startingIPCs: number;
  turnOrder: number;    // Lower = goes earlier
  isPlayable: boolean;  // Can be controlled by human
  allies: string[];     // Faction IDs of allied nations
  bonuses?: FactionBonus; // Optional asymmetry bonuses
}

export class Faction {
  public readonly id: string;
  public readonly name: string;
  public readonly color: string;
  public readonly colorLight: string;
  public readonly capital: string;
  public readonly startingIPCs: number;
  public readonly turnOrder: number;
  public readonly isPlayable: boolean;
  public readonly allies: string[];
  public readonly bonuses: FactionBonus;

  public ipcs: number;
  public isDefeated: boolean = false;
  public controlledBy: 'human' | 'ai' = 'human';

  constructor(data: FactionData) {
    this.id = data.id;
    this.name = data.name;
    this.color = data.color;
    this.colorLight = data.colorLight;
    this.capital = data.capital;
    this.startingIPCs = data.startingIPCs;
    this.ipcs = data.startingIPCs;
    this.turnOrder = data.turnOrder;
    this.isPlayable = data.isPlayable;
    this.allies = data.allies || [];
    this.bonuses = data.bonuses || {};
  }

  /**
   * Check if this faction is allied with another
   */
  isAlliedWith(factionId: string): boolean {
    return this.allies.includes(factionId);
  }

  /**
   * Check if this faction is at war with another
   */
  isEnemyOf(factionId: string): boolean {
    return factionId !== this.id && !this.isAlliedWith(factionId);
  }

  /**
   * Add IPCs (income)
   */
  addIPCs(amount: number): void {
    this.ipcs += amount;
  }

  /**
   * Spend IPCs (returns false if not enough)
   */
  spendIPCs(amount: number): boolean {
    if (this.ipcs < amount) {
      return false;
    }
    this.ipcs -= amount;
    return true;
  }

  /**
   * Check if faction can afford a purchase
   */
  canAfford(amount: number): boolean {
    return this.ipcs >= amount;
  }

  /**
   * Mark faction as defeated
   */
  defeat(): void {
    this.isDefeated = true;
  }

  /**
   * Serialize for save/load
   */
  serialize(): FactionData & { ipcs: number; isDefeated: boolean; controlledBy: string } {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      colorLight: this.colorLight,
      capital: this.capital,
      startingIPCs: this.startingIPCs,
      turnOrder: this.turnOrder,
      isPlayable: this.isPlayable,
      allies: this.allies,
      bonuses: this.bonuses,
      ipcs: this.ipcs,
      isDefeated: this.isDefeated,
      controlledBy: this.controlledBy,
    };
  }
}

/**
 * Faction registry - stores all factions
 */
export class FactionRegistry {
  private factions: Map<string, Faction> = new Map();

  /**
   * Register a new faction
   */
  register(data: FactionData): Faction {
    const faction = new Faction(data);
    this.factions.set(data.id, faction);
    return faction;
  }

  /**
   * Get a faction by ID
   */
  get(id: string): Faction | undefined {
    return this.factions.get(id);
  }

  /**
   * Get all factions
   */
  getAll(): Faction[] {
    return Array.from(this.factions.values());
  }

  /**
   * Get factions in turn order
   */
  getInTurnOrder(): Faction[] {
    return this.getAll()
      .filter(f => !f.isDefeated)
      .sort((a, b) => a.turnOrder - b.turnOrder);
  }

  /**
   * Get playable factions
   */
  getPlayable(): Faction[] {
    return this.getAll().filter(f => f.isPlayable && !f.isDefeated);
  }

  /**
   * Load faction definitions from data array
   */
  loadFromData(factionDefs: FactionData[]): void {
    for (const def of factionDefs) {
      this.register(def);
    }
  }
}