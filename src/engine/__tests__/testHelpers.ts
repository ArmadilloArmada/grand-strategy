/**
 * Shared test helpers for building minimal GameState instances.
 */
import { GameState } from '../GameState';
import { Territory, TerritoryData } from '../../data/Territory';
import { UnitType, UnitTypeData } from '../../data/Unit';
import { FactionData } from '../../data/Faction';

// ── Unit builders ────────────────────────────────────────────────────────────

export function makeUnitData(overrides: Partial<UnitTypeData> = {}): UnitTypeData {
  return {
    id: 'infantry',
    name: 'Infantry',
    attack: 1,
    defense: 2,
    movement: 1,
    cost: 3,
    domain: 'land',
    hitPoints: 1,
    canBlitz: false,
    canBombard: false,
    canStrategicBomb: false,
    transportCapacity: 0,
    requiredTransport: false,
    ...overrides,
  };
}

export function makeUnit(overrides: Partial<UnitTypeData> = {}): UnitType {
  return new UnitType(makeUnitData(overrides));
}

// ── Territory builders ───────────────────────────────────────────────────────

export function makeTerritoryData(id: string, owner: string | null, overrides: Partial<TerritoryData> = {}): TerritoryData {
  return {
    id,
    name: id,
    type: 'land',
    production: 2,
    adjacentTo: [],
    polygon: [],
    center: [0, 0],
    owner,
    originalOwner: owner,
    hasFactory: false,
    isCapital: false,
    ...overrides,
  };
}

export function makeTerritory(id: string, owner: string | null, overrides: Partial<TerritoryData> = {}): Territory {
  return new Territory(makeTerritoryData(id, owner, overrides));
}

// ── Faction builder ──────────────────────────────────────────────────────────

export function makeFactionData(id: string, overrides: Partial<FactionData> = {}): FactionData {
  return {
    id,
    name: id,
    color: '#ff0000',
    colorLight: '#ff8888',
    capital: `${id}_capital`,
    startingIPCs: 30,
    turnOrder: 1,
    isPlayable: true,
    allies: [],
    ...overrides,
  };
}

// ── Minimal GameState builder ─────────────────────────────────────────────────

/**
 * Build a minimal two-faction GameState with unit registry populated.
 * attacker owns 'source', defender owns 'target', both territories are adjacent.
 */
export function buildCombatState(): {
  state: GameState;
  attackerFactionId: string;
  defenderFactionId: string;
} {
  const state = new GameState();
  const attackerFactionId = 'attacker';
  const defenderFactionId = 'defender';

  // Register factions
  state.factionRegistry.register(makeFactionData(attackerFactionId, { capital: 'source', allies: [] }));
  state.factionRegistry.register(makeFactionData(defenderFactionId, { capital: 'target', allies: [] }));

  // Register units
  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3, attack: 1, defense: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'tank', cost: 6, attack: 3, defense: 3, canBlitz: true }));
  state.unitRegistry.register(makeUnitData({ id: 'artillery', cost: 4, attack: 2, defense: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'bomber', cost: 12, attack: 4, defense: 1, domain: 'air', canStrategicBomb: true }));

  // Build territories
  const source = makeTerritory('source', attackerFactionId, {
    adjacentTo: ['target'],
    hasFactory: true, // ensures supply
    isCapital: true,
  });
  const target = makeTerritory('target', defenderFactionId, {
    adjacentTo: ['source'],
    hasFactory: true, // ensures supply
    isCapital: true,
  });

  state.territories.set('source', source);
  state.territories.set('target', target);

  state.currentFactionId = attackerFactionId;

  return { state, attackerFactionId, defenderFactionId };
}

/**
 * Build a GameState with a linear chain of territories for pathfinding tests.
 * a → b → c, all owned by 'player'
 */
export function buildMovementState(): GameState {
  const state = new GameState();
  const factionId = 'player';
  const enemyId = 'enemy';

  state.factionRegistry.register(makeFactionData(factionId, { capital: 'a', allies: [] }));
  state.factionRegistry.register(makeFactionData(enemyId, { capital: 'c', allies: [] }));

  state.unitRegistry.register(makeUnitData({ id: 'infantry', movement: 1 }));
  state.unitRegistry.register(makeUnitData({ id: 'tank', movement: 2, canBlitz: true, cost: 6, attack: 3, defense: 3 }));
  state.unitRegistry.register(makeUnitData({ id: 'fighter', movement: 4, domain: 'air', attack: 3, defense: 4, cost: 10, canStrategicBomb: false }));

  const a = makeTerritory('a', factionId, { adjacentTo: ['b'], isCapital: true });
  const b = makeTerritory('b', factionId, { adjacentTo: ['a', 'c'] });
  const c = makeTerritory('c', enemyId, { adjacentTo: ['b'] });

  // Put units in territory a
  a.units.push({ unitTypeId: 'infantry', count: 2 });
  a.units.push({ unitTypeId: 'tank', count: 1 });

  state.territories.set('a', a);
  state.territories.set('b', b);
  state.territories.set('c', c);

  state.currentFactionId = factionId;

  return state;
}
