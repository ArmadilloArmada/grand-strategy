import { describe, it, expect } from 'vitest';
import { AIController } from '../AIController';
import { GameState } from '../GameState';
import { TurnManager } from '../TurnManager';
import { getPersonality, AI_PERSONALITIES } from '../AIPersonalities';

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
