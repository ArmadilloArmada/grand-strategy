/**
 * TurnManager - Handles turn flow and phase transitions
 */

import { GameState } from "./GameState";
import { GamePhase } from "../data/GameRules";
import { Faction } from "../data/Faction";
import { TurnStyle } from "./GameConfig";
import {
  getPhasesForStyle,
  getPhaseDisplayName as getStylePhaseDisplayName,
} from "./TurnStyleManager";

export class TurnManager {
  private turnStyle: TurnStyle = "classic";
  private customPhases: string[] | null = null;

  // For action-by-action mode
  public actionCount: number = 0;
  public waitingForContinue: boolean = false;

  // For chess mode
  public actionsThisTurn: number = 0;
  public maxActionsPerTurn: number = 1;

  // Callback for when we need to wait
  public onWaitForContinue: (() => void) | null = null;

  constructor(private state: GameState) {}

  /**
   * Set the turn style
   */
  setTurnStyle(style: TurnStyle): void {
    this.turnStyle = style;
    this.customPhases = getPhasesForStyle(style);

    console.log("=== TURN STYLE SET ===");
    console.log("Style:", style);
    console.log("Phases:", this.customPhases);
    console.log("======================");

    // Chess mode: only 1 action per turn
    if (style === "chess") {
      this.maxActionsPerTurn = 1;
    }
  }

  /**
   * Get current turn style
   */
  getTurnStyle(): TurnStyle {
    return this.turnStyle;
  }

  /**
   * Initialize the game and start first turn
   */
  startGame(): void {
    const factions = this.state.factionRegistry.getInTurnOrder();
    if (factions.length === 0) {
      throw new Error("No factions registered");
    }

    this.state.turnNumber = 1;
    this.state.currentFactionId = factions[0].id;
    this.state.currentPhase = this.getFirstPhase();
    this.resetActionCounters();

    this.state.emit("turn_start", {
      turnNumber: this.state.turnNumber,
      factionId: this.state.currentFactionId,
    });

    this.state.emit("phase_start", {
      phase: this.state.currentPhase,
      factionId: this.state.currentFactionId,
    });
  }

  /**
   * Advance to the next phase
   */
  advancePhase(): void {
    const currentPhase = this.state.currentPhase;

    this.state.emit("phase_end", {
      phase: currentPhase,
      factionId: this.state.currentFactionId,
    });

    // Use turn style phases if set, otherwise use rules phases
    const nextPhase = this.customPhases
      ? this.getNextPhaseForStyle(currentPhase)
      : this.state.rules.getNextPhase(currentPhase);

    if (nextPhase === null) {
      // End of turn for this faction
      this.advanceFaction();
    } else {
      this.state.currentPhase = nextPhase as GamePhase;
      this.onPhaseStart(nextPhase as GamePhase);
    }
  }

  /**
   * Advance to the next faction's turn
   */
  private advanceFaction(): void {
    const factions = this.state.factionRegistry.getInTurnOrder();
    const currentIndex = factions.findIndex(
      (f) => f.id === this.state.currentFactionId
    );
    const currentFaction = factions[currentIndex];

    console.log(
      `>>> FACTION TURN END: ${currentFaction?.name} completed all phases`
    );

    this.state.emit("turn_end", {
      turnNumber: this.state.turnNumber,
      factionId: this.state.currentFactionId,
    });

    // Check for victory
    const victor = this.checkVictory();
    if (victor) {
      this.state.emit("victory", { winner: victor.id });
      return;
    }

    // Move to next faction or next turn
    const nextIndex = (currentIndex + 1) % factions.length;
    const nextFaction = factions[nextIndex];

    if (nextIndex === 0) {
      // New round — tick diplomacy to expire lapsed pacts
      this.state.turnNumber++;
      this.state.diplomacyManager.tick();
    }

    this.state.currentFactionId = nextFaction.id;
    this.state.currentPhase = this.getFirstPhase();

    // Clear pending actions
    this.state.pendingMoves = [];
    this.state.purchaseOrders = [];
    this.state.selectedTerritoryId = null;
    this.state.selectedUnits.clear();

    // Reset action counters for new turn
    this.resetActionCounters();
    
    // Reset all units' "acted" status for the new faction's turn
    for (const territory of this.state.territories.values()) {
      if (territory.owner === nextFaction.id) {
        territory.resetActedUnits();
      }
    }

    this.state.emit("turn_start", {
      turnNumber: this.state.turnNumber,
      factionId: this.state.currentFactionId,
    });

    this.onPhaseStart(this.state.currentPhase);
  }

  /**
   * Handle phase start logic
   */
  private onPhaseStart(phase: GamePhase | string): void {
    console.log(
      `>>> PHASE START: ${phase} (Faction: ${this.state.currentFactionId}, Style: ${this.turnStyle})`
    );

    this.state.emit("phase_start", {
      phase,
      factionId: this.state.currentFactionId,
    });

    // Auto-collect income at income phase (classic) or end phase (quick/civ)
    if (phase === "collect_income" || phase === "end") {
      this.collectIncome();
    }
  }

  /**
   * Collect income for current faction
   */
  private collectIncome(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const income = this.state.calculateIncome(faction.id);
    faction.addIPCs(income);

    this.state.emit("income_collected", {
      factionId: faction.id,
      amount: income,
      total: faction.ipcs,
    });
  }

  /**
   * Check for victory condition
   */
  checkVictory(): Faction | null {
    const rules = this.state.rules;
    const factions = this.state.factionRegistry
      .getAll()
      .filter((f) => !f.isDefeated);

    switch (rules.victoryType) {
      case "capital": {
        // Check if any faction controls enough enemy capitals
        for (const faction of factions) {
          let capitalsControlled = 0;
          for (const other of this.state.factionRegistry.getAll()) {
            if (faction.isEnemyOf(other.id)) {
              const capitalTerritory = this.state.territories.get(
                other.capital
              );
              if (capitalTerritory?.owner === faction.id) {
                capitalsControlled++;
              }
            }
          }
          if (capitalsControlled >= rules.victoryCapitalsRequired) {
            return faction;
          }
        }
        break;
      }

      case "economic": {
        for (const faction of factions) {
          if (faction.ipcs >= rules.victoryIPCThreshold) {
            return faction;
          }
        }
        break;
      }

      case "territorial": {
        for (const faction of factions) {
          const territories = this.state.getTerritoriesOwnedBy(faction.id);
          if (territories.length >= rules.victoryTerritoryCount) {
            return faction;
          }
        }
        break;
      }
    }

    // Check if only one alliance remains
    const activeAlliances = new Set<string>();
    for (const faction of factions) {
      // Create alliance identifier (sorted list of faction + allies)
      const alliance = [faction.id, ...faction.allies].sort().join(",");
      activeAlliances.add(alliance);
    }

    if (activeAlliances.size === 1) {
      return factions[0];
    }

    return null;
  }

  /**
   * Check if current faction is AI-controlled
   */
  isCurrentFactionAI(): boolean {
    const faction = this.state.getCurrentFaction();
    return faction?.controlledBy === "ai";
  }

  /**
   * Get current phase display name
   */
  getPhaseDisplayName(): string {
    const displayName = getStylePhaseDisplayName(
      this.state.currentPhase,
      this.turnStyle
    );
    console.log(
      `Phase Display: ${this.state.currentPhase} -> ${displayName} (style: ${this.turnStyle})`
    );
    return displayName;
  }

  /**
   * Notify that an action was taken (for action-by-action and chess modes)
   */
  notifyAction(): void {
    this.actionCount++;
    this.actionsThisTurn++;

    // In chess mode, end turn after max actions
    if (
      this.turnStyle === "chess" &&
      this.actionsThisTurn >= this.maxActionsPerTurn
    ) {
      this.advancePhase();
    }

    // In action-by-action mode, wait for continue
    if (this.turnStyle === "action") {
      this.waitingForContinue = true;
      this.onWaitForContinue?.();
    }
  }

  /**
   * Continue after waiting (for action-by-action mode)
   */
  continue(): void {
    this.waitingForContinue = false;
  }

  /**
   * Reset action counters for new turn
   */
  private resetActionCounters(): void {
    this.actionsThisTurn = 0;
    this.actionCount = 0;
    this.waitingForContinue = false;
  }

  /**
   * Get phases for current turn style
   */
  getPhases(): string[] {
    return this.customPhases || getPhasesForStyle(this.turnStyle);
  }

  /**
   * Get first phase for current style
   */
  getFirstPhase(): GamePhase {
    const phases = this.getPhases();
    return phases[0] as GamePhase;
  }

  /**
   * Get next phase for current style
   */
  getNextPhaseForStyle(currentPhase: string): string | null {
    const phases = this.getPhases();
    const currentIndex = phases.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex >= phases.length - 1) {
      return null;
    }
    return phases[currentIndex + 1];
  }
}
