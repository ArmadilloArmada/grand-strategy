/**
 * FortificationSystem - Buildable defenses that persist on territories.
 *
 * Level 0: no fortification (default)
 * Level 1: earthworks (+1 defense, costs 5 IPCs)
 * Level 2: bunker complex (+2 defense, costs 8 IPCs to upgrade from level 1)
 *
 * When a fortified territory is captured the fortification degrades by 1 level —
 * the attacker either destroys or inherits the weakened defenses.
 */

import { GameState } from './GameState';

export const FORTIFICATION_UPGRADE_COSTS: Record<number, number> = { 0: 5, 1: 8 };
export const FORTIFICATION_DEFENSE_BONUS: number[] = [0, 1, 2];
export const MAX_FORTIFICATION_LEVEL = 2;

export const FORTIFICATION_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Earthworks',
  2: 'Bunker Complex',
};

export class FortificationSystem {
  constructor(private state: GameState) {}

  /** Cost in IPCs to upgrade territory to the next level, or null if already max. */
  getUpgradeCost(territoryId: string): number | null {
    const t = this.state.territories.get(territoryId);
    if (!t) return null;
    const level = t.fortificationLevel ?? 0;
    if (level >= MAX_FORTIFICATION_LEVEL) return null;
    return FORTIFICATION_UPGRADE_COSTS[level];
  }

  /** Whether the current faction can build a fortification in this territory right now. */
  canBuild(territoryId: string, factionId: string): boolean {
    const t = this.state.territories.get(territoryId);
    if (!t || t.owner !== factionId) return false;
    if (!t.isLand()) return false;
    const cost = this.getUpgradeCost(territoryId);
    if (cost === null) return false;
    const faction = this.state.factionRegistry.get(factionId);
    return (faction?.ipcs ?? 0) >= cost;
  }

  /** Build/upgrade a fortification. Returns false if not allowed. */
  build(territoryId: string, factionId: string): boolean {
    if (!this.canBuild(territoryId, factionId)) return false;

    const t = this.state.territories.get(territoryId)!;
    const cost = this.getUpgradeCost(territoryId)!;
    const faction = this.state.factionRegistry.get(factionId)!;

    faction.spendIPCs(cost);
    const newLevel = ((t.fortificationLevel ?? 0) + 1) as 0 | 1 | 2;
    t.fortificationLevel = newLevel;

    this.state.emit('fortification_built', {
      territoryId,
      factionId,
      level: newLevel,
      levelName: FORTIFICATION_NAMES[newLevel],
      cost,
    });

    return true;
  }

  /** Defense bonus granted by this territory's fortification level. */
  getDefenseBonus(territoryId: string): number {
    const t = this.state.territories.get(territoryId);
    return FORTIFICATION_DEFENSE_BONUS[t?.fortificationLevel ?? 0] ?? 0;
  }

  /**
   * Called when a territory changes hands. Fortification degrades by 1 level —
   * the attacker blasts through or partially inherits the works.
   */
  onCapture(territoryId: string): void {
    const t = this.state.territories.get(territoryId);
    if (!t) return;
    const current = t.fortificationLevel ?? 0;
    if (current > 0) {
      t.fortificationLevel = (current - 1) as 0 | 1 | 2;
    }
  }
}
