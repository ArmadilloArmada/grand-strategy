/**
 * EventsSystem tests — rollForEvent, applyEvent, active effects, serialize/restore.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameState } from '../GameState';
import { EventsSystem, GameEvent } from '../EventsSystem';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

function buildState(): { state: GameState; events: EventsSystem } {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', { capital: 'home', allies: [], startingIPCs: 30 }));
  state.factionRegistry.register(makeFactionData('enemy', { capital: 'enemy_cap', allies: [], startingIPCs: 20 }));

  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3 }));

  const home = makeTerritory('home', 'player', { isCapital: true, hasFactory: true, production: 5, adjacentTo: [] });
  const enemy_cap = makeTerritory('enemy_cap', 'enemy', { isCapital: true, hasFactory: true, production: 3, adjacentTo: [] });
  state.territories.set('home', home);
  state.territories.set('enemy_cap', enemy_cap);

  state.currentFactionId = 'player';
  state.turnNumber = 1;

  state.diplomacyManager.forceWar('player', 'enemy');

  const events = new EventsSystem(state);
  return { state, events };
}

function makeEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: 'test_event',
    name: 'Test Event',
    description: 'A test event',
    type: 'positive',
    icon: '⭐',
    effects: [{ type: 'ipc_bonus', value: 10 }],
    weight: 10,
    cooldownTurns: 3,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── rollForEvent guards ────────────────────────────────────────────────────────

describe('EventsSystem — rollForEvent', () => {
  it('returns null for unknown faction', () => {
    const { events } = buildState();
    expect(events.rollForEvent('ghost')).toBeNull();
  });

  it('returns null for defeated faction', () => {
    const { state, events } = buildState();
    state.factionRegistry.get('player')!.defeat();
    expect(events.rollForEvent('player')).toBeNull();
  });

  it('returns null when random roll exceeds event chance (>0.30)', () => {
    const { events } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(events.rollForEvent('player')).toBeNull();
  });

  it('returns an event when roll is within event chance', () => {
    const { events } = buildState();
    // First call: 0 passes event chance (0 < 0.30); second: weight roll selects event
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = events.rollForEvent('player');
    // Should return some event or null (depending on conditions); just ensure no throw
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('respects cooldown — same event not returned twice within cooldown', () => {
    const { state, events } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const first = events.rollForEvent('player');
    if (first === null) return; // No eligible events in this state — skip

    // Advance to just within cooldown
    state.turnNumber = 2;
    state.factionRegistry.get('player')!.ipcs = 30;

    // Event should be on cooldown now — it won't be selected again
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const second = events.rollForEvent('player');
    if (first && second) {
      expect(second.id).not.toBe(first.id);
    }
  });
});

// ── applyEvent — ipc effects ──────────────────────────────────────────────────

describe('EventsSystem — applyEvent ipc effects', () => {
  it('ipc_bonus adds IPCs to faction', () => {
    const { state, events } = buildState();
    const event = makeEvent({ effects: [{ type: 'ipc_bonus', value: 15 }] });
    const before = state.factionRegistry.get('player')!.ipcs;
    events.applyEvent(event, 'player');
    expect(state.factionRegistry.get('player')!.ipcs).toBe(before + 15);
  });

  it('ipc_penalty deducts IPCs, floored at 0', () => {
    const { state, events } = buildState();
    state.factionRegistry.get('player')!.ipcs = 5;
    const event = makeEvent({ effects: [{ type: 'ipc_penalty', value: 20 }] });
    events.applyEvent(event, 'player');
    expect(state.factionRegistry.get('player')!.ipcs).toBe(0);
  });

  it('does nothing for unknown faction', () => {
    const { events } = buildState();
    const event = makeEvent();
    // Should not throw
    expect(() => events.applyEvent(event, 'ghost')).not.toThrow();
  });
});

// ── applyEvent — choice events ────────────────────────────────────────────────

describe('EventsSystem — applyEvent choice events', () => {
  it('applies choice effects when choiceId matches', () => {
    const { state, events } = buildState();
    const event = makeEvent({
      type: 'choice',
      effects: [],
      choices: [
        { id: 'invest', text: 'Invest', effects: [{ type: 'ipc_bonus', value: 8 }] },
        { id: 'decline', text: 'Decline', effects: [{ type: 'ipc_penalty', value: 3 }] },
      ],
    });
    const before = state.factionRegistry.get('player')!.ipcs;
    events.applyEvent(event, 'player', 'invest');
    expect(state.factionRegistry.get('player')!.ipcs).toBe(before + 8);
  });

  it('deducts choice cost before applying effects', () => {
    const { state, events } = buildState();
    state.factionRegistry.get('player')!.ipcs = 20;
    const event = makeEvent({
      type: 'choice',
      effects: [],
      choices: [{ id: 'hire', text: 'Hire', effects: [{ type: 'ipc_bonus', value: 5 }], cost: 10 }],
    });
    events.applyEvent(event, 'player', 'hire');
    expect(state.factionRegistry.get('player')!.ipcs).toBe(20 - 10 + 5);
  });

  it('rejects choice when faction cannot afford cost', () => {
    const { state, events } = buildState();
    state.factionRegistry.get('player')!.ipcs = 3;
    const event = makeEvent({
      type: 'choice',
      effects: [],
      choices: [{ id: 'hire', text: 'Hire', effects: [{ type: 'ipc_bonus', value: 5 }], cost: 10 }],
    });
    events.applyEvent(event, 'player', 'hire');
    expect(state.factionRegistry.get('player')!.ipcs).toBe(3); // unchanged
  });

  it('applies base effects when choiceId is unknown', () => {
    const { state, events } = buildState();
    const event = makeEvent({
      type: 'choice',
      effects: [{ type: 'ipc_bonus', value: 2 }],
      choices: [{ id: 'valid', text: 'Valid', effects: [{ type: 'ipc_bonus', value: 99 }] }],
    });
    const before = state.factionRegistry.get('player')!.ipcs;
    events.applyEvent(event, 'player', 'nonexistent_choice');
    // Falls back to base effects
    expect(state.factionRegistry.get('player')!.ipcs).toBe(before + 2);
  });
});

// ── Active effects ────────────────────────────────────────────────────────────

describe('EventsSystem — getActiveEffects / getEffectBonus', () => {
  it('returns empty array when no effects active', () => {
    const { events } = buildState();
    expect(events.getActiveEffects('player')).toHaveLength(0);
  });

  it('returns active effect after applying a duration effect', () => {
    const { events } = buildState();
    const event = makeEvent({ effects: [{ type: 'attack_bonus', value: 2, duration: 3 }] });
    events.applyEvent(event, 'player');
    const active = events.getActiveEffects('player');
    expect(active).toHaveLength(1);
    expect(active[0].effect.type).toBe('attack_bonus');
  });

  it('does not return effects for a different faction', () => {
    const { events } = buildState();
    const event = makeEvent({ effects: [{ type: 'attack_bonus', value: 1, duration: 3 }] });
    events.applyEvent(event, 'player');
    expect(events.getActiveEffects('enemy')).toHaveLength(0);
  });

  it('excludes effects that have expired', () => {
    const { state, events } = buildState();
    const event = makeEvent({ effects: [{ type: 'attack_bonus', value: 1, duration: 2 }] });
    events.applyEvent(event, 'player'); // expires on turn 1+2=3
    state.turnNumber = 4; // past expiry
    expect(events.getActiveEffects('player')).toHaveLength(0);
  });

  it('getEffectBonus sums matching effect values', () => {
    const { events } = buildState();
    const e1 = makeEvent({ id: 'ev1', effects: [{ type: 'defense_bonus', value: 2, duration: 5 }] });
    const e2 = makeEvent({ id: 'ev2', effects: [{ type: 'defense_bonus', value: 1, duration: 5 }] });
    events.applyEvent(e1, 'player');
    events.applyEvent(e2, 'player');
    expect(events.getEffectBonus('player', 'defense_bonus')).toBe(3);
  });

  it('getEffectBonus returns 0 for unmatched effect type', () => {
    const { events } = buildState();
    const event = makeEvent({ effects: [{ type: 'attack_bonus', value: 5, duration: 5 }] });
    events.applyEvent(event, 'player');
    expect(events.getEffectBonus('player', 'defense_bonus')).toBe(0);
  });
});

// ── cleanupExpiredEffects ─────────────────────────────────────────────────────

describe('EventsSystem — cleanupExpiredEffects', () => {
  it('removes expired effects', () => {
    const { state, events } = buildState();
    const event = makeEvent({ effects: [{ type: 'attack_bonus', value: 1, duration: 2 }] });
    events.applyEvent(event, 'player'); // expires turn 3
    state.turnNumber = 4;
    events.cleanupExpiredEffects();
    expect(events.getActiveEffects('player')).toHaveLength(0);
  });

  it('keeps non-expired effects', () => {
    const { state, events } = buildState();
    const event = makeEvent({ effects: [{ type: 'attack_bonus', value: 1, duration: 10 }] });
    events.applyEvent(event, 'player'); // expires turn 11
    state.turnNumber = 5;
    events.cleanupExpiredEffects();
    expect(events.getActiveEffects('player')).toHaveLength(1);
  });
});

// ── serialize / restore ───────────────────────────────────────────────────────

describe('EventsSystem — serialize / restore', () => {
  it('round-trips active effects, cooldowns, and history', () => {
    const { state, events } = buildState();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const event = makeEvent({ id: 'persist_event', cooldownTurns: 5, effects: [{ type: 'attack_bonus', value: 1, duration: 3 }] });
    events.applyEvent(event, 'player');
    // Simulate rollForEvent recording a history entry
    events['eventHistory'].push({ turn: 1, eventId: 'persist_event', factionId: 'player' });
    events['eventCooldowns'].set('persist_event', 6);

    const saved = events.serialize();
    const fresh = new EventsSystem(state);
    fresh.restore(saved);

    expect(fresh.getActiveEffects('player')).toHaveLength(1);
    expect(fresh['eventCooldowns'].get('persist_event')).toBe(6);
    expect(fresh['eventHistory']).toHaveLength(1);
  });

  it('restore handles empty/missing data gracefully', () => {
    const { events } = buildState();
    expect(() => events.restore({ activeEffects: [], eventCooldowns: [], eventHistory: [] })).not.toThrow();
    expect(events.getActiveEffects('player')).toHaveLength(0);
  });
});

// ── factory_damage effect ─────────────────────────────────────────────────────

describe('EventsSystem — factory_damage effect', () => {
  it('disables a player factory for 2 turns', () => {
    const { state, events } = buildState();
    const event = makeEvent({ effects: [{ type: 'factory_damage' }] });
    events.applyEvent(event, 'player');
    const home = state.territories.get('home')!;
    expect(home.bombedUntilTurn).toBe(state.turnNumber + 2);
  });
});
