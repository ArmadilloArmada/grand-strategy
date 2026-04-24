/**
 * CloudSaveManager - Syncs game saves to cloud storage
 * Supports multiple cloud providers
 */

export interface CloudSaveMetadata {
  id: string;
  name: string;
  turnNumber: number;
  factionId: string;
  mapId: string;
  savedAt: number;
  syncedAt: number;
  size: number;
  checksum: string;
}

export interface CloudProvider {
  id: string;
  name: string;
  icon: string;
  isAvailable: () => boolean;
  authenticate: () => Promise<boolean>;
  isAuthenticated: () => boolean;
  upload: (key: string, data: string) => Promise<boolean>;
  download: (key: string) => Promise<string | null>;
  list: () => Promise<CloudSaveMetadata[]>;
  delete: (key: string) => Promise<boolean>;
}

/**
 * Local IndexedDB provider (works offline)
 */
class IndexedDBProvider implements CloudProvider {
  id = 'indexeddb';
  name = 'Local Cloud';
  icon = '💾';
  
  private db: IDBDatabase | null = null;
  private dbName = 'GrandStrategyCloud';
  private storeName = 'saves';
  
  isAvailable(): boolean {
    return 'indexedDB' in window;
  }
  
  async authenticate(): Promise<boolean> {
    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => resolve(false);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve(true);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }
  
  isAuthenticated(): boolean {
    return this.db !== null;
  }
  
  async upload(key: string, data: string): Promise<boolean> {
    if (!this.db) return false;
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const metadata: CloudSaveMetadata = {
        id: key,
        name: `Save ${new Date().toLocaleString()}`,
        turnNumber: 0,
        factionId: '',
        mapId: '',
        savedAt: Date.now(),
        syncedAt: Date.now(),
        size: data.length,
        checksum: this.calculateChecksum(data),
      };
      
      // Try to parse save data for metadata
      try {
        const parsed = JSON.parse(data);
        metadata.turnNumber = parsed.turnNumber || 0;
        metadata.factionId = parsed.currentFactionId || '';
      } catch (e) {
        // Use defaults
      }
      
      const request = store.put({ ...metadata, data });
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }
  
  async download(key: string): Promise<string | null> {
    if (!this.db) return null;
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);
      
      request.onsuccess = () => {
        resolve(request.result?.data || null);
      };
      request.onerror = () => resolve(null);
    });
  }
  
  async list(): Promise<CloudSaveMetadata[]> {
    if (!this.db) return [];
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const results = request.result.map((r: any) => ({
          id: r.id,
          name: r.name,
          turnNumber: r.turnNumber,
          factionId: r.factionId,
          mapId: r.mapId,
          savedAt: r.savedAt,
          syncedAt: r.syncedAt,
          size: r.size,
          checksum: r.checksum,
        }));
        resolve(results);
      };
      request.onerror = () => resolve([]);
    });
  }
  
  async delete(key: string): Promise<boolean> {
    if (!this.db) return false;
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }
  
  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

/**
 * Steam Cloud provider (when running in Electron with Steamworks)
 */
class SteamCloudProvider implements CloudProvider {
  id = 'steam';
  name = 'Steam Cloud';
  icon = '☁️';
  
  isAvailable(): boolean {
    return !!window.electronAPI?.isSteamRunning;
  }
  
  async authenticate(): Promise<boolean> {
    try {
      return await window.electronAPI?.isSteamRunning() || false;
    } catch {
      return false;
    }
  }
  
  isAuthenticated(): boolean {
    return this.isAvailable();
  }
  
  async upload(key: string, data: string): Promise<boolean> {
    try {
      return await window.electronAPI?.steamCloudWrite(`save_${key}.json`, data) ?? false;
    } catch (e) {
      console.error('Steam Cloud upload failed:', e);
      return false;
    }
  }

  async download(key: string): Promise<string | null> {
    try {
      return await window.electronAPI?.steamCloudRead(`save_${key}.json`) ?? null;
    } catch (e) {
      console.error('Steam Cloud download failed:', e);
      return null;
    }
  }

  async list(): Promise<CloudSaveMetadata[]> {
    try {
      const files: unknown[] = await window.electronAPI?.steamCloudList() ?? [];
      return files
        .filter((f): f is string => typeof f === 'string' && f.startsWith('save_') && f.endsWith('.json'))
        .map((filename) => ({
          id: filename.replace(/^save_/, '').replace(/\.json$/, ''),
          name: filename,
          turnNumber: 0,
          factionId: '',
          mapId: '',
          savedAt: Date.now(),
          syncedAt: Date.now(),
          size: 0,
          checksum: '',
        }));
    } catch (e) {
      console.error('Steam Cloud list failed:', e);
      return [];
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      return await window.electronAPI?.steamCloudDelete(`save_${key}.json`) ?? false;
    } catch (e) {
      console.error('Steam Cloud delete failed:', e);
      return false;
    }
  }
}

export class CloudSaveManager {
  private providers: CloudProvider[] = [];
  private activeProvider: CloudProvider | null = null;
  private syncInterval: number | null = null;
  
  constructor() {
    // Register providers
    this.providers.push(new IndexedDBProvider());
    this.providers.push(new SteamCloudProvider());
  }
  
  /**
   * Get available providers
   */
  getProviders(): CloudProvider[] {
    return this.providers.filter(p => p.isAvailable());
  }
  
  /**
   * Set active provider
   */
  async setProvider(providerId: string): Promise<boolean> {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider || !provider.isAvailable()) return false;
    
    const authenticated = await provider.authenticate();
    if (authenticated) {
      this.activeProvider = provider;
      return true;
    }
    return false;
  }
  
  /**
   * Get active provider
   */
  getActiveProvider(): CloudProvider | null {
    return this.activeProvider;
  }
  
  /**
   * Upload a save to cloud
   */
  async uploadSave(saveId: string, saveData: string): Promise<boolean> {
    if (!this.activeProvider) return false;
    return this.activeProvider.upload(saveId, saveData);
  }
  
  /**
   * Download a save from cloud
   */
  async downloadSave(saveId: string): Promise<string | null> {
    if (!this.activeProvider) return null;
    return this.activeProvider.download(saveId);
  }
  
  /**
   * List cloud saves
   */
  async listSaves(): Promise<CloudSaveMetadata[]> {
    if (!this.activeProvider) return [];
    return this.activeProvider.list();
  }
  
  /**
   * Delete a cloud save
   */
  async deleteSave(saveId: string): Promise<boolean> {
    if (!this.activeProvider) return false;
    return this.activeProvider.delete(saveId);
  }
  
  /**
   * Sync local saves with cloud
   */
  async syncWithLocal(localSaves: { id: string; data: string; timestamp: number }[]): Promise<{
    uploaded: number;
    downloaded: number;
    conflicts: string[];
  }> {
    const result = { uploaded: 0, downloaded: 0, conflicts: [] as string[] };
    if (!this.activeProvider) return result;
    
    const cloudSaves = await this.listSaves();
    const cloudMap = new Map(cloudSaves.map(s => [s.id, s]));
    
    for (const local of localSaves) {
      const cloud = cloudMap.get(local.id);
      
      if (!cloud) {
        // Upload new local save
        if (await this.uploadSave(local.id, local.data)) {
          result.uploaded++;
        }
      } else if (local.timestamp > cloud.syncedAt) {
        // Local is newer, upload
        if (await this.uploadSave(local.id, local.data)) {
          result.uploaded++;
        }
      } else if (cloud.syncedAt > local.timestamp) {
        // Cloud is newer - mark as conflict for user to resolve
        result.conflicts.push(local.id);
      }
    }
    
    return result;
  }
  
  /**
   * Start auto-sync interval.
   * Pass a getSaves callback so the manager can read current local saves.
   */
  startAutoSync(
    intervalMs: number = 300000, // 5 minutes
    getSaves?: () => { id: string; data: string; timestamp: number }[]
  ): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = window.setInterval(async () => {
      if (!this.activeProvider) return;
      const localSaves = getSaves ? getSaves() : this.readLocalSavesFromStorage();
      if (localSaves.length === 0) return;

      await this.syncWithLocal(localSaves);
    }, intervalMs);
  }

  /**
   * Read saves stored by the game's SaveManager from localStorage.
   * Keys follow the pattern "grand_strategy_save_<id>".
   */
  private readLocalSavesFromStorage(): { id: string; data: string; timestamp: number }[] {
    const saves: { id: string; data: string; timestamp: number }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith('grand_strategy_save_')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const id = key.replace('grand_strategy_save_', '');
        let timestamp = Date.now();
        try {
          const parsed = JSON.parse(raw);
          timestamp = parsed.savedAt ?? parsed.timestamp ?? Date.now();
        } catch { /* use default */ }
        saves.push({ id, data: raw, timestamp });
      }
    } catch (e) {
      console.error('[CloudSync] Failed to read local saves:', e);
    }
    return saves;
  }
  
  /**
   * Stop auto-sync
   */
  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Singleton instance
export const cloudSaveManager = new CloudSaveManager();