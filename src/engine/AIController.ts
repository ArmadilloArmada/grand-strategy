/**
 * AIController - Computer-controlled faction AI
 * Uses AIPersonality data for distinct, believable opponent behavior.
 */

import { GameState } from "./GameState";
import { TurnManager } from "./TurnManager";
import { MovementValidator } from "./MovementValidator";
import { resolveMovePhaseContext } from './movePhaseContext';
import { pickBestReadyStackType } from './aiStackSelection';
import { MobilizationOption, MobilizationSystem } from "./MobilizationSystem";
import { CombatResolver } from "./CombatResolver";
import { settings } from '../ui/Settings';
import {
  applyTacticalVictoryBonuses,
  buildTacticalOutcomeMeta,
  shouldAIUseTacticalAssault,
} from './TacticalBattleEngine';
import { statisticsManager } from './StatisticsManager';
import { Territory } from "../data/Territory";
import { Faction } from "../data/Faction";
import {
  AIPersonality,
  getPersonality,
  calculateAttackPriority,
  calculateUnitPriority,
} from "./AIPersonalities";
import {
  applyDifficultyToPersonality,
  clonePersonality,
  countFactionUnitsByDomain,
  getIpcReserveFloor,
  getMaxMobilizationsForTurn,
  mobilizationAirPenalty,
  mobilizationNavalPenalty,
  MOBILIZATION_LIMITS,
  shouldSkipAirHeavyMobilization,
  shouldSkipNavalHeavyMobilization,
  type AIDifficultyLevel,
} from './AIDifficulty';
import { isNavalReachNeighbor } from './gridAdjacency';
import type { AIWorkerState, AIWorkerResponse } from "../workers/aiWorkerTypes";

interface PerfBucket {
  samples: number;
  avg: number;
  max: number;
  p95: number;
  recent: number[];
}

interface PerfRoot {
  [metric: string]: PerfBucket;
}

export interface TerritoryEvaluation {
  territory: Territory;
  strategicValue: number;
  threatLevel: number;
  defenseStrength: number;
  nearbyEnemyStrength: number;
}

export interface AttackPlan {
  targetId: string;
  attackers: { fromId: string; unitTypeId: string; count: number }[];
  expectedSuccess: number;
  strategicValue: number;
}

export interface AIDebugPlan {
  targetId: string;
  targetName: string;
  owner: string | null;
  expectedSuccess: number;
  strategicValue: number;
  minSuccess: number;
  minValue: number;
  attackPower: number;
  defenseStrength: number;
  attackers: { fromId: string; fromName: string; unitTypeId: string; count: number }[];
  status: "chosen" | "rejected";
  reason: string;
}

export interface AIDebugSnapshot {
  factionId: string;
  factionName: string;
  personality: string;
  phase: string;
  plans: AIDebugPlan[];
  chosenCount: number;
}

interface AttackCandidate {
  fromId: string;
  unitTypeId: string;
  count: number;
  attack: number;
  cost: number;
  domain: string;
}

export class AIController {
  private movementValidator: MovementValidator;
  private mobilizationSystem: MobilizationSystem;
  private combatResolver: CombatResolver;

  // Active personality (drives all decisions)
  private personality: AIPersonality = getPersonality('balanced');
  private personalityPresetId = 'balanced';

  // Derived decision weights from personality
  private get aggressiveness(): number { return this.personality.aggression; }
  private get riskTolerance(): number { return this.personality.riskTolerance; }
  private get expansionFocus(): number { return this.personality.expansion; }

  // Grudge memory: key is `${holderId}-${offenderId}`, value is severity 0–100
  private grudges: Map<string, number> = new Map();

  // Web Worker for off-thread evaluation
  private worker: Worker | null = null;
  private workerEvaluations: { territoryId: string; strategicValue: number; threatLevel: number }[] = [];

  constructor(private state: GameState, private turnManager: TurnManager) {
    this.movementValidator = new MovementValidator(state);
    if (!state.systems.mobilizationSystem) {
      state.systems.mobilizationSystem = new MobilizationSystem(state);
    }
    this.mobilizationSystem = state.systems.mobilizationSystem;
    this.combatResolver = new CombatResolver(state);

    // Record grudges when territory is attacked
    this.state.on('combat_end', (e: any) => {
      const combat = e.data?.combat ?? e.data;
      if (!combat) return;
      // Defending faction holds grudge against attacker
      if (combat.defendingFactionId && combat.attackingFactionId) {
        const severity = combat.territoryId &&
          this.state.territories.get(combat.territoryId)?.isCapital ? 30 : 20;
        this.recordGrievance(combat.attackingFactionId, combat.defendingFactionId, severity);
      }
    });
  }

  /**
   * Set AI difficulty — scales combat aggression and naval/economic focus.
   */
  private difficultyLevel: AIDifficultyLevel = 'medium';

  setDifficulty(level: AIDifficultyLevel): void {
    this.difficultyLevel = level;
    this.rebuildPersonality(null);
  }

  /** Rebuild personality from preset, optional faction modifiers, then difficulty. */
  private rebuildPersonality(factionId: string | null): void {
    this.personality = clonePersonality(getPersonality(this.personalityPresetId));

    if (factionId && (this.hasBehavior('historical_priorities') || this.hasBehavior('faction_specific'))) {
      this.applyHistoricalPriorities(factionId);
    }
    if (this.hasBehavior('random_focus')) {
      this.applyRandomFocusModifiers();
    }

    applyDifficultyToPersonality(this.personality, this.difficultyLevel);
  }

  /** Load a named AI personality preset */
  setPersonality(preset: "default" | "turtle" | "rusher" | "economic" | "opportunist" | string): void {
    const mapping: Record<string, string> = {
      default: 'balanced',
      turtle: 'turtle',
      rusher: 'aggressive',
      economic: 'economic',
      opportunist: 'adaptive',
    };
    this.personalityPresetId = mapping[preset] ?? preset;
    this.rebuildPersonality(null);
  }

  /** Load a full AIPersonality object directly */
  setPersonalityObject(p: AIPersonality): void {
    this.personality = clonePersonality(p);
    this.personalityPresetId = p.id;
    applyDifficultyToPersonality(this.personality, this.difficultyLevel);
  }

  /**
   * Serialize current game state for the AI Worker.
   */
  private buildWorkerState(factionId: string): AIWorkerState {
    const unitTypes = this.state.unitRegistry.getAll().map(u => ({
      id: u.id, attack: u.attack, defense: u.defense,
      movement: u.movement, cost: u.cost, domain: u.domain,
    }));
    const factions = this.state.factionRegistry.getActiveIncludingDefeated().map(f => ({
      id: f.id, ipcs: f.ipcs, capital: f.capital, isDefeated: f.isDefeated,
    }));
    const territories = Array.from(this.state.territories.values()).map(t => ({
      id: t.id, owner: t.owner, originalOwner: t.originalOwner ?? null,
      type: t.type, production: t.production, isCapital: t.isCapital,
      hasFactory: t.hasFactory, adjacentTo: [...t.adjacentTo], units: [...t.units],
    }));
    const relations: AIWorkerState['relations'] = {};
    for (const f of factions) {
      for (const g of factions) {
        if (f.id !== g.id) {
          relations[`${f.id}|${g.id}`] = this.state.diplomacyManager.getRelation(f.id, g.id) as any;
        }
      }
    }
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) throw new Error(`AIController: unknown faction "${factionId}"`);
    return {
      factionId,
      ipcs: faction.ipcs,
      territories,
      factions,
      unitTypes,
      relations,
      personality: {
        aggression: this.personality.aggression,
        defense: this.personality.defense,
        expansion: this.personality.expansion,
        economy: this.personality.economy,
        riskTolerance: this.personality.riskTolerance,
      },
    };
  }

  /**
   * Send state to Worker and get evaluations back (non-blocking).
   * Falls back to synchronous evaluation if Worker is unavailable.
   */
  private async runWorkerEvaluation(factionId: string): Promise<void> {
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' });
      }
      const workerState = this.buildWorkerState(factionId);
      await new Promise<void>((resolve) => {
        this.worker!.onmessage = (e: MessageEvent<AIWorkerResponse>) => {
          this.workerEvaluations = e.data.evaluations;
          resolve();
        };
        this.worker!.onerror = () => { this.workerEvaluations = []; resolve(); };
        this.worker!.postMessage({ state: workerState });
      });
    } catch {
      // Worker not supported — continue with synchronous evaluation
      this.workerEvaluations = [];
    }
  }

  /**
   * Execute AI turn for current faction
   */
  async executeTurn(): Promise<void> {
    const perfStart = performance.now();
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== "ai") return;

    if (this.turnManager.getTurnStyle() === 'move_for_move' && this.turnManager.isMoveForMoveSegmentActive()) {
      const ownerId = this.turnManager.moveForMoveTurnOwnerId;
      if (faction.id === ownerId && !this.turnManager.moveForMoveOwnerBuildDone) {
        this.rebuildPersonality(faction.id);
        this.mobilizationSystem.resetForNewTurn();
        const evaluations = this.evaluateAllTerritories();
        this.handleMobilizationPhase(evaluations);
        this.turnManager.moveForMoveOwnerBuildDone = true;
      }
      await this.executeSingleMove();
      await this.delay(400);
      this.turnManager.passMoveForMoveTurn();
      this.emitPerf('aiTurnMs', performance.now() - perfStart, { factionId: faction.id, mode: 'single_move' });
      return;
    }

    this.rebuildPersonality(faction.id);

    this.state.emit("ai_thinking", { message: "Evaluating board..." });
    this.mobilizationSystem.resetForNewTurn();

    // Run Worker evaluation in parallel with synchronous evaluation
    const workerPromise = this.runWorkerEvaluation(faction.id);
    const evaluations = this.evaluateAllTerritories();
    await workerPromise; // Wait for worker (result stored in this.workerEvaluations)

    this.state.emit("ai_thinking", { message: "Planning strategy..." });
    this.considerDiplomacy(faction);
    this.considerEspionage(faction);
    this.considerNuclear(faction);

    while (true) {
      const active = this.state.getCurrentFaction();
      // Guard before processPhase: advancePhase on the last AI phase can hand off to the
      // next faction (e.g. quick "end" → human "play") before we re-check ownership.
      if (!active || active.id !== faction.id || active.controlledBy !== 'ai') break;

      const phaseStart = performance.now();
      await this.processPhase(evaluations);
      this.emitPerf('aiPhaseMs', performance.now() - phaseStart, { phase: this.state.currentPhase, factionId: faction.id });
      if (this.state.getCurrentFaction()?.id !== faction.id) break;
      this.turnManager.advancePhase();
      await this.delay(400);
      if (this.turnManager.getTurnStyle() === 'move_for_move') break;
    }
    this.emitPerf('aiTurnMs', performance.now() - perfStart, { factionId: faction.id });
  }

  /**
   * Move-for-move: commit and resolve a single move or attack, then pass the turn.
   */
  async executeSingleMove(): Promise<void> {
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'ai') return;

    this.mobilizationSystem.resetForNewTurn();
    const workerPromise = this.runWorkerEvaluation(faction.id);
    const evaluations = this.evaluateAllTerritories();
    await workerPromise;

    const pendingBefore = this.state.pendingMoves.length;
    this.handleCombatMovePhase(evaluations, { maxMoves: 1 });

    if (this.state.pendingMoves.length > pendingBefore) {
      await this.handleCombatPhase();
      return;
    }

    if (this.handleSingleNonCombatMove(evaluations)) return;

    this.state.emit('ai_thinking', { message: 'No moves available — passing', action: 'pass' });
  }

  /** Clean up Worker when no longer needed */
  terminateWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private emitPerf(metric: string, value: number, extra: Record<string, unknown> = {}): void {
    const root = globalThis as unknown as { localStorage?: Storage; __gsPerf?: PerfRoot };
    if (root?.localStorage?.getItem?.('gs-perf') !== '1') return;
    const perfRoot = root.__gsPerf ?? (root.__gsPerf = {});
    const bucket: PerfBucket = perfRoot[metric] ?? { samples: 0, avg: 0, max: 0, p95: 0, recent: [] };
    bucket.samples += 1;
    bucket.avg += (value - bucket.avg) / bucket.samples;
    bucket.max = Math.max(bucket.max, value);
    bucket.recent.push(value);
    if (bucket.recent.length > 120) bucket.recent.shift();
    const sorted = [...bucket.recent].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95) - 1));
    bucket.p95 = sorted[idx] ?? value;
    perfRoot[metric] = bucket;
    this.state.emit('ai_debug', { type: 'perf', metric, value, ...extra });
  }

  /**
   * AI diplomacy — personality-driven proposal handling and initiation
   */
  private considerDiplomacy(faction: Faction): void {
    const diplo = this.state.diplomacyManager;
    const isLosing = this.isLosingBadly(faction);
    const borderThreat = this.getFactionBorderThreat(faction);

    // Respond to incoming proposals
    for (const proposal of diplo.getPendingProposals(faction.id)) {
      let acceptChance = 0.2;
      const grudge = this.getGrudgeSeverity(faction.id, proposal.fromId);

      if (proposal.type === 'pact') {
        acceptChance = isLosing || borderThreat > 30 ? 0.78 : (this.personality.defense * 0.5 + 0.15);
      } else if (proposal.type === 'alliance') {
        acceptChance = isLosing ? 0.45 : (this.personality.defense * 0.4 + this.personality.economy * 0.2);
      } else if (proposal.type === 'trade_deal') {
        acceptChance = this.personality.economy * 0.8 + 0.1;
      }

      acceptChance -= Math.min(0.65, grudge / 140);
      acceptChance = Math.max(0.05, Math.min(0.9, acceptChance));

      if (Math.random() < acceptChance) {
        diplo.acceptProposal(proposal.fromId, proposal.toId, proposal.type);
      } else {
        diplo.declineProposal(proposal.fromId, proposal.toId, proposal.type);
      }
    }

    const others = this.state.factionRegistry.getActive().filter(f => f.id !== faction.id);

    // When losing badly, seek a non-aggression pact with the strongest enemy
    if ((isLosing || borderThreat > 35) && Math.random() < 0.25 + Math.min(0.25, borderThreat / 200)) {
      const strongest = others
        .filter(f => diplo.getRelation(faction.id, f.id) === 'war')
        .filter(f => this.getGrudgeSeverity(faction.id, f.id) < 70)
        .sort((a, b) =>
          this.state.getTerritoriesOwnedBy(b.id).length - this.state.getTerritoriesOwnedBy(a.id).length
        )[0];
      if (strongest) diplo.proposePact(faction.id, strongest.id, 3);
    }

    // Economic AI proposes trade deals to pact/alliance partners
    if (this.personality.economy > 0.6 && Math.random() < this.personality.economy * 0.25) {
      const tradeTarget = others.find(f => {
        const rel = diplo.getRelation(faction.id, f.id);
        return (rel === 'pact' || rel === 'alliance') && !diplo.getTradeDealInfo(faction.id, f.id);
      });
      if (tradeTarget) {
        const ipcPerTurn = Math.round(2 + this.personality.economy * 4);
        diplo.proposeTrade(faction.id, tradeTarget.id, ipcPerTurn, 5);
      }
    }

    // Defensive/patient AI upgrades pacts to alliances
    if (this.personality.aggression < 0.4 && this.personality.defense > 0.6 && Math.random() < 0.15) {
      const allyTarget = others.find(f =>
        diplo.getRelation(faction.id, f.id) === 'pact' && !diplo.hasAlliance(faction.id, f.id) &&
        this.getGrudgeSeverity(faction.id, f.id) < 30 && f.betrayalCooldown === 0
      );
      if (allyTarget) diplo.proposeAlliance(faction.id, allyTarget.id, 8);
    }

    // Reject alliance proposals from factions we hold a grudge against
    for (const proposal of diplo.getPendingProposals(faction.id)) {
      if (proposal.type === 'alliance') {
        const grudge = this.getGrudgeSeverity(faction.id, proposal.fromId);
        if (grudge > 30 && Math.random() < 0.8) {
          diplo.declineProposal(proposal.fromId, faction.id, 'alliance');
        }
      }
    }

    // Aggressive AI may betray a weak ally when winning decisively
    if (this.personality.aggression > 0.8 && faction.betrayalCooldown === 0 && Math.random() < 0.08) {
      const myTerritoryCount = this.state.getTerritoriesOwnedBy(faction.id).length;
      const weakestAlly = others
        .filter(f => diplo.hasAlliance(faction.id, f.id))
        .sort((a, b) =>
          this.state.getTerritoriesOwnedBy(a.id).length - this.state.getTerritoriesOwnedBy(b.id).length
        )[0];
      if (weakestAlly) {
        const allyCount = this.state.getTerritoriesOwnedBy(weakestAlly.id).length;
        // Only betray if we have at least 2× their territory count
        if (myTerritoryCount > allyCount * 2) {
          diplo.betrayAlliance(faction.id, weakestAlly.id);
        }
      }
    }
  }

  /**
   * AI espionage — weighted op selection driven by personality and threat assessment.
   *
   * Target scoring: high-grudge enemies are prioritised; ties broken by territory count.
   * Op scoring: each candidate is assigned a personality-scaled weight so that, e.g., an
   * aggressive AI is far more likely to pick sabotage than a cautious one, rather than
   * choosing uniformly from a filtered list.
   */
  private considerEspionage(faction: Faction): void {
    const espionage = this.state.systems.espionageSystem;
    if (!espionage?.executeOperation) return;

    if (faction.ipcs < 5) return;

    const actionChance = 0.20 + this.personality.aggression * 0.35 + this.personality.economy * 0.15;
    if (Math.random() > actionChance) return;

    const enemies = this.state.factionRegistry.getActive().filter(f =>
      f.id !== faction.id && !f.isDefeated && faction.isEnemyOf(f.id)
    );
    if (enemies.length === 0) return;

    // Score each enemy: grudge severity + territory lead over us
    const myCount = this.state.getTerritoriesOwnedBy(faction.id).length;
    const target = enemies.reduce((best, f) => {
      const grudge = this.getGrudgeSeverity(faction.id, f.id);
      const lead = this.state.getTerritoriesOwnedBy(f.id).length - myCount;
      const score = grudge + Math.max(0, lead) * 2;
      const bestScore =
        this.getGrudgeSeverity(faction.id, best.id) +
        Math.max(0, this.state.getTerritoriesOwnedBy(best.id).length - myCount) * 2;
      return score > bestScore ? f : best;
    });

    // Weighted candidate ops — weight reflects how well each op aligns with personality
    type WeightedOp = { type: string; cost: number; weight: number };
    const candidates: WeightedOp[] = [];

    if (faction.ipcs >= 5)
      candidates.push({ type: 'steal_intel', cost: 5, weight: 0.4 + this.personality.defense * 0.3 });
    if (faction.ipcs >= 10)
      candidates.push({ type: 'propaganda_campaign', cost: 10, weight: this.personality.aggression * 0.5 });
    if (faction.ipcs >= 10 && this.personality.aggression > 0.4)
      candidates.push({ type: 'sabotage', cost: 10, weight: this.personality.aggression * 0.8 });
    if (faction.ipcs >= 15 && this.personality.economy > 0.4)
      candidates.push({ type: 'economic_disruption', cost: 15, weight: this.personality.economy * 0.7 });
    if (faction.ipcs >= 15 && this.personality.economy > 0.5)
      candidates.push({ type: 'steal_tech', cost: 15, weight: this.personality.economy * 0.6 });
    if (faction.ipcs >= 20 && this.personality.aggression > 0.55)
      candidates.push({ type: 'assassinate_general', cost: 20, weight: this.personality.aggression * 0.5 });
    if (faction.ipcs >= 20 && this.personality.aggression > 0.65)
      candidates.push({ type: 'infrastructure_attack', cost: 20, weight: this.personality.aggression * 0.9 });
    if (faction.ipcs >= 25 && this.personality.aggression > 0.75)
      candidates.push({ type: 'steal_nuclear_secrets', cost: 25, weight: this.personality.aggression * 0.4 });

    if (candidates.length === 0) return;

    // Weighted random selection
    const totalWeight = candidates.reduce((s, c) => s + c.weight, 0);
    let roll = Math.random() * totalWeight;
    const pick = candidates.find(c => { roll -= c.weight; return roll <= 0; }) ?? candidates[0];

    espionage.executeOperation(faction.id, target.id, pick.type);
  }

  /**
   * AI nuclear — launch a strike when readiness reaches 100% and conditions are met.
   * Aggressive AI fires first; defensive AI waits until losing badly.
   */
  private considerNuclear(faction: Faction): void {
    const nuclearSystem = this.state.systems.nuclearSystem;
    if (!nuclearSystem?.canLaunch?.(faction.id)) return;

    const isLosing = this.isLosingBadly(faction);
    const fireChance = isLosing
      ? 0.70                                        // desperate — almost always fires
      : 0.15 + this.personality.aggression * 0.50; // aggressive AI fires opportunistically

    if (Math.random() > fireChance) return;

    // Pick the most valuable enemy target: capital > factory-rich > most units
    const candidates = Array.from(this.state.territories.values()).filter(
      t => t.owner && faction.isEnemyOf(t.owner) && t.isLand()
    );
    if (candidates.length === 0) return;

    const target = candidates.reduce((best, t) => {
      const score = t.getTotalUnitCount() * 1
        + (t.hasFactory ? t.production * 3 : 0)
        + (t.isCapital ? 50 : 0);
      const bestScore = best.getTotalUnitCount()
        + (best.hasFactory ? best.production * 3 : 0)
        + (best.isCapital ? 50 : 0);
      return score > bestScore ? t : best;
    });

    nuclearSystem.launchStrike?.(faction.id, target.id);
  }

  // ── Grudge System ────────────────────────────────────────────────────────

  /**
   * Record a grievance: offenderId attacked/betrayed holderId.
   * Called from constructor's combat_end listener and from NuclearSystem.
   */
  recordGrievance(offenderId: string, holderId: string, severity: number): void {
    const key = `${holderId}-${offenderId}`;
    const current = this.grudges.get(key) ?? 0;
    this.grudges.set(key, Math.min(100, current + severity));
  }

  /**
   * Returns cumulative grudge severity (0–100) that holderId has against offenderId.
   */
  getGrudgeSeverity(holderId: string, offenderId: string): number {
    return this.grudges.get(`${holderId}-${offenderId}`) ?? 0;
  }

  /**
   * Fade all grudges by 10% each full round. Removes entries that reach zero.
   */
  fadeGrudges(): void {
    for (const [key, val] of this.grudges) {
      const newVal = Math.max(0, val - 8); // fade ~8 per round
      if (newVal === 0) this.grudges.delete(key);
      else this.grudges.set(key, newVal);
    }
  }

  /**
   * Return the faction ID that this AI holds the biggest grudge against (or null).
   */
  getBiggestEnemy(holderId: string): string | null {
    let maxVal = 0;
    let maxId: string | null = null;
    for (const [key, val] of this.grudges) {
      if (key.startsWith(`${holderId}-`) && val > maxVal) {
        maxVal = val;
        maxId = key.slice(holderId.length + 1);
      }
    }
    return maxId;
  }

  private isLosingBadly(faction: Faction): boolean {
    const myTerritories = this.state.getTerritoriesOwnedBy(faction.id).length;
    const landTerritories = Array.from(this.state.territories.values()).filter(t => t.type !== 'sea').length;
    const ratio = myTerritories / Math.max(1, landTerritories);
    const capitalHeld = this.state.territories.get(faction.capital)?.owner === faction.id;
    return ratio < 0.2 || !capitalHeld;
  }

  private getFactionBorderThreat(faction: Faction): number {
    let threat = 0;
    for (const territory of this.state.getTerritoriesOwnedBy(faction.id)) {
      if (territory.isSea()) continue;
      threat += this.calculateThreatLevel(territory, faction);
    }
    return threat;
  }

  // ── Territory evaluation ────────────────────────────────────────────────

  private evaluateAllTerritories(): Map<string, TerritoryEvaluation> {
    const evaluations = new Map<string, TerritoryEvaluation>();
    const faction = this.state.getCurrentFaction();
    if (!faction) return evaluations;

    for (const territory of this.state.territories.values()) {
      evaluations.set(territory.id, {
        territory,
        strategicValue: this.calculateStrategicValue(territory, faction),
        threatLevel: this.calculateThreatLevel(territory, faction),
        defenseStrength: this.calculateDefenseStrength(territory),
        nearbyEnemyStrength: this.calculateNearbyEnemyStrength(territory, faction),
      });
    }
    return evaluations;
  }

  private calculateStrategicValue(territory: Territory, faction: Faction): number {
    let value = territory.production * 10;

    if (territory.isCapital) value += 200;
    if (territory.hasFactory) value += 80;
    value += (territory.victoryPoints || 0) * 15;

    if (territory.resource) {
      switch (territory.resource) {
        case 'oil': value += 40; break;
        case 'steel': value += 35; break;
        case 'uranium': value += 50; break;
        case 'rare_earth': value += 30; break;
        case 'food': value += 20; break;
      }
    }

    const defBonus = territory.defenseBonus || 0;
    if (defBonus > 0 && territory.owner === faction.id) value += defBonus * 15;

    const ourCapital = this.state.territories.get(faction.capital);
    if (ourCapital?.adjacentTo.includes(territory.id)) value += 50;

    for (const other of this.state.factionRegistry.getActiveIncludingDefeated()) {
      if (faction.isEnemyOf(other.id) && territory.id === other.capital) value += 150;
    }

    if (territory.adjacentTo.length <= 3 && territory.isLand()) value += 20;

    const adjacentFriendly = territory.adjacentTo
      .filter(id => this.state.territories.get(id)?.owner === faction.id).length;
    value += adjacentFriendly * 5;

    if (adjacentFriendly === 0 && territory.owner !== faction.id) value -= 30;

    for (const other of this.state.factionRegistry.getActiveIncludingDefeated()) {
      if (!faction.isEnemyOf(other.id)) continue;
      const ec = this.state.territories.get(other.capital);
      if (ec?.adjacentTo.includes(territory.id)) value += 60;
    }

    const ownCapital = this.state.territories.get(faction.capital);
    if (ownCapital?.adjacentTo.includes(territory.id) && territory.owner === faction.id) value += 80;

    // Personality: economic AI values income/factory territories more
    if (this.personality.economy > 0.6 && (territory.hasFactory || territory.production > 3)) {
      value *= 1 + (this.personality.economy - 0.6);
    }
    // Naval AI values coastal territories more
    if (this.personality.naval > 0.6 && territory.type === 'coastal') {
      value *= 1 + (this.personality.naval - 0.6) * 0.5;
    }

    // Blend in worker evaluation (10% weight) when available
    const workerEval = this.workerEvaluations.find(e => e.territoryId === territory.id);
    if (workerEval) {
      value = value * 0.9 + workerEval.strategicValue * 10 * 0.1;
    }

    return value;
  }

  private calculateThreatLevel(territory: Territory, faction: Faction): number {
    if (territory.owner !== faction.id) return 0;
    let threat = 0;
    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (!adj?.owner || !faction.isEnemyOf(adj.owner)) continue;
      for (const pu of adj.units) {
        const ut = this.state.unitRegistry.get(pu.unitTypeId);
        if (ut) threat += pu.count * ut.attack * 1.5;
      }
    }
    return threat;
  }

  private calculateDefenseStrength(territory: Territory): number {
    let strength = 0;
    for (const pu of territory.units) {
      const ut = this.state.unitRegistry.get(pu.unitTypeId);
      if (ut) strength += pu.count * (ut.defense * 1.5 + ut.attack * 0.5);
    }
    return strength;
  }

  private calculateNearbyEnemyStrength(territory: Territory, faction: Faction): number {
    let strength = 0;
    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (!adj?.owner || !faction.isEnemyOf(adj.owner)) continue;
      for (const pu of adj.units) {
        const ut = this.state.unitRegistry.get(pu.unitTypeId);
        if (ut) strength += pu.count * ut.attack;
      }
    }
    return strength;
  }

  // ── Phase handlers ──────────────────────────────────────────────────────

  private async processPhase(evaluations: Map<string, TerritoryEvaluation>): Promise<void> {
    const phase = this.state.currentPhase as string;
    const phaseLabels: Record<string, string> = {
      purchase: 'Mobilizing reserves',
      build: 'Mobilizing reserves',
      combat_move: 'Choosing attacks',
      move: 'Moving and attacking',
      orders: 'Issuing orders',
      action: 'Taking action',
      combat: 'Resolving battles',
      resolve: 'Resolving battles',
      noncombat_move: 'Reinforcing fronts',
      production: 'Deploying production',
      collect_income: 'Collecting income',
      end: 'Ending turn',
    };
    this.state.emit("ai_thinking", {
      message: phaseLabels[phase] ?? `Processing ${phase}`,
      action: 'phase',
    });

    switch (phase) {
      case "purchase":        this.handlePurchasePhase(evaluations); break;
      case "combat_move":     this.handleCombatMovePhase(evaluations); break;
      case "combat":          await this.handleCombatPhase(); break;
      case "noncombat_move":  this.handleNonCombatMovePhase(evaluations); break;
      case "production":      this.handleMobilizationPhase(evaluations); break;
      case "collect_income":  break; // Auto-handled

      // Simplified turn styles use player-facing phase names. Keep the AI's
      // tactical behavior mapped to the same underlying systems.
      case "build":
        this.handleMobilizationPhase(evaluations);
        break;
      case "move":
      case "play":
      case "orders":
      case "action": {
        if (phase === "play" && this.turnManager.getTurnStyle() === "quick") {
          this.handleMobilizationPhase(evaluations);
        }
        this.handleCombatMovePhase(evaluations);
        await this.handleCombatPhase();
        break;
      }
      case "resolve":
        await this.handleCombatPhase();
        break;
      case "end":
        break; // Auto-handled by TurnManager when the phase starts
    }
  }

  /**
   * Mobilization — personality-driven unit selection and territory prioritization
   */
  private handleMobilizationPhase(evaluations: Map<string, TerritoryEvaluation>): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const options = this.mobilizationSystem.getMobilizationOptions().filter(o => o.canMobilize);
    if (options.length === 0) return;

    const currentComposition = new Map<string, number>();
    for (const t of this.state.getTerritoriesOwnedBy(faction.id)) {
      for (const pu of t.units) {
        currentComposition.set(pu.unitTypeId, (currentComposition.get(pu.unitTypeId) ?? 0) + pu.count);
      }
    }

    // Behavior: save_ipcs — only spend at critical sites when IPCs are low
    if (this.hasBehavior('save_ipcs') && faction.ipcs < 25) {
      const critical = options.filter(o => {
        const eval_ = evaluations.get(o.territory.id);
        return o.territory.isCapital || (eval_?.threatLevel ?? 0) > 15;
      });
      if (critical.length > 0) options.splice(0, options.length, ...critical);
      else return;
    }

    options.sort((a, b) => {
      const scoreA = this.getMobilizationPriority(a, evaluations, currentComposition, faction);
      const scoreB = this.getMobilizationPriority(b, evaluations, currentComposition, faction);
      return scoreB - scoreA;
    });

    const limits = MOBILIZATION_LIMITS[this.difficultyLevel];
    let navalCount = countFactionUnitsByDomain(this.state, faction.id, 'sea');
    let landCount = countFactionUnitsByDomain(this.state, faction.id, 'land');
    let airCount = countFactionUnitsByDomain(this.state, faction.id, 'air');
    const ipcReserveFloor = getIpcReserveFloor(this.difficultyLevel, faction.ipcs);
    const maxMobilizations = getMaxMobilizationsForTurn(this.difficultyLevel, this.personality.patience);
    let count = 0;

    for (const option of options) {
      if (count >= maxMobilizations) break;
      if (faction.ipcs < option.cost) continue;
      if (faction.ipcs - option.cost < ipcReserveFloor) continue;
      if (shouldSkipNavalHeavyMobilization(option, navalCount, landCount, limits, this.difficultyLevel)) {
        continue;
      }
      if (shouldSkipAirHeavyMobilization(option, airCount, landCount, limits, this.difficultyLevel)) {
        continue;
      }

      const result = this.mobilizationSystem.mobilize(option.territory.id);
      if (result.success) {
        count++;
        for (const spawned of result.unitsSpawned ?? []) {
          const unitType = this.state.unitRegistry.get(spawned.unitTypeId);
          if (unitType?.domain === 'sea') navalCount += spawned.count;
          else if (unitType?.domain === 'air') airCount += spawned.count;
          else if (unitType?.domain === 'land') landCount += spawned.count;
        }
        this.state.emit("ai_thinking", {
          message: `Mobilizing forces at ${option.territory.name}`,
          action: 'mobilize',
          territory: option.territory.name,
          territoryId: option.territory.id,
        });
      }
    }
  }

  private getMobilizationPriority(
    option: MobilizationOption,
    evaluations: Map<string, TerritoryEvaluation>,
    currentComposition: Map<string, number>,
    faction: Faction
  ): number {
    const evaluation = evaluations.get(option.territory.id);
    const threatLevel = evaluation?.threatLevel ?? 0;
    const defenseStrength = evaluation?.defenseStrength ?? 0;
    const defenseGap = Math.max(0, threatLevel - defenseStrength);
    const isFrontline = option.territory.adjacentTo.some(id => {
      const territory = this.state.territories.get(id);
      return territory?.owner && faction.isEnemyOf(territory.owner);
    });

    let score = 0;

    score += threatLevel * 3;
    score += defenseGap * 6;

    if (threatLevel > 0 && option.territory.isCapital) score += 90;
    else if (option.territory.isCapital) score += 25;

    if (threatLevel > 0 && option.territory.hasFactory) score += 70;
    else if (option.type === 'factory') score += this.hasBehavior('factory_priority') ? 150 : 30;

    const frontlineScoreBonus = this.hasBehavior('fortify_borders') ? 70
      : this.personality.defense > 0.7 ? 50
      : this.aggressiveness > 0.6 ? 25 : 20;
    if (isFrontline) score += frontlineScoreBonus;

    const unitPriority = option.units.reduce((sum, unit) =>
      sum + calculateUnitPriority(this.personality, unit.unitTypeId, currentComposition) * unit.count, 0);
    score += unitPriority * 10;

    // Economic AI is frugal when low on IPCs — only mobilize threatened or key sites
    if (this.personality.economy > 0.7 && faction.ipcs < 20 && threatLevel < 5 && option.type === 'land') {
      score -= 20;
    }

    const landArmy = countFactionUnitsByDomain(this.state, faction.id, 'land');
    const limits = MOBILIZATION_LIMITS[this.difficultyLevel];
    score -= mobilizationNavalPenalty(
      option,
      countFactionUnitsByDomain(this.state, faction.id, 'sea'),
      landArmy,
      limits,
      this.difficultyLevel,
    );
    score -= mobilizationAirPenalty(
      option,
      countFactionUnitsByDomain(this.state, faction.id, 'air'),
      landArmy,
      limits,
      this.difficultyLevel,
    );

    return score;
  }

  private handlePurchasePhase(evaluations: Map<string, TerritoryEvaluation>): void {
    this.handleMobilizationPhase(evaluations);
  }

  /**
   * Combat movement — personality-aware attack planning via calculateAttackPriority
   */
  private handleCombatMovePhase(
    evaluations: Map<string, TerritoryEvaluation>,
    options?: { maxMoves?: number },
  ): void {
    const maxMoves = options?.maxMoves ?? Number.POSITIVE_INFINITY;
    let movesCommitted = 0;
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const plans = this.generateAttackPlans(evaluations, faction);

    // Find the faction we hold the biggest grudge against
    const biggestEnemy = faction ? this.getBiggestEnemy(faction.id) : null;

    plans.sort((a, b) => {
      const ea = evaluations.get(a.targetId);
      const eb = evaluations.get(b.targetId);
      const defA = ea?.defenseStrength ?? 1;
      const defB = eb?.defenseStrength ?? 1;
      const atkA = a.attackers.reduce((s, att) => {
        const ut = this.state.unitRegistry.get(att.unitTypeId);
        return s + att.count * (ut?.attack ?? 1);
      }, 0);
      const atkB = b.attackers.reduce((s, att) => {
        const ut = this.state.unitRegistry.get(att.unitTypeId);
        return s + att.count * (ut?.attack ?? 1);
      }, 0);
      let pA = calculateAttackPriority(this.personality, atkA, defA, a.strategicValue);
      let pB = calculateAttackPriority(this.personality, atkB, defB, b.strategicValue);

      // Grudge boost: prioritize attacks against the faction we hold a grudge against
      if (biggestEnemy) {
        const targA = this.state.territories.get(a.targetId)?.owner;
        const targB = this.state.territories.get(b.targetId)?.owner;
        if (targA === biggestEnemy) pA += 30;
        if (targB === biggestEnemy) pB += 30;
      }

      return pB - pA;
    });

    // Behavior: counterattack_only — only strike factions that have attacked us (grudge > 0)
    if (this.hasBehavior('counterattack_only')) {
      const revenge = plans.filter(p => {
        const owner = this.state.territories.get(p.targetId)?.owner;
        return owner && this.getGrudgeSeverity(faction.id, owner) > 0;
      });
      if (revenge.length > 0) plans.splice(0, plans.length, ...revenge);
      else return;
    }

    // Behavior: analyze_threats — don't attack when any home territory is under serious threat
    if (this.hasBehavior('analyze_threats')) {
      const homeThreatened = Array.from(evaluations.values()).some(
        e => e.territory.owner === faction.id && e.threatLevel > 25
      );
      if (homeThreatened) return;
    }

    // Behavior: surprise_attacks — occasionally commit to a non-adjacent target
    if (this.hasBehavior('surprise_attacks') && Math.random() < 0.35) {
      this.addSurpriseAttack(plans, evaluations, faction);
    }

    const usedUnits = new Set<string>();

    let behaviorMinSuccess: number;
    if (this.hasBehavior('maximum_defense')) {
      behaviorMinSuccess = 0.92;
    } else if (this.hasBehavior('only_sure_attacks')) {
      behaviorMinSuccess = 0.85;
    } else if (this.hasBehavior('ignore_losses')) {
      behaviorMinSuccess = 0.10;
    } else if (this.hasBehavior('blitz_attacks')) {
      behaviorMinSuccess = 0.25;
    } else {
      behaviorMinSuccess = this.personality.id === 'turtle'
        ? 0.85
        : this.riskTolerance * (0.5 + this.aggressiveness * 0.3);
    }
    if (this.difficultyLevel === 'easy') {
      behaviorMinSuccess = Math.min(0.95, behaviorMinSuccess + 0.12);
    } else if (this.difficultyLevel === 'hard') {
      behaviorMinSuccess = Math.max(0.08, behaviorMinSuccess - 0.08);
    }

    let minValue = 18 * (1 - this.expansionFocus * 0.4);
    if (this.difficultyLevel === 'easy') minValue *= 1.25;
    const opportunisticSuccess = Math.max(behaviorMinSuccess + 0.15, 0.55 - this.aggressiveness * 0.1);
    const debugPlans: AIDebugPlan[] = [];
    const recordPlan = (plan: AttackPlan, status: "chosen" | "rejected", reason: string): void => {
      const target = this.state.territories.get(plan.targetId);
      const eval_ = evaluations.get(plan.targetId);
      const attackPower = plan.attackers.reduce((sum, attacker) => {
        const unit = this.state.unitRegistry.get(attacker.unitTypeId);
        return sum + attacker.count * (unit?.attack ?? 0);
      }, 0);
      debugPlans.push({
        targetId: plan.targetId,
        targetName: target?.name ?? plan.targetId,
        owner: target?.owner ?? null,
        expectedSuccess: plan.expectedSuccess,
        strategicValue: plan.strategicValue,
        minSuccess: behaviorMinSuccess,
        minValue,
        attackPower,
        defenseStrength: eval_?.defenseStrength ?? 0,
        attackers: plan.attackers.map(attacker => ({
          fromId: attacker.fromId,
          fromName: this.state.territories.get(attacker.fromId)?.name ?? attacker.fromId,
          unitTypeId: attacker.unitTypeId,
          count: attacker.count,
        })),
        status,
        reason,
      });
    };

    for (const plan of plans) {
      if (movesCommitted >= maxMoves) break;
      const minSuccess = behaviorMinSuccess;
      if (plan.expectedSuccess < minSuccess) {
        recordPlan(plan, "rejected", `success ${Math.round(plan.expectedSuccess * 100)}% below minimum ${Math.round(minSuccess * 100)}%`);
        continue;
      }

      if (plan.strategicValue < minValue && plan.expectedSuccess < opportunisticSuccess) {
        recordPlan(plan, "rejected", `low value ${Math.round(plan.strategicValue)} and only ${Math.round(plan.expectedSuccess * 100)}% success`);
        continue;
      }

      let canExecute = true;
      for (const att of plan.attackers) {
        if (usedUnits.has(`${att.fromId}-${att.unitTypeId}`)) { canExecute = false; break; }
      }
      if (!canExecute) {
        recordPlan(plan, "rejected", "attackers already committed to a better plan");
        continue;
      }
      if (this.wouldOverextendKeyTerritory(plan, evaluations, faction)) {
        recordPlan(plan, "rejected", "would overextend a capital or factory");
        continue;
      }

      const target = this.state.territories.get(plan.targetId);
      let totalCommitted = 0;

      for (const att of plan.attackers) {
        if (movesCommitted >= maxMoves) break;
        const available = this.movementValidator.getAvailableUnits(att.fromId, att.unitTypeId);
        const toMove = Math.min(att.count, available);
        if (toMove > 0) {
          const moveContext = resolveMovePhaseContext(this.state.currentPhase as string);
          const strike = this.movementValidator.getValidMoves(att.unitTypeId, att.fromId, moveContext)
            .find(m => m.territoryId === plan.targetId);
          this.state.pendingMoves.push({
            unitTypeId: att.unitTypeId,
            count: toMove,
            fromTerritoryId: att.fromId,
            toTerritoryId: plan.targetId,
            path: strike?.path ?? [att.fromId, plan.targetId],
            rangedStrike: strike?.rangedStrike,
            coastalStrike: strike?.coastalStrike,
          });
          usedUnits.add(`${att.fromId}-${att.unitTypeId}`);
          totalCommitted += toMove;
          movesCommitted++;
        }
      }

      if (totalCommitted > 0 && target) {
        recordPlan(plan, "chosen", `committed ${totalCommitted} unit${totalCommitted === 1 ? "" : "s"}`);
        this.state.emit("ai_thinking", {
          message: `Attacking ${target.name} with ${totalCommitted} units`,
          action: 'attack',
          territory: target.name,
          territoryId: target.id,
        });
        if (movesCommitted >= maxMoves) break;
      } else {
        recordPlan(plan, "rejected", "no available units remained");
      }
    }

    this.state.emit("ai_debug", {
      factionId: faction.id,
      factionName: faction.name,
      personality: this.personality.name,
      phase: this.state.currentPhase,
      plans: debugPlans,
      chosenCount: debugPlans.filter(plan => plan.status === "chosen").length,
    } satisfies AIDebugSnapshot);
  }

  private handleSingleNonCombatMove(evaluations: Map<string, TerritoryEvaluation>): boolean {
    const faction = this.state.getCurrentFaction();
    if (!faction) return false;

    const ourTerritories = Array.from(evaluations.values())
      .filter(e => e.territory.owner === faction.id)
      .sort((a, b) => b.threatLevel - a.threatLevel);

    const keepHome = this.hasBehavior('maximum_defense') ? 6
      : this.hasBehavior('fortify_borders') ? 4
      : this.personality.defense > 0.7 ? 3 : 2;

    const excess: { territoryId: string; unitTypeId: string; count: number }[] = [];
    for (const eval_ of ourTerritories) {
      if (eval_.defenseStrength > eval_.threatLevel * 2 && eval_.threatLevel < 20) {
        for (const pu of eval_.territory.units) {
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          if (!ut || ut.domain !== "land") continue;
          const extra = Math.max(0, pu.count - keepHome);
          if (extra > 0) excess.push({ territoryId: eval_.territory.id, unitTypeId: pu.unitTypeId, count: extra });
        }
      }
    }

    const threatThreshold = this.hasBehavior('maximum_defense') ? 1
      : this.hasBehavior('analyze_threats') ? 3
      : this.hasBehavior('fortify_borders') ? 5
      : this.personality.defense > 0.7 ? 5 : 10;

    for (const threatened of ourTerritories) {
      if (threatened.threatLevel < threatThreshold) continue;
      if (threatened.defenseStrength > threatened.threatLevel * 1.5) continue;

      for (const ex of excess) {
        if (ex.count <= 0) continue;
        const validMoves = this.movementValidator.getValidMoves(ex.unitTypeId, ex.territoryId, false);
        const moveToward = validMoves.find(m =>
          m.territoryId === threatened.territory.id ||
          threatened.territory.adjacentTo.includes(m.territoryId)
        );
        if (moveToward) {
          const available = this.movementValidator.getAvailableUnits(ex.territoryId, ex.unitTypeId);
          const toMove = Math.min(ex.count, available);
          if (toMove > 0) {
            this.movementValidator.executeMove({
              unitTypeId: ex.unitTypeId,
              count: toMove,
              fromTerritoryId: ex.territoryId,
              toTerritoryId: moveToward.territoryId,
              path: moveToward.path,
            });
            this.state.emit("ai_thinking", {
              message: `Reinforcing ${this.state.territories.get(moveToward.territoryId)?.name ?? moveToward.territoryId}`,
              action: 'move',
              territoryId: moveToward.territoryId,
            });
            return true;
          }
        }
      }
    }

    return false;
  }

  private generateAttackPlans(
    evaluations: Map<string, TerritoryEvaluation>,
    faction: Faction
  ): AttackPlan[] {
    const plans: AttackPlan[] = [];
    const owned = this.state.getTerritoriesOwnedBy(faction.id);
    const diplo = this.state.diplomacyManager;

    const potentialTargets = new Set<string>();
    for (const t of owned) {
      for (const adjId of t.adjacentTo) {
        const adj = this.state.territories.get(adjId);
        if (
          adj &&
          adj.owner !== faction.id &&
          (!adj.owner || faction.isEnemyOf(adj.owner)) &&
          (!adj.owner || diplo.getRelation(faction.id, adj.owner) === 'war')
        ) {
          potentialTargets.add(adjId);
        }
      }
    }

    for (const targetId of potentialTargets) {
      const target = this.state.territories.get(targetId)!;
      const eval_ = evaluations.get(targetId);
      if (!eval_) continue;

      let planValue = eval_.strategicValue;

      // Behavior: control_seas — prioritize sea zone captures heavily
      if (this.hasBehavior('control_seas') && target.type === 'sea') planValue *= 3;

      // Behavior: encirclement — reward targets attackable from multiple directions
      if (this.hasBehavior('encirclement')) {
        const attackDirs = owned.filter(t => t.adjacentTo.includes(targetId)).length;
        if (attackDirs >= 3) planValue += 80;
        else if (attackDirs >= 2) planValue += 40;
      }

      // Behavior: counter_player — focus attacks on human-controlled enemies
      if (this.hasBehavior('counter_player')) {
        const ownerFaction = target.owner ? this.state.factionRegistry.get(target.owner) : null;
        if (ownerFaction?.controlledBy === 'human' && faction.isEnemyOf(target.owner!)) {
          planValue += 60;
        }
      }

      const candidates: AttackCandidate[] = [];

      for (const t of owned) {
        if (!t.adjacentTo.includes(targetId) && !this.canStrikeTarget(t, target, targetId)) continue;
        const readyStacks = t.units.filter(pu => t.getAvailableUnitCount(pu.unitTypeId) > 0);
        const preferredType = t.type === 'sea' && readyStacks.length > 1
          ? pickBestReadyStackType(this.state, t, this.personality.naval)?.unitTypeId
          : null;
        for (const pu of t.units) {
          if (preferredType && pu.unitTypeId !== preferredType) continue;
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          if (!ut || ut.attack === 0) continue;
          if (!ut.canEnter(target.type) && !this.movementValidator.isRangedStrike(t, target, ut)) continue;
          const availableCount = this.getAttackAvailableCount(t, pu.unitTypeId, pu.count, evaluations, faction);
          if (availableCount <= 0) continue;
          candidates.push({
            fromId: t.id,
            unitTypeId: pu.unitTypeId,
            count: availableCount,
            attack: ut.attack,
            cost: ut.cost,
            domain: ut.domain,
          });
        }
      }

      const { attackers, totalAttackPower } = this.selectAttackersForTarget(candidates, target, eval_, planValue);
      if (attackers.length === 0) continue;

      plans.push({
        targetId,
        attackers,
        expectedSuccess: this.estimateSuccessRate(totalAttackPower, eval_.defenseStrength),
        strategicValue: planValue,
      });
    }

    // Behavior: deep_strikes — mobile units (movement >= 2) can attack non-adjacent targets
    if (this.hasBehavior('deep_strikes')) {
      for (const t of owned) {
        for (const pu of t.units) {
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          if (!ut || ut.attack === 0 || ut.movement < 2) continue;
          const reachable = this.movementValidator.getValidMoves(pu.unitTypeId, t.id, true);
          for (const vm of reachable) {
            if (!vm.isAttack) continue;
            if (potentialTargets.has(vm.territoryId)) continue; // normal plan already covers it
            const eval_ = evaluations.get(vm.territoryId);
            if (!eval_) continue;
            const availableCount = this.getAttackAvailableCount(t, pu.unitTypeId, pu.count, evaluations, faction);
            if (availableCount <= 0) continue;
            plans.push({
              targetId: vm.territoryId,
              attackers: [{ fromId: t.id, unitTypeId: pu.unitTypeId, count: availableCount }],
              expectedSuccess: this.estimateSuccessRate(availableCount * ut.attack, eval_.defenseStrength),
              strategicValue: eval_.strategicValue + 30,
            });
          }
        }
      }
    }

    // Behavior: amphibious_focus — add transport-accessible coastal landing zones
    if (this.hasBehavior('amphibious_focus')) {
      for (const seaT of this.state.territories.values()) {
        if (seaT.type !== 'sea' || seaT.owner !== faction.id) continue;
        const hasTransport = seaT.units.some(pu => {
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          return ut && ut.transportCapacity > 0;
        });
        if (!hasTransport) continue;
        for (const coastId of seaT.adjacentTo) {
          const coast = this.state.territories.get(coastId);
          if (!coast || !coast.isLand() || !coast.owner || !faction.isEnemyOf(coast.owner)) continue;
          if (plans.some(p => p.targetId === coastId)) continue;
          const eval_ = evaluations.get(coastId);
          if (!eval_) continue;
          const landAttackers: AttackPlan['attackers'] = [];
          let seaPower = 0;
          for (const adjLandId of seaT.adjacentTo) {
            if (adjLandId === coastId) continue;
            const adjLand = this.state.territories.get(adjLandId);
            if (!adjLand || adjLand.owner !== faction.id || !adjLand.isLand()) continue;
            const inf = adjLand.units.find(u => u.unitTypeId === 'infantry');
            if (inf && inf.count > 0) {
              const availableCount = this.getAttackAvailableCount(adjLand, 'infantry', inf.count, evaluations, faction);
              if (availableCount <= 0) continue;
              landAttackers.push({ fromId: adjLandId, unitTypeId: 'infantry', count: availableCount });
              seaPower += availableCount * (this.state.unitRegistry.get('infantry')?.attack ?? 1);
            }
          }
          if (landAttackers.length === 0) continue;
          plans.push({
            targetId: coastId,
            attackers: landAttackers,
            expectedSuccess: this.estimateSuccessRate(seaPower, eval_.defenseStrength),
            strategicValue: eval_.strategicValue + 40,
          });
        }
      }
    }

    if (this.hasBehavior('control_seas') || this.personality.naval > 0.7) {
      for (const t of owned) {
        if (t.type !== 'sea') continue;
        const best = pickBestReadyStackType(this.state, t, this.personality.naval);
        if (!best) continue;
        const ut = this.state.unitRegistry.get(best.unitTypeId);
        if (!ut || ut.domain !== 'sea' || ut.attack === 0) continue;
        const reachable = this.movementValidator.getValidMoves(best.unitTypeId, t.id, true);
        for (const vm of reachable) {
          if (!vm.isAttack || !vm.coastalStrike) continue;
          if (plans.some(p => p.targetId === vm.territoryId)) continue;
          const eval_ = evaluations.get(vm.territoryId);
          if (!eval_) continue;
          const availableCount = this.getAttackAvailableCount(t, best.unitTypeId, best.count, evaluations, faction);
          if (availableCount <= 0) continue;
          plans.push({
            targetId: vm.territoryId,
            attackers: [{ fromId: t.id, unitTypeId: best.unitTypeId, count: Math.min(availableCount, 3) }],
            expectedSuccess: this.estimateSuccessRate(Math.min(availableCount, 3) * ut.attack, eval_.defenseStrength),
            strategicValue: eval_.strategicValue + 25,
          });
        }
      }
    }

    return plans;
  }

  private canStrikeTarget(from: Territory, target: Territory, _targetId: string): boolean {
    return isNavalReachNeighbor(this.state, from, target);
  }

  private selectAttackersForTarget(
    candidates: AttackCandidate[],
    target: Territory,
    evaluation: TerritoryEvaluation,
    planValue: number
  ): { attackers: AttackPlan['attackers']; totalAttackPower: number } {
    const sorted = [...candidates].sort((a, b) => {
      const cheapTarget = evaluation.defenseStrength <= 2 || planValue < 35;
      if (cheapTarget) {
        const costDiff = a.cost - b.cost;
        if (costDiff !== 0) return costDiff;
        return a.attack - b.attack;
      }

      const aEfficiency = a.attack / Math.max(1, a.cost);
      const bEfficiency = b.attack / Math.max(1, b.cost);
      if (bEfficiency !== aEfficiency) return bEfficiency - aEfficiency;
      return b.attack - a.attack;
    });

    const desiredSuccess = this.getDesiredAttackSuccess(target, evaluation, planValue);
    const attackers: AttackPlan['attackers'] = [];
    let totalAttackPower = 0;

    for (const candidate of sorted) {
      let remaining = candidate.count;
      while (remaining > 0) {
        const existing = attackers.find(a =>
          a.fromId === candidate.fromId && a.unitTypeId === candidate.unitTypeId
        );
        if (existing) existing.count += 1;
        else attackers.push({ fromId: candidate.fromId, unitTypeId: candidate.unitTypeId, count: 1 });

        totalAttackPower += candidate.attack;
        remaining -= 1;

        if (this.estimateSuccessRate(totalAttackPower, evaluation.defenseStrength) >= desiredSuccess) {
          return { attackers, totalAttackPower };
        }
      }
    }

    return { attackers, totalAttackPower };
  }

  private getDesiredAttackSuccess(
    target: Territory,
    evaluation: TerritoryEvaluation,
    planValue: number
  ): number {
    if (this.hasBehavior('ignore_losses')) return 0.3;
    if (this.hasBehavior('only_sure_attacks') || this.hasBehavior('maximum_defense')) return 0.9;

    const valuePressure = Math.min(0.2, planValue / 500);
    const defensePressure = target.isCapital || target.hasFactory || evaluation.defenseStrength >= 15 ? 0.15 : 0;
    const caution = this.personality.defense * 0.15 + this.personality.patience * 0.1;
    const aggression = this.personality.aggression * 0.1;

    return Math.max(0.45, Math.min(0.9, 0.6 + valuePressure + defensePressure + caution - aggression));
  }

  private getAttackAvailableCount(
    source: Territory,
    unitTypeId: string,
    count: number,
    evaluations: Map<string, TerritoryEvaluation>,
    faction: Faction
  ): number {
    const unit = this.state.unitRegistry.get(unitTypeId);
    const readyCount = Math.min(count, this.movementValidator.getAvailableUnits(source.id, unitTypeId));
    if (!unit || unit.domain !== 'land') return readyCount;

    const reserve = this.getAttackReserveCount(source, evaluations, faction);
    return Math.max(0, readyCount - reserve);
  }

  private getAttackReserveCount(
    source: Territory,
    evaluations: Map<string, TerritoryEvaluation>,
    faction: Faction
  ): number {
    let reserve = source.isCapital || source.id === faction.capital ? 3 : source.hasFactory ? 2 : 1;
    const evaluation = evaluations.get(source.id);

    if (evaluation) {
      if (evaluation.threatLevel > evaluation.defenseStrength) reserve += 2;
      else if (evaluation.threatLevel > 0) reserve += 1;
    }

    if (this.personality.defense > 0.7 || this.hasBehavior('fortify_borders') || this.hasBehavior('maximum_defense')) {
      reserve += 1;
    }

    if (this.personality.aggression > 0.8 && !source.isCapital && source.id !== faction.capital && !source.hasFactory) {
      reserve = Math.max(0, reserve - 1);
    }

    return reserve;
  }

  private wouldOverextendKeyTerritory(
    plan: AttackPlan,
    evaluations: Map<string, TerritoryEvaluation>,
    faction: Faction
  ): boolean {
    const target = this.state.territories.get(plan.targetId);
    if (!target) return true;
    const isDecisiveTarget = target.isCapital || target.hasFactory || plan.expectedSuccess >= 0.85;

    const committedBySource = new Map<string, number>();
    for (const attacker of plan.attackers) {
      committedBySource.set(attacker.fromId, (committedBySource.get(attacker.fromId) ?? 0) + attacker.count);
    }

    for (const [sourceId, committedCount] of committedBySource) {
      const source = this.state.territories.get(sourceId);
      if (!source || source.owner !== faction.id || source.isSea()) continue;
      if (!source.isCapital && source.id !== faction.capital && !source.hasFactory) continue;

      const evaluation = evaluations.get(sourceId);
      const currentUnits = source.getTotalUnitCount();
      const remainingUnits = currentUnits - committedCount;
      const reserve = this.getAttackReserveCount(source, evaluations, faction);
      const threatLevel = evaluation?.threatLevel ?? 0;
      const defenseStrength = evaluation?.defenseStrength ?? 0;
      const unitDefenseShare = currentUnits > 0 ? defenseStrength / currentUnits : 0;
      const projectedDefense = Math.max(0, defenseStrength - committedCount * unitDefenseShare);

      if (remainingUnits < reserve) return true;
      if (!isDecisiveTarget && threatLevel > 0 && projectedDefense < threatLevel * 0.8) return true;
      if ((source.isCapital || source.id === faction.capital) && projectedDefense < threatLevel && !isDecisiveTarget) return true;
    }

    return false;
  }

  private estimateSuccessRate(attackPower: number, defensePower: number): number {
    if (defensePower === 0) return 0.95;
    const ratio = attackPower / defensePower;
    if (ratio >= 3) return 0.95;
    if (ratio >= 2) return 0.85;
    if (ratio >= 1.5) return 0.7;
    if (ratio >= 1) return 0.5;
    if (ratio >= 0.75) return 0.3;
    if (ratio >= 0.5) return 0.15;
    return 0.05;
  }

  /**
   * Combat resolution
   */
  private async handleCombatPhase(): Promise<void> {
    const combatTerritories = this.findCombatTerritories();

    for (const territoryId of combatTerritories) {
      const territory = this.state.territories.get(territoryId);
      if (!territory) continue;

      const attackingMoves = this.state.pendingMoves.filter(m => m.toTerritoryId === territoryId);
      const attackingUnits = attackingMoves.map(m => {
        const src = this.state.territories.get(m.fromTerritoryId);
        const pu = src?.units.find(u => u.unitTypeId === m.unitTypeId);
        return { unitTypeId: m.unitTypeId, count: m.count, veteranCount: pu?.veteranCount ?? 0 };
      });

      if (attackingUnits.length === 0) continue;

      const stayInPlace = attackingMoves.every(m => m.rangedStrike || m.coastalStrike);
      const sourceTerritoryId = attackingMoves[0]?.fromTerritoryId;
      const sourceTerritory = sourceTerritoryId ? this.state.territories.get(sourceTerritoryId) : null;

      if (!territory.owner || territory.getTotalUnitCount() === 0) {
        if (stayInPlace) {
          for (const move of attackingMoves) {
            this.state.territories.get(move.fromTerritoryId)?.markUnitsActed(move.unitTypeId, move.count);
          }
          continue;
        }
        territory.owner = this.state.currentFactionId;
        territory.units = [];
        for (const unit of attackingUnits) territory.addUnits(unit.unitTypeId, unit.count);
        continue;
      }

      if (sourceTerritory) {
        for (const move of attackingMoves) {
          sourceTerritory.removeUnits(move.unitTypeId, move.count);
        }
      }

      const combat = this.combatResolver.initiateCombat(
        territoryId,
        this.state.currentFactionId,
        attackingUnits,
        sourceTerritoryId,
        { stayInPlace },
      );

      if (!combat) {
        if (sourceTerritory) {
          for (const move of attackingMoves) {
            sourceTerritory.addUnits(move.unitTypeId, move.count);
          }
        }
        continue;
      }

      combat.sourceTerritory = sourceTerritoryId;
      this.combatResolver.runPreCombatPhases(combat);

      let usedTacticalAssault = false;
      if (settings.getSetting('tacticalBattles')) {
        const attackPower = attackingUnits.reduce((sum, u) => {
          const type = this.state.unitRegistry.get(u.unitTypeId);
          return sum + u.count * (type?.attack ?? 0);
        }, 0);
        const defensePower = territory.units.reduce((sum, u) => {
          const type = this.state.unitRegistry.get(u.unitTypeId);
          return sum + u.count * (type?.defense ?? 0);
        }, 0);
        if (shouldAIUseTacticalAssault(territory, attackPower, defensePower, this.personality.aggression)) {
          combat.flankingBonus = (combat.flankingBonus ?? 0) + 1;
          combat.resolvedTactically = true;
          usedTacticalAssault = true;
          const attacker = this.state.factionRegistry.get(this.state.currentFactionId);
          this.state.emit('ai_thinking', {
            message: `${attacker?.name ?? 'Enemy'} launches a tactical assault on ${territory.name}`,
            action: 'tactical_assault',
            territoryId,
          });
          this.state.emit('tactical_assault_start', {
            factionId: this.state.currentFactionId,
            territoryId,
            territoryName: territory.name,
          });
        }
      }

      // Retreat threshold: turtle bails sooner, aggressive AI pushes harder
      const retreatThreshold = this.hasBehavior('ignore_losses') ? 0
        : this.personality.id === 'turtle' ? 0.6
        : this.personality.aggression > 0.8 ? 0.25 : 0.4;

      while (!combat.isComplete) {
        this.combatResolver.resolveCombatRound(combat);
        await this.delay(150);

        if (!combat.isComplete && combat.rounds.length >= 2) {
          const atkRemain = combat.attackers.reduce((s, a) => s + (a.count - a.casualties), 0);
          const defRemain = combat.defenders.reduce((s, d) => s + (d.count - d.casualties), 0);
          if (defRemain > 0 && atkRemain / defRemain < retreatThreshold) {
            const retreatTo = territory.adjacentTo.find(id =>
              this.state.territories.get(id)?.owner === this.state.currentFactionId
            );
            if (retreatTo) { this.combatResolver.processRetreat(combat, retreatTo); break; }
          }
        }
      }

      if (usedTacticalAssault && combat.winner === 'attacker') {
        const meta = buildTacticalOutcomeMeta(combat, true);
        combat.tacticalCleanWin = meta.cleanWin;
        applyTacticalVictoryBonuses(combat, meta);
        statisticsManager.trackTacticalBattle(combat.attackingFactionId, true);
      }

      this.combatResolver.finalizeCombat(combat);

      if (stayInPlace && sourceTerritory) {
        for (const cu of combat.attackers) {
          const surviving = cu.count - cu.casualties;
          if (surviving <= 0) continue;
          sourceTerritory.addUnits(cu.unitType.id, surviving);
          sourceTerritory.markUnitsActed(cu.unitType.id, surviving);
        }
      } else if (sourceTerritory && combat.winner !== 'attacker') {
        for (const move of attackingMoves) {
          const pu = combat.attackers.find(a => a.unitType.id === move.unitTypeId);
          const surviving = pu ? pu.count - pu.casualties : move.count;
          if (surviving > 0) {
            sourceTerritory.addUnits(move.unitTypeId, surviving);
            sourceTerritory.markUnitsActed(move.unitTypeId, surviving);
          }
        }
      }
    }

    this.state.pendingMoves = [];
  }

  private findCombatTerritories(): string[] {
    const faction = this.state.getCurrentFaction();
    if (!faction) return [];
    const territories = new Set<string>();
    for (const move of this.state.pendingMoves) {
      const target = this.state.territories.get(move.toTerritoryId);
      if (target && (!target.owner || faction.isEnemyOf(target.owner))) {
        territories.add(move.toTerritoryId);
      }
    }
    return Array.from(territories);
  }

  /**
   * Non-combat movement — reinforce threatened territories
   */
  private handleNonCombatMovePhase(evaluations: Map<string, TerritoryEvaluation>): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const ourTerritories = Array.from(evaluations.values())
      .filter(e => e.territory.owner === faction.id)
      .sort((a, b) => b.threatLevel - a.threatLevel);

    const keepHome = this.hasBehavior('maximum_defense') ? 6
      : this.hasBehavior('fortify_borders') ? 4
      : this.personality.defense > 0.7 ? 3 : 2;

    const excess: { territoryId: string; unitTypeId: string; count: number }[] = [];
    for (const eval_ of ourTerritories) {
      if (eval_.defenseStrength > eval_.threatLevel * 2 && eval_.threatLevel < 20) {
        for (const pu of eval_.territory.units) {
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          if (!ut || ut.domain !== "land") continue;
          const extra = Math.max(0, pu.count - keepHome);
          if (extra > 0) excess.push({ territoryId: eval_.territory.id, unitTypeId: pu.unitTypeId, count: extra });
        }
      }
    }

    const threatThreshold = this.hasBehavior('maximum_defense') ? 1
      : this.hasBehavior('analyze_threats') ? 3
      : this.hasBehavior('fortify_borders') ? 5
      : this.personality.defense > 0.7 ? 5 : 10;
    for (const threatened of ourTerritories) {
      if (threatened.threatLevel < threatThreshold) continue;
      if (threatened.defenseStrength > threatened.threatLevel * 1.5) continue;

      for (const ex of excess) {
        if (ex.count <= 0) continue;
        const validMoves = this.movementValidator.getValidMoves(ex.unitTypeId, ex.territoryId, false);
        const moveToward = validMoves.find(m =>
          m.territoryId === threatened.territory.id ||
          threatened.territory.adjacentTo.includes(m.territoryId)
        );
        if (moveToward) {
          const available = this.movementValidator.getAvailableUnits(ex.territoryId, ex.unitTypeId);
          const toMove = Math.min(ex.count, available);
          if (toMove > 0) {
            this.movementValidator.executeMove({
              unitTypeId: ex.unitTypeId,
              count: toMove,
              fromTerritoryId: ex.territoryId,
              toTerritoryId: moveToward.territoryId,
              path: moveToward.path,
            });
            const dest = this.state.territories.get(moveToward.territoryId);
            this.state.emit('ai_thinking', {
              message: `Repositioning to ${dest?.name ?? moveToward.territoryId}`,
              action: 'move',
              territoryId: moveToward.territoryId,
            });
            ex.count -= toMove;
          }
        }
      }
    }
  }

  private hasBehavior(behavior: string): boolean {
    return this.personality.specialBehaviors.includes(behavior);
  }

  private applyRandomFocusModifiers(): void {
    const roll = Math.random();
    if (roll < 0.2) {
      this.personality.aggression = 0.9; this.personality.defense = 0.1;
    } else if (roll < 0.4) {
      this.personality.aggression = 0.15; this.personality.defense = 0.9;
    } else if (roll < 0.6) {
      this.personality.economy = 0.9; this.personality.aggression = 0.25;
    } else if (roll < 0.8) {
      this.personality.naval = 0.95; this.personality.air = 0.8;
    } else {
      this.personality.air = 0.95; this.personality.aggression = 0.75;
    }
  }

  private applyHistoricalPriorities(factionId: string): void {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return;

    // Infer historical archetype from faction bonuses and apply appropriate weights
    const bonuses = faction.bonuses ?? {};

    if ((bonuses.movementBonus ?? 0) > 0) {
      // Mobile/blitz faction (e.g. Pacific Union) — fast strikes, expansion
      this.personality.aggression = Math.min(1, this.personality.aggression + 0.2);
      this.personality.expansion  = Math.min(1, this.personality.expansion  + 0.15);
      this.personality.naval      = Math.min(1, this.personality.naval      + 0.1);
    }
    if ((bonuses.researchSpeedBonus ?? 0) > 0) {
      // Tech-focused faction (e.g. Atlantic Alliance) — economy + air power
      this.personality.economy = Math.min(1, this.personality.economy + 0.2);
      this.personality.air     = Math.min(1, this.personality.air     + 0.15);
      this.personality.aggression = Math.max(0, this.personality.aggression - 0.1);
    }
    if ((bonuses.unitCostDiscount ?? 0) > 0) {
      // Mass-production faction (e.g. Southern Federation) — defense + attrition
      this.personality.defense    = Math.min(1, this.personality.defense    + 0.2);
      this.personality.economy    = Math.min(1, this.personality.economy    + 0.1);
      this.personality.riskTolerance = Math.max(0, this.personality.riskTolerance - 0.1);
    }
    if ((bonuses.ipcPerFactory ?? 0) > 0) {
      // Industrial faction — factories first, then overwhelming force
      this.personality.economy    = Math.min(1, this.personality.economy    + 0.25);
      this.personality.patience   = Math.min(1, this.personality.patience   + 0.15);
      this.personality.aggression = Math.max(0, this.personality.aggression - 0.05);
    }
    if ((bonuses.incomeMultiplierBonus ?? 0) > 0) {
      // Wealthy faction — modest naval interest (scaled by difficulty elsewhere)
      this.personality.naval   = Math.min(1, this.personality.naval   + 0.08);
      this.personality.economy = Math.min(1, this.personality.economy + 0.1);
    }
  }

  private addSurpriseAttack(
    plans: AttackPlan[],
    evaluations: Map<string, TerritoryEvaluation>,
    faction: Faction
  ): void {
    const candidates = Array.from(this.state.territories.values()).filter(t =>
      t.owner && faction.isEnemyOf(t.owner) && !plans.some(p => p.targetId === t.id)
    );
    if (candidates.length === 0) return;
    const randomTarget = candidates[Math.floor(Math.random() * candidates.length)];
    const eval_ = evaluations.get(randomTarget.id);
    if (!eval_) return;

    const attackers: AttackPlan['attackers'] = [];
    let totalAttackPower = 0;
    for (const ownedT of this.state.getTerritoriesOwnedBy(faction.id)) {
      for (const pu of ownedT.units) {
        const ut = this.state.unitRegistry.get(pu.unitTypeId);
        if (!ut || ut.attack === 0 || ut.movement < 2) continue;
        const validMoves = this.movementValidator.getValidMoves(pu.unitTypeId, ownedT.id, true);
        if (validMoves.some(m => m.territoryId === randomTarget.id)) {
          const availableCount = this.getAttackAvailableCount(ownedT, pu.unitTypeId, pu.count, evaluations, faction);
          if (availableCount <= 0) continue;
          attackers.push({ fromId: ownedT.id, unitTypeId: pu.unitTypeId, count: availableCount });
          totalAttackPower += availableCount * ut.attack;
        }
      }
    }
    if (attackers.length === 0) return;
    plans.push({
      targetId: randomTarget.id,
      attackers,
      expectedSuccess: this.estimateSuccessRate(totalAttackPower, eval_.defenseStrength),
      strategicValue: eval_.strategicValue + 50,
    });
  }

  // Speed multiplier: 1.0 = normal, 0.25 = fast, 2.0 = slow/cinematic
  private speedMultiplier: number = 1.0;

  setSpeed(multiplier: number): void {
    this.speedMultiplier = Math.max(0.1, Math.min(3.0, multiplier));
  }

  getSpeed(): number { return this.speedMultiplier; }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms * this.speedMultiplier));
  }
}
