export function isMovementPhase(phase: string): boolean {
  return ['combat_move', 'noncombat_move', 'move', 'orders', 'action'].includes(phase);
}

export function isBuildPhase(phase: string): boolean {
  return ['purchase', 'production', 'build'].includes(phase);
}

export function isCombatPhase(phase: string): boolean {
  return ['combat', 'attack', 'resolve'].includes(phase);
}

export function isAttackMovePhase(phase: string): boolean {
  return ['combat_move', 'move', 'orders', 'action'].includes(phase);
}
