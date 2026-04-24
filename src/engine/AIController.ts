/**
 * AIController - Computer-controlled faction AI
 * Uses AIPersonality data for distinct, believable opponent behavior.
 */

import { GameState } from "./GameState";
import { TurnManager } from "./TurnManager";
import { MovementValidator } from "./MovementValidator";
import { MobilizationSystem } from "./MobilizationSystem";
import { CombatResolver } from "./CombatResolver";
import { Territory } from "../data/Territory";
import { Faction } from "../data/Faction";
import {
  AIPersonality,
  getPersonality,
  calculateAttackPriority,
  calculateUnitPriority,
} from "./AIPersonalities";
import type { AIWorkerState, AIWorkerResponse } from "../workers/aiWorkerTypes";

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

export class AIController {
  private movementValidator: MovementValidator;
  private mobilizationSystem: MobilizationSystem;
  private combatResolver: CombatResolver;

  // Active personality (drives all decisions)
  private personality: AIPersonality = getPersonality('balanced');

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
    this.mobilizationSystem = new MobilizationSystem(state);
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
   * Set AI difficulty — scales personality risk/aggression
   */
  setDifficulty(level: "easy" | "medium" | "hard"): void {
    const scale = level === "easy" ? 0.55 : level === "hard" ? 1.15 : 1.0;
    const clamp = (v: number) => Math.min(1, Math.max(0, v * scale));
    this.personality.aggression = clamp(this.personality.aggression);
    this.personality.riskTolerance = clamp(this.personality.riskTolerance);
    this.personality.expansion = clamp(this.personality.expansion);
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
    this.personality = getPersonality(mapping[preset] ?? preset);
  }

  /** Load a full AIPersonality object directly */
  setPersonalityObject(p: AIPersonality): void {
    this.personality = p;
  }

  /**
   * Serialize current game state for the AI Worker.
   */
  private buildWorkerState(factionId: string): AIWorkerState {
    const unitTypes = this.state.unitRegistry.getAll().map(u => ({
      id: u.id, attack: u.attack, defense: u.defense,
      movement: u.movement, cost: u.cost, domain: u.domain,
    }));
    const factions = this.state.factionRegistry.getAll().map(f => ({
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
    const faction = this.state.factionRegistry.get(factionId)!;
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
        this.worker!.onerror = () => resolve(); // fallback on error
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
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== "ai") return;

    this.state.emit("ai_thinking", { message: "Evaluating board..." });
    this.mobilizationSystem.resetForNewTurn();

    // Run Worker evaluation in parallel with synchronous evaluation
    const workerPromise = this.runWorkerEvaluation(faction.id);
    const evaluations = this.evaluateAllTerritories();
    await workerPromise; // Wait for worker (result stored in this.workerEvaluations)

    this.state.emit("ai_thinking", { message: "Planning strategy..." });
    this.considerDiplomacy(faction);

    while (true) {
      await this.processPhase(evaluations);
      if (this.state.getCurrentFaction()?.id !== faction.id) break;
      this.turnManager.advancePhase();
      await this.delay(400);
    }
  }

  /** Clean up Worker when no longer needed */
  terminateWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  /**
   * AI diplomacy — personality-driven proposal handling and initiation
   */
  private considerDiplomacy(faction: Faction): void {
    const diplo = this.state.diplomacyManager;
    const isLosing = this.isLosingBadly(faction);

    // Respond to incoming proposals
    for (const proposal of diplo.getPendingProposals(faction.id)) {
      let acceptChance = 0.2;

      if (proposal.type === 'pact') {
        acceptChance = isLosing ? 0.75 : (this.personality.defense * 0.5 + 0.15);
      } else if (proposal.type === 'alliance') {
        acceptChance = isLosing ? 0.3 : (this.personality.defense * 0.4 + this.personality.economy * 0.2);
      } else if (proposal.type === 'trade_deal') {
        acceptChance = this.personality.economy * 0.8 + 0.1;
      }

      if (Math.random() < acceptChance) {
        diplo.acceptProposal(proposal.fromId, proposal.toId, proposal.type);
      } else {
        diplo.declineProposal(proposal.fromId, proposal.toId, proposal.type);
      }
    }

    const others = this.state.factionRegistry.getAll().filter(f => f.id !== faction.id && !f.isDefeated);

    // When losing badly, seek a non-aggression pact with the strongest enemy
    if (isLosing && Math.random() < 0.25) {
      const strongest = others
        .filter(f => diplo.getRelation(faction.id, f.id) === 'war')
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

    for (const other of this.state.factionRegistry.getAll()) {
      if (faction.isEnemyOf(other.id) && territory.id === other.capital) value += 150;
    }

    if (territory.adjacentTo.length <= 3 && territory.isLand()) value += 20;

    const adjacentFriendly = territory.adjacentTo
      .filter(id => this.state.territories.get(id)?.owner === faction.id).length;
    value += adjacentFriendly * 5;

    if (adjacentFriendly === 0 && territory.owner !== faction.id) value -= 30;

    for (const other of this.state.factionRegistry.getAll()) {
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
    switch (this.state.currentPhase) {
      case "purchase":        this.handlePurchasePhase(evaluations); break;
      case "combat_move":     this.handleCombatMovePhase(evaluations); break;
      case "combat":          await this.handleCombatPhase(); break;
      case "noncombat_move":  this.handleNonCombatMovePhase(evaluations); break;
      case "production":      this.handleMobilizationPhase(evaluations); break;
      case "collect_income":  break; // Auto-handled
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

    options.sort((a, b) => {
      const evalA = evaluations.get(a.territory.id);
      const evalB = evaluations.get(b.territory.id);
      let scoreA = 0, scoreB = 0;

      if (evalA?.threatLevel ?? 0 > 0) scoreA += (evalA!.threatLevel) * 2;
      if (evalB?.threatLevel ?? 0 > 0) scoreB += (evalB!.threatLevel) * 2;

      if (a.type === 'factory') scoreA += 30;
      if (b.type === 'factory') scoreB += 30;
      if (a.type === 'capital') scoreA += 25;
      if (b.type === 'capital') scoreB += 25;

      const aFrontline = a.territory.adjacentTo.some(id => {
        const t = this.state.territories.get(id);
        return t?.owner && faction.isEnemyOf(t.owner);
      });
      const bFrontline = b.territory.adjacentTo.some(id => {
        const t = this.state.territories.get(id);
        return t?.owner && faction.isEnemyOf(t.owner);
      });
      if (aFrontline) scoreA += this.aggressiveness > 0.6 ? 30 : 10;
      if (bFrontline) scoreB += this.aggressiveness > 0.6 ? 30 : 10;

      // Unit composition preference via personality
      const upA = a.units.reduce((sum, u) =>
        sum + calculateUnitPriority(this.personality, u.unitTypeId, currentComposition) * u.count, 0);
      const upB = b.units.reduce((sum, u) =>
        sum + calculateUnitPriority(this.personality, u.unitTypeId, currentComposition) * u.count, 0);
      scoreA += upA * 10;
      scoreB += upB * 10;

      // Economic AI is frugal when low on IPCs — only mobilize threatened or key sites
      if (this.personality.economy > 0.7 && faction.ipcs < 20) {
        if ((evalA?.threatLevel ?? 0) < 5 && a.type === 'land') scoreA -= 20;
        if ((evalB?.threatLevel ?? 0) < 5 && b.type === 'land') scoreB -= 20;
      }

      return scoreB - scoreA;
    });

    // Patient personalities mobilize fewer sites per turn to save IPCs
    const maxMobilizations = this.personality.patience > 0.7 ? 2 : 3;
    let count = 0;

    for (const option of options) {
      if (count >= maxMobilizations) break;
      if (faction.ipcs < option.cost) continue;
      const result = this.mobilizationSystem.mobilize(option.territory.id);
      if (result.success) {
        count++;
        this.state.emit("ai_thinking", {
          message: `Mobilizing forces at ${option.territory.name}`,
          action: 'mobilize',
          territory: option.territory.name,
        });
      }
    }
  }

  private handlePurchasePhase(evaluations: Map<string, TerritoryEvaluation>): void {
    this.handleMobilizationPhase(evaluations);
  }

  /**
   * Combat movement — personality-aware attack planning via calculateAttackPriority
   */
  private handleCombatMovePhase(evaluations: Map<string, TerritoryEvaluation>): void {
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

    const usedUnits = new Set<string>();

    for (const plan of plans) {
      const minSuccess = this.personality.id === 'turtle'
        ? 0.85
        : this.riskTolerance * (0.5 + this.aggressiveness * 0.3);
      if (plan.expectedSuccess < minSuccess) continue;

      const minValue = 30 * (1 - this.expansionFocus * 0.5);
      if (plan.strategicValue < minValue && plan.expectedSuccess < 0.8) continue;

      let canExecute = true;
      for (const att of plan.attackers) {
        if (usedUnits.has(`${att.fromId}-${att.unitTypeId}`)) { canExecute = false; break; }
      }
      if (!canExecute) continue;

      const target = this.state.territories.get(plan.targetId);
      let totalCommitted = 0;

      for (const att of plan.attackers) {
        const available = this.movementValidator.getAvailableUnits(att.fromId, att.unitTypeId);
        const toMove = Math.min(att.count, available);
        if (toMove > 0) {
          this.state.pendingMoves.push({
            unitTypeId: att.unitTypeId,
            count: toMove,
            fromTerritoryId: att.fromId,
            toTerritoryId: plan.targetId,
            path: [att.fromId, plan.targetId],
          });
          usedUnits.add(`${att.fromId}-${att.unitTypeId}`);
          totalCommitted += toMove;
        }
      }

      if (totalCommitted > 0 && target) {
        this.state.emit("ai_thinking", {
          message: `Attacking ${target.name} with ${totalCommitted} units`,
          action: 'attack',
          territory: target.name,
        });
      }
    }
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

      const attackers: { fromId: string; unitTypeId: string; count: number }[] = [];
      let totalAttackPower = 0;

      for (const t of owned) {
        if (!t.adjacentTo.includes(targetId)) continue;
        for (const pu of t.units) {
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          if (!ut || ut.attack === 0 || !ut.canEnter(target.type)) continue;
          // Naval AI skips inland targets for naval units
          if (this.personality.naval > 0.8 && ut.domain === 'sea' && target.type === 'land') continue;
          attackers.push({ fromId: t.id, unitTypeId: pu.unitTypeId, count: pu.count });
          totalAttackPower += pu.count * ut.attack;
        }
      }

      if (attackers.length === 0) continue;

      plans.push({
        targetId,
        attackers,
        expectedSuccess: this.estimateSuccessRate(totalAttackPower, eval_.defenseStrength),
        strategicValue: eval_.strategicValue,
      });
    }

    return plans;
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

      for (const move of attackingMoves) {
        this.state.territories.get(move.fromTerritoryId)?.removeUnits(move.unitTypeId, move.count);
      }

      if (!territory.owner || territory.getTotalUnitCount() === 0) {
        territory.owner = this.state.currentFactionId;
        territory.units = [];
        for (const unit of attackingUnits) territory.addUnits(unit.unitTypeId, unit.count);
        continue;
      }

      const combat = this.combatResolver.initiateCombat(territoryId, this.state.currentFactionId, attackingUnits);

      if (!combat) {
        for (const move of attackingMoves) {
          this.state.territories.get(move.fromTerritoryId)?.addUnits(move.unitTypeId, move.count);
        }
        continue;
      }

      // Retreat threshold: turtle bails sooner, aggressive AI pushes harder
      const retreatThreshold = this.personality.id === 'turtle' ? 0.6
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

      this.combatResolver.finalizeCombat(combat);
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

    // Turtle keeps 3 home; aggressive keeps 2
    const keepHome = this.personality.defense > 0.7 ? 3 : 2;

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

    const threatThreshold = this.personality.defense > 0.7 ? 5 : 10;
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
            ex.count -= toMove;
          }
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
