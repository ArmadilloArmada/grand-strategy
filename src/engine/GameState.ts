/**
 * GameState - Central state container with event system
 * Designed to be serializable and multiplayer-ready
 */

import { Territory, TerritoryData, PlacedUnit } from '../data/Territory';
import { UnitRegistry } from '../data/Unit';
import { Faction, FactionRegistry, FactionData } from '../data/Faction';
import { GameRules, GamePhase } from '../data/GameRules';
import { DiplomacyManager } from './DiplomacyManager';

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
  | 'strategic_bombing'
  | 'naval_bombardment'
  | 'reserve_updated'
  | 'units_deployed'
  | 'game_event'
  | 'diplomacy_proposal'
  | 'diplomacy_accepted'
  | 'diplomacy_declined';

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
  factions: (FactionData & { ipcs: number; isDefeated: boolean; controlledBy: string })[];
  pendingMoves: PendingMove[];
  purchaseOrders: PurchaseOrder[];
  diplomacy?: unknown;
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

    let income = 0;
    for (const territory of this.getTerritoriesOwnedBy(factionId)) {
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

    return income;
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
      }
    }

    this.pendingMoves = snapshot.pendingMoves;
    this.purchaseOrders = snapshot.purchaseOrders;

    if (snapshot.diplomacy) {
      this.diplomacyManager.restore(snapshot.diplomacy);
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
   * Load game from JSON string
   */
  loadFromJSON(json: string): void {
    const snapshot = JSON.parse(json) as GameStateSnapshot;
    this.restoreFromSnapshot(snapshot);
  }
}







