/**
 * NuclearSystem tests — readiness ticking, launch gating, strike effects.
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { NuclearSystem } from '../NuclearSystem';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

interface FakeTechManager {
  hasTech: (factionId: string, techId: string) => boolean;
  getTechEffect: (factionId: string) => Record<string, unknown>;
}

function buildState(hasTech = true): { state: GameState; nuclear: NuclearSystem; techManager: FakeTechManager } {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', { capital: 'home', allies: [] }));
  state.factionRegistry.register(makeFactionData('enemy', { capital: 'enemy_cap', allies: [] }));

  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3 }));

  const home = makeTerritory('home', 'player', { isCapital: true, production: 5, hasFactory: true, adjacentTo: [] });
  const enemyCap = makeTerritory('enemy_cap', 'enemy', {
    isCapital: true, production: 3, hasFactory: true, adjacentTo: [],
  });
  enemyCap.units.push({ unitTypeId: 'infantry', count: 10 });

  const sea = makeTerritory('sea1', null, { type: 'sea', production: 0, adjacentTo: [] });

  state.territories.set('home', home);
  state.territories.set('enemy_cap', enemyCap);
  state.territories.set('sea1', sea);

  state.currentFactionId = 'player';
  state.turnNumber = 1;

  const techManager: FakeTechManager = {
    hasTech: (_fid, techId) => hasTech && techId === 'nuclear_program',
    getTechEffect: () => ({}),
  };
  state.systems.technologyManager = techManager as any;

  const nuclear = new NuclearSystem(state);
  state.systems.nuclearSystem = nuclear;

  return { state, nuclear, techManager };
}

// ── readiness ticking ─────────────────────────────────────────────────────────

describe('NuclearSystem — tickReadiness', () => {
  it('increases readiness when faction has nuclear_program tech', () => {
    const { state, nuclear } = buildState(true);
    const player = state.factionRegistry.get('player')!;
    player.nuclearReadiness = 0;
    nuclear.tickReadiness();
    expect(player.nuclearReadiness).toBeGreaterThan(0);
  });

  it('does not increase readiness without nuclear_program tech', () => {
    const { state, nuclear } = buildState(false);
    const player = state.factionRegistry.get('player')!;
    player.nuclearReadiness = 0;
    nuclear.tickReadiness();
    expect(player.nuclearReadiness).toBe(0);
  });

  it('caps readiness at 100', () => {
    const { state, nuclear } = buildState(true);
    const player = state.factionRegistry.get('player')!;
    player.nuclearReadiness = 95;
    nuclear.tickReadiness();
    expect(player.nuclearReadiness).toBeLessThanOrEqual(100);
  });

  it('uranium territories increase tick gain', () => {
    const { state, nuclear } = buildState(true);
    const player = state.factionRegistry.get('player')!;
    player.nuclearReadiness = 0;

    // Add a uranium territory
    const u1 = makeTerritory('u1', 'player', { resource: 'uranium', production: 1, adjacentTo: [] });
    state.territories.set('u1', u1);

    nuclear.tickReadiness();
    // Base gain is 20; +10 per uranium territory → should be 30
    expect(player.nuclearReadiness).toBe(30);
  });
});

// ── canLaunch ─────────────────────────────────────────────────────────────────

describe('NuclearSystem — canLaunch', () => {
  it('returns false when readiness < 100', () => {
    const { state, nuclear } = buildState(true);
    state.factionRegistry.get('player')!.nuclearReadiness = 80;
    expect(nuclear.canLaunch('player')).toBe(false);
  });

  it('returns false without tech', () => {
    const { state, nuclear } = buildState(false);
    state.factionRegistry.get('player')!.nuclearReadiness = 100;
    expect(nuclear.canLaunch('player')).toBe(false);
  });

  it('returns true at 100% readiness with tech', () => {
    const { state, nuclear } = buildState(true);
    state.factionRegistry.get('player')!.nuclearReadiness = 100;
    expect(nuclear.canLaunch('player')).toBe(true);
  });

  it('returns false for defeated faction', () => {
    const { state, nuclear } = buildState(true);
    const player = state.factionRegistry.get('player')!;
    player.nuclearReadiness = 100;
    player.defeat();
    expect(nuclear.canLaunch('player')).toBe(false);
  });
});

// ── launchStrike ──────────────────────────────────────────────────────────────

describe('NuclearSystem — launchStrike', () => {
  it('returns null when canLaunch is false', () => {
    const { state, nuclear } = buildState(true);
    state.factionRegistry.get('player')!.nuclearReadiness = 50;
    expect(nuclear.launchStrike('player', 'enemy_cap')).toBeNull();
  });

  it('returns null for sea territory target', () => {
    const { state, nuclear } = buildState(true);
    state.factionRegistry.get('player')!.nuclearReadiness = 100;
    expect(nuclear.launchStrike('player', 'sea1')).toBeNull();
  });

  it('destroys ~80% of target units', () => {
    const { state, nuclear } = buildState(true);
    state.factionRegistry.get('player')!.nuclearReadiness = 100;
    const target = state.territories.get('enemy_cap')!;
    const beforeCount = target.getTotalUnitCount();
    nuclear.launchStrike('player', 'enemy_cap');
    const afterCount = target.getTotalUnitCount();
    expect(afterCount).toBeLessThan(beforeCount);
    expect(afterCount).toBe(Math.ceil(beforeCount * 0.2)); // ~20% survive
  });

  it('disables factory for 5 turns', () => {
    const { state, nuclear } = buildState(true);
    state.factionRegistry.get('player')!.nuclearReadiness = 100;
    nuclear.launchStrike('player', 'enemy_cap');
    const target = state.territories.get('enemy_cap')!;
    expect(target.bombedUntilTurn).toBe(state.turnNumber + 5);
  });

  it('resets attacker readiness to 0', () => {
    const { state, nuclear } = buildState(true);
    state.factionRegistry.get('player')!.nuclearReadiness = 100;
    nuclear.launchStrike('player', 'enemy_cap');
    expect(state.factionRegistry.get('player')!.nuclearReadiness).toBe(0);
  });
});
