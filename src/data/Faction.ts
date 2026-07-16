/**
 * Faction - Represents a playable faction/nation
 */

import { colorblindEntryForTurnOrder } from './colorblindPalette';

export interface FactionBonus {
  ipcPerFactory?: number;         // Extra IPCs per factory (e.g. +1)
  infantryDefenseBonus?: number;  // +N to infantry defense rolls
  armorAttackBonus?: number;      // +N to armor attack rolls
  unitCostDiscount?: number;      // Flat IPC discount on all unit costs
  movementBonus?: number;         // +1 movement for land/air units
  navalAttackBonus?: number;      // +N to naval unit attack rolls
  researchSpeedBonus?: number;    // Research progress fraction bonus (e.g. 0.25 = +25% speed)
  incomeMultiplierBonus?: number; // Income multiplier bonus (e.g. 0.1 = +10% income)
  counterIntelBonus?: number;     // Reduces enemy espionage success (0–1 fraction)
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
  playstyle?: string;   // Short label e.g. "Industrial Powerhouse"
  description?: string; // One-sentence flavor description
}

export class Faction {
  public readonly id: string;
  public readonly name: string;
  /** Current display color (may be overridden by the colorblind palette). */
  public color: string;
  public colorLight: string;
  /** Original colors from faction data, used to restore when colorblind mode is off. */
  public readonly baseColor: string;
  public readonly baseColorLight: string;
  public readonly capital: string;
  public readonly startingIPCs: number;
  public readonly turnOrder: number;
  public readonly isPlayable: boolean;
  public readonly allies: string[];
  public readonly bonuses: FactionBonus;
  public readonly playstyle: string;
  public readonly description: string;

  public ipcs: number;
  public isDefeated: boolean = false;
  public controlledBy: 'human' | 'ai' = 'human';
  /**
   * Whether this faction is participating in the current game session.
   * Defaults to true so existing saves and tests behave as before; the New Game
   * setup pass marks unselected map factions as inactive.
   */
  public isActive: boolean = true;

  // Runtime state for new features
  public warWeariness: number = 0;      // 0–100: increases each turn at war
  public morale: number = 100;          // 0–100: derived from warWeariness
  public nuclearReadiness: number = 0;  // 0–100: charges up after researching nuclear_program
  public betrayalCooldown: number = 0;  // turns before can form new alliances after betrayal

  constructor(data: FactionData) {
    this.id = data.id;
    this.name = data.name;
    this.color = data.color;
    this.colorLight = data.colorLight;
    this.baseColor = data.color;
    this.baseColorLight = data.colorLight;
    this.capital = data.capital;
    this.startingIPCs = data.startingIPCs;
    this.ipcs = data.startingIPCs;
    this.turnOrder = data.turnOrder;
    this.isPlayable = data.isPlayable;
    this.allies = data.allies || [];
    this.bonuses = data.bonuses || {};
    this.playstyle = data.playstyle ?? '';
    this.description = data.description ?? '';
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
  serialize(): FactionData & { ipcs: number; isDefeated: boolean; controlledBy: string; warWeariness: number; morale: number; nuclearReadiness: number; betrayalCooldown: number; isActive: boolean } {
    return {
      id: this.id,
      name: this.name,
      // Persist the original colors so saves are independent of the active palette.
      color: this.baseColor,
      colorLight: this.baseColorLight,
      capital: this.capital,
      startingIPCs: this.startingIPCs,
      turnOrder: this.turnOrder,
      isPlayable: this.isPlayable,
      allies: this.allies,
      bonuses: this.bonuses,
      ipcs: this.ipcs,
      isDefeated: this.isDefeated,
      controlledBy: this.controlledBy,
      warWeariness: this.warWeariness,
      morale: this.morale,
      nuclearReadiness: this.nuclearReadiness,
      betrayalCooldown: this.betrayalCooldown,
      isActive: this.isActive,
    };
  }
}

/**
 * Faction registry - stores all factions
 */
export class FactionRegistry {
  private factions: Map<string, Faction> = new Map();
  private colorblind = false;

  /**
   * Register a new faction
   */
  register(data: FactionData): Faction {
    const faction = new Faction(data);
    this.factions.set(data.id, faction);
    this.applyPalette(faction);
    return faction;
  }

  /**
   * Enable/disable the colorblind-safe palette. Re-applies colors to every
   * already-registered faction so the change takes effect immediately.
   */
  setColorblindMode(enabled: boolean): void {
    this.colorblind = enabled;
    for (const faction of this.factions.values()) {
      this.applyPalette(faction);
    }
  }

  isColorblindMode(): boolean {
    return this.colorblind;
  }

  private applyPalette(faction: Faction): void {
    if (this.colorblind) {
      const entry = colorblindEntryForTurnOrder(faction.turnOrder);
      faction.color = entry.color;
      faction.colorLight = entry.colorLight;
    } else {
      faction.color = faction.baseColor;
      faction.colorLight = faction.baseColorLight;
    }
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
   * Get factions actually participating in the current game session.
   * This is the canonical helper UI should use for faction lists, dots, rows, etc.
   * Excludes both defeated factions and factions marked inactive at New Game setup.
   */
  getActive(): Faction[] {
    return this.getInTurnOrder().filter(f => f.isActive);
  }

  /**
   * Like getActive() but keeps defeated factions, for screens that show
   * the full participant scoreboard (Victory, Stats).
   */
  getActiveIncludingDefeated(): Faction[] {
    return this.getAll()
      .filter(f => f.isActive)
      .sort((a, b) => a.turnOrder - b.turnOrder);
  }

  /**
   * Drop every registered faction. Called between games so a previous map's
   * factions never leak into the new one (showed up as ghost turn-order dots).
   */
  clear(): void {
    this.factions.clear();
  }

  /**
   * Load faction definitions from data array. Replaces any existing entries
   * so consecutive `loadFromData` calls do not stack stale factions.
   */
  loadFromData(factionDefs: FactionData[]): void {
    this.clear();
    for (const def of factionDefs) {
      this.register(def);
    }
  }
}