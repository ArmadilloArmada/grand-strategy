/**
 * Shared rules for where sea-domain units may be placed (matches Unit.canEnter for sea).
 * Used by mobilization-adjacent logic, random events, and objective rewards so fleets
 * are not stacked on pure land tiles where they cannot move or provide lift.
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';

export function territoryAcceptsNavalUnit(t: Territory): boolean {
  return t.type === 'sea' || t.type === 'coastal';
}

/**
 * If `preferred` cannot host a sea unit, use an adjacent owned coastal port, else a
 * neutral/friendly adjacent sea, else any adjacent sea. Returns null if impossible.
 */
export function resolveTerritoryForNavalUnitPlacement(
  state: GameState,
  preferred: Territory,
  unitTypeId: string,
  factionId: string
): Territory | null {
  const unitType = state.unitRegistry.get(unitTypeId);
  if (!unitType || unitType.domain !== 'sea') {
    return preferred;
  }
  if (territoryAcceptsNavalUnit(preferred)) {
    return preferred;
  }

  const faction = state.factionRegistry.get(factionId);
  const adjacent = preferred.adjacentTo
    .map(id => state.territories.get(id))
    .filter((t): t is Territory => !!t);

  const ownCoastal = adjacent
    .filter(t => t.type === 'coastal' && t.owner === factionId)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (ownCoastal.length > 0) return ownCoastal[0];

  const openSeas = adjacent
    .filter(t => {
      if (t.type !== 'sea') return false;
      if (t.owner === null || t.owner === factionId) return true;
      if (!faction) return false;
      return !faction.isEnemyOf(t.owner);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (openSeas.length > 0) return openSeas[0];

  const anySea = adjacent.filter(t => t.type === 'sea').sort((a, b) => a.id.localeCompare(b.id));
  return anySea[0] ?? null;
}
