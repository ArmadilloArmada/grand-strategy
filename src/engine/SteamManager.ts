/**
 * SteamManager - Handles Steam integration
 * Achievements, Cloud Saves, Workshop, and Overlay
 */

export interface SteamAchievement {
  id: string;
  apiName: string;     // Steam API achievement name
  name: string;
  description: string;
  icon: string;
  hidden: boolean;
}

export interface WorkshopItem {
  id: string;
  title: string;
  description: string;
  author: string;
  authorId: string;
  tags: string[];
  previewUrl?: string;
  fileUrl?: string;
  subscriberCount: number;
  rating: number;
  createdAt: number;
  updatedAt: number;
  size: number;
}

// Steam achievement mappings
const STEAM_ACHIEVEMENTS: SteamAchievement[] = [
  {
    id: 'first_blood',
    apiName: 'ACH_FIRST_BLOOD',
    name: 'First Blood',
    description: 'Win your first battle',
    icon: 'ach_first_blood.png',
    hidden: false,
  },
  {
    id: 'first_victory',
    apiName: 'ACH_FIRST_VICTORY',
    name: 'First Victory',
    description: 'Win your first game',
    icon: 'ach_first_victory.png',
    hidden: false,
  },
  {
    id: 'warrior',
    apiName: 'ACH_WARRIOR',
    name: 'Warrior',
    description: 'Destroy 100 enemy units',
    icon: 'ach_warrior.png',
    hidden: false,
  },
  {
    id: 'warlord',
    apiName: 'ACH_WARLORD',
    name: 'Warlord',
    description: 'Destroy 500 enemy units',
    icon: 'ach_warlord.png',
    hidden: false,
  },
  {
    id: 'conqueror',
    apiName: 'ACH_CONQUEROR',
    name: 'Conqueror',
    description: 'Destroy 1000 enemy units',
    icon: 'ach_conqueror.png',
    hidden: false,
  },
  {
    id: 'land_grab',
    apiName: 'ACH_LAND_GRAB',
    name: 'Land Grab',
    description: 'Capture 10 territories',
    icon: 'ach_land_grab.png',
    hidden: false,
  },
  {
    id: 'empire_builder',
    apiName: 'ACH_EMPIRE_BUILDER',
    name: 'Empire Builder',
    description: 'Capture 50 territories',
    icon: 'ach_empire_builder.png',
    hidden: false,
  },
  {
    id: 'world_domination',
    apiName: 'ACH_WORLD_DOMINATION',
    name: 'World Domination',
    description: 'Capture 100 territories',
    icon: 'ach_world_dom.png',
    hidden: false,
  },
  {
    id: 'industrialist',
    apiName: 'ACH_INDUSTRIALIST',
    name: 'Industrialist',
    description: 'Produce 100 units',
    icon: 'ach_industrialist.png',
    hidden: false,
  },
  {
    id: 'veteran',
    apiName: 'ACH_VETERAN',
    name: 'Veteran',
    description: 'Win 10 games',
    icon: 'ach_veteran.png',
    hidden: false,
  },
  {
    id: 'master_strategist',
    apiName: 'ACH_MASTER_STRATEGIST',
    name: 'Master Strategist',
    description: 'Win 50 games',
    icon: 'ach_master.png',
    hidden: false,
  },
  {
    id: 'blitzkrieg',
    apiName: 'ACH_BLITZKRIEG',
    name: 'Blitzkrieg',
    description: 'Win a game in under 10 turns',
    icon: 'ach_blitzkrieg.png',
    hidden: false,
  },
  {
    id: 'perfect_game',
    apiName: 'ACH_PERFECT_GAME',
    name: 'Perfect Game',
    description: 'Win without losing any units',
    icon: 'ach_perfect.png',
    hidden: true,
  },
  {
    id: 'campaign_europe',
    apiName: 'ACH_CAMPAIGN_EUROPE',
    name: 'European Liberation',
    description: 'Complete the Europe campaign',
    icon: 'ach_europe.png',
    hidden: false,
  },
  {
    id: 'campaign_pacific',
    apiName: 'ACH_CAMPAIGN_PACIFIC',
    name: 'Pacific Victor',
    description: 'Complete the Pacific campaign',
    icon: 'ach_pacific.png',
    hidden: false,
  },
  {
    id: 'campaign_world',
    apiName: 'ACH_CAMPAIGN_WORLD',
    name: 'World Conqueror',
    description: 'Complete the World War campaign',
    icon: 'ach_world.png',
    hidden: false,
  },
  {
    id: 'grand_strategist',
    apiName: 'ACH_GRAND_STRATEGIST',
    name: 'Grand Strategist',
    description: 'Complete all campaigns',
    icon: 'ach_grand.png',
    hidden: true,
  },
];

export class SteamManager {
  private isInitialized: boolean = false;
  private steamUsername: string = '';
  // @ts-ignore Reserved for future use
  private steamId: string = '';
  
  /**
   * Initialize Steam integration
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if running in Electron with Steam
      if (!window.electronAPI) {
        return false;
      }

      const isSteamRunning = await window.electronAPI.isSteamRunning();
      if (!isSteamRunning) {
        return false;
      }

      // Get Steam user info
      this.steamUsername = await window.electronAPI.getSteamUsername() || 'Player';
      this.isInitialized = true;
      return true;
    } catch (e) {
      console.error('Failed to initialize Steam:', e);
      return false;
    }
  }
  
  /**
   * Check if Steam is available
   */
  isAvailable(): boolean {
    return this.isInitialized;
  }
  
  /**
   * Get Steam username
   */
  getUsername(): string {
    return this.steamUsername;
  }
  
  /**
   * Unlock a Steam achievement
   */
  async unlockAchievement(achievementId: string): Promise<boolean> {
    if (!this.isInitialized) return false;
    
    const steamAch = STEAM_ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!steamAch) {
      console.warn(`No Steam achievement mapping for: ${achievementId}`);
      return false;
    }
    
    try {
      await window.electronAPI?.unlockAchievement(steamAch.apiName);
      return true;
    } catch (e) {
      console.error(`Failed to unlock Steam achievement: ${steamAch.apiName}`, e);
      return false;
    }
  }
  
  /**
   * Get all Steam achievements
   */
  getAchievements(): SteamAchievement[] {
    return STEAM_ACHIEVEMENTS;
  }
  
  /**
   * Open Steam overlay to achievement page
   */
  openAchievementsOverlay(): void {
    window.electronAPI?.openSteamOverlay?.('Achievements');
  }
  
  // ==================== WORKSHOP INTEGRATION ====================
  
  /**
   * Get Workshop items (mods) from Steam
   */
  async getWorkshopItems(_query?: string, _tags?: string[]): Promise<WorkshopItem[]> {
    // In a real implementation, this would call the Steam Workshop API
    // For now, return mock data
    
    return [
      {
        id: 'workshop_1',
        title: 'WWII Realism Mod',
        description: 'Adds historically accurate unit stats and mechanics',
        author: 'HistoryBuff42',
        authorId: '12345',
        tags: ['gameplay', 'historical'],
        subscriberCount: 1250,
        rating: 4.5,
        createdAt: Date.now() - 86400000 * 30,
        updatedAt: Date.now() - 86400000 * 5,
        size: 1024 * 500,
      },
      {
        id: 'workshop_2',
        title: 'Cold War Map Pack',
        description: 'New maps set during the Cold War era',
        author: 'MapMaker99',
        authorId: '67890',
        tags: ['maps', 'cold_war'],
        subscriberCount: 850,
        rating: 4.2,
        createdAt: Date.now() - 86400000 * 60,
        updatedAt: Date.now() - 86400000 * 10,
        size: 1024 * 1024 * 2,
      },
      {
        id: 'workshop_3',
        title: 'Modern Warfare Units',
        description: 'Adds modern military units like drones and stealth fighters',
        author: 'TechWarrior',
        authorId: '11111',
        tags: ['units', 'modern'],
        subscriberCount: 2100,
        rating: 4.8,
        createdAt: Date.now() - 86400000 * 90,
        updatedAt: Date.now() - 86400000 * 2,
        size: 1024 * 750,
      },
    ];
  }
  
  /**
   * Subscribe to a Workshop item
   */
  async subscribeToItem(_itemId: string): Promise<boolean> {
    // Would call Steam Workshop API
    return true;
  }

  /**
   * Unsubscribe from a Workshop item
   */
  async unsubscribeFromItem(_itemId: string): Promise<boolean> {
    // Would call Steam Workshop API
    return true;
  }
  
  /**
   * Get subscribed items
   */
  async getSubscribedItems(): Promise<WorkshopItem[]> {
    // Would call Steam Workshop API
    return [];
  }
  
  /**
   * Publish a mod to Workshop
   */
  async publishToWorkshop(
    _title: string,
    _description: string,
    _tags: string[],
    _modData: string,
    _previewImage?: string
  ): Promise<string | null> {
    // Would call Steam Workshop API
    // Returns workshop item ID on success
    return `workshop_${Date.now()}`;
  }
  
  /**
   * Update a published Workshop item
   */
  async updateWorkshopItem(
    _itemId: string,
    _updates: Partial<{ title: string; description: string; tags: string[]; modData: string }>
  ): Promise<boolean> {
    // Would call Steam Workshop API
    return true;
  }
  
  /**
   * Open Workshop in Steam overlay
   */
  openWorkshopOverlay(): void {
    window.electronAPI?.openSteamOverlay?.('Workshop');
  }

  /**
   * Open Workshop item page
   */
  openWorkshopItemPage(_itemId: string): void {
    window.electronAPI?.openSteamOverlay?.('Workshop');
  }
  
  // ==================== RICH PRESENCE ====================
  
  /**
   * Set Steam Rich Presence status
   */
  setRichPresence(status: string, details?: Record<string, string>): void {
    window.electronAPI?.setRichPresence?.(status, details);
  }

  /**
   * Clear Rich Presence
   */
  clearRichPresence(): void {
    window.electronAPI?.setRichPresence?.('');
  }
}

// Singleton instance
export const steamManager = new SteamManager();