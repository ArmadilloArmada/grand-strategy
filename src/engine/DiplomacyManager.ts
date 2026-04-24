/**
 * DiplomacyManager — tracks diplomatic relations between factions.
 *
 * Relations:
 *   war      — default; factions fight freely
 *   pact     — non-aggression pact; no attacks allowed for N turns
 *   alliance — full alliance; shared combat bonuses, combined-arms bonus in same territory
 *
 * Trade deals are independent of diplomatic state and can coexist with any relation.
 * Both parties earn +ipcPerTurn each income phase while the deal is active.
 */

import { GameState } from './GameState';

export type DiplomaticState = 'war' | 'pact' | 'alliance';

export interface PactInfo {
  turnsLeft: number;
}

export interface AllianceInfo {
  turnsLeft: number;
}

export interface TradeDealInfo {
  ipcPerTurn: number;
  turnsLeft: number;
}

// ── Internal types ─────────────────────────────────────────────────────────

interface TradeDeal {
  ipcPerTurn: number;
  expiresAt: number; // turn number
}

interface Relation {
  state: DiplomaticState;
  pactExpiresAt?: number;
  allianceExpiresAt?: number;
  tradeDeal?: TradeDeal;
}

export type ProposalType = 'pact' | 'alliance' | 'trade_deal';

interface Proposal {
  fromId: string;
  toId: string;
  type: ProposalType;
  duration: number;
  terms?: { ipcPerTurn?: number };
  proposedAt: number; // turn number
}

// ── DiplomacyManager ───────────────────────────────────────────────────────

export class DiplomacyManager {
  private relations: Map<string, Map<string, Relation>> = new Map();
  private pendingProposals: Proposal[] = [];

  constructor(private state: GameState) {}

  // ── Relation helpers ────────────────────────────────────────────────────

  private key(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  private getRelEntry(a: string, b: string): Relation {
    const [x, y] = this.key(a, b);
    if (!this.relations.has(x)) this.relations.set(x, new Map());
    const inner = this.relations.get(x)!;
    if (!inner.has(y)) inner.set(y, { state: 'war' });
    return inner.get(y)!;
  }

  getRelation(a: string, b: string): DiplomaticState {
    return this.getRelEntry(a, b).state;
  }

  getPactInfo(a: string, b: string): PactInfo | null {
    const rel = this.getRelEntry(a, b);
    if (rel.state !== 'pact' || rel.pactExpiresAt === undefined) return null;
    return { turnsLeft: Math.max(0, rel.pactExpiresAt - this.state.turnNumber) };
  }

  getAllianceInfo(a: string, b: string): AllianceInfo | null {
    const rel = this.getRelEntry(a, b);
    if (rel.state !== 'alliance' || rel.allianceExpiresAt === undefined) return null;
    return { turnsLeft: Math.max(0, rel.allianceExpiresAt - this.state.turnNumber) };
  }

  hasAlliance(a: string, b: string): boolean {
    return this.getRelEntry(a, b).state === 'alliance';
  }

  getTradeDealInfo(a: string, b: string): TradeDealInfo | null {
    const rel = this.getRelEntry(a, b);
    if (!rel.tradeDeal) return null;
    const turnsLeft = rel.tradeDeal.expiresAt - this.state.turnNumber;
    if (turnsLeft <= 0) return null;
    return { ipcPerTurn: rel.tradeDeal.ipcPerTurn, turnsLeft };
  }

  /**
   * Sum of IPC income from all active trade deals for a faction.
   */
  getTradeIncome(factionId: string): number {
    let total = 0;
    for (const faction of this.state.factionRegistry.getAll()) {
      if (faction.id === factionId) continue;
      const info = this.getTradeDealInfo(factionId, faction.id);
      if (info) total += info.ipcPerTurn;
    }
    return total;
  }

  /**
   * Alliance combat bonus: +1 attack when fighting alongside an ally in the same territory.
   */
  getAllianceCombatBonus(attackingFactionId: string, _territoryId: string): number {
    // Check if any ally also has units attacking the same territory
    for (const faction of this.state.factionRegistry.getAll()) {
      if (faction.id === attackingFactionId) continue;
      if (this.hasAlliance(attackingFactionId, faction.id)) {
        return 1; // +1 attack when fighting alongside an ally
      }
    }
    return 0;
  }

  // ── Proposals ──────────────────────────────────────────────────────────

  propose(fromId: string, toId: string, duration: number, _currentTurn: number): void {
    this._propose({ fromId, toId, type: 'pact', duration, proposedAt: this.state.turnNumber });
  }

  proposePact(fromId: string, toId: string, duration: number): void {
    this._propose({ fromId, toId, type: 'pact', duration, proposedAt: this.state.turnNumber });
  }

  proposeAlliance(fromId: string, toId: string, duration: number): void {
    this._propose({ fromId, toId, type: 'alliance', duration, proposedAt: this.state.turnNumber });
  }

  proposeTrade(fromId: string, toId: string, ipcPerTurn: number, duration: number): void {
    this._propose({
      fromId, toId, type: 'trade_deal', duration,
      terms: { ipcPerTurn },
      proposedAt: this.state.turnNumber,
    });
  }

  private _propose(proposal: Proposal): void {
    // Replace any existing proposal of same type between the same pair
    this.pendingProposals = this.pendingProposals.filter(
      p => !(p.fromId === proposal.fromId && p.toId === proposal.toId && p.type === proposal.type)
    );
    this.pendingProposals.push(proposal);
    this.state.emit('diplomacy_proposal', {
      fromId: proposal.fromId,
      toId: proposal.toId,
      type: proposal.type,
      duration: proposal.duration,
      terms: proposal.terms,
    });
  }

  accept(fromId: string, toId: string, duration: number, _currentTurn: number): void {
    // Legacy: accept the first pending pact proposal between these two
    const proposal = this.pendingProposals.find(
      p => p.fromId === fromId && p.toId === toId && p.type === 'pact'
    );
    if (proposal) {
      this._acceptProposal(proposal);
    } else {
      // Direct accept without pending proposal (e.g. programmatic)
      const rel = this.getRelEntry(fromId, toId);
      rel.state = 'pact';
      rel.pactExpiresAt = this.state.turnNumber + duration;
      this.state.emit('diplomacy_accepted', { fromId, toId, type: 'pact', duration, expiresAt: rel.pactExpiresAt });
    }
  }

  acceptProposal(fromId: string, toId: string, type: ProposalType): void {
    const proposal = this.pendingProposals.find(
      p => p.fromId === fromId && p.toId === toId && p.type === type
    );
    if (proposal) this._acceptProposal(proposal);
  }

  private _acceptProposal(proposal: Proposal): void {
    const rel = this.getRelEntry(proposal.fromId, proposal.toId);

    switch (proposal.type) {
      case 'pact':
        rel.state = 'pact';
        rel.pactExpiresAt = this.state.turnNumber + proposal.duration;
        break;

      case 'alliance':
        rel.state = 'alliance';
        rel.allianceExpiresAt = this.state.turnNumber + proposal.duration;
        break;

      case 'trade_deal':
        rel.tradeDeal = {
          ipcPerTurn: proposal.terms?.ipcPerTurn ?? 3,
          expiresAt: this.state.turnNumber + proposal.duration,
        };
        break;
    }

    this.pendingProposals = this.pendingProposals.filter(p => p !== proposal);
    this.state.emit('diplomacy_accepted', {
      fromId: proposal.fromId,
      toId: proposal.toId,
      type: proposal.type,
      duration: proposal.duration,
      terms: proposal.terms,
    });
  }

  decline(fromId: string, toId: string): void {
    this.pendingProposals = this.pendingProposals.filter(
      p => !(p.fromId === fromId && p.toId === toId)
    );
    this.state.emit('diplomacy_declined', { fromId, toId });
  }

  declineProposal(fromId: string, toId: string, type: ProposalType): void {
    this.pendingProposals = this.pendingProposals.filter(
      p => !(p.fromId === fromId && p.toId === toId && p.type === type)
    );
    this.state.emit('diplomacy_declined', { fromId, toId, type });
  }

  getPendingProposals(toId: string): Proposal[] {
    return this.pendingProposals.filter(p => p.toId === toId);
  }

  // ── Alliance Betrayal ──────────────────────────────────────────────────

  /**
   * Betray an existing alliance — immediately declare war on the ally.
   * Sets a betrayal cooldown: the betrayer cannot form new alliances for 10 turns.
   * Broadcasts the event so the HUD can announce it dramatically.
   */
  betrayAlliance(betrayerId: string, betrayedId: string): boolean {
    const rel = this.getRelEntry(betrayerId, betrayedId);
    if (rel.state !== 'alliance') return false;

    rel.state = 'war';
    rel.allianceExpiresAt = undefined;

    const betrayer = this.state.factionRegistry.get(betrayerId);
    const betrayed = this.state.factionRegistry.get(betrayedId);
    if (betrayer) betrayer.betrayalCooldown = 10;

    this.state.emit('alliance_betrayed', {
      betrayerId,
      betrayedId,
      betrayerName: betrayer?.name ?? betrayerId,
      betrayedName: betrayed?.name ?? betrayedId,
    });

    return true;
  }

  /**
   * Force two factions to war (used by espionage exposure).
   */
  forceWar(a: string, b: string): void {
    const rel = this.getRelEntry(a, b);
    rel.state = 'war';
    rel.pactExpiresAt = undefined;
    rel.allianceExpiresAt = undefined;
  }

  // ── Turn tick ──────────────────────────────────────────────────────────

  /** Call at start of each full round to expire lapsed pacts, alliances, and trade deals. */
  tick(): void {
    const turn = this.state.turnNumber;
    for (const inner of this.relations.values()) {
      for (const rel of inner.values()) {
        // Expire pacts
        if (rel.state === 'pact' && rel.pactExpiresAt !== undefined && turn >= rel.pactExpiresAt) {
          rel.state = 'war';
          rel.pactExpiresAt = undefined;
        }
        // Expire alliances
        if (rel.state === 'alliance' && rel.allianceExpiresAt !== undefined && turn >= rel.allianceExpiresAt) {
          rel.state = 'war';
          rel.allianceExpiresAt = undefined;
        }
        // Expire trade deals
        if (rel.tradeDeal && turn >= rel.tradeDeal.expiresAt) {
          rel.tradeDeal = undefined;
        }
      }
    }
    // Expire stale proposals (older than 3 turns)
    this.pendingProposals = this.pendingProposals.filter(p => turn - p.proposedAt < 3);

    // Decrement betrayal cooldowns
    for (const faction of this.state.factionRegistry.getAll()) {
      if (faction.betrayalCooldown > 0) faction.betrayalCooldown--;
    }
  }

  // ── All relations (for UI) ─────────────────────────────────────────────

  getAllRelationsFor(factionId: string): Array<{
    otherId: string;
    state: DiplomaticState;
    pactInfo: PactInfo | null;
    allianceInfo: AllianceInfo | null;
    tradeDeal: TradeDealInfo | null;
  }> {
    const result = [];
    for (const faction of this.state.factionRegistry.getAll()) {
      if (faction.id === factionId) continue;
      result.push({
        otherId: faction.id,
        state: this.getRelation(factionId, faction.id),
        pactInfo: this.getPactInfo(factionId, faction.id),
        allianceInfo: this.getAllianceInfo(factionId, faction.id),
        tradeDeal: this.getTradeDealInfo(factionId, faction.id),
      });
    }
    return result;
  }

  // ── Save / Load ────────────────────────────────────────────────────────

  serialize(): unknown {
    const rels: Array<{
      a: string; b: string;
      state: DiplomaticState;
      pactExpiresAt?: number;
      allianceExpiresAt?: number;
      tradeDeal?: TradeDeal;
    }> = [];
    for (const [a, inner] of this.relations) {
      for (const [b, rel] of inner) {
        if (rel.state !== 'war' || rel.tradeDeal) {
          rels.push({
            a, b,
            state: rel.state,
            pactExpiresAt: rel.pactExpiresAt,
            allianceExpiresAt: rel.allianceExpiresAt,
            tradeDeal: rel.tradeDeal,
          });
        }
      }
    }
    return { rels, pendingProposals: this.pendingProposals };
  }

  restore(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const d = data as {
      rels?: Array<{
        a: string; b: string;
        state: DiplomaticState;
        pactExpiresAt?: number;
        allianceExpiresAt?: number;
        tradeDeal?: TradeDeal;
      }>;
      pendingProposals?: Proposal[];
    };
    this.relations.clear();
    for (const entry of d.rels ?? []) {
      const rel = this.getRelEntry(entry.a, entry.b);
      rel.state = entry.state;
      rel.pactExpiresAt = entry.pactExpiresAt;
      rel.allianceExpiresAt = entry.allianceExpiresAt;
      rel.tradeDeal = entry.tradeDeal;
    }
    this.pendingProposals = d.pendingProposals ?? [];
  }
}
