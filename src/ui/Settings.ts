/**
 * Settings - Game settings management
 */

const SETTINGS_KEY = 'grand-strategy-settings';

export interface GameSettings {
  // Gameplay
  gameSpeed: 'slow' | 'normal' | 'fast';
  aiDifficulty: 'easy' | 'medium' | 'hard';
  aiPersonality: string;
  showMoveHighlights: boolean;
  confirmEndTurn: boolean;
  animationsEnabled: boolean;
  showTerritoryNames: boolean;
  // Audio
  musicEnabled: boolean;
  sfxEnabled: boolean;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
}

const DEFAULT_SETTINGS: GameSettings = {
  gameSpeed: 'normal',
  aiDifficulty: 'medium',
  aiPersonality: 'default',
  showMoveHighlights: true,
  confirmEndTurn: false,
  animationsEnabled: true,
  showTerritoryNames: true,
  musicEnabled: true,
  sfxEnabled: true,
  masterVolume: 70,
  sfxVolume: 80,
  musicVolume: 60,
};

class SettingsManager {
  private settings: GameSettings;
  private listeners: Set<(settings: GameSettings) => void> = new Set();

  constructor() {
    this.settings = this.load();
  }

  /**
   * Get current settings
   */
  get(): GameSettings {
    return { ...this.settings };
  }

  /**
   * Get a specific setting
   */
  getSetting<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return this.settings[key];
  }

  /**
   * Update settings
   */
  update(partial: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.save();
    this.notifyListeners();
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
    this.notifyListeners();
  }

  /**
   * Get AI turn delay in ms based on game speed
   */
  getAIDelay(): number {
    const speed = this.settings.gameSpeed;
    switch (speed) {
      case 'slow': return 1200;
      case 'fast': return 300;
      default: return 600;
    }
  }

  /**
   * Register a listener for settings changes
   */
  onChange(listener: (settings: GameSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Save settings to localStorage
   */
  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  /**
   * Load settings from localStorage
   */
  private load(): GameSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (data) {
        const parsed = JSON.parse(data) as Partial<GameSettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.get());
    }
  }
}

export const settings = new SettingsManager();
