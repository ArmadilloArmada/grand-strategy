import { describe, expect, it } from 'vitest';
import {
  applyTacticalCasualtyRelief,
  applyTacticalVictoryBonuses,
  buildTacticalOutcomeMeta,
  shouldAIUseTacticalAssault,
} from '../TacticalBattleEngine';
import type { CombatState } from '../CombatResolver';

function makeCombat(overrides: Partial<CombatState> = {}): CombatState {
  return {
    territoryId: 'test',
    attackingFactionId: 'atk',
    defendingFactionId: 'def',
    attackers: [{
      unitType: { id: 'infantry', name: 'Infantry', attack: 1, defense: 2, movement: 1, cost: 3, domain: 'land', canAttack: () => true, canDefend: () => true } as any,
      count: 4,
      hits: 0,
      casualties: 2,
    }],
    defenders: [],
    rounds: [],
    isComplete: true,
    winner: 'attacker',
    ...overrides,
  };
}

describe('TacticalBattleEngine', () => {
  it('flags AI tactical assaults on capitals and contested fights', () => {
    expect(shouldAIUseTacticalAssault({ isCapital: true }, 6, 8, 0.3)).toBe(true);
    expect(shouldAIUseTacticalAssault({}, 5, 5, 0.6)).toBe(true);
    expect(shouldAIUseTacticalAssault({}, 5, 5, 0.2)).toBe(false);
    expect(shouldAIUseTacticalAssault({}, 10, 2, 0.9)).toBe(false);
  });

  it('marks clean wins when most attackers survive', () => {
    const meta = buildTacticalOutcomeMeta(makeCombat({
      attackers: [{
        unitType: { id: 'infantry', name: 'Infantry', attack: 1, defense: 2, movement: 1, cost: 3, domain: 'land', canAttack: () => true, canDefend: () => true } as any,
        count: 5,
        hits: 0,
        casualties: 1,
      }],
    }), true);
    expect(meta.cleanWin).toBe(true);
    expect(meta.attackerSurvivalRate).toBe(0.8);
  });

  it('relieves casualties after clean tactical victories', () => {
    const combat = makeCombat({
      attackers: [{
        unitType: { id: 'infantry', name: 'Infantry', attack: 1, defense: 2, movement: 1, cost: 3, domain: 'land', canAttack: () => true, canDefend: () => true } as any,
        count: 5,
        hits: 0,
        casualties: 1,
      }],
    });
    const meta = buildTacticalOutcomeMeta(combat, true);
    const { savedUnits } = applyTacticalVictoryBonuses(combat, meta);
    expect(savedUnits).toBe(1);
    expect(combat.attackers[0].casualties).toBe(0);
  });

  it('applies casualty relief up to the requested cap', () => {
    const infantryType = { id: 'infantry', name: 'Infantry', attack: 1, defense: 2, movement: 1, cost: 3, domain: 'land', canAttack: () => true, canDefend: () => true } as any;
    const combat = makeCombat({
      attackers: [
        { unitType: infantryType, count: 2, hits: 0, casualties: 2 },
        { unitType: infantryType, count: 2, hits: 0, casualties: 1 },
      ],
    });
    expect(applyTacticalCasualtyRelief(combat, 2)).toBe(2);
    expect(combat.attackers[0].casualties).toBe(1);
    expect(combat.attackers[1].casualties).toBe(0);
  });
});
