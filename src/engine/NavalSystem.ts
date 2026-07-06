/**
 * NavalSystem — ship roles, fleet rules, bombardment, and sea-zone logic.
 * Gives naval units a coherent structure instead of ad-hoc checks scattered in combat/movement.
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';
import { UnitType } from '../data/Unit';
import type { CombatState, CombatUnit } from './CombatResolver';
import { getNavalReachSeaZones } from './gridAdjacency';

/** Functional role each ship class fills in a fleet. */
export type NavalRole = 'capital' | 'screen' | 'raider' | 'logistics' | 'air_base';

export const NAVAL_ROLE_LABELS: Record<NavalRole, { name: string; duty: string }> = {
  capital: { name: 'Capital', duty: 'Heavy guns & shore bombardment' },
  screen: { name: 'Screen', duty: 'Escorts the fleet & hunts subs' },
  raider: { name: 'Raider', duty: 'Stealth strikes & convoy hunting' },
  logistics: { name: 'Logistics', duty: 'Amphibious lift capacity' },
  air_base: { name: 'Air Base', duty: 'Carrier air projection' },
};

const UNIT_ROLES: Record<string, NavalRole> = {
  battleship: 'capital',
  cruiser: 'capital',
  carrier: 'air_base',
  destroyer: 'screen',
  submarine: 'raider',
  transport: 'logistics',
};

const ASW_UNITS = new Set(['destroyer', 'cruiser']);
const CAPITAL_UNITS = new Set(['battleship', 'carrier']);

export function getNavalRole(unitTypeId: string): NavalRole | null {
  return UNIT_ROLES[unitTypeId] ?? null;
}

export function isSeaDomainUnit(unitType: UnitType | undefined): boolean {
  return unitType?.domain === 'sea';
}

/** Coastal artillery / AA — full anti-naval effectiveness at range. */
export function isFullAntiNavalStriker(unitType: UnitType): boolean {
  if (unitType.domain !== 'land') return false;
  return unitType.id.includes('artillery')
    || unitType.canBombard
    || unitType.id.includes('anti_air');
}

/** Direct-fire land units that can engage ships from coast (artillery, armor). */
export function canLandUnitStrikeNaval(unitType: UnitType): boolean {
  if (unitType.domain !== 'land') return false;
  return isFullAntiNavalStriker(unitType)
    || unitType.id.includes('tank')
    || unitType.id.includes('armor');
}

/** Any land unit may return fire at an offshore fleet (infantry at reduced effect). */
export function canLandUnitEngageNaval(unitType: UnitType): boolean {
  return unitType.domain === 'land';
}

/** Attack value when land units fire on naval targets. */
export function getLandAntiNavalAttack(unitType: UnitType, baseAttack: number): number {
  if (isFullAntiNavalStriker(unitType)) return baseAttack;
  if (unitType.id.includes('tank') || unitType.id.includes('armor')) {
    return Math.max(1, baseAttack - 1);
  }
  return Math.max(1, baseAttack - 1);
}

/** Defense value when land units fire back at ships during the defender phase. */
export function getLandAntiNavalDefense(unitType: UnitType, baseDefense: number): number {
  if (isFullAntiNavalStriker(unitType)) return baseDefense;
  if (unitType.id.includes('tank') || unitType.id.includes('armor')) {
    return Math.max(1, baseDefense - 1);
  }
  return Math.max(1, baseDefense - 1);
}

/** Whether one unit type can roll against another in cross-domain fights. */
export function canUnitEngageTarget(attacker: UnitType, defender: UnitType): boolean {
  if (attacker.domain === defender.domain) return true;
  if (attacker.domain === 'air') return true;
  if (attacker.domain === 'sea' && defender.domain === 'land') return true;
  if (attacker.domain === 'land' && defender.domain === 'sea') {
    return canLandUnitEngageNaval(attacker);
  }
  return false;
}

export interface CombatPowerUnit {
  unitType: UnitType;
  count: number;
}

/** Attack power counting only stacks that can hit at least one enemy present. */
export function computeEngageableAttackPower(
  attackers: CombatPowerUnit[],
  defenders: CombatPowerUnit[],
): number {
  if (defenders.length === 0) return 0;
  let total = 0;
  for (const atk of attackers) {
    if (atk.count <= 0) continue;
    const canEngage = defenders.some(
      def => def.count > 0 && canUnitEngageTarget(atk.unitType, def.unitType),
    );
    if (!canEngage) continue;
    const engageable = defenders.filter(
      def => def.count > 0 && canUnitEngageTarget(atk.unitType, def.unitType),
    );
    const navalOnly = engageable.length > 0 && engageable.every(def => def.unitType.domain === 'sea');
    const atkStat = atk.unitType.domain === 'land' && navalOnly
      ? getLandAntiNavalAttack(atk.unitType, atk.unitType.attack)
      : atk.unitType.attack;
    total += atk.count * atkStat;
  }
  return total;
}

/** Defense power counting only stacks that can hit at least one attacker present. */
export function computeEngageableDefensePower(
  defenders: CombatPowerUnit[],
  attackers: CombatPowerUnit[],
): number {
  if (attackers.length === 0) return 0;
  let total = 0;
  for (const def of defenders) {
    if (def.count <= 0) continue;
    const canEngage = attackers.some(
      atk => atk.count > 0 && canUnitEngageTarget(def.unitType, atk.unitType),
    );
    if (!canEngage) continue;
    const engageable = attackers.filter(
      atk => atk.count > 0 && canUnitEngageTarget(def.unitType, atk.unitType),
    );
    const navalOnly = engageable.length > 0 && engageable.every(atk => atk.unitType.domain === 'sea');
    const defStat = def.unitType.domain === 'land' && navalOnly
      ? getLandAntiNavalDefense(def.unitType, def.unitType.defense)
      : def.unitType.defense;
    total += def.count * defStat;
  }
  return total;
}

export interface StrategicDefenderPreview {
  unitType: UnitType;
  count: number;
  offshore?: boolean;
  seaZoneName?: string;
}

/** Land garrison plus offshore fleet for battle preview / odds. */
export function buildStrategicDefenderPreview(
  state: GameState,
  territoryId: string,
  defendingFactionId: string,
): StrategicDefenderPreview[] {
  const territory = state.territories.get(territoryId);
  if (!territory) return [];

  const preview: StrategicDefenderPreview[] = [];

  for (const pu of territory.units) {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    if (!unitType?.canDefend()) continue;
    if (unitType.domain === 'sea' && territory.type !== 'sea') continue;
    preview.push({ unitType, count: pu.count });
  }

  if (territory.type !== 'sea') {
    for (const offshore of collectOffshoreNavalDefenders(state, territoryId, defendingFactionId)) {
      const sea = state.territories.get(offshore.stationedTerritoryId);
      preview.push({
        unitType: offshore.unitType,
        count: offshore.count,
        offshore: true,
        seaZoneName: sea?.name,
      });
    }
  }

  return preview;
}

/** Defenders that can be hit by shore naval bombardment (garrison only, not offshore fleet). */
export function getShoreBombardmentTargets(
  combat: CombatState,
  battleTerritoryType: string,
): CombatUnit[] {
  if (battleTerritoryType === 'sea') {
    return combat.defenders.filter(d => d.unitType.domain === 'sea' && d.count > d.casualties);
  }
  return combat.defenders.filter(
    d => !d.stationedTerritoryId
      && d.unitType.domain !== 'sea'
      && d.count > d.casualties,
  );
}

/**
 * Pre-combat shore fire for strategic battles.
 * Coastal strike from sea: the whole fleet opens on the garrison.
 * Amphibious assault from land: only canBombard ships in adjacent sea zones.
 */
export function collectShoreBombardmentForCombat(
  state: GameState,
  combat: CombatState,
  targetTerritoryId: string,
): Array<{ unitType: UnitType; count: number }> {
  const target = state.territories.get(targetTerritoryId);
  if (!target || target.type === 'sea') return [];

  const source = combat.sourceTerritory
    ? state.territories.get(combat.sourceTerritory)
    : null;

  if (source?.type === 'sea') {
    const totals = new Map<string, { unitType: UnitType; count: number }>();
    for (const cu of combat.attackers) {
      if (cu.unitType.domain !== 'sea') continue;
      const active = cu.count - cu.casualties;
      if (active <= 0) continue;
      const entry = totals.get(cu.unitType.id);
      if (entry) entry.count += active;
      else totals.set(cu.unitType.id, { unitType: cu.unitType, count: active });
    }
    return Array.from(totals.values());
  }

  return collectBombardingUnits(state, targetTerritoryId, combat.attackingFactionId);
}

/** Land artillery / coastal guns firing one-way into a sea battle. */
export function collectCoastalArtilleryBarrage(
  combat: CombatState,
): Array<{ unitType: UnitType; count: number }> {
  return combat.attackers
    .filter(cu => canLandUnitStrikeNaval(cu.unitType) && cu.count > cu.casualties)
    .map(cu => ({ unitType: cu.unitType, count: cu.count - cu.casualties }));
}

/** Naval stacks in adjacent sea zones supporting a coastal/land defense. */
export function collectOffshoreNavalDefenders(
  state: GameState,
  territoryId: string,
  defendingFactionId: string,
): Array<{ unitType: UnitType; count: number; stationedTerritoryId: string }> {
  const territory = state.territories.get(territoryId);
  if (!territory || territory.type === 'sea') return [];

  const stacks: Array<{ unitType: UnitType; count: number; stationedTerritoryId: string }> = [];

  for (const adjId of territory.adjacentTo) {
    const sea = state.territories.get(adjId);
    if (!sea || sea.type !== 'sea' || sea.owner !== defendingFactionId) continue;

    for (const pu of sea.units) {
      const unitType = state.unitRegistry.get(pu.unitTypeId);
      if (!unitType || unitType.domain !== 'sea' || !unitType.canDefend()) continue;
      stacks.push({
        unitType,
        count: pu.count,
        stationedTerritoryId: sea.id,
      });
    }
  }

  return stacks;
}

/** Land garrison plus adjacent friendly fleet for capture / combat checks. */
export function countTerritoryDefendersIncludingOffshore(
  state: GameState,
  territoryId: string,
  defendingFactionId: string,
): number {
  const territory = state.territories.get(territoryId);
  if (!territory) return 0;

  let total = 0;
  for (const pu of territory.units) {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    if (!unitType?.canDefend()) continue;
    if (unitType.domain === 'sea' && territory.type !== 'sea') continue;
    total += pu.count;
  }

  for (const offshore of collectOffshoreNavalDefenders(state, territoryId, defendingFactionId)) {
    total += offshore.count;
  }

  return total;
}

export function isAntiSubUnit(unitTypeId: string): boolean {
  return ASW_UNITS.has(unitTypeId);
}

/** Adjacent friendly sea zones that can bombard a coastal/land target. */
export function collectBombardingUnits(
  state: GameState,
  targetTerritoryId: string,
  attackingFactionId: string,
): Array<{ unitType: UnitType; count: number }> {
  const target = state.territories.get(targetTerritoryId);
  if (!target || target.type === 'sea') return [];

  const totals = new Map<string, { unitType: UnitType; count: number }>();

  const addFromTerritory = (t: Territory) => {
    if (t.owner !== attackingFactionId) return;
    for (const pu of t.units) {
      const unitType = state.unitRegistry.get(pu.unitTypeId);
      if (!unitType?.canBombard) continue;
      const entry = totals.get(pu.unitTypeId);
      if (entry) entry.count += pu.count;
      else totals.set(pu.unitTypeId, { unitType, count: pu.count });
    }
  };

  for (const adj of getNavalReachSeaZones(state, target)) {
    addFromTerritory(adj);
  }

  return Array.from(totals.values());
}

/** Attacking subs fire first when the defender has no destroyer/cruiser escort. */
export function canSubmarinesSurpriseStrike(combat: CombatState): boolean {
  const activeSubs = combat.attackers.filter(
    cu => cu.unitType.id === 'submarine' && cu.count > cu.casualties,
  );
  if (activeSubs.length === 0) return false;

  const escorts = combat.defenders.filter(
    cu => isAntiSubUnit(cu.unitType.id) && cu.count > cu.casualties,
  );
  return escorts.length === 0;
}

export function getActiveSubmarineStrikeUnits(combat: CombatState): CombatUnit[] {
  if (!canSubmarinesSurpriseStrike(combat)) return [];
  return combat.attackers.filter(
    cu => cu.unitType.id === 'submarine' && cu.count > cu.casualties,
  );
}

/** Rock-paper-scissors naval counters (centralized). */
export function getNavalAttackCounterBonus(attackerTypeId: string, defenders: CombatUnit[]): number {
  const defIds = new Set(
    defenders.filter(cu => cu.count > cu.casualties).map(cu => cu.unitType.id),
  );
  if (attackerTypeId === 'destroyer' && defIds.has('submarine')) return 2;
  if (attackerTypeId === 'submarine' && (defIds.has('battleship') || defIds.has('carrier'))) return 1;
  if (attackerTypeId === 'cruiser' && defIds.has('submarine')) return 1;
  return 0;
}

export function getNavalDefenseCounterBonus(defenderTypeId: string, attackers: CombatUnit[]): number {
  const atkIds = new Set(
    attackers.filter(cu => cu.count > cu.casualties).map(cu => cu.unitType.id),
  );
  if (defenderTypeId === 'destroyer' && atkIds.has('submarine')) return 2;
  if (defenderTypeId === 'cruiser' && atkIds.has('submarine')) return 1;
  return 0;
}

/** Fleet composition bonuses from role mix. */
export function getFleetCompositionBonus(units: CombatUnit[]): { attack: number; defense: number } {
  let attack = 0;
  let defense = 0;

  const active = units.filter(cu => cu.count > cu.casualties);
  const roleCount = (role: NavalRole) =>
    active.reduce((sum, cu) => sum + (getNavalRole(cu.unitType.id) === role ? cu.count - cu.casualties : 0), 0);

  const screens = roleCount('screen');
  const capitals = active.reduce(
    (sum, cu) => sum + (CAPITAL_UNITS.has(cu.unitType.id) ? cu.count - cu.casualties : 0),
    0,
  );
  const raiders = roleCount('raider');
  const logistics = roleCount('logistics');

  // Capital ships need escorts to fight at full effectiveness.
  if (capitals > 0 && screens > 0) attack += 1;

  // Wolfpack: two or more subs operating together.
  if (raiders >= 2) attack += 1;

  // Logistics screen: transports protected by destroyers.
  if (logistics > 0 && screens > 0) defense += 1;

  return { attack, defense };
}

export interface FleetBreakdownLine {
  role: NavalRole;
  label: string;
  count: number;
  duty: string;
}

/** Summarize a stack for HUD / tooltips. */
export function summarizeFleet(
  state: GameState,
  territory: Territory,
): FleetBreakdownLine[] {
  const byRole = new Map<NavalRole, number>();

  for (const pu of territory.units) {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    if (!unitType || unitType.domain !== 'sea') continue;
    const role = getNavalRole(pu.unitTypeId);
    if (!role) continue;
    byRole.set(role, (byRole.get(role) ?? 0) + pu.count);
  }

  const order: NavalRole[] = ['capital', 'air_base', 'screen', 'raider', 'logistics'];
  return order
    .filter(role => (byRole.get(role) ?? 0) > 0)
    .map(role => ({
      role,
      label: NAVAL_ROLE_LABELS[role].name,
      count: byRole.get(role)!,
      duty: NAVAL_ROLE_LABELS[role].duty,
    }));
}

/** Whether this faction controls a sea zone (owns it with units present). */
export function controlsSeaZone(state: GameState, seaTerritoryId: string, factionId: string): boolean {
  const sea = state.territories.get(seaTerritoryId);
  if (!sea || sea.type !== 'sea') return false;
  if (sea.owner === factionId && sea.getTotalUnitCount() > 0) return true;
  return sea.units.some(pu => {
    const ut = state.unitRegistry.get(pu.unitTypeId);
    return ut?.domain === 'sea';
  }) && sea.owner === factionId;
}

/** Total transport lift available in a sea zone (+ friendly coastal ports touching it). */
export function getTransportCapacityInSeaZone(
  state: GameState,
  seaTerritoryId: string,
  factionId: string,
): number {
  const sea = state.territories.get(seaTerritoryId);
  if (!sea || sea.type !== 'sea') return 0;

  const sumCapacity = (t: Territory): number =>
    t.units.reduce((sum, pu) => {
      const ut = state.unitRegistry.get(pu.unitTypeId);
      return sum + (ut?.transportCapacity ?? 0) * pu.count;
    }, 0);

  let total = sea.owner === factionId ? sumCapacity(sea) : 0;
  for (const adjId of sea.adjacentTo) {
    const adj = state.territories.get(adjId);
    if (adj?.type === 'coastal' && adj.owner === factionId) {
      total += sumCapacity(adj);
    }
  }
  return total;
}
