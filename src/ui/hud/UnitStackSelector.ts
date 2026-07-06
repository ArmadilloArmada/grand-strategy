import type { GameState } from '../../engine/GameState';
import type { Territory } from '../../data/Territory';
import { isMovementPhase } from './PhaseHelpers';
import { isRangedStrikeUnit } from './MovementSelection';

export interface UnitStackSelectorOptions {
  selectedUnitType: string | null;
  selectedMoveCount: number | null;
  selectAllTypes: boolean;
  unitIcon: (unitTypeId: string) => string;
  escapeHtml: (value: string) => string;
}

function displayUnitsForTerritory(state: GameState, territory: Territory) {
  return territory.units.filter(pu => {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    return unitType && !(unitType.domain === 'sea' && territory.type !== 'sea');
  });
}

function moveCountStepperHtml(
  unitTypeId: string,
  selectedCount: number,
  maxCount: number,
  moveAll: boolean,
  escapeHtml: (v: string) => string,
): string {
  if (maxCount <= 1) return '';
  const countLabel = moveAll ? `All (${maxCount})` : `${selectedCount}/${maxCount}`;
  return `<div class="unit-stack-count-stepper" role="group" aria-label="Move count">
    <button type="button" class="unit-stack-count-btn" data-stack-count-action="-1"
      data-unit-type-id="${escapeHtml(unitTypeId)}" ${!moveAll && selectedCount <= 1 ? 'disabled' : ''} aria-label="Move fewer">−</button>
    <span class="unit-stack-count-value">${countLabel}</span>
    <button type="button" class="unit-stack-count-btn" data-stack-count-action="1"
      data-unit-type-id="${escapeHtml(unitTypeId)}" ${!moveAll && selectedCount >= maxCount ? 'disabled' : ''} aria-label="Move more">+</button>
    <button type="button" class="unit-stack-count-all${moveAll ? ' active' : ''}" data-stack-count-action="all"
      data-unit-type-id="${escapeHtml(unitTypeId)}" aria-label="Select all units">All</button>
  </div>`;
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
    html += `<div class="unit-stack-selector-hint">${options.selectAllTypes
      ? 'All unit types selected — drag to move or click enemies to attack.'
      : 'Active stack moves with all units by default — pick another chip to switch.'}</div>`;
  } else if (canPickStack) {
    html += `<div class="unit-stack-selector-hint">All ready units selected — drag on the map to move.</div>`;
  } else if (isOwnedTerritory && movementPhaseActive && readyStacks.length === 0) {
    html += `<div class="unit-stack-selector-hint muted">All units here have already acted.</div>`;
  }

  if (canPickStack && readyStacks.length > 1) {
    const totalReady = readyStacks.reduce(
      (sum, pu) => sum + territory.getAvailableUnitCount(pu.unitTypeId),
      0,
    );
    html += `<button type="button"
      class="unit-stack-all-types-btn${options.selectAllTypes ? ' selected' : ''}"
      data-stack-select-all-types
      title="Command every ready unit type from this territory">
      <span class="unit-stack-all-types-label">All Unit Types</span>
      <span class="unit-stack-all-types-meta">${readyStacks.length} stacks · ${totalReady} units</span>
    </button>`;
  }

  html += `<div class="unit-stack-chips">`;
  for (const pu of displayUnits) {
    const unitType = state.unitRegistry.get(pu.unitTypeId);
    if (!unitType) continue;

    const icon = options.unitIcon(pu.unitTypeId);
    const availableCount = territory.getAvailableUnitCount(pu.unitTypeId);
    const movedCount = pu.movedCount || 0;
    const isRanged = isRangedStrikeUnit(unitType);
    const canSelect = canPickStack && availableCount > 0 && !isRanged;
    const canCommand = canPickStack && availableCount > 0;
    const isSelected = options.selectAllTypes
      ? (canCommand && availableCount > 0)
      : options.selectedUnitType === pu.unitTypeId;

    const moveLabel = unitType.movement === 1 ? 'M1' : `M${unitType.movement}`;
    const domainLabel = unitType.domain === 'sea' ? 'Naval' : unitType.domain === 'air' ? 'Air' : 'Ground';

    let status = '';
    if (isOwnedTerritory && movementPhaseActive) {
      if (availableCount === 0) status = 'acted';
      else if (movedCount > 0) status = 'partial';
    }

    const moveAll = isSelected && options.selectedMoveCount == null;
    const selectedCount = isSelected && options.selectedMoveCount != null
      ? Math.min(Math.max(1, options.selectedMoveCount), availableCount)
      : availableCount;

    const countLabel = isOwnedTerritory && movementPhaseActive && status === 'partial'
      ? `${availableCount}/${pu.count}`
      : `×${pu.count}`;

    const metaExtra = isRanged && canCommand ? ' · click target' : '';

    html += `<button type="button"
      class="unit-stack-chip${isSelected ? ' selected' : ''}${canSelect || (isRanged && canCommand) ? '' : ' readonly'}${status === 'acted' ? ' acted' : ''}${isRanged && canCommand ? ' ranged' : ''}"
      ${canSelect || (isRanged && canCommand) ? `data-unit-type-id="${pu.unitTypeId}"` : ''}
      ${canSelect || (isRanged && canCommand) ? '' : 'disabled'}
      title="${options.escapeHtml(unitType.name)} · ${unitType.attack}/${unitType.defense} · ${moveLabel}${isRanged ? ' · ranged strike' : ''}">
      <span class="unit-stack-chip-icon">${icon}</span>
      <span class="unit-stack-chip-body">
        <span class="unit-stack-chip-name">${options.escapeHtml(unitType.name)}</span>
        <span class="unit-stack-chip-meta">${countLabel} · ${domainLabel} · ${moveLabel}${metaExtra}</span>
      </span>
      ${isSelected && canCommand && !isRanged && availableCount > 1 && !options.selectAllTypes
        ? moveCountStepperHtml(pu.unitTypeId, selectedCount, availableCount, moveAll, options.escapeHtml)
        : ''}
      ${isSelected && options.selectAllTypes && canCommand
        ? '<span class="unit-stack-chip-badge">Ready</span>'
        : ''}
      ${isSelected && !options.selectAllTypes ? '<span class="unit-stack-chip-badge">Active</span>' : ''}
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

  const mobileEl = document.getElementById('mobile-stack-command-bar');
  const mobileBody = mobileEl?.querySelector('.unit-stack-selector-body') as HTMLElement | null;
  if (mobileBody) {
    if (!territory) {
      mobileEl?.classList.add('hidden');
      mobileBody.innerHTML = '';
    } else {
      mobileEl?.classList.remove('hidden');
      mobileBody.innerHTML = html;
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

export function resolveMoveCountForStack(
  territory: Territory,
  unitTypeId: string,
  selectedMoveCount: number | null,
): number {
  const available = territory.getAvailableUnitCount(unitTypeId);
  if (available <= 0) return 0;
  if (selectedMoveCount == null) return available;
  return Math.min(Math.max(1, selectedMoveCount), available);
}
