import { describe, it, expect, beforeEach } from 'vitest';
import { MovementValidator } from '../MovementValidator';
import { buildMovementState, makeTerritory } from './testHelpers';
import { GameState } from '../GameState';

describe('MovementValidator', () => {
  let state: GameState;
  let validator: MovementValidator;

  beforeEach(() => {
    state = buildMovementState();
    validator = new MovementValidator(state);
  });

  // ── validateMove ───────────────────────────────────────────────────────────

  describe('validateMove', () => {
    it('validates a simple adjacent move', () => {
      const result = validator.validateMove('infantry', 1, 'a', 'b', false);
      expect(result.valid).toBe(true);
      expect(result.path).toEqual(['a', 'b']);
      expect(result.movementCost).toBe(1);
    });

    it('rejects unknown unit type', () => {
      const result = validator.validateMove('battleship', 1, 'a', 'b', false);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/unknown unit type/i);
    });

    it('rejects move from invalid territory', () => {
      const result = validator.validateMove('infantry', 1, 'nowhere', 'b', false);
      expect(result.valid).toBe(false);
    });

    it('rejects move when source territory not owned by current faction', () => {
      // Territory 'c' is owned by 'enemy'
      const result = validator.validateMove('infantry', 1, 'c', 'b', false);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/do not control/i);
    });

    it('rejects moving into enemy territory during non-combat move', () => {
      // 'c' is enemy territory; non-combat move should be blocked
      const result = validator.validateMove('infantry', 1, 'b', 'c', false);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/non-combat/i);
    });

    it('allows moving into enemy territory during combat move', () => {
      const result = validator.validateMove('infantry', 1, 'b', 'c', true);
      expect(result.valid).toBe(true);
    });

    it('rejects move when movement cost exceeds unit range', () => {
      // Infantry movement = 1. a → b → c is cost 2, which exceeds 1.
      const result = validator.validateMove('infantry', 1, 'a', 'c', true);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/movement cost/i);
    });

    it('allows tank to reach 2 territories away (movement = 2)', () => {
      const result = validator.validateMove('tank', 1, 'a', 'c', true);
      expect(result.valid).toBe(true);
    });

    it('rejects land unit entering sea territory', () => {
      // Add a sea territory adjacent to 'a'
      const sea = makeTerritory('sea1', 'player', { type: 'sea', adjacentTo: ['a'] });
      state.territories.set('sea1', sea);
      const a = state.territories.get('a')!;
      (a.adjacentTo as string[]).push('sea1');

      const result = validator.validateMove('infantry', 1, 'a', 'sea1', false);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/cannot enter/i);
    });

    it('allows air unit to enter any territory type', () => {
      const sea = makeTerritory('sea1', 'player', { type: 'sea', adjacentTo: ['a'] });
      state.territories.set('sea1', sea);
      const a = state.territories.get('a')!;
      (a.adjacentTo as string[]).push('sea1');

      const result = validator.validateMove('fighter', 1, 'a', 'sea1', false);
      expect(result.valid).toBe(true);
    });
  });

  // ── getValidMoves ──────────────────────────────────────────────────────────

  describe('getValidMoves', () => {
    it('returns adjacent friendly territory for infantry', () => {
      const moves = validator.getValidMoves('infantry', 'a', false);
      const ids = moves.map(m => m.territoryId);
      expect(ids).toContain('b');
    });

    it('marks enemy territory as isAttack=true in non-combat move (filtering is caller responsibility)', () => {
      // getValidMoves always includes visible attack targets; callers filter by isCombatMove
      state.territories.get('b')!.units.push({ unitTypeId: 'infantry', count: 1 });
      const moves = validator.getValidMoves('infantry', 'b', false);
      const enemyMove = moves.find(m => m.territoryId === 'c');
      // Enemy territory is included but flagged as an attack
      if (enemyMove) {
        expect(enemyMove.isAttack).toBe(true);
      }
    });

    it('includes enemy territory in combat move', () => {
      state.territories.get('b')!.units.push({ unitTypeId: 'infantry', count: 1 });
      const moves = validator.getValidMoves('infantry', 'b', true);
      const ids = moves.map(m => m.territoryId);
      expect(ids).toContain('c');
    });

    it('marks enemy territory as isAttack=true', () => {
      state.territories.get('b')!.units.push({ unitTypeId: 'infantry', count: 1 });
      const moves = validator.getValidMoves('infantry', 'b', true);
      const enemyMove = moves.find(m => m.territoryId === 'c');
      expect(enemyMove?.isAttack).toBe(true);
    });

    it('tank with movement=2 reaches c from a in combat move', () => {
      const moves = validator.getValidMoves('tank', 'a', true);
      const ids = moves.map(m => m.territoryId);
      expect(ids).toContain('c');
    });

    it('returns empty array for unknown unit type', () => {
      const moves = validator.getValidMoves('unknown_unit', 'a', true);
      expect(moves).toHaveLength(0);
    });

    it('returns empty array when no available units', () => {
      // 'b' has no units
      const moves = validator.getValidMoves('infantry', 'b', true);
      // b has no infantry units placed there, getAvailableUnits should return 0
      expect(moves).toHaveLength(0);
    });

    it('allows transport movement through neutral sea with friendly transport capacity', () => {
      state.unitRegistry.register({
        ...state.unitRegistry.get('infantry')!.serialize(),
        requiredTransport: true,
      });
      state.unitRegistry.register({
        id: 'transport',
        name: 'Transport',
        attack: 0,
        defense: 0,
        movement: 2,
        cost: 8,
        domain: 'sea',
        hitPoints: 1,
        canBlitz: false,
        canBombard: false,
        canStrategicBomb: false,
        transportCapacity: 2,
        requiredTransport: false,
      });

      const island = makeTerritory('island', 'player', { type: 'coastal', adjacentTo: ['sea1'] });
      const sea = makeTerritory('sea1', null, { type: 'sea', production: 0, adjacentTo: ['a', 'island'] });
      sea.units.push({ unitTypeId: 'transport', count: 1 });
      state.territories.set('island', island);
      state.territories.set('sea1', sea);
      (state.territories.get('a')!.adjacentTo as string[]).push('sea1');

      const combatMoves = validator.getValidMoves('infantry', 'a', true);
      const nonCombatMoves = validator.getValidMoves('infantry', 'a', false);

      expect(combatMoves.find(m => m.territoryId === 'island')?.viaTransport).toBe('sea1');
      expect(nonCombatMoves.find(m => m.territoryId === 'island')?.viaTransport).toBe('sea1');
    });

    it('does not use transport routes through enemy-controlled seas', () => {
      state.unitRegistry.register({
        ...state.unitRegistry.get('infantry')!.serialize(),
        requiredTransport: true,
      });
      state.unitRegistry.register({
        id: 'transport',
        name: 'Transport',
        attack: 0,
        defense: 0,
        movement: 2,
        cost: 8,
        domain: 'sea',
        hitPoints: 1,
        canBlitz: false,
        canBombard: false,
        canStrategicBomb: false,
        transportCapacity: 2,
        requiredTransport: false,
      });

      const island = makeTerritory('island', 'player', { type: 'coastal', adjacentTo: ['sea1'] });
      const sea = makeTerritory('sea1', 'enemy', { type: 'sea', production: 0, adjacentTo: ['a', 'island'] });
      sea.units.push({ unitTypeId: 'transport', count: 1 });
      state.territories.set('island', island);
      state.territories.set('sea1', sea);
      (state.territories.get('a')!.adjacentTo as string[]).push('sea1');

      const moves = validator.getValidMoves('infantry', 'a', true);
      expect(moves.find(m => m.territoryId === 'island')).toBeUndefined();
    });
  });

  // ── getAvailableUnits ──────────────────────────────────────────────────────

  describe('getAvailableUnits', () => {
    it('returns unit count from territory', () => {
      const count = validator.getAvailableUnits('a', 'infantry');
      expect(count).toBe(2);
    });

    it('returns 0 for a unit type not present', () => {
      const count = validator.getAvailableUnits('a', 'artillery');
      expect(count).toBe(0);
    });

    it('subtracts units already committed to pending moves', () => {
      state.pendingMoves.push({
        unitTypeId: 'infantry',
        count: 1,
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        path: ['a', 'b'],
      });
      const count = validator.getAvailableUnits('a', 'infantry');
      expect(count).toBe(1); // 2 - 1 pending = 1 remaining
    });
  });

  // ── executeMove ───────────────────────────────────────────────────────────

  describe('executeMove', () => {
    it('moves units from source to destination', () => {
      validator.executeMove({
        unitTypeId: 'infantry',
        count: 1,
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        path: ['a', 'b'],
      });

      const a = state.territories.get('a')!;
      const b = state.territories.get('b')!;
      expect(a.getUnitCount('infantry')).toBe(1); // 2 - 1
      expect(b.getUnitCount('infantry')).toBe(1); // 0 + 1
    });

    it('captures neutral territory when moving in', () => {
      // Make 'b' neutral
      (state.territories.get('b') as any).owner = null;

      validator.executeMove({
        unitTypeId: 'infantry',
        count: 1,
        fromTerritoryId: 'a',
        toTerritoryId: 'b',
        path: ['a', 'b'],
      });

      expect(state.territories.get('b')!.owner).toBe('player');
    });

    it('returns false when source territory is unknown', () => {
      const result = validator.executeMove({
        unitTypeId: 'infantry',
        count: 1,
        fromTerritoryId: 'nowhere',
        toTerritoryId: 'b',
        path: ['nowhere', 'b'],
      });
      expect(result).toBe(false);
    });
  });
});
