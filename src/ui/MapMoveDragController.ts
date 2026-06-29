import type { MapRenderer } from '../renderer/MapRenderer';
import type { GameState } from '../engine/GameState';
import { isMovementPhase } from './hud/PhaseHelpers';
import { canIssueOrdersFromTerritory, territoryHasAvailableUnits } from '../engine/territoryControl';

export type UnitDropKind = 'move' | 'attack' | 'invalid';

export interface UnitDragHandlers {
  canDragFrom(territoryId: string): boolean;
  onDragStart(fromTerritoryId: string): void;
  onDragHover(toTerritoryId: string | null): void;
  onDragDrop(fromTerritoryId: string, toTerritoryId: string): void;
  onDragCancel(): void;
  getDropKind(fromTerritoryId: string, toTerritoryId: string): UnitDropKind;
}

/**
 * Wires map drag-and-drop movement onto MapRenderer.
 */
export class MapMoveDragController {
  constructor(
    private renderer: MapRenderer,
    private handlers: UnitDragHandlers,
  ) {
    this.renderer.setUnitDragController({
      canDragFrom: (id) => this.handlers.canDragFrom(id),
      onDragStart: (id) => this.handlers.onDragStart(id),
      onDragHover: (id) => this.handlers.onDragHover(id),
      onDragDrop: (from, to) => this.handlers.onDragDrop(from, to),
      onDragCancel: () => this.handlers.onDragCancel(),
      getDropKind: (from, to) => this.handlers.getDropKind(from, to),
    });
  }

  static canDragFromTerritory(state: GameState, territoryId: string): boolean {
    const faction = state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'human') return false;
    if (!isMovementPhase(state.currentPhase)) return false;
    const territory = state.territories.get(territoryId);
    if (!territory) return false;
    return canIssueOrdersFromTerritory(territory, faction.id) && territoryHasAvailableUnits(territory);
  }
}
