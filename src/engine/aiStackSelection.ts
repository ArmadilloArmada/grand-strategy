import type { GameState } from './GameState';
import type { Territory } from '../data/Territory';
import type { UnitType } from '../data/Unit';

/** Score ready stacks so AI prefers subs vs cruisers etc. intelligently. */
export function scoreReadyStackForAI(
  state: GameState,
  territory: Territory,
  unitType: UnitType,
  availableCount: number,
  navalPersonality: number,
): number {
  let score = unitType.attack * availableCount + unitType.movement * 2;
  if (unitType.domain === 'sea') {
    score += navalPersonality * 12;
    if (unitType.id === 'submarine') score += navalPersonality * 8;
    if (unitType.id === 'destroyer') score += navalPersonality * 5;
    if (unitType.id === 'battleship' || unitType.id === 'carrier') score += navalPersonality * 4;
    if (unitType.id === 'transport') score -= 20;
  }
  if (unitType.domain === 'air') score += 6;
  if (unitType.canBlitz) score += 4;
  if (territory.type === 'sea' && unitType.domain === 'land') score -= 50;
  return score;
}

export function pickBestReadyStackType(
  state: GameState,
  territory: Territory,
  navalPersonality: number,
): { unitTypeId: string; count: number } | null {
  let best: { unitTypeId: string; count: number; score: number } | null = null;
  for (const pu of territory.units) {
    const available = territory.getAvailableUnitCount(pu.unitTypeId);
    if (available <= 0) continue;
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    if (!unitType) continue;
    const score = scoreReadyStackForAI(state, territory, unitType, available, navalPersonality);
    if (!best || score > best.score) {
      best = { unitTypeId: pu.unitTypeId, count: available, score };
    }
  }
  return best ? { unitTypeId: best.unitTypeId, count: best.count } : null;
}
