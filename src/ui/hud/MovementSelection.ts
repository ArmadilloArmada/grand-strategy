import type { ValidMove } from '../../engine/MovementValidator';
import type { MovementValidator } from '../../engine/MovementValidator';
import type { Territory } from '../../data/Territory';
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

function moveDedupeKey(move: ValidMove): string {
  return [
    move.unitTypeId ?? '',
    move.territoryId,
    move.isAttack ? 'a' : 'm',
    move.coastalStrike ? 'c' : '',
    move.rangedStrike ? 'r' : '',
  ].join('|');
}

/** Union valid moves/attacks from every ready stack at a territory. */
export function collectValidMovesForAllReadyStacks(
  territory: Territory,
  getMoves: (unitTypeId: string) => ValidMove[],
  getAvailableCount: (unitTypeId: string) => number,
): ValidMove[] {
  const best = new Map<string, ValidMove>();

  for (const pu of territory.units) {
    const available = getAvailableCount(pu.unitTypeId);
    if (available <= 0) continue;

    for (const move of getMoves(pu.unitTypeId)) {
      const tagged: ValidMove = { ...move, unitTypeId: pu.unitTypeId };
      const key = moveDedupeKey(tagged);
      const existing = best.get(key);
      if (!existing) {
        best.set(key, tagged);
        continue;
      }
      const existingAvailable = existing.unitTypeId
        ? getAvailableCount(existing.unitTypeId)
        : 0;
      if (available > existingAvailable || tagged.movementCost < existing.movementCost) {
        best.set(key, tagged);
      }
    }
  }

  return [...best.values()];
}

export function resolveValidMoveAtTarget(
  moves: ValidMove[],
  territoryId: string,
  kind: 'move' | 'attack' | 'any' = 'any',
): ValidMove | undefined {
  return moves.find(m => {
    if (m.territoryId !== territoryId) return false;
    if (kind === 'move') return !m.isAttack;
    if (kind === 'attack') return m.isAttack;
    return true;
  });
}

/** Every ready stack that can reach the target (all-types command mode). */
export function resolveAllValidMovesAtTarget(
  moves: ValidMove[],
  territoryId: string,
  kind: 'move' | 'attack' | 'any' = 'any',
): ValidMove[] {
  const seen = new Set<string>();
  const result: ValidMove[] = [];

  for (const move of moves) {
    if (move.territoryId !== territoryId) continue;
    if (kind === 'move' && move.isAttack) continue;
    if (kind === 'attack' && !move.isAttack) continue;
    if (!move.unitTypeId || seen.has(move.unitTypeId)) continue;
    seen.add(move.unitTypeId);
    result.push(move);
  }

  return result;
}
