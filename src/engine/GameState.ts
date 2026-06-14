/**
 * GameState - Central state container with event system
 * Designed to be serializable and multiplayer-ready
 */

import { Territory, TerritoryData, PlacedUnit } from '../data/Territory';
import { UnitRegistry } from '../data/Unit';
import { Faction, FactionRegistry, FactionData } from '../data/Faction';
import { GameRules, GamePhase } from '../data/GameRules';
import { DiplomacyManager } from './DiplomacyManager';
import { SupplySystem } from './SupplySystem';

/**
 * Registry of optional subsystems wired onto GameState after construction.
 * Using explicit optional fields instead of (state as any).x casts.
 */
export interface SystemRegistry {
  technologyManager?: {
    getTechEffect(factionId: string): {
      incomeBonus?: number;
      attackBonus?: number;
      defenseBonus?: number;
      infantryDefenseBonus?: number;
      infantryAttackBonus?: number;
      navalAttackBonus?: number;
      navalDefenseBonus?: number;
      airAttackBonus?: number;
      movementBonus?: number;
      [key: string]: unknown;
    };
    getFactionTechPublic?: (factionId: string) => { currentResearch?: string | null; researchProgress?: number } | undefined;
    startResearch?(factionId: string, techId: string): void;
    hasTech?(factionId: string, techId: string): boolean;
  };
  moraleSystem?: {
    tick?(): void;
    tickAll?(): void;
    getCombatModifier?(factionId: string): number;
    getIncomeModifier?(factionId: string): number;
    recordCasualties?(factionId: string, count: number): void;
    recordVictory?(factionId: string, isCapital?: boolean, hasFactory?: boolean): void;
    recordTacticalVictory?(factionId: string, cleanWin?: boolean): void;
  };
  espionageSystem?: {
    tick?(): void;
    isIntelRevealed?(territoryId: string): boolean;
    revealFactionIntel?(targetFactionId: string, turns: number): void;
    getCooldownUntil?(factionId: string): number;
    getHistory?(factionId: string, limit?: number): Array<{ turn: number; opType: string; targetFactionId: string; success: boolean; exposed: boolean }>;
    executeOperation?(initiatorId: string, targetFactionId: string, opType: string): { success: boolean; exposed: boolean; detail: string };
  };
  nuclearSystem?: {
    tick?(): void;
    tickReadiness?(): void;
    canLaunch?(factionId: string): boolean;
    launchStrike?(factionId: string, targetTerritoryId: string): unknown;
  };
  aiController?: {
    fadeGrudges?(): void;
    recordGrievance?(offenderId: string, holderId: string, severity: number): void;
  };
  reserveSystem?: {
    serialize(): { reserves: [string, { unitTypeId: string; count: number }[]][]; pending: { unitTypeId: string; count: number; territoryId: string }[] };
    restore(data: { reserves: [string, { unitTypeId: string; count: number }[]][]; pending: { unitTypeId: string; count: number; territoryId: string }[] }): void;
  };
  mobilizationSystem?: import('./MobilizationSystem').MobilizationSystem;
  weatherSystem?: {
    tick(): void;
    getWeatherModifiers(terrain: import('../data/Territory').TerrainType): import('./WeatherSystem').WeatherModifiers;
    getDisplayString(): string;
    serialize(): object;
    restore(data: object): void;
    currentEvent: import('./WeatherSystem').WeatherEvent;
  };
  commanderProgression?: {
    playerFactionIds: string[];
  };
  fortificationSystem?: {
    canBuild(territoryId: string, factionId: string): boolean;
    build(territoryId: string, factionId: string): boolean;
    getDefenseBonus(territoryId: string): number;
    getUpgradeCost(territoryId: string): number | null;
    onCapture(territoryId: string): void;
  };
  abilityState?: {
    /** Faction abilities that applied effects still in flight this game session */
    pendingIPCBonuses: Map<string, number>;      // factionId → IPC bonus on next income
    scorchedTerritories: Map<string, number>;    // territoryId → turn it expires
    islandHoppingTurns: Map<string, number>;     // factionId → turn it was activated
  };
}

export type GameEventType =
  | 'state_loaded'
  | 'turn_start'
  | 'turn_end'
  | 'phase_start'
  | 'phase_end'
  | 'territory_selected'
  | 'units_moved'
  | 'combat_start'
  | 'combat_round'
  | 'combat_end'
  | 'territory_mobilized'
  | 'units_produced'
  | 'income_collected'
  | 'faction_defeated'
  | 'victory'
  | 'tech_researched'
  | 'ai_thinking'
  | 'ai_debug'
  | 'strategic_bombing'
  | 'naval_bombardment'
  | 'reserve_updated'
  | 'units_deployed'
  | 'game_event'
  | 'diplomacy_proposal'
  | 'diplomacy_accepted'
  | 'diplomacy_declined'
  | 'nuclear_strike'
  | 'alliance_formed'
  | 'alliance_betrayed'
  | 'pact_formed'
  | 'espionage_result'
  | 'objective_reward'
  | 'tension_level_change'
  | 'fortification_built'
  | 'tactical_assault_start';

export interface GameEvent {
  type: GameEventType;
  data: unknown;
  timestamp: number;
}

export type GameEventListener = (event: GameEvent) => void;

export interface PendingMove {
  unitTypeId: string;
  count: number;
  fromTerritoryId: string;
  toTerritoryId: string;
  path: string[];
  viaTransport?: string; // sea zone ID of the transport being used, if any
}

export interface PurchaseOrder {
  unitTypeId: string;
  count: number;
  factoryTerritoryId: string;
}

export interface GameStateSnapshot {
  turnNumber: number;
  currentFactionId: string;
  currentPhase: GamePhase;
  territories: (TerritoryData & { units: PlacedUnit[] })[];
  factions: (FactionData & { ipcs: number; isDefeated: boolean; controlledBy: string; warWeariness?: number; morale?: number; nuclearReadiness?: number; betrayalCooldown?: number; isActive?: boolean })[];
  pendingMoves: PendingMove[];
  purchaseOrders: PurchaseOrder[];
  diplomacy?: unknown;
  reserves?: { reserves: [string, { unitTypeId: string; count: number }[]][]; pending: { unitTypeId: string; count: number; territoryId: string }[] };
  abilityState?: {
    pendingIPCBonuses: [string, number][];
    scorchedTerritories: [string, number][];
    islandHoppingTurns: [string, number][];
  };
  weather?: { condition: string; name: string; description: string; duration: number; expiresAtTurn: number };
}

export class GameState {
  // Core game data
  public territories: Map<string, Territory> = new Map();
  public unitRegistry: UnitRegistry = new UnitRegistry();
  public factionRegistry: FactionRegistry = new FactionRegistry();
  public rules: GameRules = GameRules.createDefault();

  // Turn state
  public turnNumber: number = 1;
  public currentFactionId: string = '';
  public currentPhase: GamePhase = 'purchase';

  // Pending actions for current turn
  public pendingMoves: PendingMove[] = [];
  public purchaseOrders: PurchaseOrder[] = [];

  // Selection state (UI)
  public selectedTerritoryId: string | null = null;
  public selectedUnits: Map<string, number> = new Map(); // unitTypeId -> count

  // Diplomacy
  public diplomacyManager: DiplomacyManager = new DiplomacyManager(this);

  // Seasonal weather (updated by TurnManager each round)
  public currentSeason: 'spring' | 'summer' | 'autumn' | 'winter' = 'spring';

  // Optional subsystems registered after construction (avoids (state as any) casts)
  public systems: SystemRegistry = {};

  // Territory ownership history: territoryId → array of { factionId, turnNumber }
  // Only the last 5 owners are kept per territory to bound memory.
  public ownershipHistory: Map<string, Array<{ factionId: string; turnNumber: number }>> = new Map();

  /** Record that a territory changed owner. Called by CombatResolver/movement code. */
  recordOwnershipChange(territoryId: string, previousOwnerId: string | null, turnNumber: number): void {
    if (previousOwnerId === null) return;
    if (!this.ownershipHistory.has(territoryId)) this.ownershipHistory.set(territoryId, []);
    const history = this.ownershipHistory.get(territoryId)!;
    history.push({ factionId: previousOwnerId, turnNumber });
    if (history.length > 5) history.shift();
  }

  // Event system
  private listeners: Map<GameEventType, Set<GameEventListener>> = new Map();
  private eventHistory: GameEvent[] = [];

  /**
   * Subscribe to game events
   */
  on(type: GameEventType, listener: GameEventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Emit a game event
   */
  emit(type: GameEventType, data: unknown = {}): void {
    const event: GameEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    
    this.eventHistory.push(event);
    
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${type}:`, error);
        }
      }
    }
  }

  /**
   * Get current faction
   */
  getCurrentFaction(): Faction | undefined {
    return this.factionRegistry.get(this.currentFactionId);
  }

  /**
   * Get selected territory
   */
  getSelectedTerritory(): Territory | undefined {
    if (!this.selectedTerritoryId) return undefined;
    return this.territories.get(this.selectedTerritoryId);
  }

  /**
   * Select a territory
   */
  selectTerritory(territoryId: string | null): void {
    const previousTerritoryId = this.selectedTerritoryId;
    this.selectedTerritoryId = territoryId;
    this.selectedUnits.clear();
    this.emit('territory_selected', { territoryId, previousTerritoryId });
  }

  /**
   * Get all territories owned by a faction
   */
  getTerritoriesOwnedBy(factionId: string): Territory[] {
    return Array.from(this.territories.values())
      .filter(t => t.owner === factionId);
  }

  /**
   * Calculate income for a faction (includes faction asymmetry bonuses)
   */
  calculateIncome(factionId: string): number {
    const faction = this.factionRegistry.get(factionId);
    if (!faction) return 0;

    const supplySystem = new SupplySystem(this);
    const scorchedTerritories = this.systems.abilityState?.scorchedTerritories;
    let income = 0;
    for (const territory of this.getTerritoriesOwnedBy(factionId)) {
      // Naval blockade: coastal territories surrounded by enemy sea power earn 0
      if (supplySystem.isNavalBlockaded(territory.id, factionId)) continue;
      // Scorched Earth ability: territory generates no income until the effect expires
      if (scorchedTerritories?.has(territory.id) &&
          (scorchedTerritories.get(territory.id) ?? 0) > this.turnNumber) continue;
      income += territory.production * this.rules.baseIncomeMultiplier;
    }

    // Capital bonus
    const capitalTerritory = this.territories.get(faction.capital);
    if (capitalTerritory?.owner === factionId) {
      income += this.rules.capitalBonusIPCs;
    }

    // Faction bonus: extra IPCs per factory
    const bonusPerFactory = faction.bonuses?.ipcPerFactory ?? 0;
    if (bonusPerFactory > 0) {
      const factories = this.getFactories(factionId);
      income += factories.length * bonusPerFactory;
    }

    // Resource income bonuses (oil +2/territory, steel +1, food +1, rare_earth +2)
    for (const territory of this.getTerritoriesOwnedBy(factionId)) {
      if (territory.resource === 'oil') income += 2;
      else if (territory.resource === 'steel') income += 1;
      else if (territory.resource === 'food') income += 1;
      else if (territory.resource === 'rare_earth') income += 2;
    }

    // Trade deal income from active diplomatic trade agreements
    income += this.diplomacyManager.getTradeIncome(factionId);

    // Faction income multiplier bonus (e.g. Atlantic Alliance +10%)
    const incomeMultiplierBonus = faction.bonuses?.incomeMultiplierBonus ?? 0;
    if (incomeMultiplierBonus > 0) {
      income = Math.round(income * (1 + incomeMultiplierBonus));
    }

    // Tech income bonus (e.g. Industrialization, Lend-Lease)
    const techManager = this.systems.technologyManager;
    if (techManager) {
      const incomeBonus = techManager.getTechEffect(factionId).incomeBonus ?? 0;
      if (incomeBonus > 0) income = Math.round(income * (1 + incomeBonus));
    }

    return income;
  }

  /**
   * Itemized income breakdown for display in the HUD tooltip.
   */
  calculateIncomeBreakdown(factionId: string): {
    territorial: number; capital: number; factory: number; resource: number;
    trade: number; techMultiplier: number; factionMultiplier: number;
    blockadeLoss: number; scorchedLoss: number; total: number;
  } {
    const faction = this.factionRegistry.get(factionId);
    if (!faction) return { territorial: 0, capital: 0, factory: 0, resource: 0, trade: 0, techMultiplier: 0, factionMultiplier: 0, blockadeLoss: 0, scorchedLoss: 0, total: 0 };

    const supplySystem = new SupplySystem(this);
    const scorchedTerritories = this.systems.abilityState?.scorchedTerritories;
    let territorial = 0, blockadeLoss = 0, scorchedLoss = 0, resource = 0;

    for (const territory of this.getTerritoriesOwnedBy(factionId)) {
      const base = territory.production * this.rules.baseIncomeMultiplier;
      if (supplySystem.isNavalBlockaded(territory.id, factionId)) { blockadeLoss += base; continue; }
      if (scorchedTerritories?.has(territory.id) && (scorchedTerritories.get(territory.id) ?? 0) > this.turnNumber) { scorchedLoss += base; continue; }
      territorial += base;
      if (territory.resource === 'oil') resource += 2;
      else if (territory.resource === 'steel') resource += 1;
      else if (territory.resource === 'food') resource += 1;
      else if (territory.resource === 'rare_earth') resource += 2;
    }

    const capital = this.territories.get(faction.capital)?.owner === factionId ? this.rules.capitalBonusIPCs : 0;
    const bonusPerFactory = faction.bonuses?.ipcPerFactory ?? 0;
    const factory = bonusPerFactory > 0 ? this.getFactories(factionId).length * bonusPerFactory : 0;
    const trade = this.diplomacyManager.getTradeIncome(factionId);

    const subtotal = territorial + capital + factory + resource + trade;
    const factionMultiplierBonus = faction.bonuses?.incomeMultiplierBonus ?? 0;
    const factionMultiplier = factionMultiplierBonus > 0 ? Math.round(subtotal * factionMultiplierBonus) : 0;

    const techManager = this.systems.technologyManager;
    const incomeBonus = techManager ? (techManager.getTechEffect(factionId).incomeBonus ?? 0) : 0;
    const techMultiplier = incomeBonus > 0 ? Math.round((subtotal + factionMultiplier) * incomeBonus) : 0;

    const total = subtotal + factionMultiplier + techMultiplier;
    return { territorial, capital, factory, resource, trade, techMultiplier, factionMultiplier, blockadeLoss, scorchedLoss, total };
  }

  /**
   * Get factories owned by a faction (excluding bombed/disabled this turn)
   */
  getFactories(factionId: string): Territory[] {
    return this.getTerritoriesOwnedBy(factionId)
      .filter(t => t.hasFactory && !t.isFactoryDisabled(this.turnNumber));
  }

  /**
   * Snapshot current state for save/load
   */
  createSnapshot(): GameStateSnapshot {
    return {
      turnNumber: this.turnNumber,
      currentFactionId: this.currentFactionId,
      currentPhase: this.currentPhase,
      territories: Array.from(this.territories.values()).map(t => t.serialize()),
      factions: this.factionRegistry.getAll().map(f => f.serialize()),
      pendingMoves: [...this.pendingMoves],
      purchaseOrders: [...this.purchaseOrders],
      diplomacy: this.diplomacyManager.serialize(),
      reserves: this.systems.reserveSystem?.serialize(),
      abilityState: this.systems.abilityState ? {
        pendingIPCBonuses: [...this.systems.abilityState.pendingIPCBonuses.entries()],
        scorchedTerritories: [...this.systems.abilityState.scorchedTerritories.entries()],
        islandHoppingTurns: [...this.systems.abilityState.islandHoppingTurns.entries()],
      } : undefined,
      weather: this.systems.weatherSystem?.serialize() as any,
    };
  }

  /**
   * Restore state from snapshot
   */
  restoreFromSnapshot(snapshot: GameStateSnapshot): void {
    this.turnNumber = snapshot.turnNumber;
    this.currentFactionId = snapshot.currentFactionId;
    this.currentPhase = snapshot.currentPhase;

    // Restore territories
    this.territories.clear();
    for (const tData of snapshot.territories) {
      const territory = new Territory(tData);
      territory.units = tData.units;
      this.territories.set(territory.id, territory);
    }

    // Restore factions
    for (const fData of snapshot.factions) {
      const faction = this.factionRegistry.get(fData.id);
      if (faction) {
        faction.ipcs = fData.ipcs;
        faction.isDefeated = fData.isDefeated;
        faction.controlledBy = fData.controlledBy as 'human' | 'ai';
        if (fData.warWeariness !== undefined) faction.warWeariness = fData.warWeariness;
        if (fData.morale !== undefined) faction.morale = fData.morale;
        if (fData.nuclearReadiness !== undefined) faction.nuclearReadiness = fData.nuclearReadiness;
        if (fData.betrayalCooldown !== undefined) faction.betrayalCooldown = fData.betrayalCooldown;
        // Backward compatibility: pre-active-set saves omit isActive, so treat
        // every faction in the snapshot as active. New saves persist the flag.
        faction.isActive = fData.isActive ?? true;
      }
    }

    this.pendingMoves = snapshot.pendingMoves;
    this.purchaseOrders = snapshot.purchaseOrders;

    if (snapshot.diplomacy) {
      this.diplomacyManager.restore(snapshot.diplomacy);
    }

    if (snapshot.reserves && this.systems.reserveSystem) {
      this.systems.reserveSystem.restore(snapshot.reserves);
    }

    if (snapshot.abilityState && this.systems.abilityState) {
      this.systems.abilityState.pendingIPCBonuses = new Map(snapshot.abilityState.pendingIPCBonuses);
      this.systems.abilityState.scorchedTerritories = new Map(snapshot.abilityState.scorchedTerritories);
      this.systems.abilityState.islandHoppingTurns = new Map(snapshot.abilityState.islandHoppingTurns);
    }

    if (snapshot.weather && this.systems.weatherSystem) {
      this.systems.weatherSystem.restore(snapshot.weather as any);
    }

    this.emit('state_loaded', {});
  }

  /**
   * Save game to JSON string
   */
  saveToJSON(): string {
    return JSON.stringify(this.createSnapshot(), null, 2);
  }

  /**
   * Compute a deterministic 32-bit FNV-1a checksum of the critical game state.
   * Used for multiplayer desync detection — all clients must produce the same
   * checksum after applying the same action.
   *
   * Only includes state that affects gameplay:
   *   - turn number, phase, current faction
   *   - territory owners and unit counts (sorted by territory id)
   *   - faction IPCs and defeat flags (sorted by faction id)
   */
  computeChecksum(): number {
    // FNV-1a 32-bit constants
    let hash = 0x811c9dc5;
    const prime = 0x01000193;

    const mix = (s: string): void => {
      for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        hash = Math.imul(hash, prime) >>> 0;
      }
      // Separator byte to avoid "ab"+"c" === "a"+"bc" collisions
      hash ^= 0x1f;
      hash = Math.imul(hash, prime) >>> 0;
    };

    // Turn / phase / faction
    mix(String(this.turnNumber));
    mix(this.currentPhase);
    mix(this.currentFactionId);

    // Territories — sort by id for determinism
    const territories = Array.from(this.territories.values())
      .sort((a, b) => a.id < b.id ? -1 : 1);
    for (const t of territories) {
      mix(t.id);
      mix(t.owner ?? 'null');
      // Include sorted unit counts
      const units = [...t.units].sort((a, b) => a.unitTypeId < b.unitTypeId ? -1 : 1);
      for (const u of units) {
        mix(u.unitTypeId);
        mix(String(u.count));
      }
    }

    // Factions — sort by id for determinism
    const factions = this.factionRegistry.getAll().sort((a, b) => a.id < b.id ? -1 : 1);
    for (const f of factions) {
      mix(f.id);
      mix(String(f.ipcs));
      mix(f.isDefeated ? '1' : '0');
    }

    return hash >>> 0; // ensure unsigned 32-bit
  }

  /**
   * Load game from JSON string
   */
  loadFromJSON(json: string): void {
    const snapshot = JSON.parse(json) as GameStateSnapshot;
    this.restoreFromSnapshot(snapshot);
  }
}







