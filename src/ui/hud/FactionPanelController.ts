/**
 * Turn-order strip and faction scoreboard — extracted from HUD.ts (Horizon 3).
 */

import type { GameState } from '../../engine/GameState';

export class FactionPanelController {
  constructor(private state: GameState) {}

  updateTurnOrder(): void {
    const container = document.getElementById('turn-order');
    if (!container) return;

    const factions = this.state.factionRegistry.getActive();
    const currentId = this.state.currentFactionId;
    const currentIdx = factions.findIndex(f => f.id === currentId);

    let html = '';
    factions.forEach((faction, idx) => {
      const isCurrent = faction.id === currentId;
      const isNext = idx === (currentIdx + 1) % factions.length;
      const statusClass = isCurrent ? 'current' : (isNext ? 'next' : '');
      const displayName = isCurrent ? faction.name : faction.name.split(' ')[0];

      html += `
        <div class="turn-order-item ${statusClass}" title="${faction.name}">
          <div class="faction-emblem turn-order-emblem" data-faction="${faction.id}" style="--faction-color:${faction.color};${isCurrent ? `box-shadow:0 0 0 2px ${faction.color},0 0 8px ${faction.color}88;` : ''}"></div>
          <span>${displayName}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  updateFactionPanel(): void {
    const container = document.getElementById('faction-panel-content');
    if (!container) return;

    const factions = this.state.factionRegistry.getActive();
    const currentId = this.state.currentFactionId;

    const allTerr = factions.map(f => this.state.getTerritoriesOwnedBy(f.id).length);
    const allUnits = factions.map(f => this.state.getTerritoriesOwnedBy(f.id).reduce((s, t) => s + t.getTotalUnitCount(), 0));
    const maxTerr = Math.max(...allTerr, 1);
    const maxUnits = Math.max(...allUnits, 1);

    let html = '';
    for (let i = 0; i < factions.length; i++) {
      const faction = factions[i];
      const territories = this.state.getTerritoriesOwnedBy(faction.id);
      const totalUnits = allUnits[i];
      const isCurrent = faction.id === currentId;
      const isDefeated = faction.isDefeated;

      const terrPct = Math.round((territories.length / maxTerr) * 100);
      const unitsPct = Math.round((totalUnits / maxUnits) * 100);
      const color = faction.color;
      const income = this.state.calculateIncome(faction.id);

      html += `
        <div class="faction-row ${isCurrent ? 'current' : ''} ${isDefeated ? 'defeated' : ''}">
          <div class="faction-emblem faction-panel-emblem" data-faction="${faction.id}" style="--faction-color:${color};"></div>
          <div class="faction-info">
            <div class="faction-name">${faction.name}</div>
            <div class="faction-bars">
              <div class="fb-row" title="${territories.length} territories">
                <span class="fb-icon">🗺️</span>
                <div class="fb-track"><div class="fb-fill" style="width:${terrPct}%;background:${color};"></div></div>
                <span class="fb-val">${territories.length}</span>
              </div>
              <div class="fb-row" title="${totalUnits} units">
                <span class="fb-icon">⚔️</span>
                <div class="fb-track"><div class="fb-fill" style="width:${unitsPct}%;background:${color};"></div></div>
                <span class="fb-val">${totalUnits}</span>
              </div>
              <div class="fb-row fb-ipc" title="${faction.ipcs} IPCs (${income > 0 ? '+' : ''}${income}/turn)">
                <span class="fb-icon">💰</span>
                <span class="fb-val">${faction.ipcs} <span style="color:#4ade80;font-size:0.72em;opacity:0.85;">+${income}</span></span>
              </div>
              ${faction.warWeariness > 0 ? (() => {
                const ww = faction.warWeariness;
                const wwColor = ww < 33 ? '#22c55e' : ww < 66 ? '#fbbf24' : '#ef4444';
                return `<div class="fb-row" title="War Weariness: ${ww}%">
                  <span class="fb-icon">😰</span>
                  <div class="fb-track"><div class="fb-fill" style="width:${ww}%;background:${wwColor};"></div></div>
                  <span class="fb-val" style="color:${wwColor}">${ww}%</span>
                </div>`;
              })() : ''}
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  getActiveFactionCount(): number {
    return this.state.factionRegistry.getActive().length;
  }
}
