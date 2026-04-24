/**
 * CombatResolver - Handles dice-based combat resolution
 */

import { GameState } from "./GameState";
import { PlacedUnit } from "../data/Territory";
import { UnitType } from "../data/Unit";
import { SupplySystem } from "./SupplySystem";

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

export interface BombardmentResult {
  rolls: DiceRoll[];
  hits: number;
  casualties: CasualtySummary[];
}

export interface StrategicBombingResult {
  intercepted: boolean;
  bomberLosses: number;
  damageRolls: number[];
  totalDamage: number;
}

export class CombatResolver {
  private supplySystem: SupplySystem;

  constructor(private state: GameState) {
    this.supplySystem = new SupplySystem(state);
  }

  /**
   * Get faction combat bonuses based on their special abilities
   */
  private getFactionBonuses(factionId: string, isAttacker: boolean, territoryId: string): {
    attackBonus: number;
    defenseBonus: number;
    infantryAttackBonus: number;
    infantryDefenseBonus: number;
    navalAttackBonus: number;
    navalDefenseBonus: number;
    airAttackBonus: number;
    movementBonus: number;
    firstCasualtyIgnored: boolean;
  } {
    const faction = this.state.factionRegistry.get(factionId);
    const territory = this.state.territories.get(territoryId);
    const bonuses = {
      attackBonus: 0,
      defenseBonus: 0,
      infantryAttackBonus: 0,
      infantryDefenseBonus: 0,
      navalAttackBonus: 0,
      navalDefenseBonus: 0,
      airAttackBonus: 0,
      movementBonus: 0,
      firstCasualtyIgnored: false,
    };

    if (!faction) return bonuses;

    // Apply faction asymmetry bonuses from FactionBonus data
    const fb = faction.bonuses;
    if (fb) {
      if (fb.infantryDefenseBonus) bonuses.infantryDefenseBonus += fb.infantryDefenseBonus;
      if (fb.armorAttackBonus)     bonuses.attackBonus          += fb.armorAttackBonus;
      if (fb.navalAttackBonus)     bonuses.navalAttackBonus     += fb.navalAttackBonus;
      if (fb.movementBonus)        bonuses.movementBonus        += fb.movementBonus;
    }

    // Eastern Coalition: home territory defense bonus (distinctive faction trait)
    if (factionId === 'eastern_coalition' && !isAttacker && territory?.originalOwner === factionId) {
      bonuses.defenseBonus += 1;
    }

    // Southern Federation: First casualty ignored when defending owned territory
    if (!isAttacker && territory?.owner === factionId && (faction.bonuses?.unitCostDiscount ?? 0) > 0) {
      bonuses.firstCasualtyIgnored = true;
    }

    // Technology bonuses
    const techManager = this.state.systems.technologyManager;
    if (techManager) {
      const te = techManager.getTechEffect(factionId);
      bonuses.attackBonus           += te.attackBonus           ?? 0;
      bonuses.defenseBonus          += te.defenseBonus          ?? 0;
      bonuses.infantryDefenseBonus  += te.infantryDefenseBonus  ?? 0;
      bonuses.infantryAttackBonus   += te.infantryAttackBonus   ?? 0;
      bonuses.navalAttackBonus      += te.navalAttackBonus      ?? 0;
      bonuses.navalDefenseBonus     += te.navalDefenseBonus     ?? 0;
      bonuses.airAttackBonus        += te.airAttackBonus        ?? 0;
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

    // Terrain defense bonus from territory's natural terrain (all rounds)
    const territory = this.state.territories.get(combat.territoryId);
    const terrainBonus = territory?.defenseBonus ?? 0;

    // Capital/factory fortification bonus (first round only — defenders are prepared)
    const fortificationBonus = (roundNumber === 1 && territory && (territory.isCapital || territory.hasFactory)) ? 1 : 0;

    // Supply penalties: out-of-supply units fight at -1 attack/defense
    const attackerSourceId = combat.sourceTerritory ?? combat.territoryId;
    const attackerInSupply = this.supplySystem.isInSupply(attackerSourceId, combat.attackingFactionId);
    const defenderInSupply = this.supplySystem.isInSupply(combat.territoryId, combat.defendingFactionId);
    const attackerSupplyPenalty = attackerInSupply ? 0 : 1;
    const defenderSupplyPenalty = defenderInSupply ? 0 : 1;

    // Winter weather: -1 to all land unit attack/defense
    const isWinter = this.state.currentSeason === 'winter';

    // Get faction-specific bonuses
    const attackerBonuses = this.getFactionBonuses(combat.attackingFactionId, true, combat.territoryId);
    const defenderBonuses = this.getFactionBonuses(combat.defendingFactionId, false, combat.territoryId);

    // Morale modifier (war weariness penalty)
    const moraleSystem = this.state.systems.moraleSystem;
    if (moraleSystem) {
      attackerBonuses.attackBonus += moraleSystem.getCombatModifier?.(combat.attackingFactionId) ?? 0;
      defenderBonuses.defenseBonus += moraleSystem.getCombatModifier?.(combat.defendingFactionId) ?? 0;
    }

    // Commander bonuses: find commander in attacking/defending stacks
    const attackSource = combat.sourceTerritory ? this.state.territories.get(combat.sourceTerritory) : null;
    const defTerritory = this.state.territories.get(combat.territoryId);
    const atkCommander = attackSource?.units.find(u => u.commander)?.commander ?? null;
    const defCommander = defTerritory?.units.find(u => u.commander)?.commander ?? null;
    if (atkCommander) attackerBonuses.attackBonus += atkCommander.attackBonus;
    if (defCommander) defenderBonuses.defenseBonus += defCommander.defenseBonus;

    // Roll for attackers
    const attackerRolls: DiceRoll[] = [];
    let attackerHits = 0;

    const veteranBonus = 1; // +1 attack/defense for veterans

    // Artillery boost: count artillery to boost infantry attacks
    const artilleryCount = combat.attackers
      .filter(cu => cu.unitType.id === 'artillery')
      .reduce((sum, cu) => sum + (cu.count - cu.casualties), 0);
    let artilleryBoostsRemaining = artilleryCount;

    // Combined arms bonus: tanks + infantry together get +1 attack
    const hasTanks = combat.attackers.some(cu => cu.unitType.id === 'tank' && (cu.count - cu.casualties) > 0);
    const hasInfantry = combat.attackers.some(cu => cu.unitType.id === 'infantry' && (cu.count - cu.casualties) > 0);
    const combinedArmsBonus = (hasTanks && hasInfantry) ? 1 : 0;

    for (const cu of combat.attackers) {
      const activeCount = cu.count - cu.casualties;
      let attackValue = cu.unitType.attack + (cu.veteranCount && cu.veteranCount > 0 ? veteranBonus : 0);

      // Apply faction + tech attack bonuses
      attackValue += attackerBonuses.attackBonus;
      if (cu.unitType.id === 'infantry')    attackValue += attackerBonuses.infantryAttackBonus;
      if (cu.unitType.domain === 'air')     attackValue += attackerBonuses.airAttackBonus;
      if (cu.unitType.domain === 'sea')     attackValue += attackerBonuses.navalAttackBonus;

      // Combined arms bonus to tanks when infantry present
      if (cu.unitType.id === 'tank' && combinedArmsBonus > 0) {
        attackValue += combinedArmsBonus;
      }

      // Supply and weather penalties (land units only for weather)
      attackValue -= attackerSupplyPenalty;
      if (isWinter && cu.unitType.domain === 'land') {
        attackValue -= 1;
      }
      attackValue = Math.max(1, attackValue); // Always at least 1 chance to hit

      for (let i = 0; i < activeCount; i++) {
        // Artillery boost to infantry
        let unitAttack = attackValue;
        if (cu.unitType.id === 'infantry' && artilleryBoostsRemaining > 0) {
          unitAttack += 1;
          artilleryBoostsRemaining--;
        }

        const roll = this.rollDie(diceSides);
        const isHit = roll <= unitAttack;
        // Only powerful units (attack >= 3) can crit
        const isCritical = isHit && unitAttack >= 3 && this.isCriticalHit(roll);
        attackerRolls.push({
          unitTypeId: cu.unitType.id,
          unitName: cu.unitType.name,
          targetValue: unitAttack,
          roll,
          isHit,
          isCritical,
        });
        if (isHit) attackerHits += isCritical ? 2 : 1;
      }
    }

    // Roll for defenders (with terrain and faction bonuses)
    const defenderRolls: DiceRoll[] = [];
    let defenderHits = 0;

    for (const cu of combat.defenders) {
      const activeCount = cu.count - cu.casualties;
      let defenseValue = cu.unitType.defense
        + (cu.veteranCount && cu.veteranCount > 0 ? veteranBonus : 0)
        + terrainBonus
        + fortificationBonus;

      // Faction defense bonuses
      defenseValue += defenderBonuses.defenseBonus;

      // Infantry and naval defense bonuses (tech + faction)
      if (cu.unitType.id === 'infantry') {
        defenseValue += defenderBonuses.infantryDefenseBonus;
      }
      if (cu.unitType.domain === 'sea') {
        defenseValue += defenderBonuses.navalDefenseBonus;
      }

      // Supply and weather penalties
      defenseValue -= defenderSupplyPenalty;
      if (isWinter && cu.unitType.domain === 'land') {
        defenseValue -= 1;
      }
      defenseValue = Math.max(1, defenseValue);

      for (let i = 0; i < activeCount; i++) {
        const roll = this.rollDie(diceSides);
        const isHit = roll <= defenseValue;
        const isCritical = isHit && defenseValue >= 3 && this.isCriticalHit(roll);
        defenderRolls.push({
          unitTypeId: cu.unitType.id,
          unitName: cu.unitType.name,
          targetValue: defenseValue,
          roll,
          isHit,
          isCritical,
        });
        if (isHit) defenderHits += isCritical ? 2 : 1;
      }
    }

    // Apply Southern Federation special: first casualty ignored in owned territory
    let attackerHitsToApply = attackerHits;
    if (defenderBonuses.firstCasualtyIgnored && roundNumber === 1 && attackerHits > 0) {
      attackerHitsToApply = Math.max(0, attackerHits - 1);
    }

    // Apply casualties - cheapest units first
    const attackerCasualties = this.applyCasualties(combat.attackers, defenderHits);
    const defenderCasualties = this.applyCasualties(combat.defenders, attackerHitsToApply);

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
   * Naval pre-combat bombardment — naval units fire once before regular combat.
   * Defenders cannot fire back during bombardment.
   */
  performNavalBombardment(
    combat: CombatState,
    bombardingUnits: { unitType: UnitType; count: number }[]
  ): BombardmentResult {
    const diceSides = this.state.rules.diceSides;
    const rolls: DiceRoll[] = [];
    let hits = 0;

    for (const bu of bombardingUnits) {
      for (let i = 0; i < bu.count; i++) {
        const roll = this.rollDie(diceSides);
        const isHit = roll <= bu.unitType.attack;
        const isCritical = isHit && bu.unitType.attack >= 3 && this.isCriticalHit(roll);
        rolls.push({
          unitTypeId: bu.unitType.id,
          unitName: bu.unitType.name,
          targetValue: bu.unitType.attack,
          roll,
          isHit,
          isCritical,
        });
        if (isHit) hits += isCritical ? 2 : 1;
      }
    }

    // Apply bombardment hits to defenders — cheapest first
    const casualties = this.applyCasualties(combat.defenders, hits);

    this.state.emit("naval_bombardment", { combat, rolls, hits, casualties });

    return { rolls, hits, casualties };
  }

  /**
   * Strategic bombing mission — bombers attack a factory territory.
   * Anti-air guns intercept first (AA rolls 1d6 per bomber, hits on 1).
   * Each surviving bomber rolls 1d6 damage to the factory (bombedUntilTurn += rolls).
   */
  resolveStrategicBombing(
    territoryId: string,
    attackingFactionId: string,
    bomberCount: number,
    antiAirCount: number
  ): StrategicBombingResult {
    const territory = this.state.territories.get(territoryId);
    if (!territory || !territory.hasFactory) {
      return { intercepted: false, bomberLosses: 0, damageRolls: [], totalDamage: 0 };
    }

    // AA interception: each AA gun rolls 1d6, hits (kills a bomber) on a roll of 1
    let bomberLosses = 0;
    const aaRolls: number[] = [];
    for (let i = 0; i < antiAirCount && bomberCount > bomberLosses; i++) {
      const roll = this.rollDie(6);
      aaRolls.push(roll);
      if (roll === 1) {
        bomberLosses++;
      }
    }

    const survivingBombers = bomberCount - bomberLosses;
    const damageRolls: number[] = [];
    let totalDamage = 0;

    // Each surviving bomber rolls 1d6 damage
    for (let i = 0; i < survivingBombers; i++) {
      const damage = this.rollDie(6);
      damageRolls.push(damage);
      totalDamage += damage;
    }

    // Apply factory damage: disabled for (damage / 3) turns, minimum 1 if any damage
    if (totalDamage > 0) {
      const disabledTurns = Math.max(1, Math.floor(totalDamage / 3));
      territory.bombedUntilTurn = Math.max(
        territory.bombedUntilTurn,
        this.state.turnNumber + disabledTurns
      );
    }

    const intercepted = bomberLosses > 0;
    this.state.emit("strategic_bombing", {
      territoryId,
      attackingFactionId,
      bomberCount,
      bomberLosses,
      damageRolls,
      totalDamage,
      disabledUntilTurn: territory.bombedUntilTurn,
    });

    return { intercepted, bomberLosses, damageRolls, totalDamage };
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
      const defender = this.state.factionRegistry.get(combat.defendingFactionId);
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
