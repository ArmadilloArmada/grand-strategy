/**
 * ReserveSystem tests — addToReserve, removeFromReserve, executeDeployments,
 * capacity enforcement, serialize/restore, and save-snapshot round-trip.
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { ReserveSystem } from '../ReserveSystem';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

function buildState(): { state: GameState; reserves: ReserveSystem } {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', { capital: 'home', allies: [], startingIPCs: 30 }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3 }));
  state.unitRegistry.register(makeUnitData({ id: 'tank', cost: 6, attack: 3, defense: 3 }));

  const home = makeTerritory('home', 'player', {
    isCapital: true,
    hasFactory: true,
    production: 3,
    adjacentTo: ['front'],
  });
  const front = makeTerritory('front', 'player', {
    adjacentTo: ['home', 'enemy_land'],
  });
  const enemy_land = makeTerritory('enemy_land', 'enemy', {
    adjacentTo: ['front'],
  });
  const rear = makeTerritory('rear', 'player', { adjacentTo: [] });

  state.territories.set('home', home);
  state.territories.set('front', front);
  state.territories.set('enemy_land', enemy_land);
  state.territories.set('rear', rear);

  state.currentFactionId = 'player';
  state.turnNumber = 1;

  const reserves = new ReserveSystem(state);
  return { state, reserves };
}

// ── addToReserve / removeFromReserve ─────────────────────────────────────────

describe('ReserveSystem — addToReserve / removeFromReserve', () => {
  it('starts with empty reserves', () => {
    const { reserves } = buildState();
    expect(reserves.getReserves('player')).toHaveLength(0);
    expect(reserves.getReserveCount('player')).toBe(0);
  });

  it('adds units to the pool', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 3);
    expect(reserves.getReserveCount('player')).toBe(3);
  });

  it('stacks same unit type', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    reserves.addToReserve('player', 'infantry', 1);
    const pool = reserves.getReserves('player');
    expect(pool).toHaveLength(1);
    expect(pool[0].count).toBe(3);
  });

  it('tracks different unit types separately', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    reserves.addToReserve('player', 'tank', 1);
    expect(reserves.getReserveCount('player')).toBe(3);
    expect(reserves.getReserves('player')).toHaveLength(2);
  });

  it('removeFromReserve deducts count', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 5);
    const ok = reserves.removeFromReserve('player', 'infantry', 3);
    expect(ok).toBe(true);
    expect(reserves.getReserveCount('player')).toBe(2);
  });

  it('removeFromReserve removes entry when count reaches zero', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    reserves.removeFromReserve('player', 'infantry', 2);
    expect(reserves.getReserves('player')).toHaveLength(0);
  });

  it('removeFromReserve returns false when insufficient units', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 1);
    expect(reserves.removeFromReserve('player', 'infantry', 5)).toBe(false);
    expect(reserves.getReserveCount('player')).toBe(1); // unchanged
  });

  it('removeFromReserve returns false for unknown unit type', () => {
    const { reserves } = buildState();
    expect(reserves.removeFromReserve('player', 'bomber', 1)).toBe(false);
  });
});

// ── queueDeployment ───────────────────────────────────────────────────────────

describe('ReserveSystem — queueDeployment', () => {
  it('queues a valid deployment', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 3);
    const result = reserves.queueDeployment('infantry', 'home', 2);
    expect(result.success).toBe(true);
    expect(reserves.getPendingDeployments()).toHaveLength(1);
  });

  it('rejects deployment when reserve is insufficient', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 1);
    const result = reserves.queueDeployment('infantry', 'home', 5);
    expect(result.success).toBe(false);
  });

  it('rejects deployment to enemy territory', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    const result = reserves.queueDeployment('infantry', 'enemy_land', 1);
    expect(result.success).toBe(false);
  });

  it('allows deploying sea units to a coastal territory', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('player', { capital: 'port', allies: [], startingIPCs: 30 }));
    state.unitRegistry.register(makeUnitData({ id: 'transport', domain: 'sea' as any, transportCapacity: 2, attack: 0, defense: 0 }));

    const port = makeTerritory('port', 'player', {
      type: 'coastal' as any,
      isCapital: true,
      production: 2,
      adjacentTo: [],
    });
    state.territories.set('port', port);
    state.currentFactionId = 'player';

    const reserves = new ReserveSystem(state);
    reserves.addToReserve('player', 'transport', 1);
    const result = reserves.queueDeployment('transport', 'port', 1);
    expect(result.success).toBe(true);
  });
});

// ── executeDeployments ────────────────────────────────────────────────────────

describe('ReserveSystem — executeDeployments', () => {
  it('returns zero deployed when no pending deployments', () => {
    const { reserves } = buildState();
    const result = reserves.executeDeployments();
    expect(result.deployed).toBe(0);
    expect(result.territories).toHaveLength(0);
  });

  it('places units in territory and removes from reserve', () => {
    const { state, reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 3);
    reserves.queueDeployment('infantry', 'home', 2);

    const result = reserves.executeDeployments();

    expect(result.deployed).toBe(2);
    expect(result.territories).toContain('home');
    const territory = state.territories.get('home')!;
    const placed = territory.units.find(u => u.unitTypeId === 'infantry');
    expect(placed?.count).toBeGreaterThanOrEqual(2);
    // 1 infantry still in reserve (3 added, 2 deployed)
    expect(reserves.getReserveCount('player')).toBe(1);
  });

  it('clears pending deployments after execution', () => {
    const { reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    reserves.queueDeployment('infantry', 'home', 1);
    reserves.executeDeployments();
    expect(reserves.getPendingDeployments()).toHaveLength(0);
  });

  it('emits units_produced event with correct data', () => {
    const { state, reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    reserves.queueDeployment('infantry', 'home', 2);

    const events: any[] = [];
    state.on('units_produced', (e) => events.push(e.data));

    reserves.executeDeployments();

    expect(events).toHaveLength(1);
    expect(events[0].factionId).toBe('player');
    expect(events[0].placedCount).toBe(2);
    expect(events[0].territories).toContain('home');
  });

  it('skips deployment to territory no longer owned by faction', () => {
    const { state, reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    reserves.queueDeployment('infantry', 'front', 2);

    // Territory captured mid-turn
    state.territories.get('front')!.owner = 'enemy';

    const result = reserves.executeDeployments();
    expect(result.deployed).toBe(0);
    // Units that failed to deploy are lost from reserve already (removeFromReserve called first)
    // The territory should have no new player units
    const front = state.territories.get('front')!;
    const placed = front.units.find(u => u.unitTypeId === 'infantry');
    expect(placed).toBeUndefined();
  });

  it('handles multiple territory deployments in one turn', () => {
    const { reserves } = buildState();
    // home (capital+factory, production=3) has capacity 5; rear has capacity 1
    reserves.addToReserve('player', 'infantry', 4);
    reserves.queueDeployment('infantry', 'home', 2);
    reserves.queueDeployment('infantry', 'rear', 1);

    const result = reserves.executeDeployments();
    expect(result.deployed).toBe(3);
    expect(result.territories).toContain('home');
    expect(result.territories).toContain('rear');
    expect(reserves.getReserveCount('player')).toBe(1); // 4 added, 3 deployed
  });

  it('handles mixed unit type deployments', () => {
    const { state, reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 2);
    reserves.addToReserve('player', 'tank', 1);
    reserves.queueDeployment('infantry', 'home', 2);
    reserves.queueDeployment('tank', 'home', 1);

    const result = reserves.executeDeployments();
    expect(result.deployed).toBe(3);
    expect(reserves.getReserveCount('player')).toBe(0);
    const territory = state.territories.get('home')!;
    const infantry = territory.units.find(u => u.unitTypeId === 'infantry');
    const tank = territory.units.find(u => u.unitTypeId === 'tank');
    expect(infantry?.count).toBeGreaterThanOrEqual(2);
    expect(tank?.count).toBeGreaterThanOrEqual(1);
  });
});

// ── serialize / restore ───────────────────────────────────────────────────────

describe('ReserveSystem — serialize / restore', () => {
  it('round-trips reserves and pending deployments', () => {
    const { state, reserves } = buildState();
    reserves.addToReserve('player', 'infantry', 3);
    reserves.queueDeployment('infantry', 'home', 1);

    const saved = reserves.serialize();
    const fresh = new ReserveSystem(state);
    fresh.restore(saved);

    expect(fresh.getReserveCount('player')).toBe(3);
    expect(fresh.getPendingDeployments()).toHaveLength(1);
    expect(fresh.getPendingDeployments()[0].unitTypeId).toBe('infantry');
  });

  it('handles empty data gracefully', () => {
    const { reserves } = buildState();
    expect(() => reserves.restore({ reserves: [], pending: [] })).not.toThrow();
    expect(reserves.getReserveCount('player')).toBe(0);
  });
});

// ── GameState snapshot round-trip ─────────────────────────────────────────────

describe('ReserveSystem — GameState snapshot round-trip', () => {
  it('preserves reserve data through createSnapshot/restoreFromSnapshot', () => {
    const { state, reserves } = buildState();
    state.systems.reserveSystem = reserves;

    reserves.addToReserve('player', 'infantry', 5);
    reserves.queueDeployment('infantry', 'home', 2);

    const snapshot = state.createSnapshot();

    // Create a fresh state and restore
    const state2 = new GameState();
    state2.factionRegistry.register(makeFactionData('player', { capital: 'home', allies: [], startingIPCs: 30 }));
    state2.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3 }));
    const home2 = makeTerritory('home', 'player', { isCapital: true, hasFactory: true, production: 3 });
    state2.territories.set('home', home2);
    state2.currentFactionId = 'player';

    const freshReserves = new ReserveSystem(state2);
    state2.systems.reserveSystem = freshReserves;

    state2.restoreFromSnapshot(snapshot);

    expect(freshReserves.getReserveCount('player')).toBe(5);
    expect(freshReserves.getPendingDeployments()).toHaveLength(1);
  });

  it('snapshot without reserves does not crash restore', () => {
    const { state, reserves } = buildState();
    state.systems.reserveSystem = reserves;
    reserves.addToReserve('player', 'infantry', 2);

    const snapshot = state.createSnapshot();
    // Simulate old save format without reserves field
    delete (snapshot as any).reserves;

    expect(() => state.restoreFromSnapshot(snapshot)).not.toThrow();
  });
});
