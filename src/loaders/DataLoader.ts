/**
 * DataLoader - Loads all game data (units, factions, rules)
 */

import { GameState } from '../engine/GameState';
import { UnitTypeData } from '../data/Unit';
import { FactionData } from '../data/Faction';
import { GameRulesData, GameRules } from '../data/GameRules';
import { MapLoader, MapData } from './MapLoader';
import { rulesetLoader, RulesetData } from './RulesetLoader';

export interface GameDataBundle {
  rules?: GameRulesData;
  units: UnitTypeData[];
  factions: FactionData[];
  map: MapData;
}

export class DataLoader {
  private mapLoader: MapLoader;

  constructor(private state: GameState) {
    this.mapLoader = new MapLoader(state);
  }

  /**
   * Load all game data from a bundle
   */
  loadBundle(bundle: GameDataBundle): void {
    // Load rules first
    if (bundle.rules) {
      this.state.rules = new GameRules(bundle.rules);
    }

    // Load unit definitions
    this.state.unitRegistry.loadFromData(bundle.units);

    // Load factions
    this.state.factionRegistry.loadFromData(bundle.factions);

    // Load map
    this.mapLoader.loadMap(bundle.map);
  }

  /**
   * Load bundle from multiple JSON URLs
   */
  async loadFromURLs(urls: {
    rules?: string;
    units: string;
    factions: string;
    map: string;
  }): Promise<void> {
    const fetchJson = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
      return res.json();
    };

    const [rulesData, unitsData, factionsData, mapData] = await Promise.all([
      urls.rules ? fetchJson(urls.rules) : Promise.resolve(undefined),
      fetchJson(urls.units),
      fetchJson(urls.factions),
      fetchJson(urls.map),
    ]);

    this.loadBundle({
      rules: rulesData,
      units: unitsData,
      factions: factionsData,
      map: mapData,
    });
  }

  /**
   * Load extra content from a mod bundle (merge units, factions, or replace map)
   * Use for DLC or user mods dropped in /mods folder
   */
  loadModBundle(mod: Partial<GameDataBundle>): void {
    if (mod.units?.length) {
      this.state.unitRegistry.loadFromData(mod.units);
    }
    if (mod.factions?.length) {
      this.state.factionRegistry.loadFromData(mod.factions);
    }
    if (mod.map) {
      this.mapLoader.loadMap(mod.map);
    }
    if (mod.rules) {
      this.state.rules = new GameRules(mod.rules);
    }
  }

  /**
   * Load a ruleset override from a RulesetData object, merging it with current rules.
   * Validates the ruleset before applying; logs errors and skips on failure.
   */
  loadRuleset(data: RulesetData): boolean {
    try {
      const overrides = rulesetLoader.load(data);
      this.state.rules = rulesetLoader.mergeWithDefaults(overrides);
      return true;
    } catch (e) {
      console.error('[DataLoader] Failed to apply ruleset:', e);
      return false;
    }
  }

  /**
   * Load a ruleset override from a JSON string.
   */
  loadRulesetFromJSON(json: string): boolean {
    try {
      const data: RulesetData = JSON.parse(json);
      return this.loadRuleset(data);
    } catch (e) {
      console.error('[DataLoader] Failed to parse ruleset JSON:', e);
      return false;
    }
  }

  /**
   * Get the map loader for territory lookups
   */
  getMapLoader(): MapLoader {
    return this.mapLoader;
  }
}