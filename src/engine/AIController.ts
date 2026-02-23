/**
 * AIController - Improved AI for computer-controlled factions
 * Uses strategic evaluation, threat assessment, and goal-based planning
 */

import { GameState, PendingMove } from "./GameState";
import { TurnManager } from "./TurnManager";
import { MovementValidator } from "./MovementValidator";
import { MobilizationSystem } from "./MobilizationSystem";
import { CombatResolver } from "./CombatResolver";
import { Territory } from "../data/Territory";
import { Faction } from "../data/Faction";

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

  // AI personality settings (can be adjusted for difficulty)
  private aggressiveness: number = 0.75; // 0-1, higher = more likely to attack
  private riskTolerance: number = 0.6; // 0-1, higher = accepts worse odds
  private expansionFocus: number = 0.8; // 0-1, higher = prioritizes capturing territory

  constructor(private state: GameState, private turnManager: TurnManager) {
    this.movementValidator = new MovementValidator(state);
    this.mobilizationSystem = new MobilizationSystem(state);
    this.combatResolver = new CombatResolver(state);
  }

  /**
   * Set AI difficulty
   */
  setDifficulty(level: "easy" | "medium" | "hard"): void {
    switch (level) {
      case "easy":
        this.aggressiveness = 0.4;
        this.riskTolerance = 0.35;
        this.expansionFocus = 0.5;
        break;
      case "medium":
        this.aggressiveness = 0.7;
        this.riskTolerance = 0.6;
        this.expansionFocus = 0.75;
        break;
      case "hard":
        this.aggressiveness = 0.9;
        this.riskTolerance = 0.8;
        this.expansionFocus = 0.95;
        break;
    }
  }

  /** AI personality presets */
  setPersonality(preset: "default" | "turtle" | "rusher" | "economic" | "opportunist"): void {
    switch (preset) {
      case "turtle":
        this.aggressiveness = 0.2;
        this.riskTolerance = 0.2;
        this.expansionFocus = 0.3;
        break;
      case "rusher":
        this.aggressiveness = 0.9;
        this.riskTolerance = 0.8;
        this.expansionFocus = 0.9;
        break;
      case "economic":
        this.aggressiveness = 0.4;
        this.riskTolerance = 0.3;
        this.expansionFocus = 0.5;
        break;
      case "opportunist":
        this.aggressiveness = 0.7;
        this.riskTolerance = 0.7;
        this.expansionFocus = 0.6;
        break;
      default:
        this.aggressiveness = 0.6;
        this.riskTolerance = 0.5;
        this.expansionFocus = 0.7;
    }
  }

  /**
   * Execute AI turn for current faction
   */
  async executeTurn(): Promise<void> {
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== "ai") return;

    console.log(`🤖 AI (${faction.name}) thinking...`);
    this.state.emit("ai_thinking", { message: "Evaluating board..." });

    // Reset mobilization tracking for new turn
    this.mobilizationSystem.resetForNewTurn();

    // Evaluate the board state
    const evaluations = this.evaluateAllTerritories();
    this.state.emit("ai_thinking", { message: "Planning strategy..." });

    // Diplomacy: respond to pending proposals and optionally propose pacts
    this.considerDiplomacy(faction);

    // Process each phase
    while (true) {
      await this.processPhase(evaluations);

      // Check if it's still our turn
      if (this.state.getCurrentFaction()?.id !== faction.id) break;

      this.turnManager.advancePhase();

      // Delay for visual feedback
      await this.delay(400);
    }
  }

  /**
   * AI diplomacy: respond to pending proposals; propose pacts when losing
   */
  private considerDiplomacy(faction: Faction): void {
    const diplo = this.state.diplomacyManager;

    // Accept or decline pending proposals directed at this faction
    for (const proposal of diplo.getPendingProposals(faction.id)) {
      const isLosing = this.isLosingBadly(faction);
      const acceptChance = isLosing ? 0.7 : 0.3;
      if (Math.random() < acceptChance) {
        diplo.accept(proposal.fromId, proposal.toId, proposal.duration, this.state.turnNumber);
      } else {
        diplo.decline(proposal.fromId, proposal.toId);
      }
    }

    // Propose a pact to the strongest enemy when badly losing (25% chance per turn)
    if (this.isLosingBadly(faction) && Math.random() < 0.25) {
      const enemies = this.state.factionRegistry.getAll()
        .filter(f => f.id !== faction.id && !f.isDefeated && diplo.getRelation(faction.id, f.id) === 'war');
      if (enemies.length > 0) {
        // Pick the strongest enemy (most territories)
        const strongest = enemies.reduce((best, f) =>
          this.state.getTerritoriesOwnedBy(f.id).length > this.state.getTerritoriesOwnedBy(best.id).length ? f : best
        );
        diplo.propose(faction.id, strongest.id, 3, this.state.turnNumber);
      }
    }
  }

  private isLosingBadly(faction: Faction): boolean {
    const myTerritories = this.state.getTerritoriesOwnedBy(faction.id).length;
    const totalTerritories = this.state.territories.size;
    const landTerritories = Array.from(this.state.territories.values()).filter(t => t.type !== 'sea').length;
    const ratio = myTerritories / Math.max(1, landTerritories);
    const capitalHeld = !!this.state.territories.get(faction.capital)?.owner === (this.state.territories.get(faction.capital)?.owner === faction.id);
    return ratio < 0.2 || (!capitalHeld && totalTerritories > 0);
  }

  /**
   * Evaluate all territories for strategic planning
   */
  private evaluateAllTerritories(): Map<string, TerritoryEvaluation> {
    const evaluations = new Map<string, TerritoryEvaluation>();
    const faction = this.state.getCurrentFaction();
    if (!faction) return evaluations;

    for (const territory of this.state.territories.values()) {
      const eval_: TerritoryEvaluation = {
        territory,
        strategicValue: this.calculateStrategicValue(territory, faction),
        threatLevel: this.calculateThreatLevel(territory, faction),
        defenseStrength: this.calculateDefenseStrength(territory),
        nearbyEnemyStrength: this.calculateNearbyEnemyStrength(
          territory,
          faction
        ),
      };
      evaluations.set(territory.id, eval_);
    }

    return evaluations;
  }

  /**
   * Calculate strategic value of a territory
   */
  private calculateStrategicValue(
    territory: Territory,
    faction: Faction
  ): number {
    let value = 0;

    // Base production value
    value += territory.production * 10;

    // Capital is extremely valuable
    if (territory.isCapital) {
      value += 200;
    }

    // Factory territories are valuable
    if (territory.hasFactory) {
      value += 80;
    }

    // Victory points matter for winning
    value += (territory.victoryPoints || 0) * 15;

    // Resources are strategically important
    if (territory.resource) {
      switch (territory.resource) {
        case 'oil': value += 40; break;      // Critical for movement/production
        case 'steel': value += 35; break;    // Industrial might
        case 'uranium': value += 50; break;  // Strategic weapons
        case 'rare_earth': value += 30; break; // Technology
        case 'food': value += 20; break;     // Sustaining armies
      }
    }

    // Defensive terrain is valuable for holding
    const defBonus = territory.defenseBonus || 0;
    if (defBonus > 0 && territory.owner === faction.id) {
      value += defBonus * 15;
    }

    // Territories adjacent to our capital need protection
    const ourCapital = this.state.territories.get(faction.capital);
    if (ourCapital?.adjacentTo.includes(territory.id)) {
      value += 50;
    }

    // Enemy capitals are high-value targets
    for (const otherFaction of this.state.factionRegistry.getAll()) {
      if (
        faction.isEnemyOf(otherFaction.id) &&
        territory.id === otherFaction.capital
      ) {
        value += 150;
      }
    }

    // Chokepoints (territories with few connections) are valuable
    if (territory.adjacentTo.length <= 3 && territory.isLand()) {
      value += 20;
    }

    // Adjacent to our territories = easier to reinforce
    const adjacentFriendlyCount = territory.adjacentTo
      .filter(id => this.state.territories.get(id)?.owner === faction.id).length;
    value += adjacentFriendlyCount * 5;

    // Penalize isolated targets (hard to hold after capture)
    if (adjacentFriendlyCount === 0 && territory.owner !== faction.id) {
      value -= 30;
    }

    // Bonus for territories adjacent to an enemy capital (stepping stones)
    for (const otherFaction of this.state.factionRegistry.getAll()) {
      if (!faction.isEnemyOf(otherFaction.id)) continue;
      const enemyCapital = this.state.territories.get(otherFaction.capital);
      if (enemyCapital?.adjacentTo.includes(territory.id)) {
        value += 60; // Staging point for capital assault
      }
    }

    // Protect territories adjacent to our own capital strongly
    const ownCapital = this.state.territories.get(faction.capital);
    if (ownCapital?.adjacentTo.includes(territory.id) && territory.owner === faction.id) {
      value += 80;
    }

    return value;
  }

  /**
   * Calculate threat level to a territory
   */
  private calculateThreatLevel(territory: Territory, faction: Faction): number {
    if (territory.owner !== faction.id) return 0;

    let threat = 0;

    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (!adj) continue;

      if (adj.owner && faction.isEnemyOf(adj.owner)) {
        // Sum up enemy attack power
        for (const pu of adj.units) {
          const unitType = this.state.unitRegistry.get(pu.unitTypeId);
          if (unitType) {
            threat += pu.count * unitType.attack * 1.5;
          }
        }
      }
    }

    return threat;
  }

  /**
   * Calculate defense strength of a territory
   */
  private calculateDefenseStrength(territory: Territory): number {
    let strength = 0;

    for (const pu of territory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType) {
        // Defense value + some attack capability
        strength += pu.count * (unitType.defense * 1.5 + unitType.attack * 0.5);
      }
    }

    return strength;
  }

  /**
   * Calculate nearby enemy strength
   */
  private calculateNearbyEnemyStrength(
    territory: Territory,
    faction: Faction
  ): number {
    let strength = 0;

    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (!adj || !adj.owner || !faction.isEnemyOf(adj.owner)) continue;

      for (const pu of adj.units) {
        const unitType = this.state.unitRegistry.get(pu.unitTypeId);
        if (unitType) {
          strength += pu.count * unitType.attack;
        }
      }
    }

    return strength;
  }

  /**
   * Process current phase
   */
  private async processPhase(
    evaluations: Map<string, TerritoryEvaluation>
  ): Promise<void> {
    const phase = this.state.currentPhase;

    switch (phase) {
      case "purchase":
        this.handlePurchasePhase(evaluations);
        break;
      case "combat_move":
        this.handleCombatMovePhase(evaluations);
        break;
      case "combat":
        await this.handleCombatPhase();
        break;
      case "noncombat_move":
        this.handleNonCombatMovePhase(evaluations);
        break;
      case "production":
        // With new mobilization system, we can mobilize more territories if we have IPCs
        this.handleMobilizationPhase(evaluations);
        break;
      case "collect_income":
        // Handled automatically
        break;
    }
  }

  /**
   * Smart mobilization phase - mobilize territories based on strategic needs
   */
  private handleMobilizationPhase(
    evaluations: Map<string, TerritoryEvaluation>
  ): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    // Get mobilization options
    const options = this.mobilizationSystem.getMobilizationOptions();
    const availableOptions = options.filter(o => o.canMobilize);

    if (availableOptions.length === 0) return;

    // Sort by priority based on strategic evaluation
    availableOptions.sort((a, b) => {
      const evalA = evaluations.get(a.territory.id);
      const evalB = evaluations.get(b.territory.id);
      
      // Prioritize: 1) threatened territories, 2) factories, 3) capitals, 4) frontlines
      let scoreA = 0, scoreB = 0;
      
      // Threat bonus
      if (evalA && evalA.threatLevel > 0) scoreA += evalA.threatLevel * 2;
      if (evalB && evalB.threatLevel > 0) scoreB += evalB.threatLevel * 2;
      
      // Type bonuses
      if (a.type === 'factory') scoreA += 30;
      if (b.type === 'factory') scoreB += 30;
      if (a.type === 'capital') scoreA += 25;
      if (b.type === 'capital') scoreB += 25;
      
      // Frontline bonus (near enemies)
      const aFrontline = a.territory.adjacentTo.some(id => {
        const t = this.state.territories.get(id);
        return t && t.owner && faction.isEnemyOf(t.owner);
      });
      const bFrontline = b.territory.adjacentTo.some(id => {
        const t = this.state.territories.get(id);
        return t && t.owner && faction.isEnemyOf(t.owner);
      });
      if (aFrontline) scoreA += 20;
      if (bFrontline) scoreB += 20;
      
      // Value per cost
      scoreA += (a.units.reduce((sum, u) => sum + u.count, 0) / a.cost) * 10;
      scoreB += (b.units.reduce((sum, u) => sum + u.count, 0) / b.cost) * 10;
      
      return scoreB - scoreA;
    });

    // Mobilize best options until we run out of IPCs or max 3 mobilizations per turn
    let mobilizationCount = 0;
    const maxMobilizations = 3;
    
    for (const option of availableOptions) {
      if (mobilizationCount >= maxMobilizations) break;
      if (faction.ipcs < option.cost) continue;
      
      const result = this.mobilizationSystem.mobilize(option.territory.id);
      if (result.success) {
        mobilizationCount++;
        console.log(`[AI] Mobilized ${option.territory.name}: ${result.unitsSpawned?.map(u => `${u.count}x ${u.unitTypeId}`).join(', ')}`);
        this.state.emit("ai_thinking", { 
          message: `Mobilizing forces at ${option.territory.name}`,
          action: 'mobilize',
          territory: option.territory.name
        });
      }
    }
    
    if (mobilizationCount > 0) {
      this.state.emit("ai_thinking", { 
        message: `Mobilized ${mobilizationCount} territories`,
        action: 'mobilize_done'
      });
    }
  }

  /**
   * Smart purchase phase - buy based on strategic needs (legacy - redirects to mobilization)
   */
  private handlePurchasePhase(
    evaluations: Map<string, TerritoryEvaluation>
  ): void {
    // Use the new mobilization system
    this.handleMobilizationPhase(evaluations);
  }

  /**
   * Smart combat movement - plan coordinated attacks
   */
  private handleCombatMovePhase(
    evaluations: Map<string, TerritoryEvaluation>
  ): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    // Generate attack plans
    const attackPlans = this.generateAttackPlans(evaluations, faction);

    // Sort by expected value (success * strategic value)
    attackPlans.sort(
      (a, b) =>
        b.expectedSuccess * b.strategicValue -
        a.expectedSuccess * a.strategicValue
    );

    // Execute top attacks that meet our risk tolerance
    const usedUnits = new Set<string>(); // Track units already committed

    for (const plan of attackPlans) {
      // Skip if success chance is too low (aggressiveness lowers required threshold)
      const minSuccess = this.riskTolerance * (0.5 + this.aggressiveness * 0.3);
      if (plan.expectedSuccess < minSuccess) continue;

      // Skip low-value targets unless we have overwhelming odds (expansionFocus affects this)
      const minValue = 30 * (1 - this.expansionFocus * 0.5);
      if (plan.strategicValue < minValue && plan.expectedSuccess < 0.8) continue;

      // Check if we can still execute this plan (units not already used)
      let canExecute = true;
      for (const attacker of plan.attackers) {
        const key = `${attacker.fromId}-${attacker.unitTypeId}`;
        if (usedUnits.has(key)) {
          canExecute = false;
          break;
        }
      }

      if (!canExecute) continue;

      // Execute the attack
      const target = this.state.territories.get(plan.targetId);
      let totalUnitsCommitted = 0;
      
      for (const attacker of plan.attackers) {
        const availableCount = this.movementValidator.getAvailableUnits(
          attacker.fromId,
          attacker.unitTypeId
        );

        const countToMove = Math.min(attacker.count, availableCount);
        if (countToMove > 0) {
          this.state.pendingMoves.push({
            unitTypeId: attacker.unitTypeId,
            count: countToMove,
            fromTerritoryId: attacker.fromId,
            toTerritoryId: plan.targetId,
            path: [attacker.fromId, plan.targetId],
          });

          usedUnits.add(`${attacker.fromId}-${attacker.unitTypeId}`);
          totalUnitsCommitted += countToMove;
        }
      }
      
      if (totalUnitsCommitted > 0 && target) {
        this.state.emit("ai_thinking", { 
          message: `Attacking ${target.name} with ${totalUnitsCommitted} units`,
          action: 'attack',
          territory: target.name
        });
      }
    }
  }

  /**
   * Generate potential attack plans
   */
  private generateAttackPlans(
    evaluations: Map<string, TerritoryEvaluation>,
    faction: Faction
  ): AttackPlan[] {
    const plans: AttackPlan[] = [];
    const ownedTerritories = this.state.getTerritoriesOwnedBy(faction.id);

    // Find all potential targets
    const potentialTargets = new Set<string>();
    for (const owned of ownedTerritories) {
      for (const adjId of owned.adjacentTo) {
        const adj = this.state.territories.get(adjId);
        if (
          adj &&
          adj.owner !== faction.id &&
          (!adj.owner || faction.isEnemyOf(adj.owner)) &&
          (!adj.owner || this.state.diplomacyManager.getRelation(faction.id, adj.owner) !== 'pact')
        ) {
          potentialTargets.add(adjId);
        }
      }
    }

    // Generate plans for each target
    for (const targetId of potentialTargets) {
      const target = this.state.territories.get(targetId)!;
      const eval_ = evaluations.get(targetId);
      if (!eval_) continue;

      // Find all units that can attack this target
      const attackers: { fromId: string; unitTypeId: string; count: number }[] =
        [];
      let totalAttackPower = 0;

      for (const owned of ownedTerritories) {
        if (!owned.adjacentTo.includes(targetId)) continue;

        for (const pu of owned.units) {
          const unitType = this.state.unitRegistry.get(pu.unitTypeId);
          if (!unitType || unitType.attack === 0) continue;

          // Check if unit can enter target
          if (!unitType.canEnter(target.type)) continue;

          attackers.push({
            fromId: owned.id,
            unitTypeId: pu.unitTypeId,
            count: pu.count,
          });

          totalAttackPower += pu.count * unitType.attack;
        }
      }

      if (attackers.length === 0) continue;

      // Calculate expected success rate
      const defenseStrength = eval_.defenseStrength;
      const successRate = this.estimateSuccessRate(
        totalAttackPower,
        defenseStrength
      );

      plans.push({
        targetId,
        attackers,
        expectedSuccess: successRate,
        strategicValue: eval_.strategicValue,
      });
    }

    return plans;
  }

  /**
   * Estimate success rate of an attack
   */
  private estimateSuccessRate(
    attackPower: number,
    defensePower: number
  ): number {
    if (defensePower === 0) return 0.95;

    const ratio = attackPower / defensePower;

    // Sigmoid-like function for success probability
    if (ratio >= 3) return 0.95;
    if (ratio >= 2) return 0.85;
    if (ratio >= 1.5) return 0.7;
    if (ratio >= 1) return 0.5;
    if (ratio >= 0.75) return 0.3;
    if (ratio >= 0.5) return 0.15;
    return 0.05;
  }

  /**
   * Handle combat resolution phase
   */
  private async handleCombatPhase(): Promise<void> {
    const combatTerritories = this.findCombatTerritories();

    for (const territoryId of combatTerritories) {
      const territory = this.state.territories.get(territoryId);
      if (!territory) continue;

      const attackingMoves = this.state.pendingMoves
        .filter((m) => m.toTerritoryId === territoryId);

      const attackingUnits = attackingMoves.map((m) => {
        const src = this.state.territories.get(m.fromTerritoryId);
        const pu = src?.units.find(u => u.unitTypeId === m.unitTypeId);
        return { unitTypeId: m.unitTypeId, count: m.count, veteranCount: pu?.veteranCount ?? 0 };
      });

      if (attackingUnits.length === 0) continue;

      // Remove units from source territories before combat
      for (const move of attackingMoves) {
        const fromTerritory = this.state.territories.get(move.fromTerritoryId);
        if (fromTerritory) {
          fromTerritory.removeUnits(move.unitTypeId, move.count);
        }
      }

      // Handle undefended/neutral territories (no combat needed)
      if (!territory.owner || territory.getTotalUnitCount() === 0) {
        territory.owner = this.state.currentFactionId;
        territory.units = [];
        for (const unit of attackingUnits) {
          territory.addUnits(unit.unitTypeId, unit.count);
        }
        continue;
      }

      const combat = this.combatResolver.initiateCombat(
        territoryId,
        this.state.currentFactionId,
        attackingUnits
      );

      if (!combat) {
        // Combat couldn't be initiated - restore units to source
        for (const move of attackingMoves) {
          const fromTerritory = this.state.territories.get(move.fromTerritoryId);
          if (fromTerritory) {
            fromTerritory.addUnits(move.unitTypeId, move.count);
          }
        }
        continue;
      }

      // Resolve combat rounds — retreat if badly outnumbered after round 2
      while (!combat.isComplete) {
        this.combatResolver.resolveCombatRound(combat);
        await this.delay(150);

        // Smart retreat: after round 2, bail if attacker strength < 40% of defender
        if (!combat.isComplete && combat.rounds.length >= 2) {
          const attackerUnits = combat.attackers.reduce((sum, a) => sum + (a.count - (a.casualties || 0)), 0);
          const defenderUnits = combat.defenders.reduce((sum, d) => sum + (d.count - (d.casualties || 0)), 0);
          if (defenderUnits > 0 && attackerUnits / defenderUnits < 0.4) {
            // Find adjacent friendly territory to retreat to
            const retreatTo = territory.adjacentTo.find(id => {
              const adj = this.state.territories.get(id);
              return adj?.owner === this.state.currentFactionId;
            });
            if (retreatTo) {
              this.combatResolver.processRetreat(combat, retreatTo);
              break;
            }
          }
        }
      }

      this.combatResolver.finalizeCombat(combat);
    }

    // Clear pending moves
    this.state.pendingMoves = [];
  }

  /**
   * Find territories with pending attacks
   */
  private findCombatTerritories(): string[] {
    const faction = this.state.getCurrentFaction();
    if (!faction) return [];

    const territories = new Set<string>();

    for (const move of this.state.pendingMoves) {
      const target = this.state.territories.get(move.toTerritoryId);
      if (target && ((!target.owner) || (target.owner && faction.isEnemyOf(target.owner)))) {
        territories.add(move.toTerritoryId);
      }
    }

    return Array.from(territories);
  }

  /**
   * Smart non-combat movement - reinforce threatened areas
   */
  private handleNonCombatMovePhase(
    evaluations: Map<string, TerritoryEvaluation>
  ): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    // Sort our territories by threat level (highest first)
    const ourTerritories = Array.from(evaluations.values())
      .filter((e) => e.territory.owner === faction.id)
      .sort((a, b) => b.threatLevel - a.threatLevel);

    // Find territories with excess units (low threat, high defense)
    const excessUnits: {
      territoryId: string;
      unitTypeId: string;
      count: number;
    }[] = [];

    for (const eval_ of ourTerritories) {
      // If defense greatly exceeds threat, we have excess
      if (
        eval_.defenseStrength > eval_.threatLevel * 2 &&
        eval_.threatLevel < 20
      ) {
        for (const pu of eval_.territory.units) {
          const unitType = this.state.unitRegistry.get(pu.unitTypeId);
          if (!unitType || unitType.domain !== "land") continue;

          // Keep at least 1-2 units for defense
          const excess = Math.max(0, pu.count - 2);
          if (excess > 0) {
            excessUnits.push({
              territoryId: eval_.territory.id,
              unitTypeId: pu.unitTypeId,
              count: excess,
            });
          }
        }
      }
    }

    // Move excess units toward threatened territories
    for (const threatened of ourTerritories) {
      if (threatened.threatLevel < 10) continue;
      if (threatened.defenseStrength > threatened.threatLevel * 1.5) continue;

      for (const excess of excessUnits) {
        if (excess.count <= 0) continue;

        const fromTerritory = this.state.territories.get(excess.territoryId);
        if (!fromTerritory) continue;

        // Find path to threatened territory
        const validMoves = this.movementValidator.getValidMoves(
          excess.unitTypeId,
          excess.territoryId,
          false
        );

        // Look for move toward threatened territory
        const moveToward = validMoves.find(
          (m) =>
            m.territoryId === threatened.territory.id ||
            threatened.territory.adjacentTo.includes(m.territoryId)
        );

        if (moveToward) {
          const availableCount = this.movementValidator.getAvailableUnits(
            excess.territoryId,
            excess.unitTypeId
          );

          const countToMove = Math.min(excess.count, availableCount);
          if (countToMove > 0) {
            const move: PendingMove = {
              unitTypeId: excess.unitTypeId,
              count: countToMove,
              fromTerritoryId: excess.territoryId,
              toTerritoryId: moveToward.territoryId,
              path: moveToward.path,
            };

            this.movementValidator.executeMove(move);
            excess.count -= countToMove;
          }
        }
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
