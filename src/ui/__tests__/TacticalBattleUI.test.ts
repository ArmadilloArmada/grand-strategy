import { describe, expect, it } from 'vitest';
import { buildTacticalTerrainGrid, computeTacticalDamage, hasTacticalLineOfSight, terrainTileCode } from '../TacticalBattleUI';

describe('TacticalBattleUI helpers', () => {
  it('uses unique terrain tile codes', () => {
    expect(terrainTileCode('Field')).toBe('F');
    expect(terrainTileCode('Road')).toBe('D');
    expect(terrainTileCode('Woods')).toBe('W');
    expect(terrainTileCode('Ridge')).toBe('G');
    expect(terrainTileCode('Town')).toBe('T');
  });

  it('builds terrain grid matching map dimensions', () => {
    const grid = buildTacticalTerrainGrid(8, 6);
    expect(grid).toHaveLength(6);
    expect(grid[0]).toHaveLength(8);
    expect(grid[3][4].name).toBe('Town');
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
});
