import { describe, expect, it } from 'vitest';
import {
  buildTacticalTerrainGrid,
  buildNavalTacticalTerrainGrid,
  canTacticalLandAttackNaval,
  computeTacticalDamage,
  hasNavalBombardLineOfSight,
  hasTacticalLineOfSight,
  isTacticalCoastalFiringPosition,
  resolveTacticalBattleMode,
  terrainTileCode,
} from '../TacticalBattleUI';
import type { CombatState } from '../../engine/CombatResolver';
import { UnitType } from '../../data/Unit';
import { getLandAntiNavalAttack } from '../../engine/NavalSystem';

describe('TacticalBattleUI helpers', () => {
  it('uses unique terrain tile codes', () => {
    expect(terrainTileCode('Field')).toBe('F');
    expect(terrainTileCode('Road')).toBe('D');
    expect(terrainTileCode('Woods')).toBe('L');
    expect(terrainTileCode('Ridge')).toBe('G');
    expect(terrainTileCode('Town')).toBe('T');
    expect(terrainTileCode('Open Water')).toBe('W');
    expect(terrainTileCode('Shore')).toBe('S');
  });

  it('builds terrain grid matching map dimensions', () => {
    const grid = buildTacticalTerrainGrid(8, 6);
    expect(grid).toHaveLength(6);
    expect(grid[0]).toHaveLength(8);
    expect(grid[3][4].name).toBe('Town');
  });

  it('builds naval grid dominated by water with shore on defender flank', () => {
    const grid = buildNavalTacticalTerrainGrid(8, 6, 'naval');
    const waterCount = grid.flat().filter(tile => tile.kind === 'water').length;
    const shoreCount = grid.flat().filter(tile => tile.kind === 'shore').length;
    expect(waterCount).toBeGreaterThan(shoreCount);
    expect(grid[3][7].kind).toBe('shore');
    expect(grid[3][4].isObjective).toBe(true);
  });

  it('resolves naval mode for sea territory battles', () => {
    const battleship = new UnitType({
      id: 'battleship',
      name: 'Battleship',
      attack: 4,
      defense: 4,
      movement: 2,
      cost: 24,
      domain: 'sea',
      hitPoints: 2,
      canBlitz: false,
      canBombard: true,
      canStrategicBomb: false,
      transportCapacity: 0,
      requiredTransport: false,
    });
    const combat = {
      attackers: [{ unitType: battleship, count: 1, hits: 0, casualties: 0 }],
      defenders: [{ unitType: battleship, count: 1, hits: 0, casualties: 0 }],
    } as CombatState;
    expect(resolveTacticalBattleMode('sea', combat)).toBe('naval');
    expect(resolveTacticalBattleMode('coastal', combat)).toBe('naval');
  });

  it('allows naval bombardment line of sight over water', () => {
    const grid = buildNavalTacticalTerrainGrid(8, 6, 'naval');
    expect(hasNavalBombardLineOfSight(8, 6, grid, 1, 3, 7, 3)).toBe(true);
  });

  it('applies cover and flank bonus to damage', () => {
    const attacker = { attack: 4, count: 3, hp: 9 };
    const target = { hp: 9, count: 3 };
    expect(computeTacticalDamage(attacker, target, 0, 0)).toBeGreaterThan(0);
    expect(computeTacticalDamage(attacker, target, 2, 0)).toBeLessThan(
      computeTacticalDamage(attacker, target, 0, 0),
    );
    expect(computeTacticalDamage(attacker, target, 0, 1)).toBeGreaterThan(
      computeTacticalDamage(attacker, target, 0, 0),
    );
    expect(computeTacticalDamage(attacker, target, 0, 0, 1)).toBeGreaterThan(
      computeTacticalDamage(attacker, target, 0, 0, 0),
    );
  });

  it('blocks ranged line of sight through ridge tiles', () => {
    const grid = buildTacticalTerrainGrid(8, 6);
    const y = 2;
    const ridgeX = grid[y].findIndex(tile => tile.cover >= 2);
    expect(ridgeX).toBeGreaterThan(1);
    expect(hasTacticalLineOfSight(8, 6, grid, [], 0, y, ridgeX - 1, y)).toBe(true);
    expect(hasTacticalLineOfSight(8, 6, grid, [], 0, y, ridgeX + 1, y)).toBe(false);
  });

  it('allows infantry on shore to fire on adjacent ships with reduced attack', () => {
    const grid = buildNavalTacticalTerrainGrid(8, 6, 'amphibious');
    const infantry = new UnitType({
      id: 'infantry',
      name: 'Infantry',
      attack: 2,
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
    });
    let shorePos: { x: number; y: number } | null = null;
    let waterPos: { x: number; y: number } | null = null;
    outer: for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x].kind !== 'shore') continue;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= grid[y].length || ny >= grid.length) continue;
          if (grid[ny][nx].kind === 'water') {
            shorePos = { x, y };
            waterPos = { x: nx, y: ny };
            break outer;
          }
        }
      }
    }
    expect(shorePos).not.toBeNull();
    expect(waterPos).not.toBeNull();
    expect(isTacticalCoastalFiringPosition(8, 6, grid, shorePos!.x, shorePos!.y)).toBe(true);
    expect(canTacticalLandAttackNaval(
      infantry,
      { x: shorePos!.x, y: shorePos!.y, range: 1 },
      { x: waterPos!.x, y: waterPos!.y, domain: 'sea', hp: 6 },
      grid,
      8,
      6,
      () => true,
    )).toBe(true);
    expect(canTacticalLandAttackNaval(
      infantry,
      { x: 0, y: 0, range: 1 },
      { x: waterPos!.x, y: waterPos!.y, domain: 'sea', hp: 6 },
      grid,
      8,
      6,
      () => true,
    )).toBe(false);
    const penalized = getLandAntiNavalAttack(infantry, infantry.attack);
    expect(penalized).toBe(1);
    expect(computeTacticalDamage({ attack: penalized, count: 3, hp: 9 }, { hp: 9, count: 3 }, 0, 0))
      .toBeLessThan(computeTacticalDamage({ attack: infantry.attack, count: 3, hp: 9 }, { hp: 9, count: 3 }, 0, 0));
  });
});
