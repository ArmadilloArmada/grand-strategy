export function isMovementPhase(phase: string): boolean {
  return ['combat_move', 'noncombat_move', 'move', 'orders', 'action', 'play'].includes(phase);
}

export function isBuildPhase(phase: string): boolean {
  return ['purchase', 'production', 'build'].includes(phase);
}

export function isCombatPhase(phase: string): boolean {
  return ['combat', 'attack', 'resolve'].includes(phase);
}

/** Combat move / quick move — attacks and combat movement allowed */
export function isAttackMovePhase(phase: string): boolean {
  return ['combat_move', 'move', 'orders', 'action', 'play'].includes(phase);
}

/** Non-combat reposition only */
export function isNonCombatMovePhase(phase: string): boolean {
  return phase === 'noncombat_move';
}

export type { MovePhaseContext } from '../../engine/movePhaseContext';
export { resolveMovePhaseContext, normalizeMoveContext } from '../../engine/movePhaseContext';
