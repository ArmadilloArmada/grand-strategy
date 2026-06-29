/**
 * Shared tactical battle logic for player UI and AI assault resolution.
 */

import type { CombatState } from './CombatResolver';

export interface TacticalOutcomeMeta {
  cleanWin: boolean;
  attackerSurvivalRate: number;
}

export interface TacticalTerritoryContext {
  isCapital?: boolean;
  hasFactory?: boolean;
  name?: string;
}

export function computeCombatSidePower(
  combat: CombatState,
  side: 'attacker' | 'defender',
): number {
  const units = side === 'attacker' ? combat.attackers : combat.defenders;
  return units.reduce((sum, cu) => {
    const stat = side === 'attacker' ? cu.unitType.attack : cu.unitType.defense;
    return sum + (cu.count - cu.casualties) * stat;
  }, 0);
}

/** Whether an AI faction should resolve this assault with tactical positioning bonuses. */
export function shouldAIUseTacticalAssault(
  territory: TacticalTerritoryContext,
  attackPower: number,
  defensePower: number,
  aggression: number,
): boolean {
  if (defensePower <= 0 || attackPower <= 0) return false;
  const ratio = attackPower / defensePower;
  const highStakes = Boolean(territory.isCapital || territory.hasFactory);
  const contested = ratio >= 0.45 && ratio <= 1.45;
  return highStakes || (contested && aggression >= 0.45);
}

export function buildTacticalOutcomeMeta(combat: CombatState, attackerWon: boolean): TacticalOutcomeMeta {
  const committed = combat.attackers.reduce((sum, cu) => sum + cu.count, 0);
  const lost = combat.attackers.reduce((sum, cu) => sum + cu.casualties, 0);
  const attackerSurvivalRate = committed > 0 ? (committed - lost) / committed : 0;
  const cleanWin = attackerWon && attackerSurvivalRate >= 0.6;
  return { cleanWin, attackerSurvivalRate };
}

/** Reduce attacker casualties after a clean tactical victory. Returns units saved. */
export function applyTacticalCasualtyRelief(combat: CombatState, maxSaved = 1): number {
  let saved = 0;
  for (const cu of combat.attackers) {
    if (saved >= maxSaved || cu.casualties <= 0) continue;
    cu.casualties--;
    saved++;
  }
  return saved;
}

export function applyTacticalVictoryBonuses(
  combat: CombatState,
  meta: TacticalOutcomeMeta,
): { savedUnits: number; cleanWin: boolean } {
  if (combat.winner !== 'attacker') return { savedUnits: 0, cleanWin: false };
  const maxSaved = meta.attackerSurvivalRate >= 0.85 ? 2 : meta.cleanWin ? 1 : 0;
  const savedUnits = maxSaved > 0 ? applyTacticalCasualtyRelief(combat, maxSaved) : 0;
  return { savedUnits, cleanWin: meta.cleanWin };
}
