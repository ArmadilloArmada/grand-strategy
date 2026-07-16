import { describe, expect, it } from 'vitest';
import { getFactionOptionLabel, buildSetupPlanLine } from '../setupSummaryText';
import type { FactionData } from '../../data/Faction';

function faction(overrides: Partial<FactionData>): FactionData {
  return {
    id: 'x', name: 'Test', color: '#fff', colorLight: '#eee', capital: 'cap',
    startingIPCs: 20, turnOrder: 1, isPlayable: true, allies: [], ...overrides,
  };
}

describe('getFactionOptionLabel', () => {
  it('appends the playstyle when present', () => {
    expect(getFactionOptionLabel(faction({ name: 'Atlantic Alliance', playstyle: 'Industrial Powerhouse' })))
      .toBe('Atlantic Alliance - Industrial Powerhouse');
  });
  it('omits the dash when there is no playstyle', () => {
    expect(getFactionOptionLabel(faction({ name: 'Blue Command', playstyle: undefined })))
      .toBe('Blue Command');
  });
});

describe('buildSetupPlanLine', () => {
  it('tailors the map hint to mega maps', () => {
    expect(buildSetupPlanLine('grid-world-map-mega', 'capitals', 'quick', 'medium', 'default'))
      .toContain('broad fronts');
  });
  it('tailors the map hint to naval maps', () => {
    expect(buildSetupPlanLine('grid-pacific', 'capitals', 'quick', 'medium', 'default'))
      .toContain('sea lanes');
  });
  it('reflects the victory type and AI pressure', () => {
    const line = buildSetupPlanLine('grid-europe', 'economic', 'classic', 'hard', 'aggressive');
    expect(line).toContain('protect production');
    expect(line).toContain('AI pressure will arrive early');
    expect(line).toContain('classic pacing');
  });
  it('joins the four plan sections and reflects a defensive AI', () => {
    const line = buildSetupPlanLine('tutorial', 'capitals', 'quick', 'easy', 'defensive');
    expect(line).toContain('short opening');
    expect(line).toContain('watch enemy capitals');
    expect(line).toContain('AI will punish weak attacks');
    expect(line).toContain('faster decisions');
  });
});
