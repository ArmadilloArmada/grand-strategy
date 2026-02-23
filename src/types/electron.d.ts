/**
 * Electron API type declarations
 * Exposes the electron API made available by preload.cjs via contextBridge
 */

interface ElectronAPI {
  platform: string;
  openExternal: (url: string) => void;
  onMenuAction: (callback: (action: string) => void) => void;
  removeMenuActionListeners: () => void;
  // Steam integration (optional)
  steam?: {
    isAvailable: () => boolean;
    getSteamId: () => string | null;
    getPlayerName: () => string | null;
    unlockAchievement: (achievementId: string) => boolean;
    setRichPresence: (key: string, value: string) => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
