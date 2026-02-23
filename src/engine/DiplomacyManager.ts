/**
 * DiplomacyManager — tracks diplomatic relations between factions.
 * Supports non-aggression pacts that prevent mutual attacks for a fixed number of turns.
 */

import { GameState } from './GameState';

export type DiplomaticState = 'war' | 'pact';

interface Relation {
  state: DiplomaticState;
  pactExpiresAt?: number; // turn number when the pact expires
}

export interface PactInfo {
  turnsLeft: number;
}

interface Proposal {
  fromId: string;
  toId: string;
  duration: number;
  proposedAt: number; // turn number
}

export class DiplomacyManager {
  private relations: Map<string, Map<string, Relation>> = new Map();
  private pendingProposals: Proposal[] = [];

  constructor(private state: GameState) {}

  // ── Relation helpers ──────────────────────────────────────────────────────

  private key(a: string, b: string): [string, string] {
    // Canonical order so (a,b) and (b,a) map to the same entry
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

  // ── Proposals ─────────────────────────────────────────────────────────────

  propose(fromId: string, toId: string, duration: number, _currentTurn: number): void {
    // Remove any existing proposal from the same faction pair
    this.pendingProposals = this.pendingProposals.filter(
      p => !(p.fromId === fromId && p.toId === toId)
    );
    this.pendingProposals.push({ fromId, toId, duration, proposedAt: this.state.turnNumber });
    this.state.emit('diplomacy_proposal', { fromId, toId, duration });
  }

  accept(fromId: string, toId: string, duration: number, _currentTurn: number): void {
    const rel = this.getRelEntry(fromId, toId);
    rel.state = 'pact';
    rel.pactExpiresAt = this.state.turnNumber + duration;
    // Remove the proposal
    this.pendingProposals = this.pendingProposals.filter(
      p => !(p.fromId === fromId && p.toId === toId)
    );
    this.state.emit('diplomacy_accepted', { fromId, toId, duration, expiresAt: rel.pactExpiresAt });
  }

  decline(fromId: string, toId: string): void {
    this.pendingProposals = this.pendingProposals.filter(
      p => !(p.fromId === fromId && p.toId === toId)
    );
    this.state.emit('diplomacy_declined', { fromId, toId });
  }

  getPendingProposals(toId: string): Proposal[] {
    return this.pendingProposals.filter(p => p.toId === toId);
  }

  // ── Turn tick ─────────────────────────────────────────────────────────────

  /** Call at start of each turn to expire lapsed pacts. */
  tick(): void {
    const turn = this.state.turnNumber;
    for (const inner of this.relations.values()) {
      for (const rel of inner.values()) {
        if (rel.state === 'pact' && rel.pactExpiresAt !== undefined && turn >= rel.pactExpiresAt) {
          rel.state = 'war';
          rel.pactExpiresAt = undefined;
        }
      }
    }
    // Expire stale proposals (older than 3 turns)
    this.pendingProposals = this.pendingProposals.filter(p => turn - p.proposedAt < 3);
  }

  // ── All relations (for UI) ─────────────────────────────────────────────────

  getAllRelationsFor(factionId: string): Array<{ otherId: string; state: DiplomaticState; pactInfo: PactInfo | null }> {
    const result: Array<{ otherId: string; state: DiplomaticState; pactInfo: PactInfo | null }> = [];
    for (const faction of this.state.factionRegistry.getAll()) {
      if (faction.id === factionId) continue;
      result.push({
        otherId: faction.id,
        state: this.getRelation(factionId, faction.id),
        pactInfo: this.getPactInfo(factionId, faction.id),
      });
    }
    return result;
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  serialize(): unknown {
    const rels: Array<{ a: string; b: string; state: DiplomaticState; pactExpiresAt?: number }> = [];
    for (const [a, inner] of this.relations) {
      for (const [b, rel] of inner) {
        if (rel.state !== 'war') { // war is default — no need to persist
          rels.push({ a, b, state: rel.state, pactExpiresAt: rel.pactExpiresAt });
        }
      }
    }
    return { rels, pendingProposals: this.pendingProposals };
  }

  restore(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const d = data as { rels?: Array<{ a: string; b: string; state: DiplomaticState; pactExpiresAt?: number }>; pendingProposals?: Proposal[] };
    this.relations.clear();
    for (const entry of d.rels ?? []) {
      const rel = this.getRelEntry(entry.a, entry.b);
      rel.state = entry.state;
      rel.pactExpiresAt = entry.pactExpiresAt;
    }
    this.pendingProposals = d.pendingProposals ?? [];
  }
}
