/**
 * Renders the naval-status block shown in the territory selection panel.
 *
 * Extracted from the HUD god-class. Pure with respect to the DOM: it only reads
 * game state + the supply system and returns an HTML string. Returns '' when
 * there is nothing naval to show.
 */

import type { GameState } from '../engine/GameState';
import type { SupplySystem } from '../engine/SupplySystem';
import type { Territory } from '../data/Territory';
import { getTransportCapacityInSeaZone, summarizeFleet } from '../engine/NavalSystem';
import { getAdjacentSeaZones, hasSeaAccess } from '../engine/navalPlacement';
import { escapeHtml } from './htmlEscape';

export function getNavalStatusHtml(state: GameState, supplySystem: SupplySystem, territory: Territory): string {
  const faction = state.getCurrentFaction();
  if (!faction) return '';

  if (territory.isLand() && territory.owner === faction.id && hasSeaAccess(state, territory)) {
    const adjacentSeas = getAdjacentSeaZones(state, territory);
    if (adjacentSeas.length === 0) return '';

    const blockaded = supplySystem.isNavalBlockaded(territory.id, faction.id);
    const openSeas = adjacentSeas.filter(sea =>
      sea.owner === null ||
      sea.owner === faction.id ||
      sea.getTotalUnitCount() === 0 ||
      !sea.owner ||
      !faction.isEnemyOf(sea.owner)
    ).length;

    const fleetSummaries = adjacentSeas
      .map(sea => {
        const lines = summarizeFleet(state, sea);
        if (lines.length === 0) return null;
        const isFriendly = !sea.owner || sea.owner === faction.id;
        if (!isFriendly) return null;
        return `${escapeHtml(sea.name)}: ${lines.map(l => `${l.count} ${l.label}`).join(', ')}`;
      })
      .filter(Boolean);

    const fleetHtml = fleetSummaries.length > 0
      ? `<span class="naval-roles">Fleet: ${fleetSummaries.join(' · ')}</span>`
      : `<span style="font-size:0.72rem;opacity:0.85;">Naval builds deploy to adjacent sea zones — select one to inspect your fleet.</span>`;

    return `<div class="naval-status ${blockaded ? 'danger' : 'open'}">
        <strong>${blockaded ? 'Naval blockade' : 'Sea access open'}</strong>
        <span>${openSeas}/${adjacentSeas.length} adjacent sea zone${adjacentSeas.length === 1 ? '' : 's'} open</span>
        ${fleetHtml}
      </div>`;
  }

  if (territory.type === 'sea') {
    const transports = faction
      ? getTransportCapacityInSeaZone(state, territory.id, faction.id)
      : 0;
    const fleetLines = summarizeFleet(state, territory);
    const adjacentCoasts = territory.adjacentTo
      .map(id => state.territories.get(id))
      .filter(t => t?.isLand())
      .slice(0, 3)
      .map(t => t?.name ?? '')
      .filter(Boolean);
    const owner = territory.owner ? state.factionRegistry.get(territory.owner) : null;
    const fleetHtml = fleetLines.length > 0
      ? fleetLines.map(line => `${line.count} ${line.label}`).join(' · ')
      : 'No fleet present';
    return `<div class="naval-status sea">
        <strong>${owner ? `${escapeHtml(owner.name)} sea control` : 'Neutral sea zone'}</strong>
        <span>${fleetHtml}${transports > 0 ? ` · ${transports} lift` : ''}${adjacentCoasts.length ? ` · Coasts: ${escapeHtml(adjacentCoasts.join(', '))}` : ''}</span>
        ${fleetLines.length > 0 ? `<span class="naval-roles">${fleetLines.map(l => escapeHtml(`${l.label}: ${l.duty}`)).join(' · ')}</span>` : ''}
      </div>`;
  }

  return '';
}
