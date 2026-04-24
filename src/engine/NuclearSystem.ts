/**
 * NuclearSystem - Nuclear weapons research and strike mechanics.
 * Requires 'nuclear_program' technology. Readiness charges over 5 turns.
 * A strike devastates a territory and worsens AI grudges globally.
 */

import { GameState } from './GameState';
import { battleLog } from '../ui/BattleLog';
import { statisticsManager } from './StatisticsManager';

export interface NuclearStrikeResult {
  factionId: string;
  targetTerritoryId: string;
  targetTerritoryName: string;
  unitsDestroyed: number;
  factoryDamaged: boolean;
}

export class NuclearSystem {
  constructor(private state: GameState) {}

  /**
   * Advance nuclear readiness for all factions that have the nuclear_program tech.
   * Called once per full round.
   */
  tickReadiness(): void {
    const techManager = this.state.systems.technologyManager;
    if (!techManager) return;

    for (const faction of this.state.factionRegistry.getAll()) {
      if (faction.isDefeated) continue;
      if (techManager.hasTech?.(faction.id, 'nuclear_program')) {
        const uraniumCount = Array.from(this.state.territories.values())
          .filter(t => t.owner === faction.id && t.resource === 'uranium').length;
        const gain = 20 + uraniumCount * 10;
        faction.nuclearReadiness = Math.min(100, faction.nuclearReadiness + gain);
      }
    }
  }

  /**
   * Returns true if a faction can launch a nuclear strike.
   */
  canLaunch(factionId: string): boolean {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction || faction.isDefeated) return false;
    if (faction.nuclearReadiness < 100) return false;
    const techManager = this.state.systems.technologyManager;
    return techManager ? (techManager.hasTech?.(factionId, 'nuclear_program') ?? false) : false;
  }

  /**
   * Launch a nuclear strike at the target territory.
   * Destroys ~80% of units, bombs factory for 5 turns, resets readiness.
   */
  launchStrike(factionId: string, targetTerritoryId: string): NuclearStrikeResult | null {
    if (!this.canLaunch(factionId)) return null;

    const faction = this.state.factionRegistry.get(factionId)!;
    const territory = this.state.territories.get(targetTerritoryId);
    if (!territory || territory.isSea()) return null;

    // Reset readiness
    faction.nuclearReadiness = 0;

    // Kill 80% of units in territory
    let totalDestroyed = 0;
    for (const placedUnit of territory.units) {
      const toKill = Math.floor(placedUnit.count * 0.8);
      placedUnit.count = Math.max(0, placedUnit.count - toKill);
      totalDestroyed += toKill;
    }
    territory.units = territory.units.filter(u => u.count > 0);

    // Damage factory for 5 turns
    const factoryDamaged = territory.hasFactory;
    if (factoryDamaged) {
      territory.bombedUntilTurn = this.state.turnNumber + 5;
    }

    const result: NuclearStrikeResult = {
      factionId,
      targetTerritoryId,
      targetTerritoryName: territory.name,
      unitsDestroyed: totalDestroyed,
      factoryDamaged,
    };

    statisticsManager.trackNukeLaunched(factionId);
    this.state.emit('nuclear_strike', result);

    battleLog.logCombat(
      this.state.turnNumber,
      faction.name,
      faction.color,
      `☢️ NUCLEAR STRIKE on ${territory.name}! ${totalDestroyed} units annihilated.${factoryDamaged ? ' Factory devastated for 5 turns.' : ''}`
    );

    // Worsen AI grudges: all other factions gain +40 grudge against attacker
    const aiController = this.state.systems.aiController;
    if (aiController?.recordGrievance) {
      for (const f of this.state.factionRegistry.getAll()) {
        if (f.id !== factionId && !f.isDefeated) {
          aiController.recordGrievance(factionId, f.id, 40);
        }
      }
    }

    return result;
  }
}
