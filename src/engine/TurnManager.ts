/**
 * TurnManager - Handles turn flow, phase transitions, and seasonal weather
 */

import { GameState } from "./GameState";
import { rng } from "./rng";
import { GamePhase } from "../data/GameRules";
import { Faction } from "../data/Faction";
import { TurnStyle } from "./GameConfig";
import {
  getPhasesForStyle,
  getPhaseDisplayName as getStylePhaseDisplayName,
  isMoveForMoveStyle,
} from "./TurnStyleManager";
import { MovementValidator } from "./MovementValidator";

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** How many full faction-rounds make up one season */
const TURNS_PER_SEASON = 3;

export class TurnManager {
  private turnStyle: TurnStyle = "classic";
  private customPhases: string[] | null = null;

  // For action-by-action mode
  public actionCount: number = 0;
  public waitingForContinue: boolean = false;

  // For chess mode
  public actionsThisTurn: number = 0;
  public maxActionsPerTurn: number = 1;

  // For move-for-move: shared alternating move segment
  public moveForMoveSegmentActive: boolean = false;
  /** Faction whose turn window opened the current alternating move segment */
  public moveForMoveTurnOwnerId: string | null = null;
  /** AI mobilizes once per turn owner at the start of their window */
  public moveForMoveOwnerBuildDone: boolean = false;
  private movementValidator: MovementValidator | null = null;

  // Callback for when we need to wait
  public onWaitForContinue: (() => void) | null = null;

  constructor(private state: GameState) {}

  setMovementValidator(validator: MovementValidator): void {
    this.movementValidator = validator;
  }

  isMoveForMoveSegmentActive(): boolean {
    return this.moveStyleUsesAlternatingMoves() && this.moveForMoveSegmentActive;
  }

  private moveStyleUsesAlternatingMoves(): boolean {
    return isMoveForMoveStyle(this.turnStyle);
  }

  setTurnStyle(style: TurnStyle): void {
    this.turnStyle = style;
    this.customPhases = getPhasesForStyle(style);
    if (style === "chess") this.maxActionsPerTurn = 1;
  }

  getTurnStyle(): TurnStyle {
    return this.turnStyle;
  }

  startGame(): void {
    const factions = this.state.factionRegistry.getActive();
    if (factions.length === 0) throw new Error("No factions registered");

    this.state.turnNumber = 1;
    this.state.currentFactionId = factions[0].id;
    this.state.currentPhase = this.getFirstPhase();
    this.resetActionCounters();
    this.updateSeason();

    if (this.moveStyleUsesAlternatingMoves()) {
      this.beginMoveForMoveTurn(factions[0].id);
    }

    this.state.emit("turn_start", {
      turnNumber: this.state.turnNumber,
      factionId: this.state.currentFactionId,
    });

    this.state.emit("phase_start", {
      phase: this.state.currentPhase,
      factionId: this.state.currentFactionId,
    });
  }

  advancePhase(): void {
    const currentPhase = this.state.currentPhase;

    this.state.emit("phase_end", {
      phase: currentPhase,
      factionId: this.state.currentFactionId,
    });

    if (this.moveStyleUsesAlternatingMoves()) {
      this.endMoveForMoveTurn();
      return;
    }

    const nextPhase = this.customPhases
      ? this.getNextPhaseForStyle(currentPhase)
      : this.state.rules.getNextPhase(currentPhase);

    if (nextPhase === null) {
      this.advanceFaction();
    } else {
      this.state.currentPhase = nextPhase as GamePhase;
      this.onPhaseStart(nextPhase as GamePhase);
    }
  }

  private advanceFaction(): void {
    const factions = this.state.factionRegistry.getActive();
    const currentIndex = factions.findIndex(f => f.id === this.state.currentFactionId);

    this.state.emit("turn_end", {
      turnNumber: this.state.turnNumber,
      factionId: this.state.currentFactionId,
    });

    const victor = this.checkVictory();
    if (victor) {
      this.state.emit("victory", { winner: victor.id });
      return;
    }

    this.checkSurrenders();
    this.checkVictoryProximity();

    const nextIndex = (currentIndex + 1) % factions.length;
    const nextFaction = factions[nextIndex];

    if (nextIndex === 0) {
      // New full round: increment turn, update season, tick diplomacy
      this.state.turnNumber++;
      this.updateSeason();
      this.state.diplomacyManager.tick();

      // Tick morale/war weariness
      this.state.systems.moraleSystem?.tickAll?.();

      // Tick weather events
      this.state.systems.weatherSystem?.tick?.();

      // Tick nuclear readiness
      this.state.systems.nuclearSystem?.tickReadiness?.();

      // Expire old espionage intel
      this.state.systems.espionageSystem?.tick?.();

      // Fade AI grudges each round
      this.state.systems.aiController?.fadeGrudges?.();

      // Partisan spawning: 8% chance per occupied enemy territory per round
      for (const territory of this.state.territories.values()) {
        if (
          territory.owner !== null &&
          territory.originalOwner !== null &&
          territory.owner !== territory.originalOwner &&
          territory.isLand() &&
          rng.next() < 0.08
        ) {
          territory.addUnits('partisan', 1);
        }
      }
    }

    this.state.currentFactionId = nextFaction.id;
    this.state.currentPhase = this.getFirstPhase();

    this.state.pendingMoves = [];
    this.state.purchaseOrders = [];
    this.state.selectedTerritoryId = null;
    this.state.selectedUnits.clear();

    this.resetActionCounters();

    for (const territory of this.state.territories.values()) {
      if (territory.owner === nextFaction.id) territory.resetActedUnits();
    }

    if (this.moveStyleUsesAlternatingMoves()) {
      this.beginMoveForMoveTurn(nextFaction.id);
    }

    this.state.emit("turn_start", {
      turnNumber: this.state.turnNumber,
      factionId: this.state.currentFactionId,
    });

    this.onPhaseStart(this.state.currentPhase);
  }

  /**
   * Update season: cycles Spring → Summer → Autumn → Winter every TURNS_PER_SEASON rounds.
   * Winter applies -1 attack/defense to all land units (handled in CombatResolver).
   */
  private updateSeason(): void {
    const seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
    const index = Math.floor((this.state.turnNumber - 1) / TURNS_PER_SEASON) % seasons.length;
    const newSeason = seasons[index];
    const previousSeason = this.state.currentSeason;
    this.state.currentSeason = newSeason;

    if (newSeason !== previousSeason) {
      this.state.emit('game_event', {
        type: 'season_change',
        season: newSeason,
        description: this.getSeasonDescription(newSeason),
      });
    }
  }

  getSeasonDescription(season: Season): string {
    switch (season) {
      case 'spring': return 'Spring — Normal conditions. Melting snow opens mountain passes.';
      case 'summer': return 'Summer — Optimal conditions. Full movement and combat effectiveness.';
      case 'autumn': return 'Autumn — Prepare for winter. Supply lines growing harder to maintain.';
      case 'winter': return 'Winter — Harsh conditions! Land units suffer -1 attack and defense.';
    }
  }

  getCurrentSeason(): Season {
    return this.state.currentSeason;
  }

  private onPhaseStart(phase: GamePhase | string): void {
    this.state.emit("phase_start", {
      phase,
      factionId: this.state.currentFactionId,
    });

    if (phase === "collect_income" || phase === "end") {
      this.collectIncome();
    }
  }

  private collectIncome(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const baseIncome = this.state.calculateIncome(faction.id);
    const moraleMultiplier = this.state.systems.moraleSystem?.getIncomeModifier?.(faction.id) ?? 1;
    let income = Math.floor(baseIncome * moraleMultiplier);

    // Marshall Plan deferred +5 IPC trade dividend
    const abilityState = this.state.systems.abilityState;
    if (abilityState) {
      const bonus = abilityState.pendingIPCBonuses.get(faction.id) ?? 0;
      if (bonus > 0) {
        income += bonus;
        abilityState.pendingIPCBonuses.delete(faction.id);
      }
    }

    faction.addIPCs(income);

    this.state.emit("income_collected", {
      factionId: faction.id,
      amount: income,
      total: faction.ipcs,
      season: this.state.currentSeason,
    });
  }

  /**
   * Emit a warning event when any faction is one step from winning.
   * Fires at most once per turn number per faction to avoid spam.
   */
  private proximityWarningsThisTurn: Set<string> = new Set();

  private checkVictoryProximity(): void {
    const rules = this.state.rules;
    const factions = this.state.factionRegistry.getActive();
    const warningKey = (fId: string) => `${this.state.turnNumber}-${fId}`;

    for (const faction of factions) {
      if (this.proximityWarningsThisTurn.has(warningKey(faction.id))) continue;

      let warning: string | null = null;

      if (rules.victoryType === 'capital') {
        let caps = 0;
        for (const other of this.state.factionRegistry.getActiveIncludingDefeated()) {
          if (faction.isEnemyOf(other.id) &&
              this.state.territories.get(other.capital)?.owner === faction.id) caps++;
        }
        if (caps >= rules.victoryCapitalsRequired - 1 && caps < rules.victoryCapitalsRequired) {
          warning = `${faction.name} needs just 1 more enemy capital to win!`;
        }
      } else if (rules.victoryType === 'economic') {
        const threshold = rules.victoryIPCThreshold;
        if (faction.ipcs >= threshold * 0.85) {
          const pct = Math.round((faction.ipcs / threshold) * 100);
          warning = `${faction.name} is at ${pct}% of the economic victory threshold!`;
        }
      } else if (rules.victoryType === 'territorial') {
        const owned = this.state.getTerritoriesOwnedBy(faction.id).length;
        if (owned >= rules.victoryTerritoryCount - 3) {
          warning = `${faction.name} needs only ${rules.victoryTerritoryCount - owned} more territories to win!`;
        }
      }

      if (warning) {
        this.proximityWarningsThisTurn.add(warningKey(faction.id));
        this.state.emit('game_event', {
          type: 'victory_warning',
          factionId: faction.id,
          factionName: faction.name,
          factionColor: faction.color,
          message: warning,
        });
      }
    }
  }

  private checkSurrenders(): void {
    for (const faction of this.state.factionRegistry.getActiveIncludingDefeated()) {
      if (faction.isDefeated) continue;
      if (faction.warWeariness >= 100) {
        faction.defeat();
        this.state.emit('game_event', {
          type: 'surrender',
          factionId: faction.id,
          factionName: faction.name,
          message: `${faction.name} has surrendered due to war weariness!`,
        });
      }
    }
  }

  checkVictory(): Faction | null {
    const rules = this.state.rules;
    const factions = this.state.factionRegistry.getActive();

    switch (rules.victoryType) {
      case "capital": {
        for (const faction of factions) {
          let capitalsControlled = 0;
          for (const other of this.state.factionRegistry.getActiveIncludingDefeated()) {
            if (faction.isEnemyOf(other.id)) {
              const capitalTerritory = this.state.territories.get(other.capital);
              if (capitalTerritory?.owner === faction.id) capitalsControlled++;
            }
          }
          if (capitalsControlled >= rules.victoryCapitalsRequired) return faction;
        }
        break;
      }

      case "economic": {
        for (const faction of factions) {
          if (faction.ipcs >= rules.victoryIPCThreshold) return faction;
        }
        break;
      }

      case "territorial": {
        for (const faction of factions) {
          if (this.state.getTerritoriesOwnedBy(faction.id).length >= rules.victoryTerritoryCount) {
            return faction;
          }
        }
        break;
      }
    }

    // Last alliance standing wins
    const activeAlliances = new Set<string>();
    for (const faction of factions) {
      const alliance = [faction.id, ...faction.allies].sort().join(",");
      activeAlliances.add(alliance);
    }
    if (activeAlliances.size === 1) return factions[0];

    return null;
  }

  isCurrentFactionAI(): boolean {
    return this.state.getCurrentFaction()?.controlledBy === "ai";
  }

  getPhaseDisplayName(): string {
    return getStylePhaseDisplayName(this.state.currentPhase, this.turnStyle);
  }

  notifyAction(): void {
    this.actionCount++;
    this.actionsThisTurn++;

    if (this.turnStyle === "chess" && this.actionsThisTurn >= this.maxActionsPerTurn) {
      this.advancePhase();
    }

    if (this.turnStyle === "action") {
      this.waitingForContinue = true;
      this.onWaitForContinue?.();
    }
  }

  /**
   * After a single move/attack in move-for-move mode, pass to the next faction with moves.
   */
  passMoveForMoveTurn(): void {
    if (!this.isMoveForMoveSegmentActive() || (this.state.currentPhase as string) !== "play") return;

    const nextFactionId = this.findNextMovableFaction(this.state.currentFactionId);
    if (nextFactionId) {
      this.switchToFaction(nextFactionId);
      return;
    }

    const ownerId = this.moveForMoveTurnOwnerId ?? this.state.currentFactionId;
    if (ownerId !== this.state.currentFactionId) {
      this.switchToFaction(ownerId);
    }
  }

  /** End the active faction's turn window: collect income and advance. */
  private endMoveForMoveTurn(): void {
    this.moveForMoveSegmentActive = false;
    this.moveForMoveTurnOwnerId = null;
    this.moveForMoveOwnerBuildDone = false;
    this.collectIncome();
    this.advanceFaction();
  }

  private beginMoveForMoveTurn(ownerId: string): void {
    this.moveForMoveSegmentActive = true;
    this.moveForMoveTurnOwnerId = ownerId;
    this.moveForMoveOwnerBuildDone = false;
    this.state.currentPhase = "play" as GamePhase;

    for (const faction of this.state.factionRegistry.getActive()) {
      for (const territory of this.state.getTerritoriesOwnedBy(faction.id)) {
        territory.resetActedUnits();
      }
    }

    this.state.pendingMoves = [];
    this.state.purchaseOrders = [];
    this.state.selectedTerritoryId = null;
    this.state.selectedUnits.clear();
  }

  private switchToFaction(factionId: string, emitTurnStart = true): void {
    if (this.state.currentFactionId === factionId && emitTurnStart) return;

    this.state.pendingMoves = [];
    this.state.selectedTerritoryId = null;
    this.state.selectedUnits.clear();
    this.state.currentFactionId = factionId;

    if (emitTurnStart) {
      this.state.emit("turn_start", {
        turnNumber: this.state.turnNumber,
        factionId: factionId,
      });
    }
  }

  private findNextMovableFaction(afterFactionId: string | null): string | null {
    const factions = this.state.factionRegistry.getActive();
    if (factions.length === 0) return null;

    const startIndex = afterFactionId
      ? (factions.findIndex(f => f.id === afterFactionId) + 1) % factions.length
      : 0;

    for (let i = 0; i < factions.length; i++) {
      const faction = factions[(startIndex + i) % factions.length];
      if (this.factionHasMovableUnits(faction.id)) return faction.id;
    }
    return null;
  }

  private factionHasMovableUnits(factionId: string): boolean {
    if (this.movementValidator) {
      return this.movementValidator.factionHasMovableUnits(factionId);
    }

    for (const territory of this.state.territories.values()) {
      if (territory.owner !== factionId) continue;
      for (const pu of territory.units) {
        if (territory.getAvailableUnitCount(pu.unitTypeId) > 0) return true;
      }
    }
    return false;
  }

  continue(): void {
    this.waitingForContinue = false;
  }

  private resetActionCounters(): void {
    this.actionsThisTurn = 0;
    this.actionCount = 0;
    this.waitingForContinue = false;
  }

  getPhases(): string[] {
    return this.customPhases || getPhasesForStyle(this.turnStyle);
  }

  getFirstPhase(): GamePhase {
    return this.getPhases()[0] as GamePhase;
  }

  getNextPhaseForStyle(currentPhase: string): string | null {
    const phases = this.getPhases();
    const currentIndex = phases.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex >= phases.length - 1) return null;
    return phases[currentIndex + 1];
  }
}
