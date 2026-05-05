/**
 * Electron API type declarations
 * Exposes the electron API made available by preload.cjs via contextBridge
 */

interface ElectronAPI {
  platform: string;
  openExternal(url: string): void;
  onMenuAction(callback: (action: string) => void): void;
  removeMenuActionListeners(): void;

  // Steam integration
  isSteamRunning(): Promise<boolean>;
  getSteamUsername(): Promise<string | null>;
  unlockAchievement(apiName: string): Promise<void>;
  openSteamOverlay(page: string): void;
  setRichPresence(status: string, details?: Record<string, string>): void;

  // Steam Workshop
  getWorkshopItems?(query?: string, tags?: string[]): Promise<import('../engine/SteamManager').WorkshopItem[]>;
  subscribeWorkshopItem?(itemId: string): Promise<boolean>;
  unsubscribeWorkshopItem?(itemId: string): Promise<boolean>;

  // Steam Cloud saves
  steamCloudWrite(filename: string, data: string): Promise<boolean>;
  steamCloudRead(filename: string): Promise<string | null>;
  steamCloudList(): Promise<string[]>;
  steamCloudDelete(filename: string): Promise<boolean>;

  // Mod filesystem (Electron only)
  scanModsFolder(): Promise<{ filename: string; mod: { manifest: Record<string, unknown>; data: unknown } }[]>;
  exportModFile(jsonString: string): Promise<string | null>;
  importModFile(): Promise<unknown>;
  deleteModFile(filename: string): Promise<void>;

  // Window controls
  toggleFullscreen(): Promise<void>;
  isFullscreen(): Promise<boolean>;

  // Native OS menu event listeners (Electron only)
  onMenuNewGame?(callback: () => void): void;
  onMenuSaveGame?(callback: () => void): void;
  onMenuLoadGame?(callback: () => void): void;
  onMenuSettings?(callback: () => void): void;
  onMenuHelp?(callback: () => void): void;
  onMenuZoomIn?(callback: () => void): void;
  onMenuZoomOut?(callback: () => void): void;
  onMenuZoomReset?(callback: () => void): void;
  removeAllListeners?(channel: string): void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

declare const __APP_VERSION__: string;

export {};
