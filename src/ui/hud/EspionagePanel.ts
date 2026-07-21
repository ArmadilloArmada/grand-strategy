/**
 * Espionage operations modal — extracted from HUD.ts (Horizon 3).
 */

import type { GameState } from '../../engine/GameState';
import { ESPIONAGE_OPS } from '../../engine/EspionageSystem';

export interface EspionagePanelDeps {
  state: GameState;
  showToast(message: string, kind: 'success' | 'error' | 'info'): void;
}

export class EspionagePanel {
  constructor(private deps: EspionagePanelDeps) {}

  show(): void {
    const { state, showToast } = this.deps;
    const faction = state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'human') return;

    const espionageSystem = state.systems.espionageSystem;
    if (!espionageSystem) {
      showToast('Espionage system not available', 'info');
      return;
    }

    const enemies = state.factionRegistry.getActive().filter(
      f => f.id !== faction.id &&
           state.diplomacyManager.getRelation(faction.id, f.id) === 'war'
    );

    let modal = document.getElementById('espionage-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'espionage-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const cooldownUntil = espionageSystem.getCooldownUntil?.(faction.id) ?? 0;
    const onCooldown = state.turnNumber < cooldownUntil;
    const turnsLeft = cooldownUntil - state.turnNumber;
    const recentHistory = espionageSystem.getHistory?.(faction.id, 5) ?? [];
    const historyHtml = recentHistory.length === 0
      ? '<p style="color:#4b5563;font-size:0.8rem;margin:0">No recent operations.</p>'
      : recentHistory.map(h => {
          const fName = state.factionRegistry.get(h.targetFactionId)?.name ?? h.targetFactionId;
          const icon = h.success ? '✓' : (h.exposed ? '⚠' : '✗');
          const col = h.success ? '#4ade80' : (h.exposed ? '#fbbf24' : '#f87171');
          return `<div style="display:flex;gap:6px;align-items:baseline;font-size:0.78rem;padding:2px 0;border-bottom:1px solid #1e293b;">
            <span style="color:${col};font-weight:bold;min-width:14px">${icon}</span>
            <span style="color:#94a3b8;min-width:28px">T${h.turn}</span>
            <span style="flex:1;color:#cbd5e1">${ESPIONAGE_OPS.find(o => o.type === h.opType)?.label ?? h.opType}</span>
            <span style="color:#64748b">→ ${fName}</span>
          </div>`;
        }).join('');

    modal.innerHTML = `
      <div class="modal-container" style="max-width:500px;">
        <div class="modal-header">
          <h2>🕵️ Espionage Operations</h2>
          <button id="btn-close-espionage" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
            <span style="color:#94a3b8">Treasury: <strong style="color:#fbbf24">${faction.ipcs} IPCs</strong></span>
            ${onCooldown
              ? `<span style="color:#f87171;font-size:0.85rem;">⏳ Agents recover in <strong>${turnsLeft}</strong> turn${turnsLeft !== 1 ? 's' : ''}</span>`
              : `<span style="color:#4ade80;font-size:0.85rem;">✓ Agents ready</span>`}
          </div>

          ${enemies.length === 0
            ? '<p style="color:#f87171">No enemies at war to target.</p>'
            : enemies.map(enemy => {
                const enemyCI = (enemy as { bonuses?: { counterIntelBonus?: number } }).bonuses?.counterIntelBonus ?? 0;
                return `<div style="margin-bottom:1.2rem;border:1px solid #334155;border-radius:6px;padding:0.8rem;">
                  <div style="font-weight:bold;color:${enemy.color};margin-bottom:0.6rem;">${enemy.name}</div>
                  ${ESPIONAGE_OPS.map(op => {
                    const adjustedChance = Math.round(op.successChance * (1 - enemyCI) * 100);
                    const affordable = faction.ipcs >= op.cost;
                    const disabled = !affordable || onCooldown;
                    const disabledStyle = disabled ? 'opacity:0.5;cursor:not-allowed;' : 'cursor:pointer;';
                    return `<button
                      class="esp-op-btn"
                      data-faction-id="${faction.id}"
                      data-enemy-id="${enemy.id}"
                      data-op-type="${op.type}"
                      ${disabled ? 'disabled' : ''}
                      style="display:block;width:100%;margin-bottom:0.4rem;padding:0.45rem 0.7rem;
                             background:#0f172a;border:1px solid #475569;border-radius:4px;
                             color:#e2e8f0;text-align:left;${disabledStyle}">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span>${op.label}</span>
                        <span style="display:flex;gap:8px;align-items:center;">
                          <span style="color:#fbbf24;font-size:0.8rem;">${op.cost} IPCs</span>
                          <span style="color:${adjustedChance >= 55 ? '#4ade80' : adjustedChance >= 35 ? '#fbbf24' : '#f87171'};font-size:0.78rem;">${adjustedChance}%</span>
                        </span>
                      </div>
                      <div style="color:#64748b;font-size:0.75rem;margin-top:2px">${op.description}</div>
                    </button>`;
                  }).join('')}
                </div>`;
              }).join('')}

          <details style="margin-top:0.8rem;">
            <summary style="color:#64748b;font-size:0.8rem;cursor:pointer;user-select:none;">📜 Recent Operations</summary>
            <div style="margin-top:0.5rem;padding:0.5rem;background:#0f172a;border-radius:4px;">
              ${historyHtml}
            </div>
          </details>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-close-espionage')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    modal.querySelectorAll<HTMLButtonElement>('.esp-op-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fId = btn.dataset.factionId!;
        const eId = btn.dataset.enemyId!;
        const opType = btn.dataset.opType as Parameters<NonNullable<typeof espionageSystem.executeOperation>>[2];
        const result = espionageSystem.executeOperation?.(fId, eId, opType) ?? { success: false, exposed: false, detail: 'Unavailable' };
        modal?.classList.add('hidden');
        const icon = result.success ? '✓' : (result.exposed ? '⚠' : '✗');
        const kind = result.success ? 'success' : 'error';
        showToast(`${icon} ${result.detail}`, kind);
      });
    });
  }
}
