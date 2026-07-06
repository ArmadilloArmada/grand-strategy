import { describe, expect, it } from 'vitest';
import { GameState } from '../../engine/GameState';
import { AIController } from '../../engine/AIController';
import { MobilizationSystem } from '../../engine/MobilizationSystem';
import { MovementValidator } from '../../engine/MovementValidator';
import { TurnManager } from '../../engine/TurnManager';
import { DataLoader } from '../DataLoader';
import type { MapData } from '../MapLoader';
import type { FactionData } from '../../data/Faction';
import type { UnitTypeData } from '../../data/Unit';
import unitsData from '../../../assets/units/wwii-units.json';
import worldFactions from '../../../assets/factions/world-factions.json';
import gridMapData from '../../../assets/maps/grid-world-map.json';
import tutorialMapData from '../../../assets/maps/tutorial-map.json';
import gridEuropeData from '../../../assets/maps/grid-europe.json';
import gridPacificData from '../../../assets/maps/grid-pacific.json';
import gridAmericasData from '../../../assets/maps/grid-americas.json';
import gridAfricaData from '../../../assets/maps/grid-africa.json';
import gridEasternFrontData from '../../../assets/maps/grid-eastern-front.json';
import gridSkirmishData from '../../../assets/maps/grid-skirmish.json';
import gridMediterraneanData from '../../../assets/maps/grid-mediterranean.json';
import gridArcticData from '../../../assets/maps/grid-arctic.json';
import gridArchipelagoData from '../../../assets/maps/grid-archipelago.json';
import gridWorldMapMega from '../../../assets/maps/grid-world-map-mega.json';
import worldFactionsMega from '../../../assets/factions/world-factions-mega.json';
import {
  AFRICA_FACTIONS,
  AMERICAS_FACTIONS,
  ARCHIPELAGO_FACTIONS,
  ARCTIC_FACTIONS,
  EASTERN_FRONT_FACTIONS,
  EUROPE_FACTIONS,
  MEDITERRANEAN_FACTIONS,
  PACIFIC_FACTIONS,
  SKIRMISH_FACTIONS,
  TUTORIAL_FACTIONS,
} from '../../data/mapFactions';

const maps: Array<{ id: string; data: MapData; factions: FactionData[]; expectSeaFill?: boolean }> = [
  { id: 'grid', data: gridMapData as unknown as MapData, factions: worldFactions as FactionData[] },
  { id: 'tutorial', data: tutorialMapData as unknown as MapData, factions: TUTORIAL_FACTIONS },
  { id: 'grid-europe', data: gridEuropeData as unknown as MapData, factions: EUROPE_FACTIONS },
  { id: 'grid-pacific', data: gridPacificData as unknown as MapData, factions: PACIFIC_FACTIONS, expectSeaFill: true },
  { id: 'grid-americas', data: gridAmericasData as unknown as MapData, factions: AMERICAS_FACTIONS, expectSeaFill: true },
  { id: 'grid-africa', data: gridAfricaData as unknown as MapData, factions: AFRICA_FACTIONS },
  { id: 'grid-eastern-front', data: gridEasternFrontData as unknown as MapData, factions: EASTERN_FRONT_FACTIONS },
  { id: 'grid-skirmish', data: gridSkirmishData as unknown as MapData, factions: SKIRMISH_FACTIONS },
  { id: 'grid-mediterranean', data: gridMediterraneanData as unknown as MapData, factions: MEDITERRANEAN_FACTIONS },
  { id: 'grid-arctic', data: gridArcticData as unknown as MapData, factions: ARCTIC_FACTIONS },
  { id: 'grid-archipelago', data: gridArchipelagoData as unknown as MapData, factions: ARCHIPELAGO_FACTIONS },
  { id: 'grid-mega', data: gridWorldMapMega as unknown as MapData, factions: worldFactionsMega as FactionData[] },
];

function loadMap(data: MapData, factions: FactionData[]): GameState {
  const state = new GameState();
  new DataLoader(state).loadBundle({
    units: unitsData as unknown as UnitTypeData[],
    factions,
    map: data,
  });
  return state;
}

function playableFactions(factions: FactionData[]): FactionData[] {
  return factions.filter(f => f.isPlayable);
}

function canReach(state: GameState, fromId: string, targets: Set<string>): boolean {
  const queue = [fromId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (targets.has(id)) return true;
    if (visited.has(id)) continue;
    visited.add(id);

    const territory = state.territories.get(id);
    if (!territory) continue;
    for (const adjacentId of territory.adjacentTo) {
      if (!visited.has(adjacentId)) queue.push(adjacentId);
    }
  }

  return false;
}

function hasPlayableAction(state: GameState, factionId: string): boolean {
  state.currentFactionId = factionId;
  const movement = new MovementValidator(state);

  for (const territory of state.territories.values()) {
    if (territory.owner !== factionId) continue;
    for (const unit of territory.units) {
      if (unit.count <= 0) continue;
      const nonCombatMoves = movement.getValidMoves(unit.unitTypeId, territory.id, false);
      const combatMoves = movement.getValidMoves(unit.unitTypeId, territory.id, true);
      if (nonCombatMoves.length > 0 || combatMoves.length > 0) return true;
    }
  }

  return false;
}

function smokeFirstTurnAction(state: GameState, factionId: string): void {
  state.currentFactionId = factionId;

  const mobilization = new MobilizationSystem(state);
  const option = mobilization.getMobilizationOptions().find(o => o.canMobilize);
  expect(option, `${factionId} should have an executable mobilization option`).toBeTruthy();

  const mobilizeTarget = option!.territory;
  const unitsBeforeMobilize = mobilizeTarget.getTotalUnitCount();
  const result = mobilization.mobilize(mobilizeTarget.id);
  expect(result.success, `${factionId} should be able to mobilize ${mobilizeTarget.id}`).toBe(true);
  expect(mobilizeTarget.getTotalUnitCount(), `${factionId} mobilization should add units`).toBeGreaterThan(unitsBeforeMobilize);

  const movement = new MovementValidator(state);
  for (const territory of state.territories.values()) {
    if (territory.owner !== factionId) continue;

    for (const unit of territory.units) {
      const available = movement.getAvailableUnits(territory.id, unit.unitTypeId);
      if (available <= 0) continue;

      const moves = movement.getValidMoves(unit.unitTypeId, territory.id, true)
        .sort((a, b) => Number(a.isAttack) - Number(b.isAttack));
      const move = moves[0];
      if (!move) continue;

      const pendingMove = {
        unitTypeId: unit.unitTypeId,
        count: 1,
        fromTerritoryId: territory.id,
        toTerritoryId: move.territoryId,
        path: move.path,
        viaTransport: move.viaTransport,
      };

      if (move.isAttack) {
        state.pendingMoves.push(pendingMove);
        expect(movement.getAvailableUnits(territory.id, unit.unitTypeId), `${factionId} attack commitment should reserve a unit`).toBe(available - 1);
      } else {
        expect(movement.executeMove(pendingMove), `${factionId} should execute first safe move`).toBe(true);
      }
      return;
    }
  }

  throw new Error(`${factionId} had no executable first-turn move`);
}

describe('playable map sanity', () => {
  it.each(maps)('$id has valid references, playable capitals, units, and build options', ({ data, factions }) => {
    const state = loadMap(data, factions);
    const loader = new DataLoader(new GameState()).getMapLoader();
    expect(loader.validateMap({
      ...data,
      territories: Array.from(state.territories.values()).map(t => t.serialize()),
    })).toEqual([]);

    for (const faction of playableFactions(factions)) {
      const capital = state.territories.get(faction.capital);
      expect(capital, `${faction.id} capital ${faction.capital} should exist`).toBeTruthy();
      expect(capital?.owner, `${faction.id} should own its capital`).toBe(faction.id);

      const ownedUnits = Array.from(state.territories.values())
        .filter(t => t.owner === faction.id)
        .reduce((sum, t) => sum + t.getTotalUnitCount(), 0);
      expect(ownedUnits, `${faction.id} should start with units`).toBeGreaterThan(0);

      state.currentFactionId = faction.id;
      const mobilization = new MobilizationSystem(state);
      const options = mobilization.getMobilizationOptions();
      expect(options.length, `${faction.id} should have owned build territories`).toBeGreaterThan(0);
      expect(options.some(o => o.canMobilize), `${faction.id} should be able to mobilize on turn one`).toBe(true);
    }
  });

  it.each(maps)('$id gives every playable faction a legal first-turn action', ({ data, factions }) => {
    const state = loadMap(data, factions);

    for (const faction of playableFactions(factions)) {
      expect(hasPlayableAction(state, faction.id), `${faction.id} should have a legal move or attack`).toBe(true);
    }
  });

  it.each(maps)('$id lets every playable faction execute a first-turn mobilization and movement commitment', ({ data, factions }) => {
    for (const faction of playableFactions(factions)) {
      const state = loadMap(data, factions);
      smokeFirstTurnAction(state, faction.id);
    }
  });

  it.each(maps)('$id lets AI evaluate and plan attacks without invalid map references', ({ data, factions }) => {
    const state = loadMap(data, factions);
    const ai = new AIController(state, new TurnManager(state));

    for (const factionData of playableFactions(factions)) {
      const faction = state.factionRegistry.get(factionData.id);
      expect(faction, `${factionData.id} should be registered`).toBeTruthy();
      state.currentFactionId = factionData.id;

      const evaluations = (ai as any).evaluateAllTerritories();
      const plans = (ai as any).generateAttackPlans(evaluations, faction);

      expect(evaluations.size, `${factionData.id} should evaluate territories`).toBeGreaterThan(0);
      for (const plan of plans) {
        expect(state.territories.has(plan.targetId), `${plan.targetId} target should exist`).toBe(true);
        expect(plan.attackers.length, `${plan.targetId} should have attackers`).toBeGreaterThan(0);
        for (const attacker of plan.attackers) {
          expect(state.territories.has(attacker.fromId), `${attacker.fromId} source should exist`).toBe(true);
          expect(state.unitRegistry.get(attacker.unitTypeId), `${attacker.unitTypeId} should exist`).toBeTruthy();
          expect(attacker.count).toBeGreaterThan(0);
        }
      }
    }

    ai.terminateWorker();
  });

  it.each(maps)('$id connects every playable capital to another playable capital', ({ data, factions }) => {
    const state = loadMap(data, factions);

    for (const faction of playableFactions(factions)) {
      const otherCapitals = new Set(
        playableFactions(factions)
          .filter(other => other.id !== faction.id)
          .map(other => other.capital)
      );
      expect(canReach(state, faction.capital, otherCapitals), `${faction.id} capital should not be isolated`).toBe(true);
    }
  });

  it.each(maps)('$id round-trips through save/load without losing map state', ({ data, factions }) => {
    const state = loadMap(data, factions);
    const savedTerritories = state.territories.size;
    const savedChecksum = state.computeChecksum();

    const restored = loadMap(data, factions);
    restored.loadFromJSON(state.saveToJSON());

    expect(restored.territories.size).toBe(savedTerritories);
    expect(restored.computeChecksum()).toBe(savedChecksum);
    expect(
      Array.from(state.territories.values()).filter(t => t.id.startsWith('sea_auto_')).length
    ).toBe(
      Array.from(restored.territories.values()).filter(t => t.id.startsWith('sea_auto_')).length
    );
  });

  it.each(maps.filter(m => m.expectSeaFill))('$id fills empty grid cells with sea zones', ({ data, factions }) => {
    const state = loadMap(data, factions);
    expect(state.territories.size).toBeGreaterThan(data.territories.length);
    expect(Array.from(state.territories.values()).some(t => t.id.startsWith('sea_auto_'))).toBe(true);
  });

  it.each(maps)('$id has reciprocal adjacency and coastal sea access', ({ data, factions }) => {
    const state = loadMap(data, factions);

    for (const territory of state.territories.values()) {
      for (const adjacentId of territory.adjacentTo) {
        const adjacent = state.territories.get(adjacentId);
        expect(adjacent, `${territory.id} should reference an existing neighbor`).toBeTruthy();
        expect(adjacent?.adjacentTo, `${territory.id} <-> ${adjacentId} should be reciprocal`).toContain(territory.id);
      }

      if (territory.type === 'coastal') {
        expect(
          territory.adjacentTo.some(adjacentId => state.territories.get(adjacentId)?.type === 'sea'),
          `${territory.id} is coastal and should touch a sea zone`
        ).toBe(true);
      }
    }
  });
});
