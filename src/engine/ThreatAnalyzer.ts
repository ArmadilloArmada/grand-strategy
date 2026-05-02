import { Territory } from '../data/Territory';
import { Faction } from '../data/Faction';
import { GameState } from './GameState';

export interface TerritoryThreat {
  territoryId: string;
  threatLevel: number;
  defenseStrength: number;
  defenseGap: number;
  attackerCount: number;
  enemyTerritoryIds: string[];
}

export function calculateTerritoryThreat(
  state: GameState,
  territory: Territory,
  faction: Faction
): TerritoryThreat {
  let threatLevel = 0;
  let defenseStrength = 0;
  let attackerCount = 0;
  const enemyTerritoryIds: string[] = [];

  for (const unit of territory.units) {
    const unitType = state.unitRegistry.get(unit.unitTypeId);
    if (unitType) defenseStrength += unit.count * (unitType.defense * 1.5 + unitType.attack * 0.5);
  }

  for (const adjacentId of territory.adjacentTo) {
    const adjacent = state.territories.get(adjacentId);
    if (!adjacent?.owner || !faction.isEnemyOf(adjacent.owner)) continue;

    let adjacentThreat = 0;
    let adjacentAttackers = 0;
    for (const unit of adjacent.units) {
      const unitType = state.unitRegistry.get(unit.unitTypeId);
      if (!unitType || unitType.attack <= 0) continue;
      adjacentThreat += unit.count * unitType.attack * 1.5;
      adjacentAttackers += unit.count;
    }

    if (adjacentThreat > 0) {
      threatLevel += adjacentThreat;
      attackerCount += adjacentAttackers;
      enemyTerritoryIds.push(adjacentId);
    }
  }

  return {
    territoryId: territory.id,
    threatLevel,
    defenseStrength,
    defenseGap: Math.max(0, threatLevel - defenseStrength),
    attackerCount,
    enemyTerritoryIds,
  };
}

export function getThreatenedTerritoryIds(state: GameState, faction: Faction): Set<string> {
  const threatened = new Set<string>();

  for (const territory of state.territories.values()) {
    if (territory.owner !== faction.id || territory.isSea()) continue;
    const threat = calculateTerritoryThreat(state, territory, faction);
    if (threat.threatLevel > 0) threatened.add(territory.id);
  }

  return threatened;
}
