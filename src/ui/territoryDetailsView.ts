/**
 * Simple-mode territory detail card shown in the selection panel.
 * Extracted from HUD as a pure builder; valid moves are passed in so it stays
 * decoupled from the ValidMoveController.
 */

import type { GameState } from '../engine/GameState';
import type { Territory } from '../data/Territory';
import type { ValidMove } from '../engine/MovementValidator';
import { isMovementPhase } from './hud/PhaseHelpers';
import { escapeHtml } from './htmlEscape';

export function buildSimpleTerritoryDetails(state: GameState, territory: Territory, validMoves: ValidMove[]): string {
  const owner = territory.owner ? state.factionRegistry.get(territory.owner) : null;
  const ownerName = owner?.name ?? 'Neutral';
  const ownerColor = owner?.color ?? '#666';
  const faction = state.getCurrentFaction();
  const isOwned = territory.owner === faction?.id;
  const phase = state.currentPhase;
  const isMovement = isMovementPhase(phase);
  const displayUnits = territory.units.filter(pu => {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    return unitType && !(unitType.domain === 'sea' && territory.type !== 'sea');
  });
  const totalUnits = displayUnits.reduce((sum, pu) => sum + pu.count, 0);
  const readyUnits = displayUnits.reduce((sum, pu) => sum + territory.getAvailableUnitCount(pu.unitTypeId), 0);
  const attackTargets = isOwned && isMovement ? validMoves.filter(m => m.isAttack).length : 0;
  const moveTargets = isOwned && isMovement ? validMoves.filter(m => !m.isAttack).length : 0;
  const action = (() => {
    if (isOwned && ['purchase', 'production', 'build'].includes(phase)) return territory.hasFactory ? 'Good place to mobilize.' : 'Select a factory territory to build.';
    if (isOwned && attackTargets > 0) return `${attackTargets} attack target${attackTargets === 1 ? '' : 's'} in range.`;
    if (isOwned && moveTargets > 0) return `${moveTargets} movement option${moveTargets === 1 ? '' : 's'} open.`;
    if (!isOwned && owner) return owner.isEnemyOf(faction?.id ?? '') ? 'Enemy territory. Attack from an adjacent friendly territory.' : 'Not controlled by you.';
    return 'No immediate action here.';
  })();
  const tags = [
    territory.isCapital ? 'Capital' : '',
    territory.hasFactory ? 'Factory' : '',
    territory.isLand() ? `${territory.production} IPC` : 'Sea zone',
  ].filter(Boolean);

  return `
      <div class="simple-territory-card">
        <div class="simple-territory-owner">
          <span style="background:${ownerColor};"></span>
          <strong>${escapeHtml(ownerName)}</strong>
        </div>
        <div class="simple-territory-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="simple-territory-action">
          <small>Best Action</small>
          <strong>${escapeHtml(action)}</strong>
        </div>
        <div class="simple-territory-grid">
          <div><small>Units</small><strong>${totalUnits}</strong></div>
          <div><small>Ready</small><strong>${readyUnits}</strong></div>
          <div><small>Income</small><strong>${territory.isLand() ? `+${territory.production}` : '-'}</strong></div>
        </div>
        ${isOwned && readyUnits < totalUnits ? '<div class="acted-explainer">Acted units are already here, but cannot move again until your next turn.</div>' : ''}
      </div>
    `;
}
