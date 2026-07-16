/**
 * Strategic advisor analysis helpers (threats + attack opportunities).
 *
 * Extracted from the HUD god-class as pure functions over GameState so the
 * scoring logic is unit-testable and reusable. No DOM or class state.
 */

import type { GameState } from '../engine/GameState';
import { calculateTerritoryThreat, TerritoryThreat } from '../engine/ThreatAnalyzer';

export interface OpportunityTarget {
  territoryId: string;
  score: number;
  reason: string;
}

/** The player's three most under-defended owned land territories. */
export function getTopThreats(state: GameState, factionId: string): TerritoryThreat[] {
  const faction = state.factionRegistry.get(factionId);
  if (!faction) return [];

  return Array.from(state.territories.values())
    .filter(t => t.owner === factionId && t.isLand())
    .map(t => calculateTerritoryThreat(state, t, faction))
    .filter(t => t.threatLevel > 0)
    .sort((a, b) => b.defenseGap - a.defenseGap || b.threatLevel - a.threatLevel)
    .slice(0, 3);
}

/** The three best adjacent enemy territories to attack, scored by strength vs. value. */
export function getOpportunityTargets(state: GameState, factionId: string): OpportunityTarget[] {
  const faction = state.factionRegistry.get(factionId);
  if (!faction) return [];

  const opportunities = new Map<string, OpportunityTarget>();
  for (const owned of state.territories.values()) {
    if (owned.owner !== factionId || !owned.isLand()) continue;
    const availableAttack = owned.units.reduce((sum, unit) => {
      const type = state.unitRegistry.get(unit.unitTypeId);
      return sum + (type?.attack ?? 0) * owned.getAvailableUnitCount(unit.unitTypeId);
    }, 0);
    if (availableAttack <= 0) continue;

    for (const adjacentId of owned.adjacentTo) {
      const target = state.territories.get(adjacentId);
      if (!target?.owner || !faction.isEnemyOf(target.owner) || target.isSea()) continue;
      const defense = target.units.reduce((sum, unit) => {
        const type = state.unitRegistry.get(unit.unitTypeId);
        return sum + (type?.defense ?? 0) * unit.count;
      }, 0);
      const strategicValue = target.production + (target.isCapital ? 8 : 0) + (target.hasFactory ? 5 : 0);
      const score = availableAttack - defense + strategicValue;
      const existing = opportunities.get(target.id);
      if (!existing || score > existing.score) {
        const reason = target.isCapital ? 'enemy capital' : target.hasFactory ? 'factory target' : `+${target.production} IPC`;
        opportunities.set(target.id, { territoryId: target.id, score, reason });
      }
    }
  }

  return Array.from(opportunities.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
