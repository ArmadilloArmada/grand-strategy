/**
 * Shared rules for where sea-domain units may be placed (matches Unit.canEnter for sea).
 * Used by mobilization, reserve deployment, random events, and objective rewards.
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';

export function territoryAcceptsNavalUnit(t: Territory): boolean {
  return t.type === 'sea';
}

export function isLandTerritory(t: Territory): boolean {
  return t.type === 'land';
}

/** True when this territory touches at least one sea zone. */
export function hasSeaAccess(state: GameState, territory: Territory): boolean {
  return territory.adjacentTo.some(adjId => {
    const adj = state.territories.get(adjId);
    return adj?.type === 'sea';
  });
}

export function getAdjacentSeaZones(state: GameState, territory: Territory): Territory[] {
  return territory.adjacentTo
    .map(id => state.territories.get(id))
    .filter((t): t is Territory => !!t && t.type === 'sea');
}

/** Mark a sea zone as controlled by the faction that placed units there. */
export function claimSeaZoneForFaction(
  state: GameState,
  seaZone: Territory,
  factionId: string,
): void {
  if (seaZone.type !== 'sea') return;

  const faction = state.factionRegistry.get(factionId);
  if (seaZone.owner === null || seaZone.owner === factionId) {
    seaZone.owner = factionId;
    return;
  }
  if (faction && !faction.isEnemyOf(seaZone.owner)) {
    seaZone.owner = factionId;
  }
}

/**
 * Resolve where a sea-domain unit should spawn. Fleets always prefer an adjacent
 * sea zone over ports or land tiles. Returns null if no valid water tile exists.
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

  if (preferred.type === 'sea') {
    return preferred;
  }

  const faction = state.factionRegistry.get(factionId);
  const adjacent = preferred.adjacentTo
    .map(id => state.territories.get(id))
    .filter((t): t is Territory => !!t);

  const seas = adjacent
    .filter(t => t.type === 'sea')
    .sort((a, b) => a.id.localeCompare(b.id));

  if (seas.length > 0) {
    const friendly = seas.filter(t => {
      if (t.owner === null || t.owner === factionId) return true;
      if (!faction) return false;
      return !faction.isEnemyOf(t.owner);
    });
    return friendly[0] ?? seas[0];
  }

  const ownCoastal = adjacent
    .filter(t => t.type === 'coastal' && t.owner === factionId)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const coastal of ownCoastal) {
    const coastalSeas = coastal.adjacentTo
      .map(id => state.territories.get(id))
      .filter((t): t is Territory => !!t && t.type === 'sea')
      .sort((a, b) => a.id.localeCompare(b.id));
    if (coastalSeas.length > 0) {
      const friendly = coastalSeas.filter(t => {
        if (t.owner === null || t.owner === factionId) return true;
        if (!faction) return false;
        return !faction.isEnemyOf(t.owner);
      });
      return friendly[0] ?? coastalSeas[0];
    }
  }

  return null;
}

export interface SpawnUnitsResult {
  success: boolean;
  territoryId?: string;
  reason?: string;
}

/** Place units, redirecting sea-domain spawns into valid water tiles. */
export function spawnUnitsOnTerritory(
  state: GameState,
  factionId: string,
  preferredTerritoryId: string,
  unitTypeId: string,
  count: number,
): SpawnUnitsResult {
  if (count <= 0) return { success: false, reason: 'Invalid count' };

  const preferred = state.territories.get(preferredTerritoryId);
  const unitType = state.unitRegistry.get(unitTypeId);
  if (!preferred || !unitType) {
    return { success: false, reason: 'Invalid territory or unit type' };
  }

  if (unitType.domain === 'sea') {
    const spawn = resolveTerritoryForNavalUnitPlacement(
      state,
      preferred,
      unitTypeId,
      factionId,
    );
    if (!spawn || spawn.type !== 'sea') {
      return { success: false, reason: 'No adjacent sea zone for naval unit' };
    }
    spawn.addUnits(unitTypeId, count);
    claimSeaZoneForFaction(state, spawn, factionId);
    return { success: true, territoryId: spawn.id };
  }

  if (unitType.domain === 'land' && preferred.type === 'sea') {
    return { success: false, reason: 'Land units cannot deploy to sea zones' };
  }

  preferred.addUnits(unitTypeId, count);
  return { success: true, territoryId: preferred.id };
}

/**
 * Land-domain units on sea tiles are valid when embarked (implicit amphibious movement).
 * Legacy bad spawns are left in place; players can disembark on their next move.
 */
export function sanitizeLandUnitPlacement(_state: GameState): number {
  return 0;
}

/** Pick a friendly land tile adjacent to a sea zone for relocating stranded land units. */
export function resolveAdjacentLandForUnitPlacement(
  state: GameState,
  seaZone: Territory,
  factionId: string,
): Territory | null {
  const candidates = seaZone.adjacentTo
    .map(id => state.territories.get(id))
    .filter((t): t is Territory => !!t && t.isLand() && t.owner === factionId)
    .sort((a, b) => {
      if (a.hasFactory !== b.hasFactory) return a.hasFactory ? -1 : 1;
      if (a.isCapital !== b.isCapital) return a.isCapital ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  return candidates[0] ?? null;
}

/** Fix invalid unit/territory domain pairings after load or bad spawns. */
export function sanitizeUnitPlacement(state: GameState): number {
  return sanitizeNavalUnitPlacement(state) + sanitizeLandUnitPlacement(state);
}

/** Remove sea-domain units from land/coastal tiles (legacy saves / bad spawns). */
export function sanitizeNavalUnitPlacement(state: GameState): number {
  let relocated = 0;

  for (const territory of state.territories.values()) {
    if (territory.type === 'sea') continue;

    const navalStacks = territory.units.filter(pu => {
      const ut = state.unitRegistry.get(pu.unitTypeId);
      return ut?.domain === 'sea';
    });
    if (navalStacks.length === 0) continue;

    const ownerId = territory.owner;
    if (!ownerId) continue;

    for (const stack of navalStacks) {
      const count = stack.count;
      territory.removeUnits(stack.unitTypeId, count);
      const placed = spawnUnitsOnTerritory(
        state,
        ownerId,
        territory.id,
        stack.unitTypeId,
        count,
      );
      if (placed.success) relocated += count;
    }
  }

  return relocated;
}
