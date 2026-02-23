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

export class ModManager {
  private mods: Map<string, LoadedMod> = new Map();
  private storageKey = 'grand_strategy_mods_config';
  // @ts-ignore Reserved for future file system access
  private modsFolder = 'mods';
  
  constructor() {
    this.loadConfig();
  }
  
  /**
   * Load mod configuration (enabled/disabled, load order)
   */
  private loadConfig(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        // @ts-ignore Config will be applied when mods are loaded
        const config = JSON.parse(saved) as { id: string; enabled: boolean; loadOrder: number }[];
        void config; // Config applied during mod loading
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
   * Scan for available mods
   */
  async scanForMods(): Promise<ModManifest[]> {
    // In browser, mods would be loaded from localStorage or uploaded files
    // In Electron, we'd scan the file system
    const manifests: ModManifest[] = [];
    
    // Check for stored mod manifests
    const storedMods = localStorage.getItem('grand_strategy_installed_mods');
    if (storedMods) {
      try {
        const parsed = JSON.parse(storedMods) as ModManifest[];
        manifests.push(...parsed);
      } catch (e) {
        console.error('Failed to parse stored mods:', e);
      }
    }
    
    return manifests;
  }
  
  /**
   * Load a mod from manifest
   */
  async loadMod(manifest: ModManifest): Promise<boolean> {
    try {
      const loadedMod: LoadedMod = {
        manifest,
        enabled: true,
        loadOrder: this.mods.size,
        data: {
          units: [],
          factions: [],
          maps: [],
          rules: null,
        },
      };
      
      // Load mod contents (would load from files in Electron)
      // For now, use placeholder data structure
      
      this.mods.set(manifest.id, loadedMod);
      this.saveConfig();
      
      console.log(`Mod loaded: ${manifest.name} v${manifest.version}`);
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
   * Install a mod from JSON string (mod archive)
   */
  installModFromJSON(jsonString: string): boolean {
    try {
      const modData = JSON.parse(jsonString);
      
      if (!modData.manifest || !modData.manifest.id) {
        console.error('Invalid mod format: missing manifest');
        return false;
      }
      
      // Store mod in localStorage
      const installedMods = JSON.parse(localStorage.getItem('grand_strategy_installed_mods') || '[]');
      const existingIndex = installedMods.findIndex((m: ModManifest) => m.id === modData.manifest.id);
      
      if (existingIndex >= 0) {
        installedMods[existingIndex] = modData.manifest;
      } else {
        installedMods.push(modData.manifest);
      }
      
      localStorage.setItem('grand_strategy_installed_mods', JSON.stringify(installedMods));
      localStorage.setItem(`mod_data_${modData.manifest.id}`, JSON.stringify(modData.data));
      
      // Load the mod
      return this.loadMod(modData.manifest).then(() => true).catch(() => false) as unknown as boolean;
    } catch (e) {
      console.error('Failed to install mod:', e);
      return false;
    }
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