/**
 * StatisticsManager - Tracks per-faction game statistics
 */

export interface FactionStats {
  factionId: string;
  battlesWon: number;
  battlesLost: number;
  unitsProduced: number;
  unitsKilled: number;
  unitsLost: number;
  territoriesCaptured: number;
  territoriesLost: number;
  totalIncome: number;
  totalIncomeEarned: number;
  totalIPCsSpent: number;
  techResearched: number;
  nukesLaunched: number;
  veteranUnits: number;
  eliteUnits: number;
  turnCount: number;
}

export interface GameStatsSnapshot {
  totalTurns: number;
  totalBattles: number;
  factionStats: Map<string, FactionStats>;
}

function defaultStats(factionId: string): FactionStats {
  return {
    factionId,
    battlesWon: 0,
    battlesLost: 0,
    unitsProduced: 0,
    unitsKilled: 0,
    unitsLost: 0,
    territoriesCaptured: 0,
    territoriesLost: 0,
    totalIncome: 0,
    totalIncomeEarned: 0,
    totalIPCsSpent: 0,
    techResearched: 0,
    nukesLaunched: 0,
    veteranUnits: 0,
    eliteUnits: 0,
    turnCount: 0,
  };
}

class StatisticsManager {
  private factionStats: Map<string, FactionStats> = new Map();
  private gameStartTime: number = Date.now();
  private totalTurns: number = 0;

  initFaction(factionId: string): void {
    if (!this.factionStats.has(factionId)) {
      this.factionStats.set(factionId, defaultStats(factionId));
    }
  }

  getFactionStats(factionId: string): FactionStats {
    if (!this.factionStats.has(factionId)) {
      this.initFaction(factionId);
    }
    return this.factionStats.get(factionId)!;
  }

  trackBattleWon(factionId: string): void {
    this.getFactionStats(factionId).battlesWon++;
  }

  trackBattleLost(factionId: string): void {
    this.getFactionStats(factionId).battlesLost++;
  }

  trackUnitProduced(factionId: string, count: number = 1): void {
    this.getFactionStats(factionId).unitsProduced += count;
  }

  trackUnitKilled(factionId: string, count: number = 1): void {
    this.getFactionStats(factionId).unitsKilled += count;
  }

  trackUnitLost(factionId: string, count: number = 1): void {
    this.getFactionStats(factionId).unitsLost += count;
  }

  trackTerritoryCaptured(factionId: string): void {
    this.getFactionStats(factionId).territoriesCaptured++;
  }

  trackTerritoryLost(factionId: string): void {
    this.getFactionStats(factionId).territoriesLost++;
  }

  trackIncome(factionId: string, amount: number): void {
    const stats = this.getFactionStats(factionId);
    stats.totalIncome += amount;
    stats.totalIncomeEarned += amount;
  }

  trackSpending(factionId: string, amount: number): void {
    this.getFactionStats(factionId).totalIPCsSpent += amount;
  }

  trackTechResearched(factionId: string): void {
    this.getFactionStats(factionId).techResearched++;
  }

  trackNukeLaunched(factionId: string): void {
    this.getFactionStats(factionId).nukesLaunched++;
  }

  trackTurn(factionId: string): void {
    this.getFactionStats(factionId).turnCount++;
    this.totalTurns++;
  }

  getAllStats(): GameStatsSnapshot {
    let totalBattles = 0;
    for (const stats of this.factionStats.values()) {
      totalBattles += stats.battlesWon + stats.battlesLost;
    }
    return {
      totalTurns: this.totalTurns,
      totalBattles: Math.floor(totalBattles / 2), // each battle counted twice
      factionStats: new Map(this.factionStats),
    };
  }

  getGameDuration(): number {
    return Math.floor((Date.now() - this.gameStartTime) / 60000);
  }

  getLeaderboard(): Array<{ factionId: string; score: number; stats: FactionStats }> {
    return [...this.factionStats.values()]
      .map(stats => ({
        factionId: stats.factionId,
        score: stats.territoriesCaptured * 3 + stats.battlesWon * 2 + stats.unitsKilled,
        stats,
      }))
      .sort((a, b) => b.score - a.score);
  }

  reset(): void {
    this.factionStats.clear();
    this.gameStartTime = Date.now();
    this.totalTurns = 0;
  }

  serialize(): object {
    const result: Record<string, FactionStats> = {};
    for (const [id, stats] of this.factionStats) {
      result[id] = { ...stats };
    }
    return { stats: result, startTime: this.gameStartTime, totalTurns: this.totalTurns };
  }

  deserialize(data: any): void {
    this.factionStats.clear();
    if (data?.stats) {
      for (const [id, stats] of Object.entries(data.stats)) {
        this.factionStats.set(id, stats as FactionStats);
      }
    }
    if (data?.startTime) this.gameStartTime = data.startTime;
    if (data?.totalTurns) this.totalTurns = data.totalTurns;
  }
}

export const statisticsManager = new StatisticsManager();
