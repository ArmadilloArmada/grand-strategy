import { describe, expect, it } from 'vitest';
import { resolveKeyboardShortcut, type ShortcutContext } from '../keyboardShortcuts';

const ctx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({
  isGameStarted: true,
  phase: 'play',
  isHumanTurn: true,
  ...over,
});

const key = (key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => ({
  key,
  ctrlKey: mods.ctrlKey ?? false,
  shiftKey: mods.shiftKey ?? false,
});

describe('resolveKeyboardShortcut', () => {
  it('maps Ctrl+S / Ctrl+L even when no game is running', () => {
    expect(resolveKeyboardShortcut(key('s', { ctrlKey: true }), ctx({ isGameStarted: false })))
      .toEqual({ action: 'quick-save', preventDefault: true });
    expect(resolveKeyboardShortcut(key('l', { ctrlKey: true }), ctx({ isGameStarted: false })))
      .toEqual({ action: 'quick-load', preventDefault: true });
  });

  it('returns null for in-game hotkeys when no game is running', () => {
    expect(resolveKeyboardShortcut(key('b'), ctx({ isGameStarted: false }))).toBeNull();
    expect(resolveKeyboardShortcut(key('Tab'), ctx({ isGameStarted: false }))).toBeNull();
  });

  it('ends the phase on Enter/Space only on the human turn', () => {
    expect(resolveKeyboardShortcut(key('Enter'), ctx())).toEqual({ action: 'end-phase', preventDefault: true });
    expect(resolveKeyboardShortcut(key(' '), ctx())).toEqual({ action: 'end-phase', preventDefault: true });
    expect(resolveKeyboardShortcut(key('Enter'), ctx({ isHumanTurn: false }))).toBeNull();
  });

  it('opens build in build phases (b) and production (p)', () => {
    for (const phase of ['purchase', 'production', 'build', 'play']) {
      expect(resolveKeyboardShortcut(key('b'), ctx({ phase }))?.action).toBe('open-build');
    }
    expect(resolveKeyboardShortcut(key('b'), ctx({ phase: 'combat' }))).toBeNull();
    expect(resolveKeyboardShortcut(key('p'), ctx({ phase: 'production' }))?.action).toBe('open-build');
    expect(resolveKeyboardShortcut(key('p'), ctx({ phase: 'play' }))).toBeNull();
  });

  it('resolves combat only in the combat phase (no preventDefault)', () => {
    expect(resolveKeyboardShortcut(key('a'), ctx({ phase: 'combat' })))
      .toEqual({ action: 'resolve-combat', preventDefault: false });
    expect(resolveKeyboardShortcut(key('a'), ctx({ phase: 'play' }))).toBeNull();
  });

  it('handles Tab / Shift+Tab territory cycling', () => {
    expect(resolveKeyboardShortcut(key('Tab'), ctx())).toEqual({ action: 'cycle-territory-next', preventDefault: true });
    expect(resolveKeyboardShortcut(key('Tab', { shiftKey: true }), ctx())).toEqual({ action: 'cycle-territory-prev', preventDefault: true });
  });

  it('maps the remaining view/help hotkeys', () => {
    expect(resolveKeyboardShortcut(key('h'), ctx())?.action).toBe('help');
    expect(resolveKeyboardShortcut(key('f'), ctx())?.action).toBe('reset-view');
    expect(resolveKeyboardShortcut(key('c'), ctx())?.action).toBe('center-capital');
    expect(resolveKeyboardShortcut(key('o'), ctx())).toEqual({ action: 'cycle-overlay', preventDefault: true });
    expect(resolveKeyboardShortcut(key('?'), ctx())).toEqual({ action: 'toggle-shortcut-sheet', preventDefault: true });
  });

  it('returns null for unmapped keys and never maps Escape', () => {
    expect(resolveKeyboardShortcut(key('z'), ctx())).toBeNull();
    expect(resolveKeyboardShortcut(key('Escape'), ctx())).toBeNull();
  });
});
