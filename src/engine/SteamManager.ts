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
    id: 'war_machine',
    apiName: 'ACH_WAR_MACHINE',
    name: 'War Machine',
    description: 'Produce 500 units',
    icon: 'ach_war_machine.png',
    hidden: false,
  },
  {
    id: 'millionaire',
    apiName: 'ACH_MILLIONAIRE',
    name: 'Millionaire',
    description: 'Earn 1000 IPCs total',
    icon: 'ach_millionaire.png',
    hidden: false,
  },
  {
    id: 'billionaire',
    apiName: 'ACH_BILLIONAIRE',
    name: 'Billionaire',
    description: 'Earn 10000 IPCs total',
    icon: 'ach_billionaire.png',
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
    id: 'legendary_commander',
    apiName: 'ACH_LEGENDARY_COMMANDER',
    name: 'Legendary Commander',
    description: 'Win 100 games',
    icon: 'ach_legendary.png',
    hidden: false,
  },
  {
    id: 'underdog',
    apiName: 'ACH_UNDERDOG',
    name: 'Underdog Victory',
    description: 'Win when controlling fewer territories than enemy',
    icon: 'ach_underdog.png',
    hidden: true,
  },
  {
    id: 'winning_streak',
    apiName: 'ACH_WINNING_STREAK',
    name: 'On Fire',
    description: 'Win 5 games in a row',
    icon: 'ach_streak.png',
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
    if (!this.isInitialized) return [];
    try {
      return (await window.electronAPI?.getWorkshopItems?.(_query, _tags)) ?? [];
    } catch {
      return [];
    }
  }
  
  /**
   * Subscribe to a Workshop item
   */
  async subscribeToItem(itemId: string): Promise<boolean> {
    if (!this.isInitialized) return false;
    try { return (await window.electronAPI?.subscribeWorkshopItem?.(itemId)) ?? false; } catch { return false; }
  }

  /**
   * Unsubscribe from a Workshop item
   */
  async unsubscribeFromItem(itemId: string): Promise<boolean> {
    if (!this.isInitialized) return false;
    try { return (await window.electronAPI?.unsubscribeWorkshopItem?.(itemId)) ?? false; } catch { return false; }
  }
  
  /**
   * Get subscribed items
   */
  async getSubscribedItems(): Promise<WorkshopItem[]> {
    return this.getWorkshopItems(undefined, ['subscribed']);
  }

  /**
   * Publish a mod to Workshop.
   * modData is a JSON string (the mod file content). Returns the new item ID or null on failure.
   */
  async publishToWorkshop(
    title: string,
    description: string,
    tags: string[],
    modData: string,
    previewImage?: string
  ): Promise<string | null> {
    if (!this.isInitialized) return null;
    try {
      // Write modData to a temp file path the main process can read.
      // We pass the content directly; main.cjs writes it to a temp dir.
      const result = await (window.electronAPI as any)?.publishToWorkshop?.({
        title,
        description,
        tags,
        modData,
        previewPath: previewImage,
      });
      if (result?.success) return result.itemId ?? null;
      if (result?.error) console.warn('[SteamManager] publishToWorkshop:', result.error);
      return null;
    } catch (e) {
      console.error('[SteamManager] publishToWorkshop failed:', e);
      return null;
    }
  }

  /**
   * Update a published Workshop item.
   */
  async updateWorkshopItem(
    itemId: string,
    updates: Partial<{ title: string; description: string; tags: string[]; modData: string }>
  ): Promise<boolean> {
    if (!this.isInitialized) return false;
    try {
      const result = await (window.electronAPI as any)?.updateWorkshopItem?.({
        itemId,
        title: updates.title,
        description: updates.description,
        tags: updates.tags,
        modData: updates.modData,
      });
      if (result?.success) return true;
      if (result?.error) console.warn('[SteamManager] updateWorkshopItem:', result.error);
      return false;
    } catch (e) {
      console.error('[SteamManager] updateWorkshopItem failed:', e);
      return false;
    }
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