import type { GameState } from './GameState';
import type { Territory } from '../data/Territory';
import type { UnitType } from '../data/Unit';
import {
  computeEngageableAttackPower,
  computeEngageableDefensePower,
  collectBombardingUnits,
  canLandUnitStrikeNaval,
  type StrategicDefenderPreview,
} from './NavalSystem';

export interface PreviewAttackerEntry {
  unitTypeId: string;
  unitType: UnitType;
  count: number;
}

export interface PreviewCombatTotals {
  rawAttackPower: number;
  rawDefensePower: number;
  engageableAttackPower: number;
  engageableDefensePower: number;
  artilleryBoost: number;
  combinedArmsBonus: number;
  defenderTerrainBonus: number;
  defenderFortBonus: number;
  defenderPrepBonus: number;
  effectiveAttackPower: number;
  effectiveDefensePower: number;
  expectedPreCombatDefenderHits: number;
  expectedPreCombatAttackerHits: number;
  modifierSwingFactors: string[];
}

export function computeArtilleryBoost(attackers: PreviewAttackerEntry[]): number {
  const artillery = attackers.find(a => a.unitTypeId === 'artillery')?.count ?? 0;
  const infantry = attackers.find(a => a.unitTypeId === 'infantry')?.count ?? 0;
  return Math.min(artillery, infantry);
}

/** +1 attack per tank die when infantry is also attacking (matches CombatResolver). */
export function computeCombinedArmsBonus(attackers: PreviewAttackerEntry[]): number {
  const tanks = attackers.find(a => a.unitTypeId === 'tank')?.count ?? 0;
  const infantry = attackers.find(a => a.unitTypeId === 'infantry')?.count ?? 0;
  return tanks > 0 && infantry > 0 ? tanks : 0;
}

function expectedHitsFromAttackers(
  units: Array<{ unitType: UnitType; count: number }>,
  diceSides: number,
): number {
  return units.reduce((sum, u) => {
    if (u.count <= 0) return sum;
    const atk = Math.max(1, Math.min(diceSides, u.unitType.attack));
    return sum + u.count * atk / diceSides;
  }, 0);
}

export function computePreviewCombatTotals(
  state: GameState,
  fromTerritory: Territory,
  toTerritory: Territory,
  attackers: PreviewAttackerEntry[],
  defenderPreview: StrategicDefenderPreview[],
  attackingFactionId: string,
): PreviewCombatTotals {
  const diceSides = state.rules.diceSides ?? 6;
  const attackerPowerUnits = attackers.map(a => ({ unitType: a.unitType, count: a.count }));
  const defenderPowerUnits = defenderPreview.map(d => ({ unitType: d.unitType, count: d.count }));

  const rawAttackPower = attackers.reduce((s, a) => s + a.count * a.unitType.attack, 0);
  const rawDefensePower = defenderPreview.reduce((s, d) => s + d.count * d.unitType.defense, 0);

  const engageableAttackPower = computeEngageableAttackPower(attackerPowerUnits, defenderPowerUnits);
  const engageableDefensePower = computeEngageableDefensePower(defenderPowerUnits, attackerPowerUnits);

  const artilleryBoost = computeArtilleryBoost(attackers);
  const combinedArmsBonus = computeCombinedArmsBonus(attackers);

  const defenderUnitCount = defenderPreview.reduce((s, d) => s + d.count, 0);
  const terrainBonus = toTerritory.defenseBonus ?? 0;
  const fortBonus = state.systems.fortificationSystem?.getDefenseBonus(toTerritory.id) ?? 0;
  const prepBonus = fortBonus === 0 && (toTerritory.isCapital || toTerritory.hasFactory) ? 1 : 0;
  const perDefenderStatBonus = terrainBonus + fortBonus + prepBonus;
  const defenderStatBonusTotal = defenderUnitCount * perDefenderStatBonus;

  const baseAttack = engageableAttackPower > 0 ? engageableAttackPower : rawAttackPower;
  const baseDefense = engageableDefensePower > 0 ? engageableDefensePower : rawDefensePower;
  const effectiveAttackPower = baseAttack + artilleryBoost + combinedArmsBonus;
  const effectiveDefensePower = baseDefense + defenderStatBonusTotal;

  let expectedPreCombatDefenderHits = 0;
  let expectedPreCombatAttackerHits = 0;

  if (toTerritory.type !== 'sea') {
    const bombarding: Array<{ unitType: UnitType; count: number }> = [];
    if (fromTerritory.type === 'sea') {
      for (const a of attackers) {
        if (a.unitType.domain === 'sea' && a.count > 0) {
          bombarding.push({ unitType: a.unitType, count: a.count });
        }
      }
    } else {
      bombarding.push(...collectBombardingUnits(state, toTerritory.id, attackingFactionId));
    }
    expectedPreCombatDefenderHits = expectedHitsFromAttackers(bombarding, diceSides);
  } else {
    const barrage = attackers.filter(a => canLandUnitStrikeNaval(a.unitType) && a.count > 0);
    expectedPreCombatAttackerHits = expectedHitsFromAttackers(
      barrage.map(a => ({ unitType: a.unitType, count: a.count })),
      diceSides,
    );
  }

  const modifierSwingFactors: string[] = [];
  if (artilleryBoost > 0) modifierSwingFactors.push(`Artillery +${artilleryBoost} atk`);
  if (combinedArmsBonus > 0) modifierSwingFactors.push('Combined arms');
  if (expectedPreCombatDefenderHits >= 0.5) {
    modifierSwingFactors.push(`Shore bombard ~${expectedPreCombatDefenderHits.toFixed(1)} hits`);
  }
  if (expectedPreCombatAttackerHits >= 0.5) {
    modifierSwingFactors.push(`Coastal barrage ~${expectedPreCombatAttackerHits.toFixed(1)} hits`);
  }
  if (engageableAttackPower > 0 && engageableAttackPower < rawAttackPower) {
    modifierSwingFactors.push('Cross-domain limits');
  }
  if (defenderStatBonusTotal > 0) {
    modifierSwingFactors.push(`Terrain/fort +${defenderStatBonusTotal}`);
  }

  return {
    rawAttackPower,
    rawDefensePower,
    engageableAttackPower,
    engageableDefensePower,
    artilleryBoost,
    combinedArmsBonus,
    defenderTerrainBonus: terrainBonus,
    defenderFortBonus: fortBonus,
    defenderPrepBonus: prepBonus,
    effectiveAttackPower,
    effectiveDefensePower,
    expectedPreCombatDefenderHits,
    expectedPreCombatAttackerHits,
    modifierSwingFactors,
  };
}

/** Estimated win chance using effective power, pre-combat phases, and attrition heuristics. */
export function estimateVictoryChance(
  effectiveAttackPower: number,
  effectiveDefensePower: number,
  attackerUnitCount: number,
  defenderUnitCount: number,
  expectedPreCombatDefenderHits: number,
  expectedPreCombatAttackerHits: number,
  diceSides = 6,
): number {
  if (defenderUnitCount === 0) return 0.95;
  if (attackerUnitCount === 0) return 0.05;

  const defendersAfterOpening = Math.max(0, defenderUnitCount - Math.floor(expectedPreCombatDefenderHits));
  if (defendersAfterOpening === 0) return 0.95;

  const expectedAttackerHits = effectiveAttackPower / diceSides + expectedPreCombatDefenderHits;
  const expectedDefenderHits = effectiveDefensePower / diceSides + expectedPreCombatAttackerHits;

  const ratio = expectedAttackerHits / Math.max(expectedDefenderHits, 0.15);

  let odds: number;
  if (ratio >= 2.5) odds = 0.93;
  else if (ratio >= 2) odds = 0.84;
  else if (ratio >= 1.5) odds = 0.70;
  else if (ratio >= 1.15) odds = 0.58;
  else if (ratio >= 0.9) odds = 0.47;
  else if (ratio >= 0.7) odds = 0.32;
  else if (ratio >= 0.5) odds = 0.18;
  else odds = 0.09;

  if (expectedDefenderHits >= attackerUnitCount && expectedAttackerHits < defendersAfterOpening) {
    odds = Math.min(odds, 0.15);
  }
  if (expectedAttackerHits >= defendersAfterOpening && expectedDefenderHits < attackerUnitCount * 0.5) {
    odds = Math.max(odds, 0.88);
  }

  return Math.max(0.05, Math.min(0.95, odds));
}
