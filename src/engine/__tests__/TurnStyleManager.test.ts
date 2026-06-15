/**
 * TurnStyleManager tests
 */
import { describe, it, expect } from 'vitest';
import {
  getPhasesForStyle,
  getPhaseDisplayName,
  shouldPauseAfterAI,
  shouldPauseAfterAction,
  isOneActionPerTurn,
  isMoveOrAttackOnly,
  isMoveForMoveStyle,
  getPhaseTip,
} from '../TurnStyleManager';

describe('getPhasesForStyle', () => {
  it('classic returns the 6-phase array', () => {
    const phases = getPhasesForStyle('classic');
    expect(phases).toEqual([
      'purchase', 'combat_move', 'combat', 'noncombat_move', 'production', 'collect_income',
    ]);
  });

  it('quick returns 2-phase array', () => {
    const phases = getPhasesForStyle('quick');
    expect(phases).toEqual(['play', 'end']);
  });

  it('civilization returns 4-phase array with orders/resolve', () => {
    const phases = getPhasesForStyle('civilization');
    expect(phases).toContain('orders');
    expect(phases).toContain('resolve');
  });

  it('chess returns single "action" phase', () => {
    const phases = getPhasesForStyle('chess');
    expect(phases).toEqual(['action']);
  });

  it('move_for_move returns single freeform play phase', () => {
    const phases = getPhasesForStyle('move_for_move');
    expect(phases).toEqual(['play']);
  });

  it('spectator uses classic phases', () => {
    const phases = getPhasesForStyle('spectator');
    expect(phases).toEqual(getPhasesForStyle('classic'));
  });

  it('action style uses classic phases', () => {
    const phases = getPhasesForStyle('action');
    expect(phases).toEqual(getPhasesForStyle('classic'));
  });

  it('unknown style falls back to classic phases', () => {
    // @ts-expect-error testing unknown style
    const phases = getPhasesForStyle('unknown_style');
    expect(phases).toEqual(getPhasesForStyle('classic'));
  });
});

describe('getPhaseDisplayName', () => {
  it('purchase phase has a display name', () => {
    const name = getPhaseDisplayName('purchase', 'classic');
    expect(name).toBeTruthy();
    expect(typeof name).toBe('string');
  });

  it('combat_move phase has a display name', () => {
    expect(getPhaseDisplayName('combat_move', 'classic')).toBeTruthy();
  });

  it('unknown phase returns the raw phase string', () => {
    expect(getPhaseDisplayName('unknown_phase', 'classic')).toBe('unknown_phase');
  });

  it('all phases in classic style have display names', () => {
    for (const phase of getPhasesForStyle('classic')) {
      const name = getPhaseDisplayName(phase, 'classic');
      expect(name).toBeTruthy();
    }
  });

  it('all phases in quick style have display names', () => {
    for (const phase of getPhasesForStyle('quick')) {
      const name = getPhaseDisplayName(phase, 'quick');
      expect(name).toBeTruthy();
    }
  });
});

describe('shouldPauseAfterAI', () => {
  it('returns true for spectator style', () => {
    expect(shouldPauseAfterAI('spectator')).toBe(true);
  });

  it('returns false for all other styles', () => {
    for (const style of ['classic', 'quick', 'civilization', 'chess', 'action'] as const) {
      expect(shouldPauseAfterAI(style)).toBe(false);
    }
  });
});

describe('shouldPauseAfterAction', () => {
  it('returns true for action style', () => {
    expect(shouldPauseAfterAction('action')).toBe(true);
  });

  it('returns false for non-action styles', () => {
    for (const style of ['classic', 'quick', 'civilization', 'chess', 'spectator'] as const) {
      expect(shouldPauseAfterAction(style)).toBe(false);
    }
  });
});

describe('isOneActionPerTurn', () => {
  it('returns true for chess style', () => {
    expect(isOneActionPerTurn('chess')).toBe(true);
  });

  it('returns false for non-chess styles', () => {
    for (const style of ['classic', 'quick', 'civilization', 'spectator', 'action'] as const) {
      expect(isOneActionPerTurn(style)).toBe(false);
    }
  });
});

describe('isMoveOrAttackOnly', () => {
  it('returns true for civilization style', () => {
    expect(isMoveOrAttackOnly('civilization')).toBe(true);
  });

  it('returns false for other styles', () => {
    for (const style of ['classic', 'quick', 'chess', 'spectator', 'action'] as const) {
      expect(isMoveOrAttackOnly(style)).toBe(false);
    }
  });
});

describe('isMoveForMoveStyle', () => {
  it('returns true only for move_for_move', () => {
    expect(isMoveForMoveStyle('move_for_move')).toBe(true);
    expect(isMoveForMoveStyle('quick')).toBe(false);
  });
});

describe('getPhaseTip', () => {
  it('returns a non-empty string for quick/play', () => {
    const tip = getPhaseTip('play', 'quick');
    expect(tip).toBeTruthy();
  });

  it('returns a non-empty string for civilization/orders', () => {
    const tip = getPhaseTip('orders', 'civilization');
    expect(tip).toBeTruthy();
  });

  it('returns a non-empty string for chess style', () => {
    const tip = getPhaseTip('action', 'chess');
    expect(tip).toBeTruthy();
  });

  it('returns a non-empty string for classic/purchase', () => {
    const tip = getPhaseTip('purchase', 'classic');
    expect(tip).toBeTruthy();
  });

  it('returns empty string for unknown phase in classic', () => {
    const tip = getPhaseTip('unknown_phase', 'classic');
    expect(tip).toBe('');
  });
});
