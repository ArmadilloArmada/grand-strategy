import type { GameState } from '../../engine/GameState';
import type { MovementValidator, ValidMove } from '../../engine/MovementValidator';
import type { MapRenderer } from '../../renderer/MapRenderer';
import type { MobilizationSystem } from '../../engine/MobilizationSystem';
import type { OverlayController } from '../OverlayController';
import type { Territory } from '../../data/Territory';
import { canIssueOrdersFromTerritory } from '../../engine/territoryControl';
import { isMovementPhase, resolveMovePhaseContext } from './PhaseHelpers';
import {
  collectValidMovesForAllReadyStacks,
  splitMoveAndAttackTargets,
} from './MovementSelection';

export interface StackMoveSelection {
  isSelectAllTypes(): boolean;
  selectedUnitType: string | null;
  autoSelectUnitType(territory: Territory): void;
}

export interface ValidMoveControllerDeps {
  getState: () => GameState;
  movementValidator: MovementValidator;
  renderer: MapRenderer;
  overlayController: OverlayController;
  mobilizationSystem: MobilizationSystem;
  stackCommand: StackMoveSelection;
  escapeHtml: (value: string) => string;
  onAfterUpdate?: () => void;
}

/** Valid move highlights, target lists, and map legend for territory command. */
export class ValidMoveController {
  private validMoves: ValidMove[] = [];
  private validMovesUnitTypeId: string | null = null;

  constructor(private deps: ValidMoveControllerDeps) {}

  getValidMoves(): ValidMove[] {
    return this.validMoves;
  }

  getValidMovesUnitTypeId(): string | null {
    return this.validMovesUnitTypeId;
  }

  clear(): void {
    this.deps.renderer.clearValidMoveTargets();
    this.validMoves = [];
    this.validMovesUnitTypeId = null;
    this.updateMapReadabilityLegend();
  }

  updateValidMoves(): void {
    const state = this.deps.getState();
    const territory = state.getSelectedTerritory();
    const faction = state.getCurrentFaction();
    const phase = state.currentPhase;

    if (!territory || !faction || !canIssueOrdersFromTerritory(territory, faction.id)) {
      this.clear();
      this.deps.onAfterUpdate?.();
      return;
    }

    if (!isMovementPhase(phase)) {
      this.clear();
      this.deps.onAfterUpdate?.();
      return;
    }

    const allMoves: ValidMove[] = [];
    const moveContext = resolveMovePhaseContext(phase);
    const { stackCommand, movementValidator } = this.deps;

    if (stackCommand.isSelectAllTypes()) {
      allMoves.push(...collectValidMovesForAllReadyStacks(
        territory,
        (unitTypeId) => movementValidator.getValidMoves(unitTypeId, territory.id, moveContext),
        (unitTypeId) => territory.getAvailableUnitCount(unitTypeId),
      ));
      this.validMoves = allMoves;
      this.validMovesUnitTypeId = null;
    } else {
      const selectedStillReady = stackCommand.selectedUnitType
        && territory.getAvailableUnitCount(stackCommand.selectedUnitType) > 0;
      if (!selectedStillReady) {
        stackCommand.autoSelectUnitType(territory);
      }

      if (!stackCommand.selectedUnitType) {
        this.clear();
        this.deps.onAfterUpdate?.();
        return;
      }

      allMoves.push(...movementValidator.getValidMoves(
        stackCommand.selectedUnitType,
        territory.id,
        moveContext,
      ));

      this.validMoves = allMoves;
      this.validMovesUnitTypeId = stackCommand.selectedUnitType;
    }

    const { moveTargets, attackTargets, coastalStrikeTargets } = splitMoveAndAttackTargets(allMoves);
    this.deps.renderer.setValidMoveTargets(moveTargets, attackTargets, coastalStrikeTargets);
    this.deps.overlayController.apply();
    this.updateMapReadabilityLegend();
    this.deps.onAfterUpdate?.();
  }

  updateMapReadabilityLegend(): void {
    const state = this.deps.getState();
    const { stackCommand, mobilizationSystem } = this.deps;
    const targetParent = document.getElementById('war-room-content') ?? document.getElementById('app');
    let legend = document.getElementById('map-readability-legend');
    if (!legend) {
      legend = document.createElement('div');
      legend.id = 'map-readability-legend';
    }
    if (targetParent && legend.parentElement !== targetParent) {
      targetParent.appendChild(legend);
    }
    legend.classList.add('war-room-section', 'overlay-legend-section');

    const mode = this.deps.overlayController?.getMode() ?? 'off';
    const moveCount = this.validMoves.filter(m => !m.isAttack).length;
    const attackCount = this.validMoves.filter(m => m.isAttack).length;
    const mobilizeCount = mobilizationSystem.getMobilizationOptions().filter(o => o.canMobilize).length;
    const selected = state.getSelectedTerritory();
    const selectedUnitName = stackCommand.isSelectAllTypes()
      ? 'All unit types'
      : stackCommand.selectedUnitType
        ? state.unitRegistry.get(stackCommand.selectedUnitType)?.name
        : null;
    const selectedText = selected
      ? (selectedUnitName ? `${selected.name} · ${selectedUnitName}` : selected.name)
      : 'No territory selected';
    const showNavalLegend = Boolean(selected?.isSea() && moveCount > 0);
    const modeLabels: Record<string, string> = {
      off: 'Overlay Off',
      range: 'Range',
      threat: 'Threats',
      economic: 'Economy',
    };

    legend.innerHTML = `
      <div class="map-legend-title">${this.deps.escapeHtml(modeLabels[mode])}</div>
      <div class="map-legend-row"><span class="legend-swatch selected"></span><span>${this.deps.escapeHtml(selectedText)}</span></div>
      <div class="map-legend-row"><span class="legend-swatch ${showNavalLegend ? 'naval-move' : 'move'}"></span><span>${moveCount} ${showNavalLegend ? 'naval move' : 'move'}</span></div>
      <div class="map-legend-row"><span class="legend-swatch attack"></span><span>${attackCount} attack</span></div>
      <div class="map-legend-row"><span class="legend-swatch build"></span><span>${mobilizeCount} mobilize</span></div>
    `;
    legend.classList.toggle('quiet', mode === 'off' && moveCount === 0 && attackCount === 0 && mobilizeCount === 0);
  }
}
