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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
