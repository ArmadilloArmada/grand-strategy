/**
 * Difficulty-aware AI production and mobilization limits.
 */

import { GameState } from './GameState';
import type { MobilizationOption } from './MobilizationSystem';
import type { AIPersonality } from './AIPersonalities';

export type AIDifficultyLevel = 'easy' | 'medium' | 'hard';

export interface DifficultyMobilizationLimits {
  maxMobilizationsPerTurn: number;
  /** Minimum IPCs to keep in reserve after mobilizing. */
  ipcReserveRatio: number;
  /** Stop prioritizing naval packages above this fleet size. */
  maxNavalUnits: number;
  /** Naval count vs land army — e.g. 0.2 ≈ 1 ship per 5 land units. */
  maxNavalToLandRatio: number;
  /** Stop prioritizing air packages above this count (fighters + bombers). */
  maxAirUnits: number;
  /** Air count vs land army — e.g. 0.15 ≈ 1 air unit per ~7 land units. */
  maxAirToLandRatio: number;
}

export const MOBILIZATION_LIMITS: Record<AIDifficultyLevel, DifficultyMobilizationLimits> = {
  easy: {
    maxMobilizationsPerTurn: 1,
    ipcReserveRatio: 0.35,
    maxNavalUnits: 8,
    maxNavalToLandRatio: 0.15,
    maxAirUnits: 6,
    maxAirToLandRatio: 0.12,
  },
  medium: {
    maxMobilizationsPerTurn: 2,
    ipcReserveRatio: 0.2,
    maxNavalUnits: 16,
    maxNavalToLandRatio: 0.25,
    maxAirUnits: 12,
    maxAirToLandRatio: 0.2,
  },
  hard: {
    maxMobilizationsPerTurn: 3,
    ipcReserveRatio: 0.1,
    maxNavalUnits: 28,
    maxNavalToLandRatio: 0.4,
    maxAirUnits: 20,
    maxAirToLandRatio: 0.3,
  },
};

const NAVAL_UNIT_IDS = new Set([
  'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'marines',
]);

export function clonePersonality(p: AIPersonality): AIPersonality {
  return {
    ...p,
    preferredUnitTypes: [...p.preferredUnitTypes],
    avoidedUnitTypes: [...p.avoidedUnitTypes],
    specialBehaviors: [...p.specialBehaviors],
  };
}

/** Apply user-selected difficulty on top of a faction/preset personality. */
export function applyDifficultyToPersonality(
  personality: AIPersonality,
  difficulty: AIDifficultyLevel,
): void {
  const combatScale = difficulty === 'easy' ? 0.55 : difficulty === 'hard' ? 1.15 : 1.0;
  const navalScale = difficulty === 'easy' ? 0.35 : difficulty === 'medium' ? 0.65 : 1.0;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  personality.aggression = clamp(personality.aggression * combatScale);
  personality.riskTolerance = clamp(personality.riskTolerance * combatScale);
  personality.expansion = clamp(personality.expansion * combatScale);
  personality.naval = clamp(personality.naval * navalScale);
  personality.air = clamp(personality.air * (difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.1 : 1));

  if (difficulty === 'easy') {
    personality.patience = clamp(Math.max(personality.patience, 0.72));
    personality.economy = clamp(Math.max(personality.economy, 0.55));
    personality.defense = clamp(Math.max(personality.defense, 0.55));
  } else if (difficulty === 'hard') {
    personality.patience = clamp(personality.patience * 0.85);
  }
}

export function countFactionUnitsByDomain(
  state: GameState,
  factionId: string,
  domain: 'land' | 'sea' | 'air',
): number {
  let total = 0;
  for (const territory of state.getTerritoriesOwnedBy(factionId)) {
    for (const stack of territory.units) {
      const unitType = state.unitRegistry.get(stack.unitTypeId);
      if (unitType?.domain === domain) total += stack.count;
    }
  }
  return total;
}

export function countUnitsInMobilizationOption(
  option: MobilizationOption,
  kind: 'naval' | 'land' | 'air',
): number {
  return option.units.reduce((sum, unit) => {
    if (kind === 'naval' && NAVAL_UNIT_IDS.has(unit.unitTypeId)) return sum + unit.count;
    if (kind === 'land' && !NAVAL_UNIT_IDS.has(unit.unitTypeId)) {
      // Treat fighters/bombers separately below
      if (unit.unitTypeId === 'fighter' || unit.unitTypeId === 'bomber') return sum;
      return sum + unit.count;
    }
    if (kind === 'air' && (unit.unitTypeId === 'fighter' || unit.unitTypeId === 'bomber')) {
      return sum + unit.count;
    }
    return sum;
  }, 0);
}

export function isNavalFleetSaturated(
  navalCount: number,
  landCount: number,
  limits: DifficultyMobilizationLimits,
): boolean {
  if (navalCount >= limits.maxNavalUnits) return true;
  const landBaseline = Math.max(landCount, 4);
  return navalCount >= landBaseline * limits.maxNavalToLandRatio;
}

export function isAirForceSaturated(
  airCount: number,
  landCount: number,
  limits: DifficultyMobilizationLimits,
): boolean {
  if (airCount >= limits.maxAirUnits) return true;
  const landBaseline = Math.max(landCount, 4);
  return airCount >= landBaseline * limits.maxAirToLandRatio;
}

export function shouldSkipAirHeavyMobilization(
  option: MobilizationOption,
  airCount: number,
  landCount: number,
  limits: DifficultyMobilizationLimits,
  difficulty: AIDifficultyLevel,
): boolean {
  const airInPackage = countUnitsInMobilizationOption(option, 'air');
  if (airInPackage === 0) return false;
  if (!isAirForceSaturated(airCount, landCount, limits)) return false;

  if (option.type === 'capital') return true;

  const landInPackage = countUnitsInMobilizationOption(option, 'land');
  if (difficulty === 'easy' && airInPackage >= landInPackage) return true;
  if (difficulty === 'medium' && airInPackage > landInPackage + 1) return true;
  return difficulty === 'easy' && airInPackage > 1;
}

export function shouldSkipNavalHeavyMobilization(
  option: MobilizationOption,
  navalCount: number,
  landCount: number,
  limits: DifficultyMobilizationLimits,
  difficulty: AIDifficultyLevel,
): boolean {
  const navalInPackage = countUnitsInMobilizationOption(option, 'naval');
  if (navalInPackage === 0) return false;
  if (!isNavalFleetSaturated(navalCount, landCount, limits)) return false;

  if (option.type === 'coastal') return true;

  const landInPackage = countUnitsInMobilizationOption(option, 'land');
  if (difficulty === 'easy' && navalInPackage >= landInPackage) return true;
  if (difficulty === 'medium' && navalInPackage > landInPackage + 1) return true;
  return difficulty === 'easy' && navalInPackage > 1;
}

export function mobilizationNavalPenalty(
  option: MobilizationOption,
  navalCount: number,
  landCount: number,
  limits: DifficultyMobilizationLimits,
  difficulty: AIDifficultyLevel,
): number {
  const navalInPackage = countUnitsInMobilizationOption(option, 'naval');
  if (navalInPackage === 0) return 0;

  let penalty = 0;
  if (navalCount >= limits.maxNavalUnits * 0.6) {
    penalty += navalInPackage * (difficulty === 'easy' ? 35 : difficulty === 'medium' ? 22 : 10);
  }
  if (isNavalFleetSaturated(navalCount, landCount, limits)) {
    penalty += navalInPackage * (difficulty === 'easy' ? 50 : difficulty === 'medium' ? 30 : 12);
  }
  if (option.type === 'coastal') {
    penalty += difficulty === 'easy' ? 25 : difficulty === 'medium' ? 10 : 0;
  }
  return penalty;
}

export function mobilizationAirPenalty(
  option: MobilizationOption,
  airCount: number,
  landCount: number,
  limits: DifficultyMobilizationLimits,
  difficulty: AIDifficultyLevel,
): number {
  const airInPackage = countUnitsInMobilizationOption(option, 'air');
  if (airInPackage === 0) return 0;

  let penalty = 0;
  if (airCount >= limits.maxAirUnits * 0.6) {
    penalty += airInPackage * (difficulty === 'easy' ? 35 : difficulty === 'medium' ? 22 : 10);
  }
  if (isAirForceSaturated(airCount, landCount, limits)) {
    penalty += airInPackage * (difficulty === 'easy' ? 50 : difficulty === 'medium' ? 30 : 12);
  }
  if (option.type === 'capital') {
    penalty += difficulty === 'easy' ? 25 : difficulty === 'medium' ? 10 : 0;
  }
  return penalty;
}

export function getMaxMobilizationsForTurn(
  difficulty: AIDifficultyLevel,
  patience: number,
): number {
  const base = MOBILIZATION_LIMITS[difficulty].maxMobilizationsPerTurn;
  if (patience > 0.7) return Math.max(1, base - 1);
  return base;
}

export function getIpcReserveFloor(
  difficulty: AIDifficultyLevel,
  currentIpcs: number,
): number {
  return Math.ceil(currentIpcs * MOBILIZATION_LIMITS[difficulty].ipcReserveRatio);
}
