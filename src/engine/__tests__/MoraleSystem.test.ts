/**
 * MoraleSystem tests
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MoraleSystem } from '../MoraleSystem';
import { makeFactionData } from './testHelpers';

function buildState(relationState: 'war' | 'pact' | 'alliance' = 'war') {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('alpha', { allies: [] }));
  state.factionRegistry.register(makeFactionData('beta', { allies: [] }));

  if (relationState !== 'war') {
    // Default is war; set to pact/alliance
    (state.diplomacyManager as any).getRelEntry('alpha', 'beta').state = relationState;
  }
  return state;
}

describe('MoraleSystem — tickAll at war', () => {
  it('increases warWeariness when factions are at war', () => {
    const state = buildState('war');
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    const before = alpha.warWeariness;
    morale.tickAll();
    expect(alpha.warWeariness).toBeGreaterThan(before);
  });

  it('morale = 100 - warWeariness after tick', () => {
    const state = buildState('war');
    const morale = new MoraleSystem(state);
    morale.tickAll();
    const alpha = state.factionRegistry.get('alpha')!;
    expect(alpha.morale).toBe(100 - alpha.warWeariness);
  });

  it('warWeariness increases by 2 per enemy faction at war', () => {
    const state = buildState('war');
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 0;
    morale.tickAll();
    // 1 enemy at war → +2
    expect(alpha.warWeariness).toBe(2);
  });

  it('warWeariness does not exceed 100', () => {
    const state = buildState('war');
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 99;
    morale.tickAll();
    expect(alpha.warWeariness).toBeLessThanOrEqual(100);
  });
});

describe('MoraleSystem — tickAll at peace', () => {
  it('recovers warWeariness when not at war (pact)', () => {
    const state = buildState('pact');
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 20;
    alpha.morale = 80;
    morale.tickAll();
    expect(alpha.warWeariness).toBeLessThan(20);
  });

  it('warWeariness does not go below 0', () => {
    const state = buildState('pact');
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 2;
    morale.tickAll();
    expect(alpha.warWeariness).toBeGreaterThanOrEqual(0);
  });
});

describe('MoraleSystem — tickAll skips defeated factions', () => {
  it('does not change weariness for defeated factions', () => {
    const state = buildState('war');
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.isDefeated = true;
    alpha.warWeariness = 0;
    morale.tickAll();
    expect(alpha.warWeariness).toBe(0);
  });
});

describe('MoraleSystem — getCombatModifier', () => {
  it('returns 0 when morale >= 50', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.morale = 75;
    expect(morale.getCombatModifier('alpha')).toBe(0);
  });

  it('returns -1 when morale is 25..49', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.morale = 30;
    expect(morale.getCombatModifier('alpha')).toBe(-1);
  });

  it('returns -2 when morale < 25', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.morale = 10;
    expect(morale.getCombatModifier('alpha')).toBe(-2);
  });

  it('returns 0 for unknown faction', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    expect(morale.getCombatModifier('nobody')).toBe(0);
  });
});

describe('MoraleSystem — getIncomeModifier', () => {
  it('returns 1.0 at 100 morale', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.morale = 100;
    expect(morale.getIncomeModifier('alpha')).toBeCloseTo(1.0);
  });

  it('returns 0.7 at 0 morale', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.morale = 0;
    expect(morale.getIncomeModifier('alpha')).toBeCloseTo(0.7);
  });

  it('returns 0.85 at 50 morale (midpoint)', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.morale = 50;
    expect(morale.getIncomeModifier('alpha')).toBeCloseTo(0.85);
  });

  it('returns 1.0 for unknown faction', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    expect(morale.getIncomeModifier('nobody')).toBe(1);
  });
});

describe('MoraleSystem — recordCasualties', () => {
  it('increases warWeariness by floor(count * 0.5)', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 0;
    morale.recordCasualties('alpha', 10);
    expect(alpha.warWeariness).toBe(5); // floor(10 * 0.5) = 5
  });

  it('updates morale to 100 - warWeariness', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 0;
    morale.recordCasualties('alpha', 20);
    expect(alpha.morale).toBe(100 - alpha.warWeariness);
  });

  it('warWeariness capped at 100 after mass casualties', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 96;
    morale.recordCasualties('alpha', 100);
    expect(alpha.warWeariness).toBe(100);
  });

  it('does nothing for unknown faction', () => {
    const state = buildState();
    const morale = new MoraleSystem(state);
    expect(() => morale.recordCasualties('nobody', 5)).not.toThrow();
  });
});

describe('MoraleSystem — serialize / restore', () => {
  it('round-trips warWeariness and morale', () => {
    const state = buildState('war');
    const morale = new MoraleSystem(state);
    const alpha = state.factionRegistry.get('alpha')!;
    alpha.warWeariness = 40;
    alpha.morale = 60;
    const data = morale.serialize();
    expect(data['alpha'].warWeariness).toBe(40);
    expect(data['alpha'].morale).toBe(60);

    // Reset and restore
    alpha.warWeariness = 0;
    alpha.morale = 100;
    morale.restore(data);
    expect(alpha.warWeariness).toBe(40);
    expect(alpha.morale).toBe(60);
  });
});
