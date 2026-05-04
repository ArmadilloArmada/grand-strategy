import { describe, expect, it } from 'vitest';
import { GameState } from '../GameState';
import { ObjectiveSystem } from '../ObjectiveSystem';
import { makeFactionData, makeTerritory } from './testHelpers';

function makeObjectiveState(): GameState {
  const state = new GameState();
  state.factionRegistry.loadFromData([
    makeFactionData('blue', { capital: 'blue_capital', allies: [] }),
    makeFactionData('red', { capital: 'red_capital', allies: [] }),
  ]);
  state.currentFactionId = 'blue';

  const blueCapital = makeTerritory('blue_capital', 'blue', {
    name: 'Blue Capital',
    isCapital: true,
    hasFactory: true,
    adjacentTo: ['island_port', 'supply_port'],
  });
  const islandPort = makeTerritory('island_port', 'red', {
    name: 'Island Port',
    type: 'coastal',
    production: 4,
    adjacentTo: ['blue_capital', 'sea_lane'],
  });
  const supplyPort = makeTerritory('supply_port', 'blue', {
    name: 'Supply Port',
    type: 'coastal',
    production: 3,
    adjacentTo: ['blue_capital', 'sea_lane'],
  });
  const seaLane = makeTerritory('sea_lane', null, {
    name: 'Sea Lane',
    type: 'sea',
    production: 0,
    adjacentTo: ['island_port', 'supply_port'],
  });
  const redCapital = makeTerritory('red_capital', 'red', {
    name: 'Red Capital',
    isCapital: true,
    adjacentTo: ['island_port'],
  });

  for (const territory of [blueCapital, islandPort, supplyPort, seaLane, redCapital]) {
    state.territories.set(territory.id, territory);
  }

  return state;
}

describe('ObjectiveSystem scenario openings', () => {
  it('adds a Pacific island-hopping objective on island maps', () => {
    const state = makeObjectiveState();
    const objectives = new ObjectiveSystem(state);
    objectives.setScenarioMap('grid-pacific');

    objectives.ensureOpeningObjectives('blue');

    const active = objectives.getActive('blue');
    expect(active.some(obj => obj.title === 'Island Hopping')).toBe(true);
    const islandObjective = active.find(obj => obj.title === 'Island Hopping');
    expect(islandObjective?.condition.type).toBe('capture_territory');
    expect(islandObjective?.condition.territoryId).toBe('island_port');
  });

  it('adds a Mediterranean supply-route objective on coastal maps', () => {
    const state = makeObjectiveState();
    const objectives = new ObjectiveSystem(state);
    objectives.setScenarioMap('grid-mediterranean');

    objectives.ensureOpeningObjectives('blue');

    const routeObjective = objectives.getActive('blue').find(obj => obj.title === 'Secure the Route');
    expect(routeObjective).toBeDefined();
    expect(routeObjective?.condition.type).toBe('hold_territory');
    expect(routeObjective?.condition.territoryId).toBe('supply_port');
  });
});
