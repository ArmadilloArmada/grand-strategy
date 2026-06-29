import type { ValidMove } from '../../engine/MovementValidator';

export interface StackGuidanceCounts {
  moveCount: number;
  attackCount: number;
  transportCount: number;
  coastalCount: number;
}

export function countStackGuidanceTargets(validMoves: ValidMove[]): StackGuidanceCounts {
  const moveIds = new Set<string>();
  const attackIds = new Set<string>();
  const transportIds = new Set<string>();
  const coastalIds = new Set<string>();
  for (const move of validMoves) {
    if (move.isAttack) attackIds.add(move.territoryId);
    else moveIds.add(move.territoryId);
    if (move.viaTransport) transportIds.add(move.viaTransport);
    if (move.coastalStrike) coastalIds.add(move.territoryId);
  }
  return {
    moveCount: moveIds.size,
    attackCount: attackIds.size,
    transportCount: transportIds.size,
    coastalCount: coastalIds.size,
  };
}

export function formatStackGuidanceLine(
  territoryName: string,
  activeStackLabel: string,
  counts: StackGuidanceCounts,
): string {
  const parts: string[] = [];
  if (counts.moveCount > 0) parts.push(`${counts.moveCount} move`);
  if (counts.attackCount > 0) parts.push(`${counts.attackCount} attack`);
  if (counts.transportCount > 0) parts.push(`${counts.transportCount} amphib`);
  if (counts.coastalCount > 0) parts.push(`${counts.coastalCount} coastal`);
  const targetText = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `${territoryName}: ${activeStackLabel}${targetText}`;
}
