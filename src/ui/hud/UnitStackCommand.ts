import type { GameState } from '../../engine/GameState';
import type { Territory } from '../../data/Territory';
import { isRangedStrikeUnit } from './MovementSelection';

const STACK_CHIP_SELECTOR = '[data-unit-type-id]';
const STACK_COUNT_SELECTOR = '[data-stack-count-action]';

export interface UnitStackCommandCallbacks {
  onSelectUnitType: (unitTypeId: string) => void;
  onAdjustMoveCount: (unitTypeId: string, delta: number) => void;
  onSelectAllMoveCount?: (unitTypeId: string) => void;
  onSelectAllUnitTypes?: () => void;
}

/** One delegated listener for HQ, War Room, and mobile stack bar. */
export function setupUnitStackCommandDelegation(callbacks: UnitStackCommandCallbacks): () => void {
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement;
    const countBtn = target.closest<HTMLElement>(STACK_COUNT_SELECTOR);
    if (countBtn) {
      event.preventDefault();
      event.stopPropagation();
      const unitTypeId = countBtn.getAttribute('data-unit-type-id');
      const action = countBtn.getAttribute('data-stack-count-action');
      if (!unitTypeId) return;
      if (action === 'all') {
        callbacks.onSelectAllMoveCount?.(unitTypeId);
        return;
      }
      const delta = Number(action);
      if (Number.isFinite(delta)) {
        callbacks.onAdjustMoveCount(unitTypeId, delta);
      }
      return;
    }

    const allTypesBtn = target.closest<HTMLElement>('[data-stack-select-all-types]');
    if (allTypesBtn) {
      event.preventDefault();
      callbacks.onSelectAllUnitTypes?.();
      return;
    }

    const chip = target.closest<HTMLElement>(STACK_CHIP_SELECTOR);
    if (!chip || chip.hasAttribute('disabled')) return;
    const unitTypeId = chip.getAttribute('data-unit-type-id');
    if (unitTypeId) callbacks.onSelectUnitType(unitTypeId);
  };

  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}

export function formatActiveStackLabel(
  state: GameState,
  territory: Territory | null,
  selectedUnitType: string | null,
  selectedMoveCount: number | null,
  unitIcon: (id: string) => string,
  selectAllTypes = false,
): string | null {
  if (!territory) return null;
  if (selectAllTypes) {
    const readyStacks = territory.units.filter(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0);
    if (readyStacks.length === 0) return null;
    const total = readyStacks.reduce((sum, pu) => sum + territory.getAvailableUnitCount(pu.unitTypeId), 0);
    return `✦ All types (${readyStacks.length} stacks, ${total} units) — drag to move`;
  }
  if (!selectedUnitType) return null;
  const unitType = state.unitRegistry.get(selectedUnitType);
  if (!unitType) return null;
  const available = territory.getAvailableUnitCount(selectedUnitType);
  const count = selectedMoveCount ?? available;
  const icon = unitIcon(selectedUnitType);
  if (isRangedStrikeUnit(unitType)) {
    return `${icon} ${unitType.name} ×${count} — click enemy to strike`;
  }
  return `${icon} ${unitType.name} ×${count}${selectedMoveCount == null && available > 1 ? ' (all)' : ''} — drag to move`;
}

export function buildTooltipUnitSummary(
  state: GameState,
  territory: Territory,
  unitIcon: (id: string) => string,
  escapeHtml: (v: string) => string,
  maxItems = 4,
): string {
  const display = territory.units.filter(pu => {
    const ut = state.unitRegistry.get(pu.unitTypeId);
    return ut && !(ut.domain === 'sea' && territory.type !== 'sea');
  });
  if (display.length === 0) return '<span class="territory-tooltip-muted">None</span>';
  const summary = display.slice(0, maxItems).map(pu => {
    const ut = state.unitRegistry.get(pu.unitTypeId);
    return `${unitIcon(pu.unitTypeId)} ${escapeHtml(ut?.name ?? pu.unitTypeId)} ×${pu.count}`;
  }).join(' · ');
  const extra = display.length > maxItems ? ` · +${display.length - maxItems} more` : '';
  return `<div class="territory-tooltip-unit-summary">${summary}${extra}</div>
    <div class="territory-tooltip-muted">Select for stack command in HQ</div>`;
}
