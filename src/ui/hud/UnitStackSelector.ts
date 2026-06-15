import type { GameState } from '../../engine/GameState';
import type { Territory } from '../../data/Territory';
import { isMovementPhase } from './PhaseHelpers';

export interface UnitStackSelectorOptions {
  selectedUnitType: string | null;
  unitIcon: (unitTypeId: string) => string;
  escapeHtml: (value: string) => string;
}

function displayUnitsForTerritory(state: GameState, territory: Territory) {
  return territory.units.filter(pu => {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    return unitType && !(unitType.domain === 'sea' && territory.type !== 'sea');
  });
}

/** Interactive stack picker — submarines vs cruisers, etc. */
export function buildUnitStackSelectorHtml(
  state: GameState,
  territory: Territory,
  options: UnitStackSelectorOptions,
): string {
  const faction = state.getCurrentFaction();
  const isOwnedTerritory = Boolean(faction && territory.owner === faction.id);
  const movementPhaseActive = isMovementPhase(state.currentPhase);
  const displayUnits = displayUnitsForTerritory(state, territory);

  if (displayUnits.length === 0) {
    return `<div class="unit-stack-selector-empty">No units stationed here.</div>`;
  }

  const readyStacks = displayUnits.filter(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0);
  const canPickStack = isOwnedTerritory && movementPhaseActive && readyStacks.length > 0;

  let html = '';

  if (canPickStack && readyStacks.length > 1) {
    html += `<div class="unit-stack-selector-hint">Choose which stack moves or attacks this turn.</div>`;
  } else if (canPickStack) {
    html += `<div class="unit-stack-selector-hint">Drag on the map to move this stack.</div>`;
  } else if (isOwnedTerritory && movementPhaseActive && readyStacks.length === 0) {
    html += `<div class="unit-stack-selector-hint muted">All units here have already acted.</div>`;
  }

  html += `<div class="unit-stack-chips">`;
  for (const pu of displayUnits) {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    if (!unitType) continue;

    const icon = options.unitIcon(pu.unitTypeId);
    const availableCount = territory.getAvailableUnitCount(pu.unitTypeId);
    const movedCount = pu.movedCount || 0;
    const isSelected = options.selectedUnitType === pu.unitTypeId;
    const canSelect = canPickStack && availableCount > 0;

    const moveLabel = unitType.movement === 1 ? 'M1' : `M${unitType.movement}`;
    const domainLabel = unitType.domain === 'sea' ? 'Naval' : unitType.domain === 'air' ? 'Air' : 'Ground';

    let status = '';
    if (isOwnedTerritory && movementPhaseActive) {
      if (availableCount === 0) status = 'acted';
      else if (movedCount > 0) status = 'partial';
    }

    const countLabel = isOwnedTerritory && movementPhaseActive && status === 'partial'
      ? `${availableCount}/${pu.count}`
      : `×${pu.count}`;

    html += `<button type="button"
      class="unit-stack-chip${isSelected ? ' selected' : ''}${canSelect ? '' : ' readonly'}${status === 'acted' ? ' acted' : ''}"
      ${canSelect ? `data-unit-type-id="${pu.unitTypeId}"` : ''}
      ${canSelect ? '' : 'disabled'}
      title="${options.escapeHtml(unitType.name)} · ${unitType.attack}/${unitType.defense} · ${moveLabel}">
      <span class="unit-stack-chip-icon">${icon}</span>
      <span class="unit-stack-chip-body">
        <span class="unit-stack-chip-name">${options.escapeHtml(unitType.name)}</span>
        <span class="unit-stack-chip-meta">${countLabel} · ${domainLabel} · ${moveLabel}</span>
      </span>
      ${isSelected ? '<span class="unit-stack-chip-badge">Active</span>' : ''}
    </button>`;
  }
  html += `</div>`;

  return html;
}

export function renderUnitStackSelector(
  state: GameState,
  territory: Territory | null,
  options: UnitStackSelectorOptions,
): void {
  const html = territory
    ? buildUnitStackSelectorHtml(state, territory, options)
    : '';

  const hqEl = document.getElementById('territory-unit-selector');
  if (hqEl) {
    if (!territory) {
      hqEl.classList.add('hidden');
      hqEl.innerHTML = '';
    } else {
      hqEl.classList.remove('hidden');
      hqEl.innerHTML = html;
    }
  }

  const warRoomEl = document.getElementById('war-room-unit-slot');
  const warRoomBody = warRoomEl?.querySelector('.unit-stack-selector-body') as HTMLElement | null;
  if (warRoomBody) {
    if (!territory) {
      warRoomEl?.classList.add('hidden');
      warRoomBody.innerHTML = '';
    } else {
      warRoomEl?.classList.remove('hidden');
      warRoomBody.innerHTML = html;
    }
  }
}

export function countReadyUnitStacks(state: GameState, territory: Territory): number {
  const faction = state.getCurrentFaction();
  if (!faction || territory.owner !== faction.id || !isMovementPhase(state.currentPhase)) {
    return 0;
  }
  return displayUnitsForTerritory(state, territory)
    .filter(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0).length;
}
