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

    // BFS from territory to any friendly factory or capital
    const visited = new Set<string>();
    const queue: string[] = [territoryId];
    visited.add(territoryId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = this.state.territories.get(currentId);
      if (!current) continue;

      if (currentId !== territoryId && (current.id === faction.capital || current.hasFactory)) {
        return true; // Reached supply source
      }

      for (const adjId of current.adjacentTo) {
        if (visited.has(adjId)) continue;
        const adj = this.state.territories.get(adjId);
        if (!adj || adj.owner !== factionId) continue;
        visited.add(adjId);
        queue.push(adjId);
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
}