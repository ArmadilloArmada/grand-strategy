import { describe, it, expect, beforeEach } from 'vitest';
import { DiplomacyManager } from '../DiplomacyManager';
import { GameState } from '../GameState';

function makeState(): GameState {
  const state = new GameState();
  // Register two factions so tick() and getTradeIncome() can iterate them
  state.factionRegistry.loadFromData([
    {
      id: 'alpha', name: 'Alpha', color: '#f00', colorLight: '#f88',
      capital: 'alpha_capital', startingIPCs: 30, turnOrder: 1,
      isPlayable: true, allies: [],
    },
    {
      id: 'beta', name: 'Beta', color: '#00f', colorLight: '#88f',
      capital: 'beta_capital', startingIPCs: 30, turnOrder: 2,
      isPlayable: true, allies: [],
    },
  ]);
  state.turnNumber = 1;
  return state;
}

describe('DiplomacyManager', () => {
  let state: GameState;
  let dm: DiplomacyManager;

  beforeEach(() => {
    state = makeState();
    dm = state.diplomacyManager;
  });

  // ── Default relation ───────────────────────────────────────────────────

  it('default relation between any two factions is war', () => {
    expect(dm.getRelation('alpha', 'beta')).toBe('war');
  });

  it('is symmetric — same result regardless of argument order', () => {
    expect(dm.getRelation('alpha', 'beta')).toBe(dm.getRelation('beta', 'alpha'));
  });

  // ── Pact ──────────────────────────────────────────────────────────────

  it('proposePact creates a pending proposal', () => {
    dm.proposePact('alpha', 'beta', 3);
    const pending = dm.getPendingProposals('beta');
    expect(pending.length).toBe(1);
    expect(pending[0].type).toBe('pact');
  });

  it('acceptProposal transitions relation to pact', () => {
    dm.proposePact('alpha', 'beta', 3);
    dm.acceptProposal('alpha', 'beta', 'pact');
    expect(dm.getRelation('alpha', 'beta')).toBe('pact');
  });

  it('pact has correct expiry turn', () => {
    state.turnNumber = 5;
    dm.proposePact('alpha', 'beta', 4);
    dm.acceptProposal('alpha', 'beta', 'pact');
    const info = dm.getPactInfo('alpha', 'beta');
    expect(info).not.toBeNull();
    expect(info!.turnsLeft).toBe(4);
  });

  it('tick expires pact when turnNumber reaches pactExpiresAt', () => {
    state.turnNumber = 1;
    dm.proposePact('alpha', 'beta', 3);
    dm.acceptProposal('alpha', 'beta', 'pact');
    // Advance past expiry
    state.turnNumber = 5;
    dm.tick();
    expect(dm.getRelation('alpha', 'beta')).toBe('war');
  });

  it('pact remains while turnNumber is below expiry', () => {
    state.turnNumber = 1;
    dm.proposePact('alpha', 'beta', 5);
    dm.acceptProposal('alpha', 'beta', 'pact');
    state.turnNumber = 4;
    dm.tick();
    expect(dm.getRelation('alpha', 'beta')).toBe('pact');
  });

  // ── Alliance ──────────────────────────────────────────────────────────

  it('proposeAlliance + acceptProposal creates alliance', () => {
    dm.proposeAlliance('alpha', 'beta', 5);
    dm.acceptProposal('alpha', 'beta', 'alliance');
    expect(dm.getRelation('alpha', 'beta')).toBe('alliance');
    expect(dm.hasAlliance('alpha', 'beta')).toBe(true);
  });

  it('getAllianceInfo returns correct turnsLeft', () => {
    state.turnNumber = 2;
    dm.proposeAlliance('alpha', 'beta', 6);
    dm.acceptProposal('alpha', 'beta', 'alliance');
    expect(dm.getAllianceInfo('alpha', 'beta')!.turnsLeft).toBe(6);
  });

  it('tick expires alliance', () => {
    state.turnNumber = 1;
    dm.proposeAlliance('alpha', 'beta', 3);
    dm.acceptProposal('alpha', 'beta', 'alliance');
    state.turnNumber = 5;
    dm.tick();
    expect(dm.getRelation('alpha', 'beta')).toBe('war');
  });

  // ── Betrayal ──────────────────────────────────────────────────────────

  it('betrayAlliance returns false if no alliance exists', () => {
    expect(dm.betrayAlliance('alpha', 'beta')).toBe(false);
  });

  it('betrayAlliance transitions alliance to war', () => {
    dm.proposeAlliance('alpha', 'beta', 10);
    dm.acceptProposal('alpha', 'beta', 'alliance');
    dm.betrayAlliance('alpha', 'beta');
    expect(dm.getRelation('alpha', 'beta')).toBe('war');
  });

  it('betrayAlliance sets betrayalCooldown on betrayer', () => {
    dm.proposeAlliance('alpha', 'beta', 10);
    dm.acceptProposal('alpha', 'beta', 'alliance');
    dm.betrayAlliance('alpha', 'beta');
    const betrayer = state.factionRegistry.get('alpha');
    expect(betrayer?.betrayalCooldown).toBe(10);
  });

  it('betrayAlliance emits alliance_betrayed event', () => {
    let eventFired = false;
    state.on('alliance_betrayed', () => { eventFired = true; });
    dm.proposeAlliance('alpha', 'beta', 5);
    dm.acceptProposal('alpha', 'beta', 'alliance');
    dm.betrayAlliance('alpha', 'beta');
    expect(eventFired).toBe(true);
  });

  // ── Trade deals ───────────────────────────────────────────────────────

  it('proposeTrade + accept creates active trade deal', () => {
    dm.proposeTrade('alpha', 'beta', 5, 4);
    dm.acceptProposal('alpha', 'beta', 'trade_deal');
    const info = dm.getTradeDealInfo('alpha', 'beta');
    expect(info).not.toBeNull();
    expect(info!.ipcPerTurn).toBe(5);
  });

  it('getTradeIncome returns sum of all active deals for a faction', () => {
    dm.proposeTrade('alpha', 'beta', 3, 10);
    dm.acceptProposal('alpha', 'beta', 'trade_deal');
    // Both parties earn 3 IPC per turn
    expect(dm.getTradeIncome('alpha')).toBe(3);
    expect(dm.getTradeIncome('beta')).toBe(3);
  });

  it('tick expires trade deal', () => {
    state.turnNumber = 1;
    dm.proposeTrade('alpha', 'beta', 4, 2);
    dm.acceptProposal('alpha', 'beta', 'trade_deal');
    state.turnNumber = 4;
    dm.tick();
    expect(dm.getTradeDealInfo('alpha', 'beta')).toBeNull();
    expect(dm.getTradeIncome('alpha')).toBe(0);
  });

  it('trade deal can coexist with alliance', () => {
    dm.proposeAlliance('alpha', 'beta', 5);
    dm.acceptProposal('alpha', 'beta', 'alliance');
    dm.proposeTrade('alpha', 'beta', 2, 5);
    dm.acceptProposal('alpha', 'beta', 'trade_deal');
    expect(dm.getRelation('alpha', 'beta')).toBe('alliance');
    expect(dm.getTradeDealInfo('alpha', 'beta')!.ipcPerTurn).toBe(2);
  });

  // ── Decline ──────────────────────────────────────────────────────────

  it('declineProposal removes the pending proposal', () => {
    dm.proposePact('alpha', 'beta', 3);
    dm.declineProposal('alpha', 'beta', 'pact');
    expect(dm.getPendingProposals('beta').length).toBe(0);
  });

  it('emits diplomacy_declined event', () => {
    let fired = false;
    state.on('diplomacy_declined', () => { fired = true; });
    dm.proposePact('alpha', 'beta', 3);
    dm.declineProposal('alpha', 'beta', 'pact');
    expect(fired).toBe(true);
  });

  // ── Stale proposals ───────────────────────────────────────────────────

  it('tick removes proposals older than 3 turns', () => {
    state.turnNumber = 1;
    dm.proposePact('alpha', 'beta', 5);
    state.turnNumber = 5; // 4 turns later — past the 3-turn window
    dm.tick();
    expect(dm.getPendingProposals('beta').length).toBe(0);
  });

  // ── forceWar ─────────────────────────────────────────────────────────

  it('forceWar clears an existing pact', () => {
    dm.proposePact('alpha', 'beta', 5);
    dm.acceptProposal('alpha', 'beta', 'pact');
    dm.forceWar('alpha', 'beta');
    expect(dm.getRelation('alpha', 'beta')).toBe('war');
    expect(dm.getPactInfo('alpha', 'beta')).toBeNull();
  });

  // ── getAllRelationsFor ────────────────────────────────────────────────

  it('getAllRelationsFor returns one entry per other faction', () => {
    const relations = dm.getAllRelationsFor('alpha');
    expect(relations.length).toBe(1);
    expect(relations[0].otherId).toBe('beta');
  });

  // ── Serialize / Restore ───────────────────────────────────────────────

  it('round-trips pact through serialize/restore', () => {
    dm.proposePact('alpha', 'beta', 4);
    dm.acceptProposal('alpha', 'beta', 'pact');
    const serialized = dm.serialize();

    const state2 = makeState();
    state2.diplomacyManager.restore(serialized);
    expect(state2.diplomacyManager.getRelation('alpha', 'beta')).toBe('pact');
  });

  it('round-trips trade deal through serialize/restore', () => {
    dm.proposeTrade('alpha', 'beta', 3, 5);
    dm.acceptProposal('alpha', 'beta', 'trade_deal');
    const serialized = dm.serialize();

    const state2 = makeState();
    state2.diplomacyManager.restore(serialized);
    expect(state2.diplomacyManager.getTradeDealInfo('alpha', 'beta')!.ipcPerTurn).toBe(3);
  });
});
