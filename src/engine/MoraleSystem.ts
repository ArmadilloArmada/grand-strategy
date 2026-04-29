/**
 * MoraleSystem - Tracks war weariness and morale per faction.
 * High weariness reduces combat effectiveness and income.
 */

import { GameState } from './GameState';

export class MoraleSystem {
  constructor(private state: GameState) {}

  /**
   * Called once per full round (when all factions have taken their turn).
   * Increases weariness for factions at war, recovers for those at peace.
   */
  tickAll(): void {
    for (const faction of this.state.factionRegistry.getAll()) {
      if (faction.isDefeated) continue;

      const allFactions = this.state.factionRegistry.getAll();
      const enemies = allFactions.filter(
        f => f.id !== faction.id && !f.isDefeated &&
             this.state.diplomacyManager.getRelation(faction.id, f.id) === 'war'
      );

      if (enemies.length > 0) {
        // At war: weariness climbs faster with more enemies
        const wearyIncrease = enemies.length <= 1 ? 2 : enemies.length <= 2 ? 4 : 6;
        faction.warWeariness = Math.min(100, faction.warWeariness + wearyIncrease);

        // Territorial dominance partially offsets weariness (winning wars feel different)
        const myCount = this.state.getTerritoriesOwnedBy(faction.id).length;
        const enemyAvg = enemies.reduce((s, e) => s + this.state.getTerritoriesOwnedBy(e.id).length, 0) / enemies.length;
        if (myCount > enemyAvg * 1.5) {
          faction.warWeariness = Math.max(0, faction.warWeariness - 2);
        }
      } else {
        // At peace: weariness recovers faster
        faction.warWeariness = Math.max(0, faction.warWeariness - 8);
      }

      faction.morale = 100 - faction.warWeariness;
    }
  }

  /**
   * Call when a faction wins a battle — reduces war weariness slightly.
   * Capturing a capital or factory provides a larger morale boost.
   */
  recordVictory(factionId: string, isCapital: boolean = false, hasFactory: boolean = false): void {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return;
    const recovery = isCapital ? 8 : hasFactory ? 5 : 3;
    faction.warWeariness = Math.max(0, faction.warWeariness - recovery);
    faction.morale = 100 - faction.warWeariness;
  }

  /**
   * Returns combat modifier for a faction based on current morale.
   * Applied as a flat bonus to both attack and defense rolls.
   */
  getCombatModifier(factionId: string): number {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return 0;
    if (faction.morale >= 80) return 1;   // High morale bonus
    if (faction.morale >= 50) return 0;   // Normal
    if (faction.morale >= 35) return -1;  // Minor penalty
    if (faction.morale >= 20) return -2;  // Significant penalty
    return -3;                            // Severe penalty (near collapse)
  }

  /**
   * Returns income multiplier based on morale (0.7 – 1.0).
   * Used by TurnManager when collecting income.
   */
  getIncomeModifier(factionId: string): number {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return 1;
    // Linear: 100 morale = 1.0, 0 morale = 0.7
    return 0.7 + (faction.morale / 100) * 0.3;
  }

  /**
   * Record casualties suffered — each casualty nudges military morale down slightly.
   */
  recordCasualties(factionId: string, count: number): void {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return;
    faction.warWeariness = Math.min(100, faction.warWeariness + Math.floor(count * 0.5));
    faction.morale = 100 - faction.warWeariness;
  }

  serialize(): Record<string, { warWeariness: number; morale: number }> {
    const out: Record<string, { warWeariness: number; morale: number }> = {};
    for (const f of this.state.factionRegistry.getAll()) {
      out[f.id] = { warWeariness: f.warWeariness, morale: f.morale };
    }
    return out;
  }

  restore(data: Record<string, { warWeariness: number; morale: number }>): void {
    for (const [id, val] of Object.entries(data)) {
      const f = this.state.factionRegistry.get(id);
      if (f) {
        f.warWeariness = val.warWeariness;
        f.morale = val.morale;
      }
    }
  }
}
