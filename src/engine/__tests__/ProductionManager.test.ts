/**
 * ProductionManager tests — purchase queuing, IPC deduction, capacity limits, rollback.
 */
import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { ProductionManager } from '../ProductionManager';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

// ── fixture ───────────────────────────────────────────────────────────────────

function buildState(): { state: GameState; pm: ProductionManager } {
  const state = new GameState();

  state.factionRegistry.register(makeFactionData('player', {
    capital: 'cap',
    allies: [],
    startingIPCs: 30,
    turnOrder: 1,
  }));

  state.unitRegistry.register(makeUnitData({ id: 'infantry', cost: 3, attack: 1, defense: 2 }));
  state.unitRegistry.register(makeUnitData({ id: 'tank',     cost: 6, attack: 3, defense: 3, canBlitz: true }));
  state.unitRegistry.register(makeUnitData({ id: 'bomber',   cost: 12, attack: 4, defense: 1, domain: 'air' }));

  const cap = makeTerritory('cap', 'player', {
    isCapital: true,
    production: 3,
    hasFactory: true,
    adjacentTo: [],
  });
  state.territories.set('cap', cap);

  state.currentFactionId = 'player';
  state.factionRegistry.get('player')!.ipcs = 30;

  const pm = new ProductionManager(state);
  return { state, pm };
}

// ── queue management ──────────────────────────────────────────────────────────

describe('ProductionManager — queue management', () => {
  it('successfully queues affordable units', () => {
    const { pm } = buildState();
    const result = pm.queueSimplePurchase('infantry', 2);
    expect(result.success).toBe(true);
    expect(pm.getPurchaseQueue()).toHaveLength(1);
    expect(pm.getPurchaseQueue()[0].count).toBe(2);
  });

  it('merges repeated purchases of the same unit type', () => {
    const { pm } = buildState();
    pm.queueSimplePurchase('infantry', 2);
    pm.queueSimplePurchase('infantry', 1);
    const queue = pm.getPurchaseQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].count).toBe(3);
  });

  it('handles different unit types as separate queue entries', () => {
    const { pm } = buildState();
    pm.queueSimplePurchase('infantry', 1);
    pm.queueSimplePurchase('tank', 1);
    expect(pm.getPurchaseQueue()).toHaveLength(2);
  });

  it('removes units from the queue', () => {
    const { pm } = buildState();
    pm.queueSimplePurchase('infantry', 3);
    pm.removeFromQueue('infantry', 1);
    expect(pm.getPurchaseQueue()[0].count).toBe(2);
  });

  it('removes the entry entirely when count reaches zero', () => {
    const { pm } = buildState();
    pm.queueSimplePurchase('infantry', 2);
    pm.removeFromQueue('infantry', 2);
    expect(pm.getPurchaseQueue()).toHaveLength(0);
  });

  it('clearQueue empties the queue without confirming', () => {
    const { pm } = buildState();
    pm.queueSimplePurchase('infantry', 3);
    pm.clearQueue();
    expect(pm.getPurchaseQueue()).toHaveLength(0);
  });
});

// ── IPC accounting ────────────────────────────────────────────────────────────

describe('ProductionManager — IPC accounting', () => {
  it('getTotalPurchaseCost reflects queued units', () => {
    const { pm } = buildState();
    pm.queueSimplePurchase('infantry', 2); // 2×3 = 6
    pm.queueSimplePurchase('tank', 1);     // 1×6 = 6
    expect(pm.getTotalPurchaseCost()).toBe(12);
  });

  it('getRemainingIPCs decreases as units are queued', () => {
    const { state, pm } = buildState();
    const before = state.factionRegistry.get('player')!.ipcs;
    pm.queueSimplePurchase('infantry', 3); // cost 9
    expect(pm.getRemainingIPCs()).toBe(before - 9);
  });

  it('rejects purchase when IPCs are insufficient', () => {
    const { state, pm } = buildState();
    state.factionRegistry.get('player')!.ipcs = 2;
    const result = pm.queueSimplePurchase('infantry', 1); // costs 3
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/insufficient/i);
  });

  it('confirmPurchases deducts IPCs and empties queue', () => {
    const { state, pm } = buildState();
    pm.queueSimplePurchase('infantry', 2); // cost 6
    const ok = pm.confirmPurchases();
    expect(ok).toBe(true);
    expect(state.factionRegistry.get('player')!.ipcs).toBe(24);
    expect(pm.getPurchaseQueue()).toHaveLength(0);
  });

  it('confirmPurchases returns false when faction has no IPCs', () => {
    const { state, pm } = buildState();
    pm.queueSimplePurchase('infantry', 2); // cost 6
    state.factionRegistry.get('player')!.ipcs = 0; // bankrupt after queuing
    const ok = pm.confirmPurchases();
    expect(ok).toBe(false);
  });
});

// ── Deployment capacity limits ────────────────────────────────────────────────

describe('ProductionManager — capacity limits', () => {
  it('rejects purchase that exceeds deployment capacity', () => {
    const { pm } = buildState();
    // cap has factory (production=3) + capital bonus = 5 total capacity; 6 exceeds it
    const result = pm.queueSimplePurchase('infantry', 6);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/capacity/i);
  });

  it('allows purchase exactly at capacity limit', () => {
    const { pm } = buildState();
    const result = pm.queueSimplePurchase('infantry', 5); // exactly 5 capacity
    expect(result.success).toBe(true);
  });
});

// ── Reset ─────────────────────────────────────────────────────────────────────

describe('ProductionManager — resetForNewTurn', () => {
  it('clears queue on reset', () => {
    const { pm } = buildState();
    pm.queueSimplePurchase('infantry', 1);
    pm.resetForNewTurn();
    expect(pm.getPurchaseQueue()).toHaveLength(0);
  });
});
