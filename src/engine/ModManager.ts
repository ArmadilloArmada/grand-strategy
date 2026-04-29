/**
 * ModManager - Handles loading and managing game mods
 * Supports custom units, factions, maps, and rules
 */

export interface ModManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  gameVersion: string;
  dependencies?: string[];
  conflicts?: string[];
  contents: {
    units?: string[];      // Paths to unit JSON files
    factions?: string[];   // Paths to faction JSON files
    maps?: string[];       // Paths to map JSON files
    rules?: string;        // Path to rules override JSON
    scripts?: string[];    // Paths to custom scripts
    assets?: string[];     // Paths to custom assets
  };
}

export interface LoadedMod {
  manifest: ModManifest;
  enabled: boolean;
  loadOrder: number;
  data: {
    units: any[];
    factions: any[];
    maps: any[];
    rules: any | null;
  };
}

/** True when running inside Electron with the mod filesystem API available */
function isElectronWithMods(): boolean {
  return typeof window !== 'undefined' &&
    !!window.electronAPI?.scanModsFolder;
}

export class ModManager {
  private mods: Map<string, LoadedMod> = new Map();
  private storageKey = 'grand_strategy_mods_config';

  constructor() {
    this.loadConfig();
  }
  
  /**
   * Load mod configuration and restore all installed mods from localStorage
   */
  private loadConfig(): void {
    try {
      // Load saved enabled/loadOrder config
      const configRaw = localStorage.getItem(this.storageKey);
      const config: { id: string; enabled: boolean; loadOrder: number }[] = configRaw
        ? JSON.parse(configRaw)
        : [];
      const configMap = new Map(config.map(c => [c.id, c]));

      // Load all installed mod manifests
      const manifestsRaw = localStorage.getItem('grand_strategy_installed_mods');
      const manifests: ModManifest[] = manifestsRaw ? JSON.parse(manifestsRaw) : [];

      for (const manifest of manifests) {
        const cfg = configMap.get(manifest.id);

        // Retrieve stored mod content data
        let data: LoadedMod['data'] = { units: [], factions: [], maps: [], rules: null };
        const storedData = localStorage.getItem(`mod_data_${manifest.id}`);
        if (storedData) {
          try {
            const parsed = JSON.parse(storedData);
            data = {
              units: Array.isArray(parsed.units) ? parsed.units : [],
              factions: Array.isArray(parsed.factions) ? parsed.factions : [],
              maps: Array.isArray(parsed.maps) ? parsed.maps : [],
              rules: parsed.rules ?? null,
            };
          } catch (e) {
            console.warn(`Failed to parse data for mod "${manifest.id}":`, e);
          }
        }

        this.mods.set(manifest.id, {
          manifest,
          enabled: cfg ? cfg.enabled : true,
          loadOrder: cfg ? cfg.loadOrder : this.mods.size,
          data,
        });
      }
    } catch (e) {
      console.error('Failed to load mod config:', e);
    }
  }
  
  /**
   * Save mod configuration
   */
  private saveConfig(): void {
    const config = Array.from(this.mods.values()).map(m => ({
      id: m.manifest.id,
      enabled: m.enabled,
      loadOrder: m.loadOrder,
    }));
    localStorage.setItem(this.storageKey, JSON.stringify(config));
  }
  
  /**
   * Scan for available mods.
   * In Electron: reads from the userData/mods/ folder on disk.
   * In browser: reads from localStorage.
   */
  async scanForMods(): Promise<ModManifest[]> {
    if (isElectronWithMods()) {
      return this.scanModsFromFilesystem();
    }
    return this.scanModsFromLocalStorage();
  }

  private async scanModsFromFilesystem(): Promise<ModManifest[]> {
    try {
      const electronAPI = window.electronAPI;
      if (!electronAPI) return [];
      const results = await electronAPI.scanModsFolder() as unknown as { filename: string; mod: { manifest: ModManifest; data: LoadedMod['data'] } }[];

      const manifests: ModManifest[] = [];
      for (const { mod } of results) {
        if (mod.manifest && mod.manifest.id) {
          // Load each found mod into the registry
          await this.loadMod(mod.manifest);
          // Store full data so getMerged* methods can use it
          const loaded = this.mods.get(mod.manifest.id);
          if (loaded) {
            loaded.data = mod.data ?? loaded.data;
          }
          manifests.push(mod.manifest);
        }
      }

      return manifests;
    } catch (e) {
      console.error('[ModManager] Filesystem scan failed:', e);
      return [];
    }
  }

  private scanModsFromLocalStorage(): ModManifest[] {
    const storedMods = localStorage.getItem('grand_strategy_installed_mods');
    if (!storedMods) return [];
    try {
      return JSON.parse(storedMods) as ModManifest[];
    } catch (e) {
      console.error('[ModManager] Failed to parse localStorage mods:', e);
      return [];
    }
  }
  
  /**
   * Load a mod from manifest
   */
  async loadMod(manifest: ModManifest): Promise<boolean> {
    try {
      // Retrieve any previously stored content data for this mod
      let data: LoadedMod['data'] = { units: [], factions: [], maps: [], rules: null };
      const storedData = localStorage.getItem(`mod_data_${manifest.id}`);
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          data = {
            units: Array.isArray(parsed.units) ? parsed.units : [],
            factions: Array.isArray(parsed.factions) ? parsed.factions : [],
            maps: Array.isArray(parsed.maps) ? parsed.maps : [],
            rules: parsed.rules ?? null,
          };
        } catch (e) {
          console.warn(`Failed to parse data for mod "${manifest.id}":`, e);
        }
      }

      const existing = this.mods.get(manifest.id);
      const loadedMod: LoadedMod = {
        manifest,
        enabled: existing ? existing.enabled : true,
        loadOrder: existing ? existing.loadOrder : this.mods.size,
        data,
      };

      this.mods.set(manifest.id, loadedMod);

      // Warn if declared dependencies are not loaded
      const depCheck = this.validateDependencies(manifest);
      if (!depCheck.valid) {
        console.warn(
          `[ModManager] "${manifest.name}" (${manifest.id}) has unsatisfied dependencies: ` +
          depCheck.missing.join(', ') +
          '. Load the required mods first or some features may not work correctly.'
        );
      }

      this.saveConfig();

      return true;
    } catch (e) {
      console.error(`Failed to load mod ${manifest.id}:`, e);
      return false;
    }
  }
  
  /**
   * Unload a mod
   */
  unloadMod(modId: string): boolean {
    if (this.mods.has(modId)) {
      this.mods.delete(modId);
      this.saveConfig();
      return true;
    }
    return false;
  }
  
  /**
   * Enable/disable a mod
   */
  setModEnabled(modId: string, enabled: boolean): boolean {
    const mod = this.mods.get(modId);
    if (mod) {
      mod.enabled = enabled;
      this.saveConfig();
      return true;
    }
    return false;
  }
  
  /**
   * Change mod load order
   */
  setLoadOrder(modId: string, order: number): boolean {
    const mod = this.mods.get(modId);
    if (mod) {
      mod.loadOrder = order;
      // Reorder other mods
      const sorted = Array.from(this.mods.values()).sort((a, b) => a.loadOrder - b.loadOrder);
      sorted.forEach((m, i) => m.loadOrder = i);
      this.saveConfig();
      return true;
    }
    return false;
  }
  
  /**
   * Get all loaded mods
   */
  getMods(): LoadedMod[] {
    return Array.from(this.mods.values()).sort((a, b) => a.loadOrder - b.loadOrder);
  }
  
  /**
   * Get enabled mods in load order
   */
  getEnabledMods(): LoadedMod[] {
    return this.getMods().filter(m => m.enabled);
  }
  
  /**
   * Get merged unit data from all enabled mods
   */
  getMergedUnits(baseUnits: any[]): any[] {
    let units = [...baseUnits];
    
    for (const mod of this.getEnabledMods()) {
      for (const unit of mod.data.units) {
        const existingIndex = units.findIndex(u => u.id === unit.id);
        if (existingIndex >= 0) {
          // Override existing unit
          units[existingIndex] = { ...units[existingIndex], ...unit };
        } else {
          // Add new unit
          units.push(unit);
        }
      }
    }
    
    return units;
  }
  
  /**
   * Get merged faction data from all enabled mods
   */
  getMergedFactions(baseFactions: any[]): any[] {
    let factions = [...baseFactions];
    
    for (const mod of this.getEnabledMods()) {
      for (const faction of mod.data.factions) {
        const existingIndex = factions.findIndex(f => f.id === faction.id);
        if (existingIndex >= 0) {
          factions[existingIndex] = { ...factions[existingIndex], ...faction };
        } else {
          factions.push(faction);
        }
      }
    }
    
    return factions;
  }
  
  /**
   * Get all maps including mod maps
   */
  getMergedMaps(baseMaps: any[]): any[] {
    let maps = [...baseMaps];
    
    for (const mod of this.getEnabledMods()) {
      maps.push(...mod.data.maps);
    }
    
    return maps;
  }
  
  /**
   * Check for mod conflicts
   */
  checkConflicts(): { mod1: string; mod2: string; reason: string }[] {
    const conflicts: { mod1: string; mod2: string; reason: string }[] = [];
    const enabledMods = this.getEnabledMods();
    
    for (let i = 0; i < enabledMods.length; i++) {
      for (let j = i + 1; j < enabledMods.length; j++) {
        const mod1 = enabledMods[i];
        const mod2 = enabledMods[j];
        
        // Check declared conflicts
        if (mod1.manifest.conflicts?.includes(mod2.manifest.id)) {
          conflicts.push({
            mod1: mod1.manifest.id,
            mod2: mod2.manifest.id,
            reason: `${mod1.manifest.name} declares conflict with ${mod2.manifest.name}`,
          });
        }
        
        // Check for unit ID conflicts
        const mod1UnitIds = new Set(mod1.data.units.map((u: any) => u.id));
        const mod2UnitIds = new Set(mod2.data.units.map((u: any) => u.id));
        for (const id of mod1UnitIds) {
          if (mod2UnitIds.has(id)) {
            conflicts.push({
              mod1: mod1.manifest.id,
              mod2: mod2.manifest.id,
              reason: `Both mods modify unit: ${id}`,
            });
          }
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * Check whether all declared dependencies of a manifest are currently loaded and enabled.
   * Returns { valid: true } when all deps are satisfied, or { valid: false, missing } listing
   * which dependency IDs are absent.
   */
  validateDependencies(manifest: ModManifest): { valid: boolean; missing: string[] } {
    if (!manifest.dependencies || manifest.dependencies.length === 0) {
      return { valid: true, missing: [] };
    }
    const missing: string[] = [];
    for (const depId of manifest.dependencies) {
      const dep = this.mods.get(depId);
      if (!dep || !dep.enabled) missing.push(depId);
    }
    return { valid: missing.length === 0, missing };
  }

  /**
   * Returns mods sorted in dependency order (dependencies first) using topological sort.
   * Mods with circular dependencies are appended at the end.
   */
  getModsInDependencyOrder(): LoadedMod[] {
    const enabled = this.getEnabledMods();
    const result: LoadedMod[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (mod: LoadedMod) => {
      if (visited.has(mod.manifest.id)) return;
      if (visiting.has(mod.manifest.id)) return; // cycle — skip
      visiting.add(mod.manifest.id);
      for (const depId of mod.manifest.dependencies ?? []) {
        const dep = this.mods.get(depId);
        if (dep && dep.enabled) visit(dep);
      }
      visiting.delete(mod.manifest.id);
      visited.add(mod.manifest.id);
      result.push(mod);
    };

    for (const mod of enabled) visit(mod);
    return result;
  }

  /**
   * Install a mod from JSON string (mod archive).
   * In Electron this also writes the mod to the userData/mods/ folder so it
   * persists across sessions and shows up in scanForMods().
   */
  async installModFromJSON(jsonString: string): Promise<boolean> {
    try {
      const modData = JSON.parse(jsonString);

      if (!modData.manifest || !modData.manifest.id) {
        console.error('[ModManager] Invalid mod format: missing manifest');
        return false;
      }

      if (isElectronWithMods()) {
        // Write the mod file to disk
        const electronAPI = window.electronAPI;
        if (!electronAPI) return false;
        const filename: string | null = await electronAPI.exportModFile(jsonString);
        if (!filename) {
          return false;
        }
      } else {
        // Browser fallback: store in localStorage
        const installedMods = JSON.parse(localStorage.getItem('grand_strategy_installed_mods') || '[]');
        const existingIndex = installedMods.findIndex((m: ModManifest) => m.id === modData.manifest.id);
        if (existingIndex >= 0) {
          installedMods[existingIndex] = modData.manifest;
        } else {
          installedMods.push(modData.manifest);
        }
        localStorage.setItem('grand_strategy_installed_mods', JSON.stringify(installedMods));
        localStorage.setItem(`mod_data_${modData.manifest.id}`, JSON.stringify(modData.data));
      }

      return this.loadMod(modData.manifest);
    } catch (e) {
      console.error('[ModManager] Failed to install mod:', e);
      return false;
    }
  }

  /**
   * Open the OS file picker, let the user choose a mod .json, and install it.
   * Only available in Electron.
   */
  async importModFromFilePicker(): Promise<boolean> {
    if (!isElectronWithMods()) {
      console.warn('[ModManager] importModFromFilePicker is only available in Electron');
      return false;
    }
    try {
      const electronAPI = window.electronAPI;
      if (!electronAPI) return false;
      const modData = await electronAPI.importModFile();
      if (!modData) return false; // user cancelled
      return this.installModFromJSON(JSON.stringify(modData));
    } catch (e) {
      console.error('[ModManager] File picker import failed:', e);
      return false;
    }
  }

  /**
   * Delete a mod and, in Electron, remove its file from disk.
   */
  async removeMod(modId: string): Promise<boolean> {
    if (isElectronWithMods()) {
      try {
        const electronAPI = window.electronAPI;
        await electronAPI?.deleteModFile(`${modId}.json`);
      } catch (e) {
        console.warn('[ModManager] Could not delete mod file from disk:', e);
      }
    } else {
      // Browser: remove from localStorage
      const installedMods = JSON.parse(localStorage.getItem('grand_strategy_installed_mods') || '[]');
      const filtered = installedMods.filter((m: ModManifest) => m.id !== modId);
      localStorage.setItem('grand_strategy_installed_mods', JSON.stringify(filtered));
      localStorage.removeItem(`mod_data_${modId}`);
    }
    return this.unloadMod(modId);
  }
  
  /**
   * Export a mod as JSON
   */
  exportMod(modId: string): string | null {
    const mod = this.mods.get(modId);
    if (!mod) return null;
    
    return JSON.stringify({
      manifest: mod.manifest,
      data: mod.data,
    }, null, 2);
  }
  
  /**
   * Create a new mod template
   */
  createModTemplate(): ModManifest {
    return {
      id: `custom_mod_${Date.now()}`,
      name: 'My Custom Mod',
      version: '1.0.0',
      author: 'Your Name',
      description: 'A custom mod for Grand Strategy',
      gameVersion: '1.0.0',
      contents: {
        units: [],
        factions: [],
        maps: [],
      },
    };
  }
}

// Singleton instance
export const modManager = new ModManager();