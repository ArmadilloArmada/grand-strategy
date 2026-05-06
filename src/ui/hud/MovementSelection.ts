import type { ValidMove } from '../../engine/MovementValidator';

export type TerritorySelectionMoveResolution =
  | { kind: 'refresh' }
  | { kind: 'previewAttack'; fromId: string; toId: string }
  | { kind: 'executeMove'; fromId: string; toId: string }
  | { kind: 'none' };

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
  if (!validMove) return { kind: 'none' };

  if (validMove.isAttack) {
    return { kind: 'previewAttack', fromId: previousTerritoryId, toId: territoryId };
  }

  return { kind: 'executeMove', fromId: previousTerritoryId, toId: territoryId };
}

export function splitMoveAndAttackTargets(moves: ValidMove[]): {
  moveTargets: string[];
  attackTargets: string[];
} {
  const moveTargets: string[] = [];
  const attackTargets: string[] = [];
  const seen = new Set<string>();

  for (const move of moves) {
    if (seen.has(move.territoryId)) continue;
    seen.add(move.territoryId);

    if (move.isAttack) attackTargets.push(move.territoryId);
    else moveTargets.push(move.territoryId);
  }

  return { moveTargets, attackTargets };
}
