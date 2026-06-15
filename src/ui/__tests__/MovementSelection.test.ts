import { describe, it, expect } from 'vitest';
import {
  resolveTerritorySelectionMove,
  resolveHighlightedMoveUnitType,
  isRangedStrikeUnit,
  getRangedUnitActionHint,
} from '../hud/MovementSelection';
import type { ValidMove } from '../../engine/MovementValidator';

describe('MovementSelection', () => {
  describe('resolveTerritorySelectionMove', () => {
    const fighterMoves: ValidMove[] = [
      { territoryId: 'far', path: ['home', 'mid', 'far'], movementCost: 3, isAttack: false },
    ];

    it('does not move on click — only selects or attacks', () => {
      expect(resolveTerritorySelectionMove({
        phaseIsMovement: true,
        territoryId: 'far',
        previousTerritoryId: 'home',
        validMoves: fighterMoves,
      })).toEqual({ kind: 'none' });
    });

    it('previews an attack before changing the active stack', () => {
      expect(resolveTerritorySelectionMove({
        phaseIsMovement: true,
        territoryId: 'enemy',
        previousTerritoryId: 'home',
        validMoves: [{ territoryId: 'enemy', path: ['home', 'enemy'], movementCost: 1, isAttack: true }],
      })).toEqual({ kind: 'previewAttack', fromId: 'home', toId: 'enemy' });
    });

    it('previews coastal shore bombardment on click', () => {
      expect(resolveTerritorySelectionMove({
        phaseIsMovement: true,
        territoryId: 'shore',
        previousTerritoryId: 'sea_zone',
        validMoves: [{
          territoryId: 'shore',
          path: ['sea_zone', 'shore'],
          movementCost: 1,
          isAttack: true,
          coastalStrike: true,
          rangedStrike: true,
        }],
      })).toEqual({ kind: 'previewAttack', fromId: 'sea_zone', toId: 'shore' });
    });
  });

  describe('isRangedStrikeUnit', () => {
    const asUnit = (data: Partial<import('../../data/Unit').UnitType> & Pick<import('../../data/Unit').UnitType, 'domain' | 'attackRange' | 'canBombard'>) =>
      data as import('../../data/Unit').UnitType;

    it('treats land artillery as ranged', () => {
      expect(isRangedStrikeUnit(asUnit({
        id: 'artillery',
        attackRange: 2,
        domain: 'land',
        canBombard: true,
      }))).toBe(true);
    });

    it('treats battleships and cruisers as ranged', () => {
      expect(isRangedStrikeUnit(asUnit({
        id: 'battleship',
        attackRange: 1,
        domain: 'sea',
        canBombard: true,
      }))).toBe(true);
      expect(isRangedStrikeUnit(asUnit({
        id: 'cruiser',
        attackRange: 1,
        domain: 'sea',
        canBombard: true,
      }))).toBe(true);
    });

    it('treats anti-air as ranged for coastal fleet fire', () => {
      expect(isRangedStrikeUnit(asUnit({
        id: 'anti_air',
        attackRange: 1,
        domain: 'land',
        canBombard: false,
      }))).toBe(true);
    });

    it('does not treat melee infantry or tanks as ranged', () => {
      expect(isRangedStrikeUnit(asUnit({
        id: 'infantry',
        attackRange: 1,
        domain: 'land',
        canBombard: false,
      }))).toBe(false);
      expect(isRangedStrikeUnit(asUnit({
        id: 'tank',
        attackRange: 1,
        domain: 'land',
        canBombard: false,
      }))).toBe(false);
    });
  });

  describe('getRangedUnitActionHint', () => {
    it('describes shore bombardment for naval units', () => {
      expect(getRangedUnitActionHint({
        id: 'battleship',
        domain: 'sea',
        canBombard: true,
        attackRange: 1,
      } as import('../../data/Unit').UnitType)).toContain('click');
      expect(getRangedUnitActionHint({
        id: 'battleship',
        domain: 'sea',
        canBombard: true,
        attackRange: 1,
      } as import('../../data/Unit').UnitType)).not.toContain('drag');
    });
  });

  describe('resolveHighlightedMoveUnitType', () => {
    it('uses the stack that owns the current highlights even if selection was reset on click', () => {
      expect(resolveHighlightedMoveUnitType({
        validMovesUnitTypeId: 'fighter',
        selectedUnitType: 'infantry',
      })).toBe('fighter');
    });

    it('falls back to the selected stack when highlights were not computed yet', () => {
      expect(resolveHighlightedMoveUnitType({
        validMovesUnitTypeId: null,
        selectedUnitType: 'tank',
      })).toBe('tank');
    });
  });
});
