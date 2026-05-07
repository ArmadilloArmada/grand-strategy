/**
 * DiplomacyUI - Diplomacy proposal toast and relations modal
 * Supports player-initiated pacts, alliances, and trade deals.
 */

import { GameState } from '../engine/GameState';
import { ProposalType } from '../engine/DiplomacyManager';

export interface DiplomacyCallbacks {
  showToast(msg: string, type: 'success' | 'info' | 'error'): void;
}

export class DiplomacyUI {
  constructor(
    private state: GameState,
    private callbacks: DiplomacyCallbacks
  ) {
    // Listen for incoming AI diplomacy proposals so we can surface them to the player
    this.state.on('diplomacy_proposal', (e: any) => {
      const d = e.data as { fromId: string; toId: string; type: ProposalType; duration: number; terms?: { ipcPerTurn?: number } };
      const current = this.state.getCurrentFaction();
      if (current?.id === d.toId && current.controlledBy === 'human') {
        this.showProposalToast(d.fromId, d.toId, d.type, d.duration, d.terms);
      }
    });
  }

  // ── Incoming proposal toast ────────────────────────────────────────────────

  showProposalToast(
    fromId: string,
    toId: string,
    type: ProposalType,
    duration: number,
    terms?: { ipcPerTurn?: number }
  ): void {
    const currentFaction = this.state.getCurrentFaction();
    if (currentFaction?.id !== toId) return;

    const fromFaction = this.state.factionRegistry.get(fromId);
    if (!fromFaction) return;

    const toast = document.getElementById('diplomacy-proposal-toast');
    const textEl = document.getElementById('dp-toast-text');
    if (!toast || !textEl) return;

    const typeLabels: Record<ProposalType, string> = {
      pact: `${duration}-turn non-aggression pact`,
      alliance: `${duration}-turn military alliance`,
      trade_deal: `${duration}-turn trade deal (+${terms?.ipcPerTurn ?? 3} IPC/turn)`,
    };

    textEl.textContent = `${fromFaction.name} proposes a ${typeLabels[type]}.`;
    toast.classList.remove('hidden');

    const acceptBtn = document.getElementById('btn-accept-pact');
    const declineBtn = document.getElementById('btn-decline-pact');

    const cleanup = () => { toast.classList.add('hidden'); };

    if (acceptBtn) {
      acceptBtn.onclick = () => {
        this.state.diplomacyManager.acceptProposal(fromId, toId, type);
        this.callbacks.showToast(`${typeLabels[type]} with ${fromFaction.name} accepted!`, 'success');
        cleanup();
        this.updateModal();
      };
    }
    if (declineBtn) {
      declineBtn.onclick = () => {
        this.state.diplomacyManager.declineProposal(fromId, toId, type);
        this.callbacks.showToast(`Proposal from ${fromFaction.name} declined.`, 'info');
        cleanup();
      };
    }
  }

  // ── Relations modal ────────────────────────────────────────────────────────

  showModal(): void {
    const modal = document.getElementById('diplomacy-modal');
    if (modal) modal.classList.remove('hidden');
    this.updateModal();
  }

  updateModal(): void {
    const container = document.getElementById('diplomacy-relations');
    if (!container) return;

    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) return;

    const isHuman = currentFaction.controlledBy === 'human';
    const factions = this.state.factionRegistry.getActive().filter(f => f.id !== currentFaction.id);

    if (factions.length === 0) {
      container.innerHTML = '<p style="color:#888;">No other factions.</p>';
      return;
    }

    container.innerHTML = factions.map(f => {
      const rel       = this.state.diplomacyManager.getRelation(currentFaction.id, f.id);
      const pactInfo  = this.state.diplomacyManager.getPactInfo(currentFaction.id, f.id);
      const alliInfo  = this.state.diplomacyManager.getAllianceInfo(currentFaction.id, f.id);
      const tradeInfo = this.state.diplomacyManager.getTradeDealInfo(currentFaction.id, f.id);

      const relLabel = rel === 'alliance'
        ? `<span style="color:#a855f7;">🤝 Alliance${alliInfo ? ` (${alliInfo.turnsLeft}t)` : ''}</span>`
        : rel === 'pact'
          ? `<span style="color:#22c55e;">🕊️ Non-Aggression Pact${pactInfo ? ` (${pactInfo.turnsLeft}t)` : ''}</span>`
          : `<span style="color:#ef4444;">⚔️ At War</span>`;

      const tradeLabel = tradeInfo
        ? `<span style="color:#f59e0b;">💰 Trade +${tradeInfo.ipcPerTurn}/t (${tradeInfo.turnsLeft}t)</span>`
        : '';

      // Player-proposal buttons (only when human-controlled)
      let actionButtons = '';
      if (isHuman) {
        const canPact      = rel === 'war';
        const canAlliance  = rel !== 'alliance' && (currentFaction.betrayalCooldown ?? 0) === 0;
        const canTrade     = !tradeInfo;
        const canBetray    = rel === 'alliance';

        if (canPact) {
          actionButtons += `<button onclick="window.__hudInstance.proposeDiplomacy('${f.id}','pact',3)"
            style="${this.btnStyle('#1d4ed8')}">Propose Pact</button>`;
        }
        if (canAlliance) {
          actionButtons += `<button onclick="window.__hudInstance.proposeDiplomacy('${f.id}','alliance',5)"
            style="${this.btnStyle('#6d28d9')}">Propose Alliance</button>`;
        }
        if (canTrade) {
          actionButtons += `<button onclick="window.__hudInstance.proposeDiplomacy('${f.id}','trade_deal',5)"
            style="${this.btnStyle('#b45309')}">Propose Trade</button>`;
        }
        if (canBetray) {
          actionButtons += `<button onclick="window.__hudInstance.betrayAlliance('${f.id}')"
            style="${this.btnStyle('#991b1b')}">Betray Alliance</button>`;
        }
      }

      return `
        <div style="border:1px solid #333;border-radius:8px;padding:0.75rem;margin-bottom:0.5rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
            <div style="display:flex;align-items:center;gap:0.6rem;">
              <div style="width:12px;height:12px;border-radius:50%;background:${f.color};"></div>
              <strong style="color:#ddd;">${f.name}</strong>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;">
              ${relLabel}
              ${tradeLabel}
            </div>
          </div>
          ${actionButtons ? `<div style="display:flex;gap:0.4rem;flex-wrap:wrap;">${actionButtons}</div>` : ''}
        </div>`;
    }).join('');
  }

  // ── Player-initiated actions ───────────────────────────────────────────────

  proposePact(toFactionId: string): void {
    this.proposeDiplomacy(toFactionId, 'pact', 3);
  }

  proposeDiplomacy(toFactionId: string, type: ProposalType, duration: number): void {
    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) return;

    const target = this.state.factionRegistry.get(toFactionId);
    if (!target) return;

    switch (type) {
      case 'pact':
        this.state.diplomacyManager.proposePact(currentFaction.id, toFactionId, duration);
        this.callbacks.showToast(`Peace proposal sent to ${target.name}.`, 'success');
        break;
      case 'alliance':
        this.state.diplomacyManager.proposeAlliance(currentFaction.id, toFactionId, duration);
        this.callbacks.showToast(`Alliance proposal sent to ${target.name}.`, 'success');
        break;
      case 'trade_deal':
        this.state.diplomacyManager.proposeTrade(currentFaction.id, toFactionId, 3, duration);
        this.callbacks.showToast(`Trade deal proposed to ${target.name} (+3 IPC/turn).`, 'success');
        break;
    }
    this.updateModal();
  }

  betrayAllianceWith(toFactionId: string): void {
    const result = this.state.diplomacyManager.betrayAlliance(
      this.state.currentFactionId,
      toFactionId
    );
    const target = this.state.factionRegistry.get(toFactionId);
    if (result) {
      this.callbacks.showToast(`⚠️ You have betrayed your alliance with ${target?.name}!`, 'info');
    }
    this.updateModal();
  }

  private btnStyle(bg: string): string {
    return `padding:0.25rem 0.6rem;background:${bg};color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.78rem;`;
  }
}
