import { describe, expect, it } from 'vitest';
import { CombatUI } from '../CombatUI';
import { GameState } from '../../engine/GameState';
import { CombatResolver } from '../../engine/CombatResolver';

function makeCombatUI(): CombatUI {
  const state = new GameState();
  return new CombatUI(
    state,
    { render: () => undefined } as any,
    new CombatResolver(state),
    {
      showToast: () => undefined,
      renderMinimap: () => undefined,
      updateFactionPanel: () => undefined,
      updateSelectionInfo: () => undefined,
      updateActionButtons: () => undefined,
    }
  );
}

describe('CombatUI preview stats', () => {
  it('labels overwhelming attacks and estimates first-round hits', () => {
    const ui = makeCombatUI();
    const stats = ui.calculateBattlePreviewStats(
      [{ unitTypeId: 'tank', count: 3 }],
      [{ unitTypeId: 'infantry', count: 1 }],
      9,
      2,
      2
    );

    expect(stats.odds).toBe(0.95);
    expect(stats.riskLabel).toBe('Overwhelming attack');
    expect(stats.riskClass).toBe('good');
    expect(stats.expectedAttackerHits).toBe(1.5);
    expect(stats.expectedDefenderHits).toBeCloseTo(0.33, 2);
  });

  it('warns when defenders are favored in the first round', () => {
    const ui = makeCombatUI();
    const stats = ui.calculateBattlePreviewStats(
      [{ unitTypeId: 'infantry', count: 1 }],
      [{ unitTypeId: 'tank', count: 3 }],
      1,
      9,
      9
    );

    expect(stats.odds).toBe(0.1);
    expect(stats.riskLabel).toBe('High-risk attack');
    expect(stats.riskClass).toBe('bad');
    expect(stats.riskDetail).toContain('first round');
  });
});
