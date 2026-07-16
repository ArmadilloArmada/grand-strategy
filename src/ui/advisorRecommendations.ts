/**
 * Movement / mobilization recommendation helpers for the Command Co-pilot.
 *
 * Extracted from the HUD god-class as pure functions with dependencies passed
 * in explicitly (state, systems, phase) so the scoring logic is decoupled from
 * UI state and easier to reason about/test. No DOM access.
 */

import type { GameState } from '../engine/GameState';
import type { MobilizationSystem } from '../engine/MobilizationSystem';
import type { MovementValidator } from '../engine/MovementValidator';
import { getTopThreats } from './advisorTargets';
import { isAttackMovePhase } from './hud/PhaseHelpers';

export interface RecommendedTarget {
  territoryId: string;
  label: string;
  detail: string;
}

export interface MovementSourceRecommendation {
  territoryId: string;
  label: string;
  detail: string;
  attacks: number;
  moves: number;
}

/** Naval-specific mobilization hint for island/pacific/world maps (null otherwise). */
export function getNavalMobilizationAdvice(mobilizationSystem: MobilizationSystem, mapId: string): string | null {
  if (!mapId.includes('archipelago') && !mapId.includes('pacific') && !mapId.includes('island') && !mapId.includes('world')) {
    return null;
  }
  const coastal = mobilizationSystem.getMobilizationOptions().find(o => o.canMobilize && o.type === 'coastal');
  if (!coastal) return null;
  return `Mobilize marines at ${coastal.territory.name} (${coastal.cost} IPC) for island assaults. Ground units can cross oceans automatically.`;
}

/** Free-text mobilization advice for the advisor panel. */
export function getMobilizationAdvice(mobilizationSystem: MobilizationSystem, mapId: string): string {
  const navalHint = getNavalMobilizationAdvice(mobilizationSystem, mapId);
  if (navalHint) return navalHint;

  const best = mobilizationSystem.getMobilizationOptions()
    .filter(o => o.canMobilize)
    .sort((a, b) => {
      const aValue = (a.territory.isCapital ? 8 : 0) + (a.territory.hasFactory ? 6 : 0) + a.units.reduce((s, u) => s + u.count, 0);
      const bValue = (b.territory.isCapital ? 8 : 0) + (b.territory.hasFactory ? 6 : 0) + b.units.reduce((s, u) => s + u.count, 0);
      return bValue - aValue || a.cost - b.cost;
    })[0];
  if (!best) return 'No affordable mobilization is available. Preserve IPCs or advance the phase.';
  return `Mobilize ${best.territory.name}: ${best.type} package for ${best.cost} IPC.`;
}

/** The highest-value territory to mobilize at, factoring in current threats. */
export function getBestMobilizationTarget(mobilizationSystem: MobilizationSystem, state: GameState): RecommendedTarget | null {
  const best = mobilizationSystem.getMobilizationOptions()
    .filter(o => o.canMobilize)
    .sort((a, b) => {
      const aThreat = getTopThreats(state, a.territory.owner ?? '')[0]?.territoryId === a.territory.id ? 5 : 0;
      const bThreat = getTopThreats(state, b.territory.owner ?? '')[0]?.territoryId === b.territory.id ? 5 : 0;
      const aValue = aThreat + (a.territory.isCapital ? 10 : 0) + (a.territory.hasFactory ? 7 : 0) + a.territory.production + a.units.reduce((s, u) => s + u.count, 0);
      const bValue = bThreat + (b.territory.isCapital ? 10 : 0) + (b.territory.hasFactory ? 7 : 0) + b.territory.production + b.units.reduce((s, u) => s + u.count, 0);
      return bValue - aValue || a.cost - b.cost;
    })[0];

  if (!best) return null;
  return {
    territoryId: best.territory.id,
    label: `Mobilize ${best.territory.name}`,
    detail: `${best.type} package, ${best.cost} IPC`,
  };
}

/** The owned territory with the most impactful available moves/attacks this phase. */
export function getBestMovementSource(
  state: GameState,
  movementValidator: MovementValidator,
  factionId: string,
): MovementSourceRecommendation | null {
  const phase = state.currentPhase;
  const allowAttacks = isAttackMovePhase(phase);
  const candidates: Array<MovementSourceRecommendation & { score: number }> = [];

  for (const territory of state.territories.values()) {
    if (territory.owner !== factionId || territory.isSea()) continue;

    const moveTargets = new Set<string>();
    const attackTargets = new Set<string>();
    let readyUnits = 0;
    let attackPower = 0;

    for (const unit of territory.units) {
      const ready = territory.getAvailableUnitCount(unit.unitTypeId);
      if (ready <= 0) continue;
      readyUnits += ready;
      const unitType = state.unitRegistry.get(unit.unitTypeId);
      attackPower += ready * (unitType?.attack ?? 0);

      for (const move of movementValidator.getValidMoves(unit.unitTypeId, territory.id, allowAttacks)) {
        if (move.isAttack) attackTargets.add(move.territoryId);
        else moveTargets.add(move.territoryId);
      }
    }

    const attacks = attackTargets.size;
    const moves = moveTargets.size;
    if (readyUnits === 0 || (attacks + moves) === 0) continue;
    const strongestTarget = Array.from(attackTargets)
      .map(id => state.territories.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .sort((a, b) => (b.production + (b.hasFactory ? 4 : 0) + (b.isCapital ? 8 : 0)) - (a.production + (a.hasFactory ? 4 : 0) + (a.isCapital ? 8 : 0)))[0];

    candidates.push({
      territoryId: territory.id,
      label: attacks > 0 ? `Inspect attack from ${territory.name}` : `Move from ${territory.name}`,
      detail: attacks > 0
        ? `${readyUnits} ready units, ${attacks} attack target${attacks === 1 ? '' : 's'}${strongestTarget ? `, best: ${strongestTarget.name}` : ''}`
        : `${readyUnits} ready units, ${moves} move target${moves === 1 ? '' : 's'}`,
      attacks,
      moves,
      score: attacks * 8 + moves + attackPower,
    });
  }

  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}
