import type { ValidMove } from '../../engine/MovementValidator';
import type { UnitType } from '../../data/Unit';
import { isFullAntiNavalStriker } from '../../engine/NavalSystem';

export type TerritorySelectionMoveResolution =
  | { kind: 'refresh' }
  | { kind: 'previewAttack'; fromId: string; toId: string }
  | { kind: 'none' };

/** Units that strike from range without entering the target tile. */
export function isRangedStrikeUnit(unitType: UnitType): boolean {
  if (unitType.attackRange > 1) return true;
  if (unitType.canBombard) return true;
  if (isFullAntiNavalStriker(unitType)) return true;
  return false;
}

/** True when an attack order leaves the firing unit on its source tile. */
export function isStayInPlaceAttackMove(move: ValidMove): boolean {
  return Boolean(move.rangedStrike || move.coastalStrike);
}

export function getRangedUnitActionHint(unitType: UnitType): string {
  if (unitType.domain === 'sea' && unitType.canBombard) {
    return 'click shore to bombard';
  }
  if (unitType.domain === 'land' && unitType.id.includes('anti_air')) {
    return 'click fleet to fire';
  }
  if (unitType.domain === 'land' && (unitType.canBombard || unitType.attackRange > 1)) {
    return 'click enemy to bombard';
  }
  return 'click enemy to strike';
}

export function resolveTerritorySelectionMove(args: {
  phaseIsMovement: boolean;
  territoryId: string;
  previousTerritoryId?: string | null;
  validMoves: ValidMove[];
}): TerritorySelectionMoveResolution {
  const { phaseIsMovement, territoryId, previousTerritoryId, validMoves } = args;
  if (!phaseIsMovement) return { kind: 'none' };

  // Clicking the same selected territory should only refresh highlights.
  if (previousTerritoryId === territoryId) {
    return { kind: 'refresh' };
  }

  if (!previousTerritoryId || validMoves.length === 0) {
    return { kind: 'none' };
  }

  const validMove = validMoves.find((move) => move.territoryId === territoryId);
  if (!validMove?.isAttack) return { kind: 'none' };

  return { kind: 'previewAttack', fromId: previousTerritoryId, toId: territoryId };
}

/** Unit stack that owns the currently highlighted move/attack targets. */
export function resolveHighlightedMoveUnitType(args: {
  validMovesUnitTypeId: string | null;
  selectedUnitType: string | null;
}): string | null {
  return args.validMovesUnitTypeId ?? args.selectedUnitType;
}

export function splitMoveAndAttackTargets(moves: ValidMove[]): {
  moveTargets: string[];
  attackTargets: string[];
  coastalStrikeTargets: string[];
} {
  const moveTargets: string[] = [];
  const attackTargets: string[] = [];
  const coastalStrikeTargets: string[] = [];
  const seen = new Set<string>();

  for (const move of moves) {
    if (seen.has(move.territoryId)) continue;
    seen.add(move.territoryId);

    if (move.isAttack) {
      attackTargets.push(move.territoryId);
      if (move.coastalStrike || move.rangedStrike) coastalStrikeTargets.push(move.territoryId);
    } else {
      moveTargets.push(move.territoryId);
    }
  }

  return { moveTargets, attackTargets, coastalStrikeTargets };
}
