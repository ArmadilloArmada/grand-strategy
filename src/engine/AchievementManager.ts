/**
 * AchievementManager - Handles game achievements
 * Tracks player progress and unlocks achievements
 */

import { soundManager } from '../audio/SoundManager';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'combat' | 'economy' | 'territory' | 'special' | 'campaign';
  hidden: boolean;
  condition: AchievementCondition;
  reward?: {
    type: 'title' | 'icon' | 'bonus';
    value: string;
  };
}

export interface AchievementCondition {
  type: 'win_games' | 'win_faction' | 'capture_territories' | 'destroy_units' |
        'produce_units' | 'earn_ipcs' | 'complete_campaign' | 'win_streak' |
        'speed_victory' | 'domination' | 'no_losses' | 'underdog' | 'custom' |
        'espionage_op' | 'nuclear_strike' | 'fortification_built' | 'alliance_formed' |
        'commander_leveled';
  value: number;
  faction?: string;
  mapId?: string;
  turns?: number;
}

export interface AchievementProgress {
  achievementId: string;
  currentValue: number;
  unlocked: boolean;
  unlockedAt?: number;
}

// All achievements in the game
export const ACHIEVEMENTS: Achievement[] = [
  // Combat achievements
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Win your first battle',
    icon: '⚔️',
    category: 'combat',
    hidden: false,
    condition: { type: 'destroy_units', value: 1 },
  },
  {
    id: 'warrior',
    name: 'Warrior',
    description: 'Destroy 100 enemy units',
    icon: '🗡️',
    category: 'combat',
    hidden: false,
    condition: { type: 'destroy_units', value: 100 },
  },
  {
    id: 'warlord',
    name: 'Warlord',
    description: 'Destroy 500 enemy units',
    icon: '👑',
    category: 'combat',
    hidden: false,
    condition: { type: 'destroy_units', value: 500 },
  },
  {
    id: 'conqueror',
    name: 'Conqueror',
    description: 'Destroy 1000 enemy units',
    icon: '🏆',
    category: 'combat',
    hidden: false,
    condition: { type: 'destroy_units', value: 1000 },
  },
  
  // Territory achievements
  {
    id: 'land_grab',
    name: 'Land Grab',
    description: 'Capture 10 territories',
    icon: '🗺️',
    category: 'territory',
    hidden: false,
    condition: { type: 'capture_territories', value: 10 },
  },
  {
    id: 'empire_builder',
    name: 'Empire Builder',
    description: 'Capture 50 territories',
    icon: '🏰',
    category: 'territory',
    hidden: false,
    condition: { type: 'capture_territories', value: 50 },
  },
  {
    id: 'world_domination',
    name: 'World Domination',
    description: 'Capture 100 territories',
    icon: '🌍',
    category: 'territory',
    hidden: false,
    condition: { type: 'capture_territories', value: 100 },
  },
  
  // Economy achievements
  {
    id: 'industrialist',
    name: 'Industrialist',
    description: 'Produce 100 units',
    icon: '🏭',
    category: 'economy',
    hidden: false,
    condition: { type: 'produce_units', value: 100 },
  },
  {
    id: 'war_machine',
    name: 'War Machine',
    description: 'Produce 500 units',
    icon: '⚙️',
    category: 'economy',
    hidden: false,
    condition: { type: 'produce_units', value: 500 },
  },
  {
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Earn 1000 IPCs total',
    icon: '💰',
    category: 'economy',
    hidden: false,
    condition: { type: 'earn_ipcs', value: 1000 },
  },
  {
    id: 'billionaire',
    name: 'Billionaire',
    description: 'Earn 10000 IPCs total',
    icon: '💎',
    category: 'economy',
    hidden: false,
    condition: { type: 'earn_ipcs', value: 10000 },
  },
  
  // Victory achievements
  {
    id: 'first_victory',
    name: 'First Victory',
    description: 'Win your first game',
    icon: '🎖️',
    category: 'special',
    hidden: false,
    condition: { type: 'win_games', value: 1 },
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Win 10 games',
    icon: '🎗️',
    category: 'special',
    hidden: false,
    condition: { type: 'win_games', value: 10 },
  },
  {
    id: 'master_strategist',
    name: 'Master Strategist',
    description: 'Win 50 games',
    icon: '🏅',
    category: 'special',
    hidden: false,
    condition: { type: 'win_games', value: 50 },
  },
  {
    id: 'legendary_commander',
    name: 'Legendary Commander',
    description: 'Win 100 games',
    icon: '🎖️',
    category: 'special',
    hidden: false,
    condition: { type: 'win_games', value: 100 },
  },
  
  // Special achievements
  {
    id: 'blitzkrieg',
    name: 'Blitzkrieg',
    description: 'Win a game in under 10 turns',
    icon: '⚡',
    category: 'special',
    hidden: false,
    condition: { type: 'speed_victory', value: 10 },
  },
  {
    id: 'perfect_game',
    name: 'Perfect Game',
    description: 'Win without losing any units',
    icon: '✨',
    category: 'special',
    hidden: true,
    condition: { type: 'no_losses', value: 1 },
  },
  {
    id: 'underdog',
    name: 'Underdog Victory',
    description: 'Win when controlling fewer territories than enemy',
    icon: '🐕',
    category: 'special',
    hidden: true,
    condition: { type: 'underdog', value: 1 },
  },
  {
    id: 'winning_streak',
    name: 'On Fire',
    description: 'Win 5 games in a row',
    icon: '🔥',
    category: 'special',
    hidden: false,
    condition: { type: 'win_streak', value: 5 },
  },
  
  // Espionage achievements
  {
    id: 'spymaster_novice',
    name: 'Spymaster',
    description: 'Execute your first spy operation',
    icon: '🕵️',
    category: 'special',
    hidden: false,
    condition: { type: 'espionage_op', value: 1 },
  },
  {
    id: 'spymaster_veteran',
    name: 'Shadow Broker',
    description: 'Execute 10 spy operations',
    icon: '🌑',
    category: 'special',
    hidden: false,
    condition: { type: 'espionage_op', value: 10 },
  },
  {
    id: 'spymaster_elite',
    name: 'Grand Spymaster',
    description: 'Execute 25 spy operations',
    icon: '🎭',
    category: 'special',
    hidden: true,
    condition: { type: 'espionage_op', value: 25 },
  },
  // Nuclear achievements
  {
    id: 'nuclear_deterrent',
    name: 'Nuclear Deterrent',
    description: 'Launch a nuclear strike',
    icon: '☢️',
    category: 'special',
    hidden: true,
    condition: { type: 'nuclear_strike', value: 1 },
  },
  {
    id: 'nuclear_superpower',
    name: 'Nuclear Superpower',
    description: 'Launch 3 nuclear strikes',
    icon: '💥',
    category: 'special',
    hidden: true,
    condition: { type: 'nuclear_strike', value: 3 },
  },
  // Fortification achievements
  {
    id: 'trench_digger',
    name: 'Trench Digger',
    description: 'Build your first fortification',
    icon: '🏗️',
    category: 'special',
    hidden: false,
    condition: { type: 'fortification_built', value: 1 },
  },
  {
    id: 'fortress_commander',
    name: 'Fortress Commander',
    description: 'Build 10 fortifications',
    icon: '🏰',
    category: 'special',
    hidden: false,
    condition: { type: 'fortification_built', value: 10 },
  },
  // Alliance achievements
  {
    id: 'diplomat',
    name: 'Diplomat',
    description: 'Form your first alliance',
    icon: '🤝',
    category: 'special',
    hidden: false,
    condition: { type: 'alliance_formed', value: 1 },
  },
  {
    id: 'coalition_builder',
    name: 'Coalition Builder',
    description: 'Form 5 alliances across different games',
    icon: '🌐',
    category: 'special',
    hidden: false,
    condition: { type: 'alliance_formed', value: 5 },
  },
  // Commander achievements
  {
    id: 'promoted',
    name: 'Promoted',
    description: 'Level up a commander',
    icon: '⭐',
    category: 'special',
    hidden: false,
    condition: { type: 'commander_leveled', value: 1 },
  },
  {
    id: 'field_marshal',
    name: 'Field Marshal',
    description: 'Level up commanders 10 times',
    icon: '🎖️',
    category: 'special',
    hidden: false,
    condition: { type: 'commander_leveled', value: 10 },
  },

  // Campaign achievements
  {
    id: 'campaign_europe',
    name: 'European Liberation',
    description: 'Complete the Europe campaign',
    icon: '🇪🇺',
    category: 'campaign',
    hidden: false,
    condition: { type: 'complete_campaign', value: 1, mapId: 'europe' },
  },
  {
    id: 'campaign_pacific',
    name: 'Pacific Victor',
    description: 'Complete the Pacific campaign',
    icon: '🌊',
    category: 'campaign',
    hidden: false,
    condition: { type: 'complete_campaign', value: 1, mapId: 'pacific' },
  },
  {
    id: 'campaign_world',
    name: 'World Conqueror',
    description: 'Complete the World War campaign',
    icon: '🌐',
    category: 'campaign',
    hidden: false,
    condition: { type: 'complete_campaign', value: 1, mapId: 'world' },
  },
  {
    id: 'campaign_cold_war',
    name: 'Cold Warrior',
    description: 'Complete the Cold War Crisis campaign',
    icon: '☢️',
    category: 'campaign',
    hidden: false,
    condition: { type: 'complete_campaign', value: 1, mapId: 'cold_war_campaign' },
  },
  {
    id: 'grand_strategist',
    name: 'Grand Strategist',
    description: 'Complete all campaigns',
    icon: '👑',
    category: 'campaign',
    hidden: true,
    condition: { type: 'complete_campaign', value: 4 },
  },
];

export class AchievementManager {
  private progress: Map<string, AchievementProgress> = new Map();
  private storageKey = 'grand_strategy_achievements';
  private listeners: ((achievement: Achievement) => void)[] = [];
  
  constructor() {
    this.load();
  }
  
  /**
   * Load achievement progress from storage
   */
  private load(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const data = JSON.parse(saved) as AchievementProgress[];
        for (const p of data) {
          this.progress.set(p.achievementId, p);
        }
      }
    } catch (e) {
      console.error('Failed to load achievements:', e);
    }
    
    // Initialize any missing achievements
    for (const achievement of ACHIEVEMENTS) {
      if (!this.progress.has(achievement.id)) {
        this.progress.set(achievement.id, {
          achievementId: achievement.id,
          currentValue: 0,
          unlocked: false,
        });
      }
    }
  }
  
  /**
   * Save achievement progress to storage
   */
  private save(): void {
    try {
      const data = Array.from(this.progress.values());
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save achievements:', e);
    }
  }
  
  /**
   * Update progress towards an achievement
   */
  updateProgress(type: AchievementCondition['type'], value: number = 1, context?: { faction?: string; mapId?: string; turns?: number }): void {
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.condition.type !== type) continue;
      
      const progress = this.progress.get(achievement.id);
      if (!progress || progress.unlocked) continue;
      
      // Check faction/map requirements
      if (achievement.condition.faction && achievement.condition.faction !== context?.faction) continue;
      if (achievement.condition.mapId && achievement.condition.mapId !== context?.mapId) continue;
      
      // Special handling for speed victory
      if (type === 'speed_victory' && context?.turns) {
        if (context.turns <= achievement.condition.value) {
          this.unlock(achievement);
        }
        continue;
      }
      
      // Increment progress
      progress.currentValue += value;
      
      // Check if unlocked
      if (progress.currentValue >= achievement.condition.value) {
        this.unlock(achievement);
      }
    }
    
    this.save();
  }
  
  /**
   * Unlock an achievement
   */
  private unlock(achievement: Achievement): void {
    const progress = this.progress.get(achievement.id);
    if (!progress || progress.unlocked) return;
    
    progress.unlocked = true;
    progress.unlockedAt = Date.now();
    
    // Play sound and notify
    soundManager.play('achievement');

    for (const listener of this.listeners) {
      listener(achievement);
    }
  }
  
  /**
   * Check for special achievements after game end
   */
  checkGameEnd(won: boolean, context: {
    faction: string;
    mapId: string;
    turns: number;
    unitsLost: number;
    territoriesOwned: number;
    enemyTerritoriesOwned: number;
  }): void {
    if (won) {
      this.updateProgress('win_games', 1);
      
      // Speed victory
      this.updateProgress('speed_victory', 1, { turns: context.turns });
      
      // Perfect game
      if (context.unitsLost === 0) {
        this.updateProgress('no_losses', 1);
      }
      
      // Underdog
      if (context.territoriesOwned < context.enemyTerritoriesOwned) {
        this.updateProgress('underdog', 1);
      }
      
      // Win streak
      this.updateWinStreak(true);
    } else {
      this.updateWinStreak(false);
    }
  }
  
  /**
   * Update win streak
   */
  private updateWinStreak(won: boolean): void {
    const key = 'win_streak_current';
    let streak = parseInt(localStorage.getItem(key) || '0');
    
    if (won) {
      streak++;
      localStorage.setItem(key, streak.toString());
      
      // Check streak achievements
      for (const achievement of ACHIEVEMENTS) {
        if (achievement.condition.type === 'win_streak') {
          if (streak >= achievement.condition.value) {
            this.unlock(achievement);
          }
        }
      }
    } else {
      localStorage.setItem(key, '0');
    }
  }
  
  /**
   * Get all achievements
   */
  getAll(): Achievement[] {
    return ACHIEVEMENTS;
  }
  
  /**
   * Get achievement by ID
   */
  get(id: string): Achievement | undefined {
    return ACHIEVEMENTS.find(a => a.id === id);
  }
  
  /**
   * Get achievement progress
   */
  getProgress(id: string): AchievementProgress | undefined {
    return this.progress.get(id);
  }
  
  /**
   * Get all unlocked achievements
   */
  getUnlocked(): Achievement[] {
    return ACHIEVEMENTS.filter(a => this.progress.get(a.id)?.unlocked);
  }
  
  /**
   * Get completion percentage
   */
  getCompletionPercent(): number {
    const total = ACHIEVEMENTS.length;
    const unlocked = this.getUnlocked().length;
    return Math.round((unlocked / total) * 100);
  }
  
  /**
   * Subscribe to achievement unlocks
   */
  onUnlock(callback: (achievement: Achievement) => void): void {
    this.listeners.push(callback);
  }
  
  /**
   * Reset all achievements (for testing)
   */
  reset(): void {
    this.progress.clear();
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem('win_streak_current');
    this.load();
  }
}

// Singleton instance
export const achievementManager = new AchievementManager();
