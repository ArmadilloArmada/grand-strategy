/**
 * StatisticsManager tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { statisticsManager } from '../StatisticsManager';

beforeEach(() => {
  statisticsManager.reset();
});

describe('StatisticsManager — initFaction / getFactionStats', () => {
  it('auto-initializes faction on first access', () => {
    const stats = statisticsManager.getFactionStats('alpha');
    expect(stats.factionId).toBe('alpha');
    expect(stats.battlesWon).toBe(0);
  });

  it('initFaction is idempotent', () => {
    statisticsManager.initFaction('alpha');
    statisticsManager.initFaction('alpha');
    const stats = statisticsManager.getFactionStats('alpha');
    expect(stats.battlesWon).toBe(0);
  });
});

describe('StatisticsManager — individual trackers', () => {
  it('trackBattleWon increments battlesWon', () => {
    statisticsManager.trackBattleWon('alpha');
    statisticsManager.trackBattleWon('alpha');
    expect(statisticsManager.getFactionStats('alpha').battlesWon).toBe(2);
  });

  it('trackBattleLost increments battlesLost', () => {
    statisticsManager.trackBattleLost('alpha');
    expect(statisticsManager.getFactionStats('alpha').battlesLost).toBe(1);
  });

  it('trackUnitProduced accumulates by count', () => {
    statisticsManager.trackUnitProduced('alpha', 5);
    statisticsManager.trackUnitProduced('alpha', 3);
    expect(statisticsManager.getFactionStats('alpha').unitsProduced).toBe(8);
  });

  it('trackUnitKilled accumulates by count', () => {
    statisticsManager.trackUnitKilled('alpha', 10);
    expect(statisticsManager.getFactionStats('alpha').unitsKilled).toBe(10);
  });

  it('trackUnitLost accumulates by count', () => {
    statisticsManager.trackUnitLost('alpha', 4);
    expect(statisticsManager.getFactionStats('alpha').unitsLost).toBe(4);
  });

  it('trackTerritoryCaptured increments territoriesCaptured', () => {
    statisticsManager.trackTerritoryCaptured('alpha');
    statisticsManager.trackTerritoryCaptured('alpha');
    expect(statisticsManager.getFactionStats('alpha').territoriesCaptured).toBe(2);
  });

  it('trackTerritoryLost increments territoriesLost', () => {
    statisticsManager.trackTerritoryLost('alpha');
    expect(statisticsManager.getFactionStats('alpha').territoriesLost).toBe(1);
  });

  it('trackIncome increments totalIncome and totalIncomeEarned', () => {
    statisticsManager.trackIncome('alpha', 30);
    const s = statisticsManager.getFactionStats('alpha');
    expect(s.totalIncome).toBe(30);
    expect(s.totalIncomeEarned).toBe(30);
  });

  it('trackSpending increments totalIPCsSpent', () => {
    statisticsManager.trackSpending('alpha', 12);
    expect(statisticsManager.getFactionStats('alpha').totalIPCsSpent).toBe(12);
  });

  it('trackTechResearched increments techResearched', () => {
    statisticsManager.trackTechResearched('alpha');
    expect(statisticsManager.getFactionStats('alpha').techResearched).toBe(1);
  });

  it('trackNukeLaunched increments nukesLaunched', () => {
    statisticsManager.trackNukeLaunched('alpha');
    expect(statisticsManager.getFactionStats('alpha').nukesLaunched).toBe(1);
  });

  it('trackTurn increments both faction turnCount and global totalTurns', () => {
    statisticsManager.trackTurn('alpha');
    statisticsManager.trackTurn('alpha');
    expect(statisticsManager.getFactionStats('alpha').turnCount).toBe(2);
    const snap = statisticsManager.getAllStats();
    expect(snap.totalTurns).toBe(2);
  });
});

describe('StatisticsManager — getAllStats', () => {
  it('totalBattles is half the sum of battles across all factions', () => {
    statisticsManager.trackBattleWon('alpha');
    statisticsManager.trackBattleLost('beta');
    const snap = statisticsManager.getAllStats();
    // alpha: 1 won, beta: 1 lost → total raw = 2, halved = 1
    expect(snap.totalBattles).toBe(1);
  });

  it('factionStats map contains all tracked factions', () => {
    statisticsManager.initFaction('alpha');
    statisticsManager.initFaction('beta');
    const snap = statisticsManager.getAllStats();
    expect(snap.factionStats.has('alpha')).toBe(true);
    expect(snap.factionStats.has('beta')).toBe(true);
  });
});

describe('StatisticsManager — getLeaderboard', () => {
  it('ranks factions by score (territories * 3 + battles * 2 + kills)', () => {
    statisticsManager.trackTerritoryCaptured('alpha'); // +3
    statisticsManager.trackTerritoryCaptured('alpha'); // +3 = 6
    statisticsManager.trackBattleWon('beta');           // +2
    statisticsManager.trackUnitKilled('beta', 10);      // +10 = 12

    const board = statisticsManager.getLeaderboard();
    expect(board[0].factionId).toBe('beta');
    expect(board[1].factionId).toBe('alpha');
  });

  it('returns empty leaderboard when no factions tracked', () => {
    expect(statisticsManager.getLeaderboard()).toHaveLength(0);
  });
});

describe('StatisticsManager — serialize / deserialize', () => {
  it('round-trips stats correctly', () => {
    statisticsManager.trackBattleWon('alpha');
    statisticsManager.trackUnitKilled('alpha', 5);
    const serialized = statisticsManager.serialize();

    statisticsManager.reset();
    statisticsManager.deserialize(serialized);

    const stats = statisticsManager.getFactionStats('alpha');
    expect(stats.battlesWon).toBe(1);
    expect(stats.unitsKilled).toBe(5);
  });

  it('deserialize with empty data does not throw', () => {
    expect(() => statisticsManager.deserialize({})).not.toThrow();
  });
});

describe('StatisticsManager — reset', () => {
  it('clears all faction stats', () => {
    statisticsManager.trackBattleWon('alpha');
    statisticsManager.reset();
    const snap = statisticsManager.getAllStats();
    expect(snap.factionStats.size).toBe(0);
    expect(snap.totalTurns).toBe(0);
  });
});
