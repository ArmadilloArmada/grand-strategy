import type { GameState } from '../../engine/GameState';
import type { Territory } from '../../data/Territory';
import type { MapRenderer } from '../../renderer/MapRenderer';
import { isMovementPhase } from './PhaseHelpers';
import { isRangedStrikeUnit, getRangedUnitActionHint } from './MovementSelection';
import {
  renderUnitStackSelector,
  countReadyUnitStacks,
  resolveMoveCountForStack,
  type UnitStackSelectorOptions,
} from './UnitStackSelector';
import {
  setupUnitStackCommandDelegation,
} from './UnitStackCommand';
import { territoryHasAvailableUnits } from '../../engine/territoryControl';

export interface UnitStackCommandDeps {
  getState: () => GameState;
  renderer: MapRenderer;
  unitIcon: (unitTypeId: string) => string;
  escapeHtml: (value: string) => string;
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
  onStackChanged: () => void;
  onValidMovesRefresh: () => void;
  getCanvasRect: () => DOMRect | null;
}

/** Owns stack selection, popover, and selector rendering for HQ / War Room / mobile. */
export class UnitStackCommandController {
  selectedUnitType: string | null = null;
  selectedMoveCount: number | null = null;
  selectAllTypes = false;

  private stackCommandTeardown: (() => void) | null = null;

  constructor(private deps: UnitStackCommandDeps) {}

  init(): void {
    this.stackCommandTeardown?.();
    this.stackCommandTeardown = setupUnitStackCommandDelegation({
      onSelectUnitType: (unitTypeId) => this.selectUnitType(unitTypeId),
      onAdjustMoveCount: (unitTypeId, delta) => this.adjustMoveCount(unitTypeId, delta),
      onSelectAllMoveCount: (unitTypeId) => this.selectAllMoveCount(unitTypeId),
      onSelectAllUnitTypes: () => this.selectAllUnitTypes(),
    });
  }

  dispose(): void {
    this.stackCommandTeardown?.();
    this.stackCommandTeardown = null;
  }

  resetForNewTurn(): void {
  }

  clearSelection(): void {
    this.selectedUnitType = null;
    this.selectedMoveCount = null;
    this.selectAllTypes = false;
    this.deps.renderer.setActiveCommandStack(null);
  }

  isSelectAllTypes(): boolean {
    return this.selectAllTypes;
  }

  getSelectedUnitType(): string | null {
    return this.selectedUnitType;
  }

  getSelectedMoveCount(): number | null {
    return this.selectedMoveCount;
  }

  getResolvedMoveCount(territory: Territory, unitTypeId: string): number {
    return resolveMoveCountForStack(territory, unitTypeId, this.selectedMoveCount);
  }

  autoSelectUnitType(territory: Territory): void {
    const ready = territory.units.filter(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0);
    if (ready.length === 0) {
      this.selectedUnitType = null;
      this.selectedMoveCount = null;
      return;
    }
    if (this.selectedUnitType && ready.some(pu => pu.unitTypeId === this.selectedUnitType)) {
      this.selectedMoveCount = null;
      return;
    }
    const largest = [...ready].sort((a, b) => {
      const aCount = territory.getAvailableUnitCount(a.unitTypeId);
      const bCount = territory.getAvailableUnitCount(b.unitTypeId);
      return bCount - aCount;
    })[0];
    this.selectedUnitType = largest.unitTypeId;
    this.selectedMoveCount = null;
  }

  /** Called when the player clicks a territory — default to all types when mixed stacks. */
  onTerritorySelected(territory: Territory, isNewTerritory: boolean): void {
    const readyCount = countReadyUnitStacks(this.deps.getState(), territory);
    if (readyCount >= 2) {
      this.selectAllUnitTypes(false);
    } else if (isNewTerritory) {
      this.selectAllTypes = false;
      this.autoSelectUnitType(territory);
    } else if (this.selectAllTypes) {
      this.selectedMoveCount = null;
    } else if (this.selectedUnitType) {
      this.selectedMoveCount = null;
    } else {
      this.selectAllTypes = false;
      this.autoSelectUnitType(territory);
    }
    this.refresh();
  }

  selectAllUnitTypes(showToast = true): void {
    const state = this.deps.getState();
    const territory = state.getSelectedTerritory();
    if (!territory) return;
    const readyCount = countReadyUnitStacks(state, territory);
    if (readyCount === 0) {
      this.deps.showToast('No units ready to command here.', 'info');
      return;
    }
    this.selectAllTypes = true;
    this.selectedUnitType = null;
    this.selectedMoveCount = null;
    this.refresh();
    this.deps.onValidMovesRefresh();
    if (showToast && readyCount > 1) {
      this.deps.showToast('All unit types selected — drag to move or click enemies to attack.', 'info');
    }
    this.deps.onStackChanged();
  }

  selectAllMoveCount(unitTypeId: string): void {
    if (this.selectedUnitType !== unitTypeId) return;
    this.selectedMoveCount = null;
    this.refresh();
    this.deps.onValidMovesRefresh();
    this.deps.onStackChanged();
  }

  selectUnitType(unitTypeId: string): void {
    const state = this.deps.getState();
    const territory = state.getSelectedTerritory();
    if (!territory) return;
    const available = territory.getAvailableUnitCount(unitTypeId);
    if (available <= 0) {
      this.deps.showToast('Those units already acted this turn.', 'info');
      return;
    }
    this.selectedUnitType = unitTypeId;
    this.selectedMoveCount = null;
    this.selectAllTypes = false;
    this.refresh();
    this.deps.onValidMovesRefresh();
    const unitType = state.unitRegistry.get(unitTypeId);
    const name = unitType?.name ?? unitTypeId;
    const hint = unitType && isRangedStrikeUnit(unitType)
      ? getRangedUnitActionHint(unitType)
      : `drag to move (M${unitType?.movement ?? 1})`;
    this.deps.showToast(`Selected ${name} — ${hint}`, 'info');
    this.deps.onStackChanged();
  }

  adjustMoveCount(unitTypeId: string, delta: number): void {
    const territory = this.deps.getState().getSelectedTerritory();
    if (!territory || this.selectedUnitType !== unitTypeId) return;
    const available = territory.getAvailableUnitCount(unitTypeId);
    if (available <= 0) return;
    const current = this.getResolvedMoveCount(territory, unitTypeId);
    this.selectedMoveCount = Math.min(Math.max(1, current + delta), available);
    this.refresh();
  }

  cycleUnitStack(delta: number): void {
    const state = this.deps.getState();
    const territory = state.getSelectedTerritory();
    if (!territory || !isMovementPhase(state.currentPhase)) return;
    const ready = territory.units
      .filter(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0)
      .map(pu => pu.unitTypeId);
    if (ready.length < 2) return;
    const idx = this.selectedUnitType ? ready.indexOf(this.selectedUnitType) : -1;
    const next = ready[(idx + delta + ready.length) % ready.length];
    this.selectUnitType(next);
  }

  /** Quick stack by 1-based index (keyboard 1/2/3). */
  pickStackByIndex(index: number): boolean {
    const state = this.deps.getState();
    const territory = state.getSelectedTerritory();
    if (!territory || !isMovementPhase(state.currentPhase)) return false;
    const ready = territory.units
      .filter(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0)
      .map(pu => pu.unitTypeId);
    const unitTypeId = ready[index - 1];
    if (!unitTypeId) return false;
    this.selectUnitType(unitTypeId);
    return true;
  }

  refresh(): void {
    const state = this.deps.getState();
    const territory = state.getSelectedTerritory();
    renderUnitStackSelector(state, territory ?? null, this.selectorOptions());
    if (this.selectAllTypes && territory) {
      this.deps.renderer.setActiveCommandStack('__all__', '✦', null);
    } else if (territory && this.selectedUnitType) {
      const unitType = state.unitRegistry.get(this.selectedUnitType);
      this.deps.renderer.setActiveCommandStack(
        this.selectedUnitType,
        this.deps.unitIcon(this.selectedUnitType),
        unitType?.domain ?? null,
      );
    } else {
      this.deps.renderer.setActiveCommandStack(null);
    }
  }

  /** Keep commanding after a move or attack from a territory with mixed stacks. */
  handoffAfterAction(fromId: string, toId?: string): void {
    const state = this.deps.getState();
    const fromTerritory = state.territories.get(fromId);
    const commandFrom = fromTerritory && fromTerritory.getTotalUnitCount() > 0 ? fromId : (toId ?? fromId);
    state.selectTerritory(commandFrom);
    const commandTerritory = state.territories.get(commandFrom);
    this.selectedMoveCount = null;

    if (commandTerritory && territoryHasAvailableUnits(commandTerritory)) {
      const readyCount = countReadyUnitStacks(state, commandTerritory);
      if (readyCount >= 2) {
        this.selectAllUnitTypes(false);
      } else {
        this.selectAllTypes = false;
        this.autoSelectUnitType(commandTerritory);
      }
      this.deps.onValidMovesRefresh();
    } else {
      this.clearSelection();
      this.deps.onValidMovesRefresh();
    }
    this.refresh();
    this.deps.onStackChanged();
  }

  private selectorOptions(): UnitStackSelectorOptions {
    return {
      selectedUnitType: this.selectedUnitType,
      selectedMoveCount: this.selectedMoveCount,
      selectAllTypes: this.selectAllTypes,
      unitIcon: (id) => this.deps.unitIcon(id),
      escapeHtml: (value) => this.deps.escapeHtml(value),
    };
  }
}
