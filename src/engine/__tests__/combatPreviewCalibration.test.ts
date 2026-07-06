import { describe, expect, it } from 'vitest';
import { estimateVictoryChance } from '../combatPreviewOdds';

describe('combatPreviewCalibration', () => {
  it('rates overwhelming firepower above 80%', () => {
    expect(estimateVictoryChance(24, 3, 8, 1, 0, 0)).toBeGreaterThan(0.8);
  });

  it('rates underdog assaults below 25%', () => {
    expect(estimateVictoryChance(2, 20, 1, 6, 0, 0)).toBeLessThan(0.25);
  });

  it('rates even matchups near 40-60%', () => {
    const odds = estimateVictoryChance(12, 12, 4, 4, 0, 0);
    expect(odds).toBeGreaterThanOrEqual(0.4);
    expect(odds).toBeLessThanOrEqual(0.6);
  });

  it('monotonically favors stronger attack ratios', () => {
    const weak = estimateVictoryChance(6, 12, 2, 4, 0, 0);
    const even = estimateVictoryChance(12, 12, 4, 4, 0, 0);
    const strong = estimateVictoryChance(20, 6, 6, 2, 0, 0);
    expect(weak).toBeLessThan(even);
    expect(even).toBeLessThan(strong);
  });
});
