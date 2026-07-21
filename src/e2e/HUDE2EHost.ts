/**
 * Playwright / dev automation hooks — extracted from HUD.ts (Horizon 3).
 */

import type { GameState } from '../engine/GameState';
import type { MobilizationSystem } from '../engine/MobilizationSystem';
import type { MapRenderer } from '../renderer/MapRenderer';
import type { E2ESnapshot } from './browserApi';

export interface HUDE2EDeps {
  state: GameState;
  mobilizationSystem: MobilizationSystem;
  renderer: MapRenderer;
  focusTerritory(territoryId: string): void;
  selectAllUnitTypes(allTypes: boolean): void;
  prepareUnitDrag(fromId: string): void;
  getUnitDropKind(fromId: string, toId: string): 'move' | 'attack' | 'invalid';
  handleUnitDragDrop(fromId: string, toId: string): void;
  confirmAttackFromPreview(force?: boolean): void;
  endPhase(): void;
  renderMinimap(): void;
}

export class HUDE2EHost {
  constructor(private deps: HUDE2EDeps) {}

  runE2EUnitAction(fromId: string, toId: string, allTypes = false): 'move' | 'attack' | 'invalid' {
    this.deps.focusTerritory(fromId);
    if (allTypes) {
      this.deps.selectAllUnitTypes(false);
    }
    this.deps.prepareUnitDrag(fromId);
    const kind = this.deps.getUnitDropKind(fromId, toId);
    if (kind === 'invalid') return 'invalid';
    this.deps.handleUnitDragDrop(fromId, toId);
    return kind;
  }

  runE2EConfirmAttack(): void {
    this.deps.confirmAttackFromPreview(true);
  }

  runE2EEndTurn(): void {
    this.deps.endPhase();
  }

  runE2EMobilize(): 'mobilized' | 'none' | 'failed' {
    const options = this.deps.mobilizationSystem
      .getMobilizationOptions()
      .filter(o => o.canMobilize);
    if (options.length === 0) return 'none';
    const territoryId = options[0].territory.id;
    const result = this.deps.mobilizationSystem.mobilize(territoryId);
    if (!result.success) return 'failed';
    this.deps.renderer.render();
    this.deps.renderMinimap();
    return 'mobilized';
  }

  readE2ESnapshot(): E2ESnapshot {
    const faction = this.deps.state.getCurrentFaction();
    const owners: Record<string, string | null> = {};
    for (const [id, territory] of this.deps.state.territories) {
      owners[id] = territory.owner;
    }
    return {
      turnNumber: this.deps.state.turnNumber,
      phase: this.deps.state.currentPhase,
      currentFactionId: this.deps.state.currentFactionId,
      isHumanTurn: faction?.controlledBy === 'human',
      owners,
    };
  }

  readE2EActiveFactionCount(): number {
    return this.deps.state.factionRegistry.getActive().length;
  }

  dismissE2EOverlays(): void {
    document.getElementById('scenario-briefing-overlay')?.remove();
    document.getElementById('turn-recap-card')?.remove();
    document.getElementById('phase-recap-card')?.remove();
    document.getElementById('event-modal')?.classList.add('hidden');
    document.getElementById('campaign-briefing-overlay')?.remove();
    document.getElementById('campaign-debriefing-overlay')?.remove();
    document.getElementById('first-war-room')?.remove();
    document.getElementById('victory-modal')?.remove();
  }

  e2eBoostTerritory(territoryId: string, unitTypeId: string, count: number): void {
    const territory = this.deps.state.territories.get(territoryId);
    if (!territory || count <= 0) return;
    territory.addUnits(unitTypeId, count);
    this.deps.renderer.render();
    this.deps.renderMinimap();
  }
}
