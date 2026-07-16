/**
 * Pure keyboard-shortcut resolution for the in-game hotkeys.
 *
 * This maps a keydown (plus lightweight game context) to an abstract action;
 * the caller performs the side effects. The Escape key is handled separately by
 * the caller because it depends on live modal/DOM state. Extracted from the
 * Game god-class so the mapping is unit-testable.
 */

export type ShortcutAction =
  | 'quick-save'
  | 'quick-load'
  | 'end-phase'
  | 'open-build'
  | 'resolve-combat'
  | 'help'
  | 'reset-view'
  | 'center-capital'
  | 'cycle-territory-next'
  | 'cycle-territory-prev'
  | 'cycle-overlay'
  | 'toggle-shortcut-sheet';

export interface KeyboardShortcutEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface ShortcutContext {
  isGameStarted: boolean;
  phase: string;
  isHumanTurn: boolean;
}

export interface ShortcutResolution {
  action: ShortcutAction;
  /** Whether the caller should call preventDefault() before dispatching. */
  preventDefault: boolean;
}

const BUILD_PHASES = ['purchase', 'production', 'build', 'play'];

/**
 * Resolve a keydown to an action, or null when nothing should happen.
 * Escape is intentionally NOT handled here (the caller manages modal/DOM state).
 */
export function resolveKeyboardShortcut(
  e: KeyboardShortcutEvent,
  ctx: ShortcutContext,
): ShortcutResolution | null {
  // Ctrl+S / Ctrl+L work regardless of whether a game is in progress.
  if (e.key === 's' && e.ctrlKey) return { action: 'quick-save', preventDefault: true };
  if (e.key === 'l' && e.ctrlKey) return { action: 'quick-load', preventDefault: true };

  if (!ctx.isGameStarted) return null;

  if ((e.key === 'Enter' || e.key === ' ') && ctx.isHumanTurn) {
    return { action: 'end-phase', preventDefault: true };
  }
  if (e.key === 'b' && BUILD_PHASES.includes(ctx.phase)) {
    return { action: 'open-build', preventDefault: true };
  }
  if (e.key === 'p' && ctx.phase === 'production') {
    return { action: 'open-build', preventDefault: true };
  }
  if (e.key === 'a' && ctx.phase === 'combat') {
    return { action: 'resolve-combat', preventDefault: false };
  }
  if (e.key === 'h') return { action: 'help', preventDefault: false };
  if (e.key === 'f') return { action: 'reset-view', preventDefault: false };
  if (e.key === 'c') return { action: 'center-capital', preventDefault: false };
  if (e.key === 'Tab') {
    return { action: e.shiftKey ? 'cycle-territory-prev' : 'cycle-territory-next', preventDefault: true };
  }
  if (e.key === 'o') return { action: 'cycle-overlay', preventDefault: true };
  if (e.key === '?') return { action: 'toggle-shortcut-sheet', preventDefault: true };

  return null;
}
