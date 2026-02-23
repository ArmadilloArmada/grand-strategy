/**
 * CombatResolver - Handles dice-based combat resolution
 */

import { GameState } from "./GameState";
import { PlacedUnit } from "../data/Territory";
import { UnitType } from "../data/Unit";

export interface CombatUnit {
  unitType: UnitType;
  count: number;
  hits: number;
  casualties: number;
  veteranCount?: number; // +1 attack/defense per veteran
}

export interface CombatRoundResult {
  round: number;
  attackerRolls: DiceRoll[];
  defenderRolls: DiceRoll[];
  attackerHits: number;
  defenderHits: number;
  attackerCriticals: number;
  defenderCriticals: number;
  attackerCasualties: CasualtySummary[];
  defenderCasualties: CasualtySummary[];
}

export interface DiceRoll {
  unitTypeId: string;
  unitName: string;
  targetValue: number; // Hits if roll <= this
  roll: number;
  isHit: boolean;
  isCritical: boolean; // Critical hit - deals double damage!
}

export interface CasualtySummary {
  unitTypeId: string;
  unitName: string;
  count: number;
}

export interface CombatState {
  territoryId: string;
  sourceTerritory?: string; // Where attackers came from
  attackingFactionId: string;
  defendingFactionId: string;
  attackers: CombatUnit[];
  defenders: CombatUnit[];
  rounds: CombatRoundResult[];
  isComplete: boolean;
  winner: "attacker" | "defender" | "draw" | null;
}

export class CombatResolver {
  constructor(private state: GameState) {}

  /**
   * Get faction combat bonuses based on their special abilities
   */
  private getFactionBonuses(factionId: string, isAttacker: boolean, territoryId: string): {
    attackBonus: number;
    defenseBonus: number;
    infantryDefenseBonus: number;
    movementBonus: number;
    firstCasualtyIgnored: boolean;
  } {
    const faction = this.state.factionRegistry.get(factionId);
    const territory = this.state.territories.get(territoryId);
    const bonuses = {
      attackBonus: 0,
      defenseBonus: 0,
      infantryDefenseBonus: 0,
      movementBonus: 0,
      firstCasualtyIgnored: false,
    };

    if (!faction) return bonuses;

    // Eastern Coalition: Infantry defend at +1, home territory bonus
    if (factionId === 'eastern_coalition') {
      bonuses.infantryDefenseBonus = 1;
      // Home territory defense bonus
      if (!isAttacker && territory?.originalOwner === factionId) {
        bonuses.defenseBonus = 1;
      }
    }

    // Pacific Union: Movement and blitz bonuses (handled elsewhere)
    if (factionId === 'pacific_union') {
      bonuses.movementBonus = 1;
    }

    // Southern Federation: First casualty ignored when defending owned territory
    if (factionId === 'southern_federation' && !isAttacker) {
      if (territory?.owner === factionId) {
        bonuses.firstCasualtyIgnored = true;
      }
    }

    return bonuses;
  }

  /**
   * Initialize combat in a territory
   */
  initiateCombat(
    territoryId: string,
    attackingFactionId: string,
    attackingUnits: PlacedUnit[]
  ): CombatState | null {
    const territory = this.state.territories.get(territoryId);
    if (!territory || !territory.owner) {
      return null;
    }

    const defendingFactionId = territory.owner;
    if (defendingFactionId === attackingFactionId) {
      return null; // Can't attack own territory
    }

    // Build attacker units (with veterancy bonus)
    const attackers: CombatUnit[] = [];
    for (const pu of attackingUnits) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType && unitType.canAttack()) {
        attackers.push({
          unitType,
          count: pu.count,
          hits: 0,
          casualties: 0,
          veteranCount: pu.veteranCount ?? 0,
        });
      }
    }

    // Build defender units (with veterancy bonus)
    const defenders: CombatUnit[] = [];
    for (const pu of territory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType && unitType.canDefend()) {
        defenders.push({
          unitType,
          count: pu.count,
          hits: 0,
          casualties: 0,
          veteranCount: pu.veteranCount ?? 0,
        });
      }
    }

    if (attackers.length === 0) {
      return null; // No attacking units
    }

    const combat: CombatState = {
      territoryId,
      attackingFactionId,
      defendingFactionId,
      attackers,
      defenders,
      rounds: [],
      isComplete: false,
      winner: null,
    };

    this.state.emit("combat_start", { combat });
    return combat;
  }

  /**
   * Roll dice for one round of combat
   */
  resolveCombatRound(combat: CombatState): CombatRoundResult {
    const diceSides = this.state.rules.diceSides;
    const roundNumber = combat.rounds.length + 1;
    
    // Terrain defense bonus (+1 defense in capitals/factories, first round only)
    const territory = this.state.territories.get(combat.territoryId);
    const terrainBonus = (roundNumber === 1 && territory && (territory.isCapital || territory.hasFactory)) ? 1 : 0;

    // Get faction-specific bonuses
    const attackerBonuses = this.getFactionBonuses(combat.attackingFactionId, true, combat.territoryId);
    const defenderBonuses = this.getFactionBonuses(combat.defendingFactionId, false, combat.territoryId);

    // Roll for attackers
    const attackerRolls: DiceRoll[] = [];
    let attackerHits = 0;

    const veteranBonus = 1; // +1 attack/defense for veterans
    
    // Artillery boost: count artillery to boost infantry attacks
    const artilleryCount = combat.attackers
      .filter(cu => cu.unitType.id === 'artillery')
      .reduce((sum, cu) => sum + (cu.count - cu.casualties), 0);
    let artilleryBoostsRemaining = artilleryCount;

    // Combined arms bonus: tanks + infantry together get +1 attack (combined arms)
    const hasTanks = combat.attackers.some(cu => cu.unitType.id === 'tank' && (cu.count - cu.casualties) > 0);
    const hasInfantry = combat.attackers.some(cu => cu.unitType.id === 'infantry' && (cu.count - cu.casualties) > 0);
    const combinedArmsBonus = (hasTanks && hasInfantry) ? 1 : 0;
    
    for (const cu of combat.attackers) {
      const activeCount = cu.count - cu.casualties;
      let attackValue = cu.unitType.attack + (cu.veteranCount && cu.veteranCount > 0 ? veteranBonus : 0);
      
      // Apply faction attack bonus (e.g., from events or special abilities)
      attackValue += attackerBonuses.attackBonus;
      
      // Apply combined arms bonus to tanks when infantry present
      if (cu.unitType.id === 'tank' && combinedArmsBonus > 0) {
        attackValue += combinedArmsBonus;
      }
      
      for (let i = 0; i < activeCount; i++) {
        // Apply artillery boost to infantry (1 infantry per artillery gets +1 attack)
        let unitAttack = attackValue;
        if (cu.unitType.id === 'infantry' && artilleryBoostsRemaining > 0) {
          unitAttack += 1;
          artilleryBoostsRemaining--;
        }
        
        const roll = this.rollDie(diceSides);
        const isHit = roll <= unitAttack;
        // Only powerful units (attack >= 3) can crit — stops lucky infantry one-shots
        const isCritical = isHit && unitAttack >= 3 && this.isCriticalHit(roll);
        attackerRolls.push({
          unitTypeId: cu.unitType.id,
          unitName: cu.unitType.name,
          targetValue: unitAttack,
          roll,
          isHit,
          isCritical,
        });
        // Critical hits count as 2 hits!
        if (isHit) attackerHits += isCritical ? 2 : 1;
      }
    }

    // Roll for defenders (with terrain bonus and faction bonuses)
    const defenderRolls: DiceRoll[] = [];
    let defenderHits = 0;

    for (const cu of combat.defenders) {
      const activeCount = cu.count - cu.casualties;
      let defenseValue = cu.unitType.defense + (cu.veteranCount && cu.veteranCount > 0 ? veteranBonus : 0) + terrainBonus;
      
      // Apply faction defense bonuses
      defenseValue += defenderBonuses.defenseBonus;
      
      // Eastern Coalition infantry defense bonus
      if (cu.unitType.id === 'infantry') {
        defenseValue += defenderBonuses.infantryDefenseBonus;
      }
      
      for (let i = 0; i < activeCount; i++) {
        const roll = this.rollDie(diceSides);
        const isHit = roll <= defenseValue;
        // Only powerful units (defense >= 3) can crit — stops lucky infantry one-shots
        const isCritical = isHit && defenseValue >= 3 && this.isCriticalHit(roll);
        defenderRolls.push({
          unitTypeId: cu.unitType.id,
          unitName: cu.unitType.name,
          targetValue: defenseValue,
          roll,
          isHit,
          isCritical,
        });
        // Critical hits count as 2 hits!
        if (isHit) defenderHits += isCritical ? 2 : 1;
      }
    }

    // Apply Southern Federation special: first casualty ignored in owned territory
    let attackerHitsToApply = attackerHits;
    if (defenderBonuses.firstCasualtyIgnored && roundNumber === 1 && attackerHits > 0) {
      attackerHitsToApply = Math.max(0, attackerHits - 1);
    }

    // Apply casualties - cheapest units first
    const attackerCasualties = this.applyCasualties(
      combat.attackers,
      defenderHits
    );
    const defenderCasualties = this.applyCasualties(
      combat.defenders,
      attackerHitsToApply
    );

    // Count critical hits
    const attackerCriticals = attackerRolls.filter(r => r.isCritical).length;
    const defenderCriticals = defenderRolls.filter(r => r.isCritical).length;
    
    const result: CombatRoundResult = {
      round: roundNumber,
      attackerRolls,
      defenderRolls,
      attackerHits,
      defenderHits,
      attackerCriticals,
      defenderCriticals,
      attackerCasualties,
      defenderCasualties,
    };

    combat.rounds.push(result);

    // Check if combat is complete
    const attackersRemaining = this.getActiveUnitCount(combat.attackers);
    const defendersRemaining = this.getActiveUnitCount(combat.defenders);

    if (attackersRemaining === 0 && defendersRemaining === 0) {
      combat.isComplete = true;
      combat.winner = "draw";
    } else if (attackersRemaining === 0) {
      combat.isComplete = true;
      combat.winner = "defender";
    } else if (defendersRemaining === 0) {
      combat.isComplete = true;
      combat.winner = "attacker";
    }

    // Check max rounds
    const maxRounds = this.state.rules.maxCombatRounds;
    if (maxRounds > 0 && roundNumber >= maxRounds && !combat.isComplete) {
      combat.isComplete = true;
      combat.winner = "defender"; // Defender holds if max rounds reached
    }

    this.state.emit("combat_round", { combat, result });

    return result;
  }

  /**
   * Finalize combat and update territory ownership
   */
  finalizeCombat(combat: CombatState): void {
    const territory = this.state.territories.get(combat.territoryId);
    if (!territory) return;

    if (combat.winner === "attacker") {
      // Transfer ownership
      territory.owner = combat.attackingFactionId;

      // Update territory units to surviving attackers (veterans: +1 attack/defense next battle)
      territory.units = [];
      for (const cu of combat.attackers) {
        const surviving = cu.count - cu.casualties;
        if (surviving > 0) {
          const existing = territory.units.find(u => u.unitTypeId === cu.unitType.id);
          if (existing) {
            existing.count += surviving;
            existing.veteranCount = (existing.veteranCount ?? 0) + surviving;
          } else {
            territory.units.push({ unitTypeId: cu.unitType.id, count: surviving, veteranCount: surviving });
          }
        }
      }

      // Check if capital was captured
      const defender = this.state.factionRegistry.get(
        combat.defendingFactionId
      );
      if (defender && defender.capital === combat.territoryId) {
        defender.defeat();
        this.state.emit("faction_defeated", { factionId: defender.id });
      }
    } else {
      // Defender holds - update surviving defenders (veterans)
      territory.units = [];
      for (const cu of combat.defenders) {
        const surviving = cu.count - cu.casualties;
        if (surviving > 0) {
          const existing = territory.units.find(u => u.unitTypeId === cu.unitType.id);
          if (existing) {
            existing.count += surviving;
            existing.veteranCount = (existing.veteranCount ?? 0) + surviving;
          } else {
            territory.units.push({ unitTypeId: cu.unitType.id, count: surviving, veteranCount: surviving });
          }
        }
      }
    }

    this.state.emit("combat_end", { combat });
  }

  /**
   * Roll a single die
   */
  private rollDie(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }
  
  /**
   * Check if a roll is a critical hit (natural 1 = critical!)
   */
  private isCriticalHit(roll: number): boolean {
    return roll === 1;
  }

  /**
   * Apply casualties to units (cheapest first)
   */
  private applyCasualties(
    units: CombatUnit[],
    hits: number
  ): CasualtySummary[] {
    const summaries: CasualtySummary[] = [];
    let remainingHits = hits;

    // Sort by cost (cheapest first for casualties)
    const sorted = [...units].sort((a, b) => a.unitType.cost - b.unitType.cost);

    for (const cu of sorted) {
      if (remainingHits <= 0) break;

      const activeCount = cu.count - cu.casualties;
      const toKill = Math.min(activeCount, remainingHits);

      if (toKill > 0) {
        cu.casualties += toKill;
        remainingHits -= toKill;
        summaries.push({
          unitTypeId: cu.unitType.id,
          unitName: cu.unitType.name,
          count: toKill,
        });
      }
    }

    return summaries;
  }

  /**
   * Get count of active (non-casualty) units
   */
  private getActiveUnitCount(units: CombatUnit[]): number {
    return units.reduce((sum, cu) => sum + (cu.count - cu.casualties), 0);
  }

  /**
   * Check if attacker can retreat
   */
  canRetreat(combat: CombatState): boolean {
    if (!this.state.rules.attackerRetreatAllowed) return false;
    if (combat.rounds.length === 0) return false; // Must fight at least one round
    if (combat.isComplete) return false;
    return true;
  }

  /**
   * Process retreat
   */
  processRetreat(combat: CombatState, retreatToTerritoryId: string): boolean {
    if (!this.canRetreat(combat)) return false;

    const retreatTerritory = this.state.territories.get(retreatToTerritoryId);
    if (!retreatTerritory) return false;

    // Must retreat to friendly adjacent territory
    const combatTerritory = this.state.territories.get(combat.territoryId);
    if (!combatTerritory?.isAdjacentTo(retreatToTerritoryId)) return false;
    if (retreatTerritory.owner !== combat.attackingFactionId) return false;

    // Move surviving attackers to retreat territory
    for (const cu of combat.attackers) {
      const surviving = cu.count - cu.casualties;
      if (surviving > 0) {
        retreatTerritory.addUnits(cu.unitType.id, surviving);
      }
    }

    combat.isComplete = true;
    combat.winner = "defender";

    this.state.emit("combat_end", { combat, retreated: true });
    return true;
  }
}
