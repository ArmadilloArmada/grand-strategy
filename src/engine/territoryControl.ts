import type { Territory } from '../data/Territory';

/** True when the active faction may move or attack from this territory. */
export function canIssueOrdersFromTerritory(territory: Territory, factionId: string): boolean {
  if (territory.owner === factionId) return true;

  if (territory.type !== 'sea') return false;

  return territory.units.some(
    (pu) => territory.getAvailableUnitCount(pu.unitTypeId) > 0,
  );
}

/** True when the territory has units that can still act this turn. */
export function territoryHasAvailableUnits(territory: Territory): boolean {
  return territory.units.some(
    (pu) => territory.getAvailableUnitCount(pu.unitTypeId) > 0,
  );
}
