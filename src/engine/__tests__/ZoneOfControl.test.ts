/**
 * Zone of Control tests — non-combat movement stops at ZOC territories.
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MovementValidator } from '../MovementValidator';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

/**
 * Map layout:
 *   home ─── border ─── enemy_front
 *                │
 *              deep
 *
 * enemy_front is owned by 'enemy' with units.
 * border is 'player'-owned and adjacent to enemy_front → it is in enemy ZOC.
 * deep is 'player'-owned and only adjacent to border (two hops from enemy).
 */
function buildZOCState(): { state: GameState; mv: MovementValidator } {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', { capital: 'home', allies: [] }));
  state.factionRegistry.register(makeFactionData('enemy', { capital: 'enemy_front', allies: [] }));

  state.unitRegistry.register(makeUnitData({ id: 'infantry', movement: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'fighter', movement: 4, domain: 'air', attack: 3, defense: 4, cost: 10 }));
  state.unitRegistry.register(makeUnitData({ id: 'destroyer', movement: 2, domain: 'sea', cost: 8, attack: 3, defense: 3 }));

  const home = makeTerritory('home', 'player', {
    isCapital: true, hasFactory: true, adjacentTo: ['border'],
  });
  const border = makeTerritory('border', 'player', {
    adjacentTo: ['home', 'enemy_front', 'deep'],
  });
  const deep = makeTerritory('deep', 'player', {
    adjacentTo: ['border'],
  });
  const enemyFront = makeTerritory('enemy_front', 'enemy', {
    isCapital: true, adjacentTo: ['border'],
  });

  // Enemy has units in enemy_front (required for ZOC)
  enemyFront.units.push({ unitTypeId: 'infantry', count: 2 });
  // Player has units to move
  home.units.push({ unitTypeId: 'infantry', count: 2 });
  home.units.push({ unitTypeId: 'fighter', count: 1 });

  state.territories.set('home', home);
  state.territories.set('border', border);
  state.territories.set('deep', deep);
  state.territories.set('enemy_front', enemyFront);

  state.currentFactionId = 'player';

  const mv = new MovementValidator(state);
  return { state, mv };
}

// ── ZOC stops non-combat movement ─────────────────────────────────────────────

describe('Zone of Control — non-combat movement', () => {
  it('infantry can enter ZOC territory (border)', () => {
    const { mv } = buildZOCState();
    const moves = mv.getValidMoves('infantry', 'home', false);
    expect(moves.some(m => m.territoryId === 'border')).toBe(true);
  });

  it('infantry cannot move THROUGH border (ZOC territory) to reach deep', () => {
    const { mv } = buildZOCState();
    const moves = mv.getValidMoves('infantry', 'home', false);
    // 'deep' requires passing through 'border' which is in ZOC
    expect(moves.some(m => m.territoryId === 'deep')).toBe(false);
  });

  it('during combat move, infantry CAN reach deep via border', () => {
    const { mv } = buildZOCState();
    const moves = mv.getValidMoves('infantry', 'home', true);
    // Combat move ignores ZOC
    expect(moves.some(m => m.territoryId === 'deep')).toBe(true);
  });
});

// ── Air units ignore ZOC ──────────────────────────────────────────────────────

describe('Zone of Control — air units immune to ZOC', () => {
  it('fighter can fly through ZOC territory (border) to reach deep', () => {
    const { mv } = buildZOCState();
    const moves = mv.getValidMoves('fighter', 'home', false);
    expect(moves.some(m => m.territoryId === 'deep')).toBe(true);
  });
});

// ── Empty enemy territory does NOT exert ZOC ─────────────────────────────────

describe('Zone of Control — empty enemy territory no ZOC', () => {
  it('infantry can reach deep when enemy_front has no units', () => {
    const { state, mv } = buildZOCState();
    state.territories.get('enemy_front')!.units = [];
    const moves = mv.getValidMoves('infantry', 'home', false);
    // With no enemy units, border is no longer ZOC → deep is reachable
    expect(moves.some(m => m.territoryId === 'deep')).toBe(true);
  });
});
