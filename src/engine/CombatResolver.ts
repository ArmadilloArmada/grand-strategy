/**
 * CombatResolver - Handles dice-based combat resolution
 */

import { GameState } from "./GameState";
import { PlacedUnit } from "../data/Territory";
import { UnitType } from "../data/Unit";
import { SupplySystem } from "./SupplySystem";
import { getCommanderCombatBonuses, processBattleXP, BattleXPOutcome } from "./CommanderProgression";
import {
  getFleetCompositionBonus,
  getNavalAttackCounterBonus,
  getNavalDefenseCounterBonus,
  collectOffshoreNavalDefenders,
  canUnitEngageTarget,
  getLandAntiNavalAttack,
  getLandAntiNavalDefense,
  getShoreBombardmentTargets,
  collectShoreBombardmentForCombat,
  collectCoastalArtilleryBarrage,
  canSubmarinesSurpriseStrike,
} from "./NavalSystem";
import { spawnUnitsOnTerritory } from './navalPlacement';

export interface CombatUnit {
  unitType: UnitType;
  count: number;
  hits: number;
  casualties: number;
  /** Multi-HP units (battleships, carriers) absorb one hit before sinking. */
  damagedCount?: number;
  veteranCount?: number; // +1 attack/defense per veteran
  batteredUntilTurn?: number; // -1 attack while battered (from retreat)
  /** Sea stacks fighting from an adjacent zone (not the battle tile). */
  stationedTerritoryId?: string;
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
  /** +1 attack bonus when attackers converge from multiple territories */
  flankingBonus?: number;
  /** Shore / land barrage — attackers stay on the source tile */
  rangedStrike?: boolean;
  coastalStrike?: boolean;
  /** Ranged-only combat — no territory capture even if defenders are eliminated */
  stayInPlace?: boolean;
  /** Set when combat was resolved on the tactical grid instead of auto-battle */
  resolvedTactically?: boolean;
  /** Tactical win with no attacker casualties — boosts morale on strategic map */
  tacticalCleanWin?: boolean;
}

export interface BombardmentResult {
  rolls: DiceRoll[];
  hits: number;
  casualties: CasualtySummary[];
}

export interface PreCombatPhaseResult {
  shoreBombardment?: BombardmentResult;
  coastalArtillery?: BombardmentResult;
  submarineStrike?: BombardmentResult;
  airIntercept?: { hits: number };
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

    // Home-defense trait: any faction with an infantry defense specialty gets
    // +1 while defending its original territory (avoids hardcoding faction IDs).
    if ((faction.bonuses?.infantryDefenseBonus ?? 0) > 0 && !isAttacker && territory?.originalOwner === factionId) {
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
    attackingUnits: PlacedUnit[],
    sourceTerritoryId?: string,
    options?: { stayInPlace?: boolean },
  ): CombatState | null {
    const territory = this.state.territories.get(territoryId);
    if (!territory || !territory.owner) {
      return null;
    }

    const defendingFactionId = territory.owner;
    if (defendingFactionId === attackingFactionId) {
      return null; // Can't attack own territory
    }

    const sourceTerritory = sourceTerritoryId
      ? this.state.territories.get(sourceTerritoryId)
      : null;

    // Build attacker units (with veterancy bonus and battered status)
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
          batteredUntilTurn: pu.batteredUntilTurn ?? 0,
          stationedTerritoryId: unitType.domain === 'sea' && sourceTerritory?.type === 'sea'
            ? sourceTerritory.id
            : undefined,
        });
      }
    }

    // Build defender units on the battle tile (land/air only — ships belong in sea zones)
    const defenders: CombatUnit[] = [];
    for (const pu of territory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (!unitType || !unitType.canDefend()) continue;
      if (unitType.domain === 'sea' && territory.type !== 'sea') continue;
      defenders.push({
        unitType,
        count: pu.count,
        hits: 0,
        casualties: 0,
        veteranCount: pu.veteranCount ?? 0,
      });
    }

    // Offshore fleet support for land/coastal battles
    if (territory.type !== 'sea') {
      for (const offshore of collectOffshoreNavalDefenders(this.state, territoryId, defendingFactionId)) {
        const existing = defenders.find(
          d => d.unitType.id === offshore.unitType.id && d.stationedTerritoryId === offshore.stationedTerritoryId,
        );
        if (existing) {
          existing.count += offshore.count;
        } else {
          defenders.push({
            unitType: offshore.unitType,
            count: offshore.count,
            hits: 0,
            casualties: 0,
            stationedTerritoryId: offshore.stationedTerritoryId,
          });
        }
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
      flankingBonus: 0,
      sourceTerritory: sourceTerritoryId,
      stayInPlace: options?.stayInPlace ?? false,
    };

    this.state.emit("combat_start", { combat });
    return combat;
  }

  /**
   * Bonus attack when an attacker type hard-counters the defenders present.
   */
  private getCounterBonus(attackerTypeId: string, defenders: CombatUnit[]): number {
    const defIds = new Set(defenders.filter(cu => cu.count > cu.casualties).map(cu => cu.unitType.id));
    const hasAir = defenders.some(cu => cu.unitType.domain === 'air' && cu.count > cu.casualties);
    if (attackerTypeId === 'fighter' && defIds.has('bomber')) return 2;
    if (attackerTypeId === 'tank' && defIds.has('artillery') && !hasAir) return 1;
    const navalBonus = getNavalAttackCounterBonus(attackerTypeId, defenders);
    if (navalBonus > 0) return navalBonus;
    return 0;
  }

  private getDefenderCounterBonus(defenderTypeId: string, attackers: CombatUnit[]): number {
    const hasAir = attackers.some(cu => cu.unitType.domain === 'air' && cu.count > cu.casualties);
    const atkIds = new Set(attackers.filter(cu => cu.count > cu.casualties).map(cu => cu.unitType.id));
    if (defenderTypeId === 'anti_air' && hasAir) return 2;
    if (defenderTypeId === 'fighter' && atkIds.has('bomber')) return 1;
    const navalBonus = getNavalDefenseCounterBonus(defenderTypeId, attackers);
    if (navalBonus > 0) return navalBonus;
    return 0;
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

    // Fortification defense bonus — built structures stack on top of terrain
    const builtFortBonus = this.state.systems.fortificationSystem?.getDefenseBonus(combat.territoryId) ?? 0;
    // Built-in capital/factory prep bonus (round 1 only) when no player-built fortification
    const prepBonus = (roundNumber === 1 && builtFortBonus === 0 && territory && (territory.isCapital || territory.hasFactory)) ? 1 : 0;
    const fortificationBonus = builtFortBonus + prepBonus;

    // Supply penalties: out-of-supply units fight at -1 attack/defense
    const attackerSourceId = combat.sourceTerritory ?? combat.territoryId;
    const attackerInSupply = this.supplySystem.isInSupply(attackerSourceId, combat.attackingFactionId);
    const defenderInSupply = this.supplySystem.isInSupply(combat.territoryId, combat.defendingFactionId);
    const attackerSupplyPenalty = attackerInSupply ? 0 : 1;
    const defenderSupplyPenalty = defenderInSupply ? 0 : 1;

    // Weather modifiers — replaces the old isWinter boolean check
    const terrain = territory?.terrain ?? 'plains';
    const weatherSystem = this.state.systems.weatherSystem;
    const weather = weatherSystem
      ? weatherSystem.getWeatherModifiers(terrain)
      : { landAttackMod: this.state.currentSeason === 'winter' ? -1 : 0, landDefenseMod: this.state.currentSeason === 'winter' ? -1 : 0, airAttackMod: 0, airGrounded: false, movementPenalty: 0, supplyDisrupted: false, terrainDefenseBonus: 0 };

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

    const atkActiveCount = combat.attackers.reduce((s, cu) => s + (cu.count - cu.casualties), 0);
    const defActiveCount = combat.defenders.reduce((s, cu) => s + (cu.count - cu.casualties), 0);

    const atkCmdBonuses = atkCommander
      ? getCommanderCombatBonuses(atkCommander, atkActiveCount, roundNumber)
      : null;
    const defCmdBonuses = defCommander
      ? getCommanderCombatBonuses(defCommander, defActiveCount, roundNumber)
      : null;

    if (atkCmdBonuses) {
      attackerBonuses.attackBonus  += atkCmdBonuses.attackBonus + atkCmdBonuses.round1AttackBonus;
      attackerBonuses.defenseBonus += atkCmdBonuses.defenseBonus;
      attackerBonuses.airAttackBonus += atkCmdBonuses.airAttackBonus;
    }
    if (defCmdBonuses) {
      defenderBonuses.defenseBonus += defCmdBonuses.defenseBonus + defCmdBonuses.lastStandDefenseBonus;
      defenderBonuses.attackBonus  += defCmdBonuses.attackBonus;
      defenderBonuses.airAttackBonus += defCmdBonuses.airAttackBonus;
    }

    const attackerFleetBonus = getFleetCompositionBonus(combat.attackers);
    const defenderFleetBonus = getFleetCompositionBonus(combat.defenders);
    attackerBonuses.attackBonus += attackerFleetBonus.attack;
    defenderBonuses.defenseBonus += defenderFleetBonus.defense;
    defenderBonuses.attackBonus += defenderFleetBonus.attack;

    // Roll for attackers
    const attackerRolls: DiceRoll[] = [];
    let attackerHits = 0;

    // Veteran bonus: 1 normally, 2 if commander has veteran_eye trait
    const veteranBonus = (atkCmdBonuses?.veteranMultiplier ?? 1);

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
      if (activeCount <= 0) continue;

      const engageableDefenders = combat.defenders.filter(
        def => def.count > def.casualties && canUnitEngageTarget(cu.unitType, def.unitType),
      );
      if (engageableDefenders.length === 0) continue;

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

      // Flanking bonus: attackers converging from multiple territories
      attackValue += combat.flankingBonus ?? 0;

      // Battered penalty: unit retreated last turn, still recovering
      if (cu.batteredUntilTurn && cu.batteredUntilTurn > this.state.turnNumber) {
        attackValue = Math.max(1, attackValue - 1);
      }

      // Counter bonus: unit type hard-counters specific defender types
      attackValue += this.getCounterBonus(cu.unitType.id, combat.defenders);

      // Battle attrition: units that have lost >40% of their stack fight less effectively
      if (cu.casualties > cu.count * 0.4) attackValue = Math.max(1, attackValue - 1);

      // Supply penalty (waived if commander has supply_master)
      if (!(atkCmdBonuses?.ignoreSupplyPenalty) && !weather.supplyDisrupted) {
        attackValue -= attackerSupplyPenalty;
      } else if (weather.supplyDisrupted && !(atkCmdBonuses?.ignoreSupplyPenalty)) {
        attackValue -= 1; // weather supply disruption always applies if no supply_master
      }
      // Weather penalties for land / air units
      if (cu.unitType.domain === 'land') attackValue += weather.landAttackMod;
      if (cu.unitType.domain === 'air')  attackValue += weather.airAttackMod;
      if (cu.unitType.domain === 'land' && engageableDefenders.every(d => d.unitType.domain === 'sea')) {
        attackValue = getLandAntiNavalAttack(cu.unitType, attackValue);
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
      if (activeCount <= 0) continue;

      const engageableAttackers = combat.attackers.filter(
        atk => atk.count > atk.casualties && canUnitEngageTarget(cu.unitType, atk.unitType),
      );
      if (engageableAttackers.length === 0) continue;

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

      // Counter bonus: defender type hard-counters specific attacker types
      defenseValue += this.getDefenderCounterBonus(cu.unitType.id, combat.attackers);

      // Battle attrition: heavily-hit defenders fight less effectively
      if (cu.casualties > cu.count * 0.4) defenseValue = Math.max(1, defenseValue - 1);

      // Weather terrain defense bonus (rain/storm benefits defenders in forests, etc.)
      defenseValue += weather.terrainDefenseBonus;

      // Supply penalty (waived if commander has supply_master)
      if (!(defCmdBonuses?.ignoreSupplyPenalty) && !weather.supplyDisrupted) {
        defenseValue -= defenderSupplyPenalty;
      } else if (weather.supplyDisrupted && !(defCmdBonuses?.ignoreSupplyPenalty)) {
        defenseValue -= 1;
      }
      // Weather penalties for land / air units
      if (cu.unitType.domain === 'land') defenseValue += weather.landDefenseMod;
      if (cu.unitType.domain === 'air')  defenseValue += weather.airAttackMod;
      if (cu.unitType.domain === 'land' && engageableAttackers.every(a => a.unitType.domain === 'sea')) {
        defenseValue = getLandAntiNavalDefense(cu.unitType, defenseValue);
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
   * Submarine first strike — fires before regular combat when no enemy ASW escort.
   */
  performSubmarineStrike(combat: CombatState): BombardmentResult {
    const diceSides = this.state.rules.diceSides;
    const rolls: DiceRoll[] = [];
    let hits = 0;

    const subs = combat.attackers.filter(
      cu => cu.unitType.id === 'submarine' && cu.count > cu.casualties,
    );
    if (subs.length === 0) {
      return { rolls, hits, casualties: [] };
    }

    for (const cu of subs) {
      const activeCount = cu.count - cu.casualties;
      const attackValue = cu.unitType.attack + 1; // surprise strike bonus
      for (let i = 0; i < activeCount; i++) {
        const roll = this.rollDie(diceSides);
        const isHit = roll <= attackValue;
        const isCritical = isHit && attackValue >= 3 && this.isCriticalHit(roll);
        rolls.push({
          unitTypeId: cu.unitType.id,
          unitName: cu.unitType.name,
          targetValue: attackValue,
          roll,
          isHit,
          isCritical,
        });
        if (isHit) hits += isCritical ? 2 : 1;
      }
    }

    const casualties = this.applyCasualties(combat.defenders, hits);
    this.state.emit('naval_bombardment', {
      combat,
      rolls,
      hits,
      casualties,
      strikeType: 'submarine',
    });

    return { rolls, hits, casualties };
  }

  /**
   * Opening phases before round 1: shore bombardment, coastal artillery, subs, air intercept.
   * Uses the same cross-domain rules as tactical battles.
   */
  runPreCombatPhases(combat: CombatState): PreCombatPhaseResult {
    const result: PreCombatPhaseResult = {};
    const territory = this.state.territories.get(combat.territoryId);
    if (!territory) return result;

    if (territory.type !== 'sea') {
      const bombarding = collectShoreBombardmentForCombat(this.state, combat, combat.territoryId);
      if (bombarding.length > 0) {
        result.shoreBombardment = this.performNavalBombardment(combat, bombarding);
      }
    } else {
      const barrage = collectCoastalArtilleryBarrage(combat);
      if (barrage.length > 0) {
        result.coastalArtillery = this.performCoastalArtilleryBarrage(combat, barrage);
      }
    }

    if (canSubmarinesSurpriseStrike(combat)) {
      result.submarineStrike = this.performSubmarineStrike(combat);
    }

    const interceptResult = this.performFighterIntercept(combat);
    if (interceptResult.hits > 0) {
      result.airIntercept = { hits: interceptResult.hits };
    }

    return result;
  }

  /**
   * Naval pre-combat bombardment — naval units fire once before regular combat.
   * Defenders cannot fire back during bombardment.
   */
  performNavalBombardment(
    combat: CombatState,
    bombardingUnits: { unitType: UnitType; count: number }[],
    targetDefenders?: CombatUnit[],
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

    const territory = this.state.territories.get(combat.territoryId);
    const bombardmentTargets = targetDefenders
      ?? getShoreBombardmentTargets(combat, territory?.type ?? 'land');

    const casualties = bombardmentTargets.length > 0
      ? this.applyCasualties(bombardmentTargets, hits)
      : [];

    this.state.emit("naval_bombardment", { combat, rolls, hits, casualties });

    return { rolls, hits, casualties };
  }

  /**
   * Coastal artillery opens on an offshore fleet before regular combat rounds.
   * Defenders cannot return fire during the barrage.
   */
  performCoastalArtilleryBarrage(
    combat: CombatState,
    barrageUnits: { unitType: UnitType; count: number }[],
  ): BombardmentResult {
    const diceSides = this.state.rules.diceSides;
    const rolls: DiceRoll[] = [];
    let hits = 0;

    for (const bu of barrageUnits) {
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

    const navalTargets = combat.defenders.filter(
      d => d.unitType.domain === 'sea' && d.count > d.casualties,
    );
    const casualties = navalTargets.length > 0
      ? this.applyCasualties(navalTargets, hits)
      : [];

    this.state.emit('naval_bombardment', { combat, rolls, hits, casualties, strikeType: 'artillery' });

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

    const landFallbackId = combat.sourceTerritory ?? combat.territoryId;

    if (combat.winner === "attacker") {
      if (combat.stayInPlace) {
        territory.units = [];
        for (const cu of combat.defenders) {
          const surviving = cu.count - cu.casualties;
          if (cu.stationedTerritoryId || cu.unitType.domain === 'sea') {
            this.syncNavalCombatStack(cu, combat.defendingFactionId, landFallbackId);
            continue;
          }
          if (surviving > 0) {
            this.pushSurvivorToTerritory(territory, cu, surviving);
          }
        }
      } else {
      // Record history before changing owner
      this.state.recordOwnershipChange(territory.id, territory.owner, this.state.turnNumber);
      // Degrade fortification on capture (blasted through or partially inherited)
      this.state.systems.fortificationSystem?.onCapture(territory.id);
      // Transfer ownership
      territory.owner = combat.attackingFactionId;

      // Clear land garrison; offshore fleets sync via syncNavalCombatStack
      territory.units = [];
      for (const cu of combat.defenders) {
        this.syncNavalCombatStack(cu, combat.defendingFactionId, landFallbackId);
      }

      for (const cu of combat.attackers) {
        const surviving = cu.count - cu.casualties;
        if (surviving <= 0) continue;
        if (cu.unitType.domain === 'sea') {
          spawnUnitsOnTerritory(
            this.state,
            combat.attackingFactionId,
            landFallbackId,
            cu.unitType.id,
            surviving,
          );
          continue;
        }
        this.pushSurvivorToTerritory(territory, cu, surviving);
      }

      // Check if capital was captured
      const defender = this.state.factionRegistry.get(combat.defendingFactionId);
      if (defender && defender.capital === combat.territoryId) {
        defender.defeat();
        this.state.emit("faction_defeated", { factionId: defender.id });
      }
      }
    } else {
      // Defender holds — land units on tile, fleets in adjacent sea zones
      territory.units = [];
      for (const cu of combat.defenders) {
        const surviving = cu.count - cu.casualties;
        if (cu.stationedTerritoryId || cu.unitType.domain === 'sea') {
          this.syncNavalCombatStack(cu, combat.defendingFactionId, combat.territoryId);
          continue;
        }
        if (surviving > 0) {
          this.pushSurvivorToTerritory(territory, cu, surviving);
        }
      }
    }

    // Record casualties in morale system so war weariness reflects actual losses
    const moraleSystem = this.state.systems.moraleSystem;
    if (moraleSystem?.recordCasualties) {
      const atkCasualties = combat.attackers.reduce((s, cu) => s + cu.casualties, 0);
      const defCasualties = combat.defenders.reduce((s, cu) => s + cu.casualties, 0);
      moraleSystem.recordCasualties(combat.attackingFactionId, atkCasualties);
      moraleSystem.recordCasualties(combat.defendingFactionId, defCasualties);
    }

    // Commander XP awards
    const playerFactionIds = this.state.systems.commanderProgression?.playerFactionIds ?? [];
    const atkSrc = combat.sourceTerritory ? this.state.territories.get(combat.sourceTerritory) : null;
    const defTer = this.state.territories.get(combat.territoryId);
    const atkCmd = atkSrc?.units.find(u => u.commander)?.commander ?? null;
    const defCmd = defTer?.units.find(u => u.commander)?.commander ?? null;

    const xpOutcome: BattleXPOutcome = processBattleXP(combat, atkCmd, defCmd, playerFactionIds);

    // If a commander died, remove them from their stack
    if (xpOutcome.attackerResult?.commanderDied && atkSrc) {
      for (const unit of atkSrc.units) delete unit.commander;
    }
    if (xpOutcome.defenderResult?.commanderDied && defTer) {
      for (const unit of defTer.units) delete unit.commander;
    }

    this.state.emit("combat_end", { combat, xpOutcome, attackerCommander: atkCmd, defenderCommander: defCmd });
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
   * Apply casualties to units (cheapest first). Multi-HP ships absorb one hit as damage.
   */
  private pushSurvivorToTerritory(
    territory: import('../data/Territory').Territory,
    cu: CombatUnit,
    surviving: number,
  ): void {
    const existing = territory.units.find(u => u.unitTypeId === cu.unitType.id);
    if (existing) {
      existing.count += surviving;
      existing.veteranCount = (existing.veteranCount ?? 0) + surviving;
    } else {
      territory.units.push({ unitTypeId: cu.unitType.id, count: surviving, veteranCount: surviving });
    }
  }

  /** Sync offshore (or misplaced) naval stacks after combat — removes combat pool, writes survivors. */
  private syncNavalCombatStack(cu: CombatUnit, factionId: string, fallbackTerritoryId: string): void {
    const surviving = cu.count - cu.casualties;
    const seaId = cu.stationedTerritoryId;

    if (seaId) {
      const sea = this.state.territories.get(seaId);
      if (sea) {
        sea.removeUnits(cu.unitType.id, cu.count);
        if (surviving > 0) {
          sea.addUnits(cu.unitType.id, surviving);
          const stack = sea.units.find(u => u.unitTypeId === cu.unitType.id);
          if (stack) stack.veteranCount = (stack.veteranCount ?? 0) + surviving;
        }
      }
      return;
    }

    if (cu.unitType.domain === 'sea' && surviving > 0) {
      spawnUnitsOnTerritory(this.state, factionId, fallbackTerritoryId, cu.unitType.id, surviving);
    }
  }

  private applyCasualties(
    units: CombatUnit[],
    hits: number
  ): CasualtySummary[] {
    const summaries: CasualtySummary[] = [];
    let remainingHits = hits;
    const sorted = [...units].sort((a, b) => a.unitType.cost - b.unitType.cost);

    const recordKill = (cu: CombatUnit) => {
      const existing = summaries.find(s => s.unitTypeId === cu.unitType.id);
      if (existing) existing.count += 1;
      else summaries.push({ unitTypeId: cu.unitType.id, unitName: cu.unitType.name, count: 1 });
    };

    for (const cu of sorted) {
      if (remainingHits <= 0) break;
      cu.damagedCount = cu.damagedCount ?? 0;
      const hp = Math.max(1, cu.unitType.hitPoints);

      while (remainingHits > 0 && cu.damagedCount > 0) {
        cu.damagedCount -= 1;
        cu.casualties += 1;
        remainingHits -= 1;
        recordKill(cu);
      }

      let activeUndamaged = cu.count - cu.casualties - cu.damagedCount;
      while (remainingHits > 0 && activeUndamaged > 0) {
        if (hp > 1) {
          cu.damagedCount += 1;
        } else {
          cu.casualties += 1;
          recordKill(cu);
        }
        activeUndamaged -= 1;
        remainingHits -= 1;
      }
    }

    return summaries;
  }

  /**
   * Get count of active (non-casualty) units
   */
  private getActiveUnitCount(units: CombatUnit[]): number {
    return units.reduce(
      (sum, cu) => sum + (cu.count - cu.casualties - (cu.damagedCount ?? 0)),
      0,
    );
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
   * Air superiority interception: defending fighters fire at attacking air units
   * before round 1. Each fighter rolls at its attack value; hits kill bombers first.
   * This represents defensive air patrols contesting enemy air incursions.
   */
  performFighterIntercept(combat: CombatState): BombardmentResult {
    const diceSides = this.state.rules.diceSides;
    const rolls: DiceRoll[] = [];
    let hits = 0;

    // Only defending fighters intercept
    const interceptors = combat.defenders.filter(cu => cu.unitType.id === 'fighter');
    // Only air attackers are targeted
    const airAttackers = combat.attackers.filter(cu => cu.unitType.domain === 'air');
    if (interceptors.length === 0 || airAttackers.length === 0) {
      return { rolls, hits, casualties: [] };
    }

    for (const cu of interceptors) {
      const active = cu.count - cu.casualties;
      for (let i = 0; i < active; i++) {
        const roll = this.rollDie(diceSides);
        const isHit = roll <= cu.unitType.attack;
        const isCritical = isHit && cu.unitType.attack >= 3 && this.isCriticalHit(roll);
        rolls.push({
          unitTypeId: cu.unitType.id,
          unitName: cu.unitType.name,
          targetValue: cu.unitType.attack,
          roll,
          isHit,
          isCritical,
        });
        if (isHit) hits += isCritical ? 2 : 1;
      }
    }

    // Apply hits only to air attacking units (bombers first, then fighters)
    const airUnitsForCasualties = [...airAttackers].sort((a, b) => a.unitType.cost - b.unitType.cost);
    const casualties = this.applyCasualties(airUnitsForCasualties, hits);
    // Propagate casualties back to the original combat.attackers
    for (const c of casualties) {
      const src = combat.attackers.find(cu => cu.unitType.id === c.unitTypeId);
      if (src) src.casualties += c.count;
    }

    return { rolls, hits, casualties };
  }

  /**
   * Process retreat — surviving attackers fall back to a friendly adjacent territory.
   * Defenders get one free "pursuit" salvo before the retreaters escape.
   * Retreating units are marked battered for the next turn (-1 attack).
   */
  processRetreat(combat: CombatState, retreatToTerritoryId: string): boolean {
    if (!this.canRetreat(combat)) return false;

    const retreatTerritory = this.state.territories.get(retreatToTerritoryId);
    if (!retreatTerritory) return false;

    // Must retreat to friendly adjacent territory
    const combatTerritory = this.state.territories.get(combat.territoryId);
    if (!combatTerritory?.isAdjacentTo(retreatToTerritoryId)) return false;
    if (retreatTerritory.owner !== combat.attackingFactionId) return false;

    // Pursuit fire: each surviving defender rolls once at their attack value
    const diceSides = this.state.rules.diceSides;
    let pursuitHits = 0;
    for (const cu of combat.defenders) {
      const active = cu.count - cu.casualties;
      for (let i = 0; i < active; i++) {
        const roll = this.rollDie(diceSides);
        if (roll <= cu.unitType.attack) pursuitHits++;
      }
    }
    // Apply pursuit hits to retreating attackers (cheapest first)
    if (pursuitHits > 0) this.applyCasualties(combat.attackers, pursuitHits);

    const nextTurn = this.state.turnNumber + 1;

    // Move surviving attackers to retreat territory, marking them battered
    for (const cu of combat.attackers) {
      const surviving = cu.count - cu.casualties;
      if (surviving > 0) {
        retreatTerritory.addUnits(cu.unitType.id, surviving);
        // Mark the newly added stack as battered
        const stack = retreatTerritory.units.find(u => u.unitTypeId === cu.unitType.id);
        if (stack) stack.batteredUntilTurn = nextTurn;
      }
    }

    combat.isComplete = true;
    combat.winner = "defender";

    this.state.emit("combat_end", { combat, retreated: true, pursuitHits });
    return true;
  }
}
