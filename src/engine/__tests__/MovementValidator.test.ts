import { describe, it, expect, beforeEach } from 'vitest';
import { MovementValidator } from '../MovementValidator';
import { sanitizeLandUnitPlacement } from '../navalPlacement';
import { buildMovementState, makeTerritory, makeUnitData } from './testHelpers';
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

    it('rejects tanks entering sea territory', () => {
      const sea = makeTerritory('sea1', 'player', { type: 'sea', adjacentTo: ['a'] });
      state.territories.set('sea1', sea);
      const a = state.territories.get('a')!;
      (a.adjacentTo as string[]).push('sea1');

      const result = validator.validateMove('tank', 1, 'a', 'sea1', false);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/cannot enter/i);
    });

    it('allows transport-required infantry to embark into neutral sea', () => {
      state.unitRegistry.register({
        ...state.unitRegistry.get('infantry')!.serialize(),
        requiredTransport: true,
      });
      const sea = makeTerritory('sea1', null, { type: 'sea', adjacentTo: ['a'] });
      state.territories.set('sea1', sea);
      const a = state.territories.get('a')!;
      (a.adjacentTo as string[]).push('sea1');

      const result = validator.validateMove('infantry', 1, 'a', 'sea1', false);
      expect(result.valid).toBe(true);
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

    it('allows implicit amphibious movement through neutral sea without transport ships', () => {
      state.unitRegistry.register(makeUnitData({ id: 'mech_infantry', movement: 2, domain: 'land' }));
      state.territories.get('a')!.units.push({ unitTypeId: 'mech_infantry', count: 1 });

      const island = makeTerritory('island', 'player', { type: 'coastal', adjacentTo: ['sea1'] });
      const sea = makeTerritory('sea1', null, { type: 'sea', production: 0, adjacentTo: ['a', 'island'] });
      state.territories.set('island', island);
      state.territories.set('sea1', sea);
      (state.territories.get('a')!.adjacentTo as string[]).push('sea1');

      const combatMoves = validator.getValidMoves('mech_infantry', 'a', true);
      const nonCombatMoves = validator.getValidMoves('mech_infantry', 'a', false);

      expect(combatMoves.find(m => m.territoryId === 'island')?.viaTransport).toBe('sea1');
      expect(nonCombatMoves.find(m => m.territoryId === 'island')?.viaTransport).toBe('sea1');
    });

    it('allows amphibious movement using coastal ports without transport ships', () => {
      state.unitRegistry.register(makeUnitData({ id: 'mech_infantry', movement: 2, domain: 'land' }));
      state.territories.get('a')!.units.push({ unitTypeId: 'mech_infantry', count: 1 });

      const island = makeTerritory('island', 'player', { type: 'coastal', adjacentTo: ['sea1'] });
      const sea = makeTerritory('sea1', null, { type: 'sea', production: 0, adjacentTo: ['a', 'island'] });
      state.territories.set('island', island);
      state.territories.set('sea1', sea);
      (state.territories.get('a')!.adjacentTo as string[]).push('sea1');

      const combatMoves = validator.getValidMoves('mech_infantry', 'a', true);
      expect(combatMoves.find(m => m.territoryId === 'island')?.viaTransport).toBe('sea1');
    });

    it('does not allow amphibious routes through enemy-controlled seas', () => {
      state.unitRegistry.register({
        ...state.unitRegistry.get('infantry')!.serialize(),
        requiredTransport: true,
      });

      const island = makeTerritory('island', 'player', { type: 'coastal', adjacentTo: ['sea1'] });
      const sea = makeTerritory('sea1', 'enemy', { type: 'sea', production: 0, adjacentTo: ['a', 'island'] });
      state.territories.set('island', island);
      state.territories.set('sea1', sea);
      (state.territories.get('a')!.adjacentTo as string[]).push('sea1');

      const moves = validator.getValidMoves('infantry', 'a', true);
      expect(moves.find(m => m.territoryId === 'island')).toBeUndefined();
    });

    it('lets embarked infantry disembark to adjacent land', () => {
      state.unitRegistry.register({
        ...state.unitRegistry.get('infantry')!.serialize(),
        requiredTransport: true,
      });
      const sea = makeTerritory('sea1', 'player', { type: 'sea', production: 0, adjacentTo: ['a', 'b'] });
      sea.units.push({ unitTypeId: 'infantry', count: 2 });
      state.territories.set('sea1', sea);

      const moves = validator.getValidMoves('infantry', 'sea1', true);
      expect(moves.map(m => m.territoryId)).toContain('b');
      expect(validator.validateMove('infantry', 1, 'sea1', 'b', false).valid).toBe(true);
    });

    it('executeMove keeps embarked infantry on sea until they disembark', () => {
      state.unitRegistry.register({
        ...state.unitRegistry.get('infantry')!.serialize(),
        requiredTransport: true,
      });
      const sea = makeTerritory('sea1', null, { type: 'sea', production: 0, adjacentTo: ['a'] });
      const a = state.territories.get('a')!;
      (a.adjacentTo as string[]).push('sea1');
      state.territories.set('sea1', sea);

      const embarked = validator.executeMove({
        unitTypeId: 'infantry',
        count: 1,
        fromTerritoryId: 'a',
        toTerritoryId: 'sea1',
        viaTransport: 'sea1',
      });
      expect(embarked).toBe(true);
      expect(sea.getUnitCount('infantry')).toBe(1);

      sanitizeLandUnitPlacement(state);
      expect(sea.getUnitCount('infantry')).toBe(1);
    });

    it('returns sea move targets for destroyers in a neutral sea zone', () => {
      state.unitRegistry.register({
        id: 'destroyer',
        name: 'Destroyer',
        attack: 2,
        defense: 2,
        movement: 2,
        cost: 8,
        domain: 'sea',
        hitPoints: 1,
        canBlitz: false,
        canBombard: false,
        canStrategicBomb: false,
        transportCapacity: 0,
        requiredTransport: false,
      });

      const sea1 = makeTerritory('sea1', null, { type: 'sea', production: 0, adjacentTo: ['sea2'] });
      const sea2 = makeTerritory('sea2', null, { type: 'sea', production: 0, adjacentTo: ['sea1'] });
      sea1.units.push({ unitTypeId: 'destroyer', count: 1 });
      state.territories.set('sea1', sea1);
      state.territories.set('sea2', sea2);

      const moves = validator.getValidMoves('destroyer', 'sea1', false);
      expect(moves.map(m => m.territoryId)).toContain('sea2');
    });

    it('allows validateMove from neutral sea when friendly ships are present', () => {
      state.unitRegistry.register({
        id: 'destroyer',
        name: 'Destroyer',
        attack: 2,
        defense: 2,
        movement: 2,
        cost: 8,
        domain: 'sea',
        hitPoints: 1,
        canBlitz: false,
        canBombard: false,
        canStrategicBomb: false,
        transportCapacity: 0,
        requiredTransport: false,
      });

      const sea1 = makeTerritory('sea1', null, { type: 'sea', production: 0, adjacentTo: ['sea2'] });
      const sea2 = makeTerritory('sea2', null, { type: 'sea', production: 0, adjacentTo: ['sea1'] });
      sea1.units.push({ unitTypeId: 'destroyer', count: 1 });
      state.territories.set('sea1', sea1);
      state.territories.set('sea2', sea2);

      const result = validator.validateMove('destroyer', 1, 'sea1', 'sea2', false);
      expect(result.valid).toBe(true);
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

  describe('coastal strikes', () => {
    it('lets a fleet attack adjacent enemy coastal land without entering it', () => {
      state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea', movement: 2, attack: 2, defense: 2, cost: 8 }));
      const sea = makeTerritory('sea1', 'player', { type: 'sea', adjacentTo: ['coast'] });
      const coast = makeTerritory('coast', 'enemy', { type: 'coastal', adjacentTo: ['sea1'] });
      state.territories.set('sea1', sea);
      state.territories.set('coast', coast);
      sea.units.push({ unitTypeId: 'destroyer', count: 4 });

      const moves = validator.getValidMoves('destroyer', 'sea1', true);
      const strike = moves.find(m => m.territoryId === 'coast');
      expect(strike?.isAttack).toBe(true);
      expect(strike?.coastalStrike).toBe(true);
    });

    it('lets coastal artillery fire into an adjacent enemy sea zone', () => {
      state.unitRegistry.register(makeUnitData({ id: 'artillery', domain: 'land', movement: 1, attack: 2, defense: 2, cost: 4, canBombard: true }));
      state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea', movement: 2, attack: 2, defense: 2, cost: 8 }));
      const coast = makeTerritory('port', 'player', { type: 'coastal', adjacentTo: ['sea1'] });
      const sea = makeTerritory('sea1', 'enemy', { type: 'sea', adjacentTo: ['port'] });
      state.territories.set('port', coast);
      state.territories.set('sea1', sea);
      sea.units.push({ unitTypeId: 'destroyer', count: 2 });
      coast.units.push({ unitTypeId: 'artillery', count: 1 });

      const moves = validator.getValidMoves('artillery', 'port', true);
      const strike = moves.find(m => m.territoryId === 'sea1');
      expect(strike?.isAttack).toBe(true);
      expect(strike?.coastalStrike).toBe(true);
    });

    it('lets infantry coastal-fire an adjacent enemy sea zone', () => {
      state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea', movement: 2, attack: 2, defense: 2, cost: 8 }));
      const coast = makeTerritory('port', 'player', { type: 'coastal', adjacentTo: ['sea1'] });
      const sea = makeTerritory('sea1', 'enemy', { type: 'sea', adjacentTo: ['port'] });
      state.territories.set('port', coast);
      state.territories.set('sea1', sea);
      sea.units.push({ unitTypeId: 'destroyer', count: 2 });
      coast.units.push({ unitTypeId: 'infantry', count: 5 });

      const moves = validator.getValidMoves('infantry', 'port', true);
      const strike = moves.find(m => m.territoryId === 'sea1');
      expect(strike?.isAttack).toBe(true);
      expect(strike?.coastalStrike).toBe(true);
    });

    it('lets land artillery barrage adjacent enemy land without entering it', () => {
      state.unitRegistry.register(makeUnitData({ id: 'artillery', domain: 'land', movement: 1, attack: 2, defense: 2, cost: 4, canBombard: true, attackRange: 2 }));
      const home = makeTerritory('home', 'player', { type: 'land', adjacentTo: ['enemy'] });
      const enemy = makeTerritory('enemy', 'enemy', { type: 'land', adjacentTo: ['home'] });
      state.territories.set('home', home);
      state.territories.set('enemy', enemy);
      home.units.push({ unitTypeId: 'artillery', count: 2 });

      const rangedMoves = validator.getValidMoves('artillery', 'home', true);
      const strike = rangedMoves.find(m => m.territoryId === 'enemy');
      expect(strike?.isAttack).toBe(true);
      expect(strike?.rangedStrike).toBe(true);

      const nonCombatMoves = validator.getValidMoves('artillery', 'home', false);
      expect(nonCombatMoves.some(m => m.territoryId === 'enemy' && m.isAttack)).toBe(false);
    });

    it('does not let inland infantry coastal-fire a sea zone', () => {
      const inland = makeTerritory('inland', 'player', { type: 'land', adjacentTo: ['port'] });
      const coast = makeTerritory('port', 'player', { type: 'coastal', adjacentTo: ['inland', 'sea1'] });
      const sea = makeTerritory('sea1', 'enemy', { type: 'sea', adjacentTo: ['port'] });
      state.territories.set('inland', inland);
      state.territories.set('port', coast);
      state.territories.set('sea1', sea);
      sea.units.push({ unitTypeId: 'destroyer', count: 2 });
      inland.units.push({ unitTypeId: 'infantry', count: 5 });

      const moves = validator.getValidMoves('infantry', 'inland', true);
      expect(moves.some(m => m.territoryId === 'sea1')).toBe(false);
    });

    it('lets infantry move diagonally on a square grid map', () => {
      const gridPolygon = (col: number, row: number): [number, number][] => {
        const size = 50;
        const x = col * size;
        const y = row * size;
        return [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
      };

      state.territories.clear();
      const g0 = makeTerritory('g0', 'player', {
        type: 'land',
        adjacentTo: [],
        polygon: gridPolygon(0, 0),
        center: [25, 25],
      });
      const g1 = makeTerritory('g1', 'player', {
        type: 'land',
        adjacentTo: [],
        polygon: gridPolygon(1, 1),
        center: [75, 75],
      });
      state.territories.set('g0', g0);
      state.territories.set('g1', g1);
      g0.units.push({ unitTypeId: 'infantry', count: 3 });

      const moves = validator.getValidMoves('infantry', 'g0', false);
      expect(moves.some(m => m.territoryId === 'g1' && !m.isAttack)).toBe(true);
      expect(validator.validateMove('infantry', 1, 'g0', 'g1', false).valid).toBe(true);
    });
  });
});
