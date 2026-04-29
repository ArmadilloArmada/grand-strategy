/**
 * TurnManager - Handles turn flow, phase transitions, and seasonal weather
 */

import { GameState } from "./GameState";
import { GamePhase } from "../data/GameRules";
import { Faction } from "../data/Faction";
import { TurnStyle } from "./GameConfig";
import {
  getPhasesForStyle,
  getPhaseDisplayName as getStylePhaseDisplayName,
} from "./TurnStyleManager";

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

  // Callback for when we need to wait
  public onWaitForContinue: (() => void) | null = null;

  constructor(private state: GameState) {}

  setTurnStyle(style: TurnStyle): void {
    this.turnStyle = style;
    this.customPhases = getPhasesForStyle(style);
    if (style === "chess") this.maxActionsPerTurn = 1;
  }

  getTurnStyle(): TurnStyle {
    return this.turnStyle;
  }

  startGame(): void {
    const factions = this.state.factionRegistry.getInTurnOrder();
    if (factions.length === 0) throw new Error("No factions registered");

    this.state.turnNumber = 1;
    this.state.currentFactionId = factions[0].id;
    this.state.currentPhase = this.getFirstPhase();
    this.resetActionCounters();
    this.updateSeason();

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
    const factions = this.state.factionRegistry.getInTurnOrder();
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
          Math.random() < 0.08
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
    const factions = this.state.factionRegistry.getAll().filter(f => !f.isDefeated);
    const warningKey = (fId: string) => `${this.state.turnNumber}-${fId}`;

    for (const faction of factions) {
      if (this.proximityWarningsThisTurn.has(warningKey(faction.id))) continue;

      let warning: string | null = null;

      if (rules.victoryType === 'capital') {
        let caps = 0;
        for (const other of this.state.factionRegistry.getAll()) {
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
    for (const faction of this.state.factionRegistry.getAll()) {
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
    const factions = this.state.factionRegistry.getAll().filter(f => !f.isDefeated);

    switch (rules.victoryType) {
      case "capital": {
        for (const faction of factions) {
          let capitalsControlled = 0;
          for (const other of this.state.factionRegistry.getAll()) {
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
