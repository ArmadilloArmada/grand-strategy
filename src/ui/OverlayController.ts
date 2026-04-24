/**
 * OverlayController - Manages map overlay modes (movement range / threat)
 * Extracted from HUD.ts to reduce its size
 */

import { GameState } from '../engine/GameState';
import { MapRenderer } from '../renderer/MapRenderer';

export interface OverlayCallbacks {
  showToast: (message: string, type: 'info' | 'success') => void;
}

export type OverlayMode = 'off' | 'range' | 'threat';

export class OverlayController {
  private mode: OverlayMode = 'off';

  constructor(
    private state: GameState,
    private renderer: MapRenderer,
    private callbacks: OverlayCallbacks,
  ) {}

  getMode(): OverlayMode {
    return this.mode;
  }

  setMode(mode: OverlayMode): void {
    this.mode = mode;
    this.apply();
  }

  /** Cycle through off → range → threat → off */
  cycle(): void {
    if (this.mode === 'off') this.mode = 'range';
    else if (this.mode === 'range') this.mode = 'threat';
    else this.mode = 'off';

    this.apply();
    this.renderer.render();

    const labels: Record<OverlayMode, string> = {
      off: 'Overlays off',
      range: 'Movement/attack range',
      threat: 'Threat (enemy reach)',
    };
    this.callbacks.showToast(labels[this.mode], 'info');
  }

  /** Recompute and apply the current overlay to the renderer */
  apply(): void {
    if (this.mode === 'off') {
      this.renderer.setOverlayMode('off');
    } else if (this.mode === 'range') {
      this.renderer.setOverlayMode('range');
    } else {
      this.renderer.setOverlayMode('threat', this.getThreatTerritoryIds());
    }
  }

  private getThreatTerritoryIds(): Set<string> {
    const sel = this.state.selectedTerritoryId;
    const faction = this.state.getCurrentFaction();
    if (!sel || !faction) return new Set();

    const territory = this.state.territories.get(sel);
    if (!territory) return new Set();

    const threat = new Set<string>();
    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (!adj || !adj.owner || !faction.isEnemyOf(adj.owner)) continue;
      if (adj.getTotalUnitCount() > 0) threat.add(adjId);
    }
    return threat;
  }
}
