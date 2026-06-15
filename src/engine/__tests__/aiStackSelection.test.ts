import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { Territory } from '../../data/Territory';
import { UnitType } from '../../data/Unit';
import { pickBestReadyStackType, scoreReadyStackForAI } from '../aiStackSelection';

function makeTerritory(id: string, type: 'land' | 'sea' = 'land'): Territory {
  return new Territory({
    id,
    name: id,
    type,
    production: 1,
    isCapital: false,
    hasFactory: false,
    owner: 'faction_a',
    polygon: [[0, 0], [1, 0], [1, 1], [0, 1]],
    center: [0, 0],
    adjacentTo: [],
  });
}

function makeUnit(id: string, domain: 'land' | 'sea' | 'air', attack: number): UnitType {
  return new UnitType({
    id,
    name: id,
    domain,
    attack,
    defense: 1,
    movement: 2,
    cost: 5,
    hitPoints: 1,
    canBlitz: false,
    canBombard: false,
    canStrategicBomb: false,
    transportCapacity: 0,
    requiredTransport: false,
  });
}

describe('aiStackSelection', () => {
  it('prefers submarines over transports on mixed naval stacks when naval personality is high', () => {
    const state = new GameState();
    state.unitRegistry.register({
      id: 'submarine',
      name: 'submarine',
      domain: 'sea',
      attack: 2,
      defense: 1,
      movement: 2,
      cost: 5,
      hitPoints: 1,
      canBlitz: false,
      canBombard: false,
      canStrategicBomb: false,
      transportCapacity: 0,
      requiredTransport: false,
    });
    state.unitRegistry.register({
      id: 'transport',
      name: 'transport',
      domain: 'sea',
      attack: 0,
      defense: 1,
      movement: 2,
      cost: 5,
      hitPoints: 1,
      canBlitz: false,
      canBombard: false,
      canStrategicBomb: false,
      transportCapacity: 2,
      requiredTransport: false,
    });
    const sea = makeTerritory('sea_zone', 'sea');
    sea.units = [
      { unitTypeId: 'submarine', count: 2 },
      { unitTypeId: 'transport', count: 3 },
    ];
    state.territories.set(sea.id, sea);

    const pick = pickBestReadyStackType(state, sea, 0.9);
    expect(pick?.unitTypeId).toBe('submarine');
  });

  it('scores combat ships above transports', () => {
    const state = new GameState();
    const sub = makeUnit('submarine', 'sea', 2);
    const transport = makeUnit('transport', 'sea', 0);
    const sea = makeTerritory('sea_zone', 'sea');

    const subScore = scoreReadyStackForAI(state, sea, sub, 2, 0.8);
    const transportScore = scoreReadyStackForAI(state, sea, transport, 3, 0.8);
    expect(subScore).toBeGreaterThan(transportScore);
  });
});
