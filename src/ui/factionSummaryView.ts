/**
 * Faction overview shown in the HQ panel when no territory is selected.
 * Extracted from HUD as a pure (state) -> HTML builder.
 */

import type { GameState } from '../engine/GameState';
import { escapeHtml } from './htmlEscape';

export function buildFactionSummaryHtml(state: GameState): string {
  const faction = state.getCurrentFaction();
  if (!faction) {
    return `<p style="color:#6b7280;font-style:italic;font-size:0.78rem;text-align:center;padding:0.5rem 0;">Click any territory to inspect it.</p>`;
  }

  const ownedTerritories = Array.from(state.territories.values())
    .filter(t => t.owner === faction.id);
  const income = state.calculateIncome(faction.id);

  let totalUnits = 0;
  for (const t of ownedTerritories) totalUnits += t.getTotalUnitCount();

  const capital = ownedTerritories.find(t => t.isCapital);
  let capitalHtml = '';
  if (capital) {
    const capitalUnits = capital.getTotalUnitCount();
    const adjacentEnemies = capital.adjacentTo.some(adjId => {
      const adj = state.territories.get(adjId);
      return adj && adj.owner && faction.isEnemyOf(adj.owner) && adj.getTotalUnitCount() > 0;
    });
    const statusClass = adjacentEnemies ? 'at-risk' : 'safe';
    const statusText = adjacentEnemies ? '⚠ Under threat' : '✓ Secured';
    capitalHtml = `<div class="hq-capital-row ${statusClass}">
        <span>⭐ ${escapeHtml(capital.name)}</span>
        <span style="margin-left:auto;font-size:0.7rem;">${statusText} · ${capitalUnits} unit${capitalUnits !== 1 ? 's' : ''}</span>
      </div>`;
  }

  const threatenedCount = ownedTerritories.filter(t =>
    t.adjacentTo.some(adjId => {
      const adj = state.territories.get(adjId);
      return adj && adj.owner && faction.isEnemyOf(adj.owner) && adj.getTotalUnitCount() > 0;
    })
  ).length;

  const incomeClass = income >= 20 ? 'positive' : income >= 8 ? 'warning' : 'danger';
  const unitsClass = totalUnits >= 10 ? 'positive' : totalUnits >= 4 ? 'warning' : 'danger';

  return `<div class="hq-faction-summary">
      <div class="hq-faction-banner">
        <div class="hq-faction-dot" style="background:${escapeHtml(faction.color)};box-shadow:0 0 5px ${escapeHtml(faction.color)}44;"></div>
        <span class="hq-faction-name" style="color:${escapeHtml(faction.colorLight ?? faction.color)};">${escapeHtml(faction.name)}</span>
      </div>
      <div class="hq-stat-grid">
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Territories</span>
          <span class="hq-stat-value">${ownedTerritories.length}</span>
        </div>
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Income</span>
          <span class="hq-stat-value ${incomeClass}">+${income}</span>
        </div>
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Units</span>
          <span class="hq-stat-value ${unitsClass}">${totalUnits}</span>
        </div>
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Threatened</span>
          <span class="hq-stat-value ${threatenedCount > 0 ? 'danger' : 'positive'}">${threatenedCount}</span>
        </div>
      </div>
      ${capitalHtml}
    </div>`;
}
