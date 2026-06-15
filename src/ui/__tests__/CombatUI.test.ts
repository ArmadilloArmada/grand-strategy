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

describe('CombatUI strategic bombing', () => {
  it('splits bombers evenly across factory targets', () => {
    expect(CombatUI.allocateBombersAcrossTargets(10, 3)).toEqual([4, 3, 3]);
    expect(CombatUI.allocateBombersAcrossTargets(5, 2)).toEqual([3, 2]);
    expect(CombatUI.allocateBombersAcrossTargets(2, 5)).toEqual([1, 1, 0, 0, 0]);
  });
});

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
    expect(stats.commitmentAdvice).toContain('Commit');
    expect(stats.swingFactors).toContain('Power advantage');
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
    expect(stats.commitmentAdvice).toContain('Avoid');
    expect(stats.swingFactors).toContain('Power disadvantage');
  });

  it('surfaces defensive bonuses as swing factors', () => {
    const ui = makeCombatUI();
    const stats = ui.calculateBattlePreviewStats(
      [{ unitTypeId: 'infantry', count: 3 }],
      [{ unitTypeId: 'infantry', count: 2 }],
      3,
      4,
      6
    );

    expect(stats.swingFactors).toContain('Defense bonus +2');
  });
});

describe('CombatUI tactical recommendations', () => {
  it('recommends tactical mode for contested capital assaults', () => {
    const ui = makeCombatUI();
    const stats = ui.calculateBattlePreviewStats(
      [{ unitTypeId: 'infantry', count: 2 }],
      [{ unitTypeId: 'infantry', count: 2 }],
      2,
      4,
      6,
    );

    expect(ui.isTacticalRecommended(stats, { isCapital: true })).toBe(true);
  });

  it('recommends tactical mode for even-odds fights', () => {
    const ui = makeCombatUI();
    const stats = ui.calculateBattlePreviewStats(
      [{ unitTypeId: 'infantry', count: 2 }],
      [{ unitTypeId: 'infantry', count: 2 }],
      2,
      2,
      2,
    );

    expect(stats.odds).toBe(0.5);
    expect(ui.isTacticalRecommended(stats, {})).toBe(true);
  });

  it('skips tactical recommendation for unopposed captures', () => {
    const ui = makeCombatUI();
    const stats = ui.calculateBattlePreviewStats([], [], 0, 0, 0);

    expect(ui.isTacticalRecommended(stats, { hasFactory: true })).toBe(false);
  });
});
