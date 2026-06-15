export type MovePhaseContext = 'noncombat' | 'combined';

export function resolveMovePhaseContext(phase: string): MovePhaseContext {
  if (phase === 'noncombat_move') return 'noncombat';
  if (['combat_move', 'move', 'orders', 'action', 'play'].includes(phase)) return 'combined';
  return 'noncombat';
}

export function normalizeMoveContext(context: boolean | MovePhaseContext): MovePhaseContext {
  if (typeof context === 'boolean') return context ? 'combined' : 'noncombat';
  return context;
}
