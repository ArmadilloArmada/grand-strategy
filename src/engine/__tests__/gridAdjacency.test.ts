import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MovementValidator } from '../MovementValidator';
import { getGridNeighborIds, getNavalReachNeighborIds, isNavalReachNeighbor } from '../gridAdjacency';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

function gridPolygon(col: number, row: number, size = 50): [number, number][] {
  const x = col * size;
  const y = row * size;
  return [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
}

describe('gridAdjacency horizontal wrap', () => {
  it('connects the west and east edges on wrap maps', () => {
    const state = new GameState();
    state.mapLayout = { width: 200, height: 100, wrapHorizontal: true };

    const west = makeTerritory('west', 'player', {
      type: 'coastal',
      adjacentTo: [],
      polygon: gridPolygon(0, 1),
      center: [25, 75],
    });
    const east = makeTerritory('east', 'player', {
      type: 'coastal',
      adjacentTo: [],
      polygon: gridPolygon(3, 1),
      center: [175, 75],
    });
    state.territories.set('west', west);
    state.territories.set('east', east);

    expect(getGridNeighborIds(state, west, { allowHorizontalWrap: true })).toContain('east');
    expect(getGridNeighborIds(state, east, { allowHorizontalWrap: true })).toContain('west');
    expect(getGridNeighborIds(state, west)).not.toContain('east');
  });
});

describe('gridAdjacency naval reach', () => {
  it('includes diagonal grid neighbors beyond orthogonal adjacentTo', () => {
    const state = new GameState();
    const sea = makeTerritory('sea1', 'player', {
      type: 'sea',
      adjacentTo: [],
      polygon: gridPolygon(2, 1),
      center: [125, 75],
    });
    const land = makeTerritory('coast', 'enemy', {
      type: 'coastal',
      adjacentTo: [],
      polygon: gridPolygon(3, 2),
      center: [175, 125],
    });
    state.territories.set('sea1', sea);
    state.territories.set('coast', land);

    expect(isNavalReachNeighbor(state, sea, land)).toBe(true);
    expect(getNavalReachNeighborIds(state, sea)).toContain('coast');
    expect(getGridNeighborIds(state, sea)).toContain('coast');
  });
});

describe('MovementValidator diagonal coastal strikes', () => {
  it('lets a fleet attack diagonally adjacent enemy land', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('player', { capital: 'sea1', allies: [] }));
    state.factionRegistry.register(makeFactionData('enemy', { capital: 'coast', allies: [] }));
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea', movement: 2, attack: 2, defense: 2, cost: 8 }));

    const sea = makeTerritory('sea1', 'player', {
      type: 'sea',
      adjacentTo: [],
      polygon: gridPolygon(2, 1),
      center: [125, 75],
    });
    const land = makeTerritory('coast', 'enemy', {
      type: 'coastal',
      adjacentTo: [],
      polygon: gridPolygon(3, 2),
      center: [175, 125],
    });
    state.territories.set('sea1', sea);
    state.territories.set('coast', land);
    sea.units.push({ unitTypeId: 'destroyer', count: 8 });
    state.currentFactionId = 'player';

    const validator = new MovementValidator(state);
    const moves = validator.getValidMoves('destroyer', 'sea1', true);
    const strike = moves.find(m => m.territoryId === 'coast');
    expect(strike?.isAttack).toBe(true);
    expect(strike?.coastalStrike).toBe(true);
  });
});
