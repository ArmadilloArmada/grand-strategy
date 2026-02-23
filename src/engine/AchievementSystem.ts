/**
 * Achievement System - Tracks and celebrates player accomplishments
 */

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (stats: GameStats) => boolean;
  unlocked?: boolean;
  unlockedAt?: number;
}

export interface GameStats {
  territoriesCaptured: number;
  capitalsCaptured: number;
  battlesWon: number;
  battlesLost: number;
  unitsDestroyed: number;
  unitsLost: number;
  ipcEarned: number;
  ipcSpent: number;
  turnsPlayed: number;
  criticalHits: number;
  perfectBattles: number; // Won without losing units
  comebacks: number; // Won battle while outnumbered
}

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your first battle',
    icon: '⚔️',
    condition: (s) => s.battlesWon >= 1,
  },
  {
    id: 'conqueror',
    name: 'Conqueror',
    description: 'Capture 5 territories',
    icon: '🏰',
    condition: (s) => s.territoriesCaptured >= 5,
  },
  {
    id: 'capital_hunter',
    name: 'Capital Hunter',
    description: 'Capture an enemy capital',
    icon: '👑',
    condition: (s) => s.capitalsCaptured >= 1,
  },
  {
    id: 'warmonger',
    name: 'Warmonger',
    description: 'Win 10 battles',
    icon: '🔥',
    condition: (s) => s.battlesWon >= 10,
  },
  {
    id: 'destroyer',
    name: 'Destroyer',
    description: 'Eliminate 20 enemy units',
    icon: '💀',
    condition: (s) => s.unitsDestroyed >= 20,
  },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Lose a battle but live to fight another day',
    icon: '🛡️',
    condition: (s) => s.battlesLost >= 1 && s.battlesWon >= 1,
  },
  {
    id: 'critical_master',
    name: 'Critical Master',
    description: 'Land 5 critical hits',
    icon: '💥',
    condition: (s) => s.criticalHits >= 5,
  },
  {
    id: 'flawless',
    name: 'Flawless Victory',
    description: 'Win a battle without losing any units',
    icon: '✨',
    condition: (s) => s.perfectBattles >= 1,
  },
  {
    id: 'underdog',
    name: 'Underdog',
    description: 'Win a battle while outnumbered',
    icon: '🎯',
    condition: (s) => s.comebacks >= 1,
  },
  {
    id: 'tycoon',
    name: 'Economic Tycoon',
    description: 'Earn 100 IPCs total',
    icon: '💰',
    condition: (s) => s.ipcEarned >= 100,
  },
  {
    id: 'investor',
    name: 'Military Investor',
    description: 'Spend 50 IPCs on units',
    icon: '🏭',
    condition: (s) => s.ipcSpent >= 50,
  },
  {
    id: 'veteran',
    name: 'Veteran Commander',
    description: 'Complete 10 turns',
    icon: '🎖️',
    condition: (s) => s.turnsPlayed >= 10,
  },
  {
    id: 'blitzkrieg',
    name: 'Blitzkrieg',
    description: 'Capture 3 territories in one turn',
    icon: '⚡',
    condition: (s) => s.territoriesCaptured >= 3, // Will need per-turn tracking
  },
  {
    id: 'empire_builder',
    name: 'Empire Builder',
    description: 'Capture 15 territories',
    icon: '🌍',
    condition: (s) => s.territoriesCaptured >= 15,
  },
  {
    id: 'world_conqueror',
    name: 'World Conqueror',
    description: 'Capture 3 enemy capitals',
    icon: '🏆',
    condition: (s) => s.capitalsCaptured >= 3,
  },
];

export class AchievementSystem {
  private stats: GameStats = {
    territoriesCaptured: 0,
    capitalsCaptured: 0,
    battlesWon: 0,
    battlesLost: 0,
    unitsDestroyed: 0,
    unitsLost: 0,
    ipcEarned: 0,
    ipcSpent: 0,
    turnsPlayed: 0,
    criticalHits: 0,
    perfectBattles: 0,
    comebacks: 0,
  };
  
  private achievements: Achievement[] = ACHIEVEMENTS.map(a => ({ ...a, unlocked: false }));
  private onUnlock: ((achievement: Achievement) => void) | null = null;
  
  constructor() {
    this.loadFromStorage();
  }
  
  /**
   * Set callback for achievement unlock
   */
  setOnUnlock(callback: (achievement: Achievement) => void): void {
    this.onUnlock = callback;
  }
  
  /**
   * Check for newly unlocked achievements
   */
  private checkAchievements(): void {
    for (const achievement of this.achievements) {
      if (!achievement.unlocked && achievement.condition(this.stats)) {
        achievement.unlocked = true;
        achievement.unlockedAt = Date.now();
        this.saveToStorage();
        
        if (this.onUnlock) {
          this.onUnlock(achievement);
        }
      }
    }
  }
  
  // ==================== Stat Updates ====================
  
  recordBattleWon(unitsLost: number, wasOutnumbered: boolean): void {
    this.stats.battlesWon++;
    if (unitsLost === 0) {
      this.stats.perfectBattles++;
    }
    if (wasOutnumbered) {
      this.stats.comebacks++;
    }
    this.checkAchievements();
  }
  
  recordBattleLost(): void {
    this.stats.battlesLost++;
    this.checkAchievements();
  }
  
  recordTerritoryCapture(isCapital: boolean): void {
    this.stats.territoriesCaptured++;
    if (isCapital) {
      this.stats.capitalsCaptured++;
    }
    this.checkAchievements();
  }
  
  recordUnitsDestroyed(count: number): void {
    this.stats.unitsDestroyed += count;
    this.checkAchievements();
  }
  
  recordUnitsLost(count: number): void {
    this.stats.unitsLost += count;
    this.checkAchievements();
  }
  
  recordCriticalHit(): void {
    this.stats.criticalHits++;
    this.checkAchievements();
  }
  
  recordIncome(amount: number): void {
    this.stats.ipcEarned += amount;
    this.checkAchievements();
  }
  
  recordSpending(amount: number): void {
    this.stats.ipcSpent += amount;
    this.checkAchievements();
  }
  
  recordTurnComplete(): void {
    this.stats.turnsPlayed++;
    this.checkAchievements();
  }
  
  // ==================== Getters ====================
  
  getStats(): GameStats {
    return { ...this.stats };
  }
  
  getAchievements(): Achievement[] {
    return this.achievements;
  }
  
  getUnlockedCount(): number {
    return this.achievements.filter(a => a.unlocked).length;
  }
  
  getTotalCount(): number {
    return this.achievements.length;
  }
  
  // ==================== Persistence ====================
  
  private saveToStorage(): void {
    const data = {
      stats: this.stats,
      achievements: this.achievements.map(a => ({
        id: a.id,
        unlocked: a.unlocked,
        unlockedAt: a.unlockedAt,
      })),
    };
    localStorage.setItem('achievements', JSON.stringify(data));
  }
  
  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('achievements');
      if (saved) {
        const data = JSON.parse(saved);
        this.stats = { ...this.stats, ...data.stats };
        
        for (const savedAch of data.achievements) {
          const achievement = this.achievements.find(a => a.id === savedAch.id);
          if (achievement) {
            achievement.unlocked = savedAch.unlocked;
            achievement.unlockedAt = savedAch.unlockedAt;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load achievements:', e);
    }
  }
  
  /**
   * Reset stats for new game (but keep unlocked achievements)
   */
  resetGameStats(): void {
    this.stats = {
      territoriesCaptured: 0,
      capitalsCaptured: 0,
      battlesWon: 0,
      battlesLost: 0,
      unitsDestroyed: 0,
      unitsLost: 0,
      ipcEarned: 0,
      ipcSpent: 0,
      turnsPlayed: 0,
      criticalHits: 0,
      perfectBattles: 0,
      comebacks: 0,
    };
  }
}

// Global singleton
export const achievementSystem = new AchievementSystem();