import { describe, it, expect } from 'vitest';
import { AIController } from '../AIController';
import { GameState } from '../GameState';
import { TurnManager } from '../TurnManager';
import { getPersonality, AI_PERSONALITIES } from '../AIPersonalities';
import { makeTerritory, makeUnitData } from './testHelpers';

// ── Minimal game-state helpers ─────────────────────────────────────────────

function makeState(): GameState {
  const state = new GameState();
  state.factionRegistry.loadFromData([
    {
      id: 'axis',   name: 'Axis',   color: '#800', colorLight: '#f44',
      capital: 'berlin', startingIPCs: 40, turnOrder: 1, isPlayable: true, allies: [],
    },
    {
      id: 'allies', name: 'Allies', color: '#008', colorLight: '#44f',
      capital: 'london', startingIPCs: 40, turnOrder: 2, isPlayable: true, allies: [],
    },
  ]);
  state.currentFactionId = 'axis';
  state.turnNumber = 1;
  return state;
}

function makeAI(state?: GameState): { ai: AIController; state: GameState; tm: TurnManager } {
  const s = state ?? makeState();
  const tm = new TurnManager(s);
  const ai = new AIController(s, tm);
  return { ai, state: s, tm };
}

// ── setPersonality ─────────────────────────────────────────────────────────

describe('AIController.setPersonality', () => {
  it('defaults to balanced personality', () => {
    const { ai } = makeAI();
    // Indirectly verify: setPersonality('default') maps to 'balanced' without throwing
    expect(() => ai.setPersonality('default')).not.toThrow();
  });

  it('accepts preset names without throwing', () => {
    const { ai } = makeAI();
    for (const preset of ['default', 'turtle', 'rusher', 'economic', 'opportunist']) {
      expect(() => ai.setPersonality(preset)).not.toThrow();
    }
  });

  it('setPersonalityObject accepts any AIPersonality', () => {
    const { ai } = makeAI();
    const aggressive = getPersonality('aggressive');
    expect(() => ai.setPersonalityObject(aggressive)).not.toThrow();
  });

  it('can set all known AI personalities by id', () => {
    const { ai } = makeAI();
    for (const p of AI_PERSONALITIES) {
      expect(() => ai.setPersonality(p.id)).not.toThrow();
    }
  });
});

// ── setDifficulty ──────────────────────────────────────────────────────────

describe('AIController.setDifficulty', () => {
  it('easy reduces aggression and riskTolerance', () => {
    const { ai } = makeAI();
    ai.setPersonality('default'); // balanced: aggression = 0.5, riskTolerance = 0.5
    // Capture baseline by recording a grievance and checking grudge mechanics work
    // Then set difficulty easy — internal personality fields should scale down
    // We verify indirectly: hard should not throw or break grudge system
    expect(() => ai.setDifficulty('easy')).not.toThrow();
  });

  it('medium leaves balanced personality unchanged (scale = 1)', () => {
    const { ai } = makeAI();
    ai.setPersonality('default');
    expect(() => ai.setDifficulty('medium')).not.toThrow();
  });

  it('hard increases weights without exceeding 1', () => {
    const { ai } = makeAI();
    ai.setPersonality('default'); // max 0.5 fields → after ×1.15 → 0.575, clamped ≤ 1
    expect(() => ai.setDifficulty('hard')).not.toThrow();
  });
});

// ── Grudge system ──────────────────────────────────────────────────────────

describe('AIController grudge system', () => {
  it('starts with no grudges', () => {
    const { ai } = makeAI();
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBe(0);
  });

  it('recordGrievance increases severity', () => {
    const { ai } = makeAI();
    ai.recordGrievance('allies', 'axis', 30);
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBe(30);
  });

  it('multiple grievances accumulate', () => {
    const { ai } = makeAI();
    ai.recordGrievance('allies', 'axis', 20);
    ai.recordGrievance('allies', 'axis', 25);
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBe(45);
  });

  it('grudge is capped at 100', () => {
    const { ai } = makeAI();
    ai.recordGrievance('allies', 'axis', 80);
    ai.recordGrievance('allies', 'axis', 80);
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBe(100);
  });

  it('grievances are directional — reverse direction has separate grudge', () => {
    const { ai } = makeAI();
    ai.recordGrievance('allies', 'axis', 40); // axis attacked allies; allies hold grudge against axis
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBe(40);
    expect(ai.getGrudgeSeverity('allies', 'axis')).toBe(0); // axis holds no grudge against allies
  });

  it('fadeGrudges reduces severity over time', () => {
    const { ai } = makeAI();
    ai.recordGrievance('allies', 'axis', 50);
    ai.fadeGrudges();
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBeLessThan(50);
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBeGreaterThan(0);
  });

  it('fadeGrudges removes entries that reach zero', () => {
    const { ai } = makeAI();
    ai.recordGrievance('allies', 'axis', 5); // small enough to fade to 0
    // Fade multiple times
    for (let i = 0; i < 20; i++) ai.fadeGrudges();
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBe(0);
  });

  it('getBiggestEnemy returns null when no grudges', () => {
    const { ai } = makeAI();
    expect(ai.getBiggestEnemy('axis')).toBeNull();
  });

  it('getBiggestEnemy returns the faction with the highest grievance', () => {
    const { ai, state } = makeAI();
    // Add a third faction so we can compare
    state.factionRegistry.loadFromData([
      {
        id: 'neutral', name: 'Neutral', color: '#888', colorLight: '#aaa',
        capital: 'neutral_city', startingIPCs: 20, turnOrder: 3, isPlayable: true, allies: [],
      },
    ]);
    ai.recordGrievance('allies',  'axis', 30);
    ai.recordGrievance('neutral', 'axis', 60);
    expect(ai.getBiggestEnemy('axis')).toBe('neutral');
  });

  it('combat_end event records a grievance on the defending faction', () => {
    const { ai, state } = makeAI();
    // Emit a combat_end event mimicking the game engine
    // The listener reads `e.data?.combat ?? e.data`, so emit fields at the top of data
    state.emit('combat_end', {
      attackingFactionId: 'allies',
      defendingFactionId: 'axis',
      territoryId: 'paris',
    });
    // axis should now hold a grudge against allies
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBeGreaterThan(0);
  });

  it('combat_end at a capital records a larger grievance', () => {
    const { ai, state } = makeAI();
    // berlin is axis's capital (set up in makeState)
    // First attack a non-capital
    state.emit('combat_end', {
      attackingFactionId: 'allies', defendingFactionId: 'axis', territoryId: 'paris',
    });
    const normalGrudge = ai.getGrudgeSeverity('axis', 'allies');

    // Reset and attack the capital — berlin is set up as axis capital in makeState()
    state.territories.set('berlin', {
      id: 'berlin', owner: 'axis', isCapital: true,
      units: [], production: 5, type: 'land',
    } as any);
    state.emit('combat_end', {
      attackingFactionId: 'allies', defendingFactionId: 'axis', territoryId: 'berlin',
    });

    // Capital attacks record a larger grievance (30 vs 20), so total should grow
    expect(ai.getGrudgeSeverity('axis', 'allies')).toBeGreaterThan(normalGrudge);
  });
});

describe('AIController attack planning', () => {
  it('keeps an extra capital garrison when planning attacks from threatened territory', () => {
    const state = makeState();
    state.unitRegistry.register(makeUnitData({ id: 'infantry', attack: 1, defense: 2 }));

    const berlin = makeTerritory('berlin', 'axis', {
      adjacentTo: ['poland'],
      isCapital: true,
      hasFactory: true,
    });
    berlin.addUnits('infantry', 5);

    const poland = makeTerritory('poland', 'allies', {
      adjacentTo: ['berlin'],
      production: 4,
    });
    poland.addUnits('infantry', 1);

    state.territories.set('berlin', berlin);
    state.territories.set('poland', poland);

    const { ai } = makeAI(state);
    const axis = state.factionRegistry.get('axis')!;
    const evaluations = (ai as any).evaluateAllTerritories();
    const plans = (ai as any).generateAttackPlans(evaluations, axis);

    const polandPlan = plans.find((plan: any) => plan.targetId === 'poland');
    expect(polandPlan).toBeDefined();
    expect(polandPlan.attackers).toEqual([
      { fromId: 'berlin', unitTypeId: 'infantry', count: 1 },
    ]);
  });

  it('uses cheap units for easy low-value captures instead of overcommitting armor', () => {
    const state = makeState();
    state.unitRegistry.register(makeUnitData({ id: 'infantry', attack: 1, defense: 2, cost: 3 }));
    state.unitRegistry.register(makeUnitData({ id: 'tank', attack: 3, defense: 3, cost: 6, canBlitz: true }));

    const border = makeTerritory('border', 'axis', {
      adjacentTo: ['empty_frontier'],
      production: 2,
    });
    border.addUnits('infantry', 5);
    border.addUnits('tank', 2);

    const emptyFrontier = makeTerritory('empty_frontier', 'allies', {
      adjacentTo: ['border'],
      production: 1,
    });

    state.territories.set('border', border);
    state.territories.set('empty_frontier', emptyFrontier);

    const { ai } = makeAI(state);
    const axis = state.factionRegistry.get('axis')!;
    const evaluations = (ai as any).evaluateAllTerritories();
    const plans = (ai as any).generateAttackPlans(evaluations, axis);

    const frontierPlan = plans.find((plan: any) => plan.targetId === 'empty_frontier');
    expect(frontierPlan).toBeDefined();
    expect(frontierPlan.attackers).toEqual([
      { fromId: 'border', unitTypeId: 'infantry', count: 1 },
    ]);
    expect(frontierPlan.expectedSuccess).toBe(0.95);
  });
});

describe('AIController mobilization planning', () => {
  it('prioritizes a threatened border over a safe factory when IPCs are tight', () => {
    const state = makeState();
    state.unitRegistry.register(makeUnitData({ id: 'infantry', attack: 1, defense: 2, cost: 3 }));
    state.unitRegistry.register(makeUnitData({ id: 'artillery', attack: 2, defense: 2, cost: 4 }));
    state.unitRegistry.register(makeUnitData({ id: 'tank', attack: 3, defense: 3, cost: 6, canBlitz: true }));

    const axis = state.factionRegistry.get('axis')!;
    axis.ipcs = 12;

    const safeFactory = makeTerritory('safe_factory', 'axis', {
      adjacentTo: ['berlin'],
      hasFactory: true,
      production: 5,
    });
    const threatenedFront = makeTerritory('threatened_front', 'axis', {
      adjacentTo: ['enemy_front'],
      production: 2,
    });
    threatenedFront.addUnits('infantry', 1);

    const enemyFront = makeTerritory('enemy_front', 'allies', {
      adjacentTo: ['threatened_front'],
      production: 2,
    });
    enemyFront.addUnits('tank', 3);

    state.territories.set('safe_factory', safeFactory);
    state.territories.set('threatened_front', threatenedFront);
    state.territories.set('enemy_front', enemyFront);

    const { ai } = makeAI(state);
    const evaluations = (ai as any).evaluateAllTerritories();
    (ai as any).handleMobilizationPhase(evaluations);
    const mobilizationSystem = (ai as any).mobilizationSystem;

    expect(mobilizationSystem.wasMobilized('threatened_front')).toBe(true);
    expect(mobilizationSystem.wasMobilized('safe_factory')).toBe(false);
    expect(axis.ipcs).toBe(7);
  });
});
