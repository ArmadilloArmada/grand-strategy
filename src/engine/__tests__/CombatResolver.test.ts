import { describe, it, expect, vi } from 'vitest';
import { CombatResolver, CombatUnit, CombatState } from '../CombatResolver';
import { buildCombatState } from './testHelpers';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCombatUnit(unitTypeId: string, count: number, cost: number, attack: number, defense: number): CombatUnit {
  return {
    unitType: {
      id: unitTypeId,
      name: unitTypeId,
      attack,
      defense,
      cost,
      movement: 1,
      domain: 'land',
      hitPoints: 1,
      canBlitz: false,
      canBombard: false,
      canStrategicBomb: false,
      transportCapacity: 0,
      requiredTransport: false,
      canAttack: () => attack > 0,
      canDefend: () => defense > 0,
      canEnter: () => true,
      serialize: () => ({} as any),
    } as any,
    count,
    hits: 0,
    casualties: 0,
    veteranCount: 0,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CombatResolver', () => {
  describe('initiateCombat', () => {
    it('returns null for unknown territory', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);
      const result = resolver.initiateCombat('nonexistent', attackerFactionId, []);
      expect(result).toBeNull();
    });

    it('returns null when attacker equals defender (same faction)', () => {
      const { state, attackerFactionId } = buildCombatState();
      // Put attacker in a territory they own, then try attacking own territory
      const resolver = new CombatResolver(state);
      const source = state.territories.get('source')!;
      source.units.push({ unitTypeId: 'infantry', count: 2 });
      const result = resolver.initiateCombat('source', attackerFactionId, [{ unitTypeId: 'infantry', count: 2 }]);
      expect(result).toBeNull(); // source is owned by attacker
    });

    it('returns null when attacking units are empty', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);
      const result = resolver.initiateCombat('target', attackerFactionId, []);
      expect(result).toBeNull();
    });

    it('successfully initiates combat with valid attacker units', () => {
      const { state, attackerFactionId, defenderFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);

      // Add defending units to target
      const target = state.territories.get('target')!;
      target.units.push({ unitTypeId: 'infantry', count: 3 });

      const combat = resolver.initiateCombat('target', attackerFactionId, [
        { unitTypeId: 'infantry', count: 2 },
      ]);

      expect(combat).not.toBeNull();
      expect(combat!.attackingFactionId).toBe(attackerFactionId);
      expect(combat!.defendingFactionId).toBe(defenderFactionId);
      expect(combat!.attackers).toHaveLength(1);
      expect(combat!.defenders).toHaveLength(1);
      expect(combat!.isComplete).toBe(false);
      expect(combat!.winner).toBeNull();
    });
  });

  describe('resolveCombatRound', () => {
    it('attackers win when defenders all eliminated', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);

      // Attacker has a huge army, defender has 1 infantry
      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: attackerFactionId,
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 100, 3, 6, 2)], // always hits (attack=6 on d6)
        defenders: [makeCombatUnit('infantry', 1, 3, 1, 1)], // defense=1
        rounds: [],
        isComplete: false,
        winner: null,
      };

      // Force dice to always roll 1 (guaranteed hit for any target value >= 1)
      vi.spyOn(Math, 'random').mockReturnValue(0); // random() = 0 → roll = 1

      resolver.resolveCombatRound(combat);

      expect(combat.isComplete).toBe(true);
      expect(combat.winner).toBe('attacker');
    });

    it('defenders win when attackers all eliminated', () => {
      const { state } = buildCombatState();
      const resolver = new CombatResolver(state);

      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: 'attacker',
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 1, 3, 1, 2)],
        defenders: [makeCombatUnit('tank', 100, 6, 3, 6)], // defense=6, always hits
        rounds: [],
        isComplete: false,
        winner: null,
      };

      vi.spyOn(Math, 'random').mockReturnValue(0); // roll = 1, hits anything with targetValue >= 1

      resolver.resolveCombatRound(combat);

      expect(combat.isComplete).toBe(true);
      expect(combat.winner).toBe('defender');
    });

    it('draw when both sides eliminated in same round', () => {
      const { state } = buildCombatState();
      const resolver = new CombatResolver(state);

      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: 'attacker',
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 1, 3, 6, 2)], // always hits
        defenders: [makeCombatUnit('infantry', 1, 3, 6, 6)], // defense=6 always hits
        rounds: [],
        isComplete: false,
        winner: null,
      };

      vi.spyOn(Math, 'random').mockReturnValue(0); // roll = 1, hits for any target >= 1

      resolver.resolveCombatRound(combat);

      expect(combat.isComplete).toBe(true);
      expect(combat.winner).toBe('draw');
    });

    it('defender holds when max combat rounds reached', () => {
      const { state } = buildCombatState();
      state.rules = Object.assign(Object.create(Object.getPrototypeOf(state.rules)), state.rules, { maxCombatRounds: 1 });
      const resolver = new CombatResolver(state);

      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: 'attacker',
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 3, 3, 1, 2)],
        defenders: [makeCombatUnit('infantry', 3, 3, 1, 2)],
        rounds: [],
        isComplete: false,
        winner: null,
      };

      // Roll 6 — nobody hits (attack/defense = 1, roll 6 is a miss)
      vi.spyOn(Math, 'random').mockReturnValue(5 / 6 - 0.001);

      resolver.resolveCombatRound(combat);

      expect(combat.isComplete).toBe(true);
      expect(combat.winner).toBe('defender');
    });

    it('casualties applied cheapest-unit-first', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);

      // Attacker has infantry (cost 3) and tank (cost 6) — infantry should die first
      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: attackerFactionId,
        defendingFactionId: 'defender',
        attackers: [
          makeCombatUnit('infantry', 2, 3, 1, 2), // cheaper
          makeCombatUnit('tank', 1, 6, 3, 3),      // more expensive
        ],
        defenders: [makeCombatUnit('tank', 5, 6, 3, 6)], // always hits
        rounds: [],
        isComplete: false,
        winner: null,
      };

      vi.spyOn(Math, 'random').mockReturnValue(0); // roll = 1, everyone hits

      const result = resolver.resolveCombatRound(combat);

      // Infantry (cheaper) takes casualties first
      const infantryCasualty = result.attackerCasualties.find(c => c.unitTypeId === 'infantry');
      expect(infantryCasualty).toBeDefined();
    });

    it('critical hit on a roll of 1 deals double damage', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);

      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: attackerFactionId,
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('tank', 1, 6, 4, 3)], // attack=4, can crit
        defenders: [makeCombatUnit('infantry', 5, 3, 1, 2)],
        rounds: [],
        isComplete: false,
        winner: null,
      };

      vi.spyOn(Math, 'random').mockReturnValue(0); // roll = 1 → critical hit

      const result = resolver.resolveCombatRound(combat);

      expect(result.attackerCriticals).toBeGreaterThan(0);
      // A crit deals 2 hits instead of 1
      expect(result.attackerHits).toBe(2);
    });
  });

  describe('resolveStrategicBombing', () => {
    it('returns zero damage when territory has no factory', () => {
      const { state, attackerFactionId } = buildCombatState();
      const noFactoryTerritory = state.territories.get('source')!;
      // Override hasFactory on the source territory temporarily
      (noFactoryTerritory as any).hasFactory = false;
      const resolver = new CombatResolver(state);

      const result = resolver.resolveStrategicBombing('source', attackerFactionId, 3, 0);

      expect(result.totalDamage).toBe(0);
      expect(result.bomberLosses).toBe(0);
    });

    it('applies factory damage when bombers survive', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);

      // No AA guns → no interception; all bombers survive and deal damage
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll = 4 on d6

      const result = resolver.resolveStrategicBombing('target', attackerFactionId, 3, 0);

      expect(result.bomberLosses).toBe(0);
      expect(result.totalDamage).toBeGreaterThan(0);
      expect(result.damageRolls).toHaveLength(3);
    });

    it('AA guns intercept bombers on a roll of 1', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);

      // Force roll = 1 → every AA gun kills a bomber
      vi.spyOn(Math, 'random').mockReturnValue(0); // roll = 1

      const result = resolver.resolveStrategicBombing('target', attackerFactionId, 2, 2);

      expect(result.bomberLosses).toBe(2);
      expect(result.intercepted).toBe(true);
      expect(result.damageRolls).toHaveLength(0); // no surviving bombers
    });
  });

  describe('canRetreat', () => {
    it('returns false before any rounds are fought', () => {
      const { state } = buildCombatState();
      const resolver = new CombatResolver(state);
      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: 'attacker',
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 1, 3, 1, 2)],
        defenders: [makeCombatUnit('infantry', 1, 3, 1, 2)],
        rounds: [],
        isComplete: false,
        winner: null,
      };
      expect(resolver.canRetreat(combat)).toBe(false);
    });

    it('returns true after at least one round', () => {
      const { state } = buildCombatState();
      const resolver = new CombatResolver(state);
      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: 'attacker',
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 2, 3, 1, 2)],
        defenders: [makeCombatUnit('infantry', 2, 3, 1, 2)],
        rounds: [{ round: 1, attackerRolls: [], defenderRolls: [], attackerHits: 0, defenderHits: 0, attackerCriticals: 0, defenderCriticals: 0, attackerCasualties: [], defenderCasualties: [] }],
        isComplete: false,
        winner: null,
      };
      expect(resolver.canRetreat(combat)).toBe(true);
    });

    it('returns false when combat is already complete', () => {
      const { state } = buildCombatState();
      const resolver = new CombatResolver(state);
      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: 'attacker',
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 1, 3, 1, 2)],
        defenders: [],
        rounds: [{ round: 1, attackerRolls: [], defenderRolls: [], attackerHits: 0, defenderHits: 0, attackerCriticals: 0, defenderCriticals: 0, attackerCasualties: [], defenderCasualties: [] }],
        isComplete: true,
        winner: 'attacker',
      };
      expect(resolver.canRetreat(combat)).toBe(false);
    });
  });

  describe('finalizeCombat', () => {
    it('transfers territory ownership to attacker on attacker win', () => {
      const { state, attackerFactionId } = buildCombatState();
      const resolver = new CombatResolver(state);

      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: attackerFactionId,
        defendingFactionId: 'defender',
        attackers: [makeCombatUnit('infantry', 3, 3, 1, 2)],
        defenders: [],
        rounds: [],
        isComplete: true,
        winner: 'attacker',
      };
      // Surviving attacker units
      combat.attackers[0].casualties = 0;

      resolver.finalizeCombat(combat);

      expect(state.territories.get('target')!.owner).toBe(attackerFactionId);
    });

    it('keeps territory owner when defender wins', () => {
      const { state } = buildCombatState();
      const resolver = new CombatResolver(state);

      const combat: CombatState = {
        territoryId: 'target',
        attackingFactionId: 'attacker',
        defendingFactionId: 'defender',
        attackers: [],
        defenders: [makeCombatUnit('infantry', 2, 3, 1, 2)],
        rounds: [],
        isComplete: true,
        winner: 'defender',
      };
      combat.defenders[0].casualties = 0;

      resolver.finalizeCombat(combat);

      expect(state.territories.get('target')!.owner).toBe('defender');
    });
  });
});
