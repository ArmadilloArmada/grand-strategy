/**
 * OverlayController - Manages map overlay modes (movement range / threat / economic)
 * Extracted from HUD.ts to reduce its size
 */

import { GameState } from '../engine/GameState';
import { MapRenderer } from '../renderer/MapRenderer';
import { getThreatenedTerritoryIds } from '../engine/ThreatAnalyzer';

export interface OverlayCallbacks {
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export type OverlayMode = 'off' | 'range' | 'threat' | 'economic';

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

  /** Cycle through off → range → threat → economic → off */
  cycle(): void {
    if (this.mode === 'off') this.mode = 'range';
    else if (this.mode === 'range') this.mode = 'threat';
    else if (this.mode === 'threat') this.mode = 'economic';
    else this.mode = 'off';

    this.apply();
    this.renderer.render();

    const labels: Record<OverlayMode, string> = {
      off: 'Overlays off',
      range: 'Movement/attack range',
      threat: 'Threatened territories',
      economic: 'Economic heat map (IPC values)',
    };
    this.callbacks.showToast(labels[this.mode], 'info');
  }

  /** Recompute and apply the current overlay to the renderer */
  apply(): void {
    if (this.mode === 'off') {
      this.renderer.setOverlayMode('off');
    } else if (this.mode === 'range') {
      this.renderer.setOverlayMode('range');
    } else if (this.mode === 'threat') {
      this.renderer.setOverlayMode('threat', this.getThreatTerritoryIds());
    } else {
      this.renderer.setOverlayMode('economic');
    }
  }

  private getThreatTerritoryIds(): Set<string> {
    const faction = this.state.getCurrentFaction();
    if (!faction) return new Set();
    return getThreatenedTerritoryIds(this.state, faction);
  }
}
