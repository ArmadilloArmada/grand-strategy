/**
 * SupplySystem - Units must be in supply (connected to capital/factory)
 * Units out of supply get combat penalty or cannot attack
 */

import { GameState } from './GameState';

export class SupplySystem {
  constructor(private state: GameState) {}

  /**
   * Check if a territory is in supply for a faction (path to capital or factory)
   */
  isInSupply(territoryId: string, factionId: string): boolean {
    const territory = this.state.territories.get(territoryId);
    if (!territory || territory.owner !== factionId) return false;

    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return false;

    // Capital is always in supply
    if (territoryId === faction.capital) return true;

    // Weather supply disruption: limit BFS range to 3 hops during storms/blizzards
    const weatherMods = this.state.systems.weatherSystem?.getWeatherModifiers('plains');
    const maxRange = weatherMods?.supplyDisrupted ? 3 : Infinity;

    // BFS from territory to any friendly factory or capital (range-limited in bad weather)
    const visited = new Map<string, number>(); // id → distance
    const queue: { id: string; dist: number }[] = [{ id: territoryId, dist: 0 }];
    visited.set(territoryId, 0);

    while (queue.length > 0) {
      const { id: currentId, dist } = queue.shift()!;
      const current = this.state.territories.get(currentId);
      if (!current) continue;

      if (currentId !== territoryId && (current.id === faction.capital || current.hasFactory)) {
        return true; // Reached supply source
      }

      if (dist >= maxRange) continue; // Weather range limit

      for (const adjId of current.adjacentTo) {
        if (visited.has(adjId)) continue;
        const adj = this.state.territories.get(adjId);
        if (!adj || adj.owner !== factionId) continue;
        visited.set(adjId, dist + 1);
        queue.push({ id: adjId, dist: dist + 1 });
      }
    }
    return false;
  }

  /**
   * Get combat penalty for out-of-supply units (e.g. -1 attack/defense)
   */
  getSupplyPenalty(territoryId: string, factionId: string): { attack: number; defense: number } {
    if (this.isInSupply(territoryId, factionId)) return { attack: 0, defense: 0 };
    return { attack: 1, defense: 1 }; // -1 to attack and defense when out of supply
  }

  /**
   * Returns true when a coastal territory is under naval blockade.
   * A blockade exists if the territory is coastal and ALL adjacent sea zones
   * are controlled by enemy factions (owned + have enemy units, or owned by enemy).
   * A blocked territory earns 0 income that turn.
   */
  isNavalBlockaded(territoryId: string, factionId: string): boolean {
    const territory = this.state.territories.get(territoryId);
    if (!territory || territory.type !== 'coastal') return false;

    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return false;

    // Collect all adjacent sea zones
    const adjSeaZones = territory.adjacentTo
      .map(id => this.state.territories.get(id))
      .filter(t => t?.type === 'sea') as import('../data/Territory').Territory[];

    // No adjacent sea zones → cannot be blockaded
    if (adjSeaZones.length === 0) return false;

    // Blockade: every adjacent sea zone must be enemy-owned or have enemy units
    for (const seaZone of adjSeaZones) {
      const isEnemyControlled =
        seaZone.owner !== null &&
        faction.isEnemyOf(seaZone.owner) &&
        seaZone.getTotalUnitCount() > 0;
      if (!isEnemyControlled) return false; // At least one sea zone is open
    }
    return true;
  }
}