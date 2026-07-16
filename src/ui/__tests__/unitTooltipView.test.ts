import { describe, expect, it } from 'vitest';
import { buildUnitTooltipHtml, moraleCombatModifier } from '../unitTooltipView';
import { makeUnit } from '../../engine/__tests__/testHelpers';

describe('moraleCombatModifier', () => {
  it('maps morale bands to combat modifiers', () => {
    expect(moraleCombatModifier(90)).toBe(1);
    expect(moraleCombatModifier(60)).toBe(0);
    expect(moraleCombatModifier(40)).toBe(-1);
    expect(moraleCombatModifier(25)).toBe(-2);
    expect(moraleCombatModifier(10)).toBe(-3);
  });
});

describe('buildUnitTooltipHtml', () => {
  it('renders base stats without tech/morale extras at neutral morale', () => {
    const html = buildUnitTooltipHtml(makeUnit({ name: 'Infantry', attack: 1, defense: 2 }), '🚶', 0, 0, 60);
    expect(html).toContain('🚶 Infantry');
    expect(html).toContain('<span>Attack:</span><span>1</span>');
    expect(html).not.toContain('tech)');
    expect(html).not.toContain('Morale mod');
  });

  it('shows tech bonuses and a morale penalty when present', () => {
    const html = buildUnitTooltipHtml(makeUnit({ name: 'Tank', attack: 3, defense: 3 }), '🛡️', 1, 2, 10);
    expect(html).toContain('(+1 tech)');
    expect(html).toContain('(+2 tech)');
    expect(html).toContain('Morale mod');
    expect(html).toContain('-3 all rolls');
  });

  it('surfaces special-ability flags', () => {
    const html = buildUnitTooltipHtml(
      makeUnit({ name: 'Bomber', canStrategicBomb: true, canBlitz: true }),
      '✈️', 0, 0, 100,
    );
    expect(html).toContain('Can Blitz');
    expect(html).toContain('Strategic Bombing');
  });
});
