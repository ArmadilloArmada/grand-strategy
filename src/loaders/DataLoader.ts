/**
 * DataLoader - Loads all game data (units, factions, rules)
 */

import { GameState } from '../engine/GameState';
import { UnitTypeData } from '../data/Unit';
import { FactionData } from '../data/Faction';
import { GameRulesData, GameRules } from '../data/GameRules';
import { MapLoader, MapData } from './MapLoader';

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
    const [rulesData, unitsData, factionsData, mapData] = await Promise.all([
      urls.rules ? fetch(urls.rules).then(r => r.json()) : Promise.resolve(undefined),
      fetch(urls.units).then(r => r.json()),
      fetch(urls.factions).then(r => r.json()),
      fetch(urls.map).then(r => r.json()),
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
   * Get the map loader for territory lookups
   */
  getMapLoader(): MapLoader {
    return this.mapLoader;
  }
}