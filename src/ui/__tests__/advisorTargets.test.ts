import { describe, expect, it } from 'vitest';
import { getTopThreats, getOpportunityTargets } from '../advisorTargets';
import { buildCombatState } from '../../engine/__tests__/testHelpers';

describe('getOpportunityTargets', () => {
  it('returns nothing when the faction has no attacking units', () => {
    const { state, attackerFactionId } = buildCombatState();
    expect(getOpportunityTargets(state, attackerFactionId)).toEqual([]);
  });

  it('identifies an adjacent enemy capital as an opportunity', () => {
    const { state, attackerFactionId } = buildCombatState();
    state.territories.get('source')!.units.push({ unitTypeId: 'tank', count: 3 });

    const opportunities = getOpportunityTargets(state, attackerFactionId);
    expect(opportunities.length).toBe(1);
    expect(opportunities[0].territoryId).toBe('target');
    expect(opportunities[0].reason).toBe('enemy capital');
    expect(opportunities[0].score).toBeGreaterThan(0);
  });

  it('returns an empty list for an unknown faction', () => {
    const { state } = buildCombatState();
    expect(getOpportunityTargets(state, 'nope')).toEqual([]);
  });
});

describe('getTopThreats', () => {
  it('returns an empty list for an unknown faction', () => {
    const { state } = buildCombatState();
    expect(getTopThreats(state, 'nope')).toEqual([]);
  });

  it('returns an array (no threats when the defender has no adjacent enemy pressure quantified)', () => {
    const { state, defenderFactionId } = buildCombatState();
    const threats = getTopThreats(state, defenderFactionId);
    expect(Array.isArray(threats)).toBe(true);
    expect(threats.length).toBeLessThanOrEqual(3);
  });
});
