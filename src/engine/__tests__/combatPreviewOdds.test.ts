import { describe, expect, it } from 'vitest';
import {
  computeArtilleryBoost,
  computeCombinedArmsBonus,
  estimateVictoryChance,
} from '../combatPreviewOdds';
import { makeUnitData } from './testHelpers';
import { UnitType } from '../../data/Unit';

function unit(id: string, attack: number, defense = 1): UnitType {
  return new UnitType(makeUnitData({ id, attack, defense }));
}

describe('combatPreviewOdds', () => {
  it('counts artillery boost from paired infantry and artillery', () => {
    const attackers = [
      { unitTypeId: 'artillery', unitType: unit('artillery', 2), count: 2 },
      { unitTypeId: 'infantry', unitType: unit('infantry', 1), count: 5 },
    ];
    expect(computeArtilleryBoost(attackers)).toBe(2);
  });

  it('counts combined arms bonus per tank with infantry present', () => {
    const attackers = [
      { unitTypeId: 'tank', unitType: unit('tank', 3), count: 3 },
      { unitTypeId: 'infantry', unitType: unit('infantry', 1), count: 2 },
    ];
    expect(computeCombinedArmsBonus(attackers)).toBe(3);
  });

  it('rewards overwhelming firepower', () => {
    expect(estimateVictoryChance(18, 2, 6, 1, 0, 0)).toBeGreaterThanOrEqual(0.88);
  });

  it('penalizes underpowered assaults', () => {
    expect(estimateVictoryChance(1, 12, 1, 4, 0, 0)).toBeLessThanOrEqual(0.2);
  });

  it('boosts odds when shore bombardment clears defenders', () => {
    const without = estimateVictoryChance(6, 6, 3, 3, 0, 0);
    const withBombard = estimateVictoryChance(6, 6, 3, 3, 2.5, 0);
    expect(withBombard).toBeGreaterThan(without);
  });
});
