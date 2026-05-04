/**
 * UndoController - Manages move-level and phase-level undo/redo
 * Extracted from HUD.ts to reduce its size
 */

import { GameState } from '../engine/GameState';
import { MapRenderer } from '../renderer/MapRenderer';
import { soundManager } from '../audio/SoundManager';

export interface UndoCallbacks {
  showToast: (message: string, type: 'info' | 'success') => void;
  renderMinimap: () => void;
  updateTurnInfo: () => void;
  updatePhaseInfo: () => void;
  updateFactionPanel: () => void;
  updateActionButtons: () => void;
  /** Reverse a mobilize: remove spawned units, refund IPCs, unmark territory. */
  undoMobilize: (territoryId: string, cost: number, units: { unitTypeId: string; count: number }[]) => void;
}

interface MoveRecord {
  type: 'move' | 'queue' | 'mobilize';
  data: any;
}

export class UndoController {
  private moveHistory: MoveRecord[] = [];
  private phaseSnapshots: string[] = [];
  private redoSnapshots: string[] = [];

  constructor(
    private state: GameState,
    private renderer: MapRenderer,
    private callbacks: UndoCallbacks,
  ) {}

  // ── Snapshot management ──────────────────────────────────────────────────

  /** Save a JSON snapshot of the current game state (call at start of each phase) */
  pushPhaseSnapshot(json: string): void {
    this.phaseSnapshots.push(json);
    // Keep a rolling window of the last 10 phase snapshots to cap memory
    if (this.phaseSnapshots.length > 10) {
      this.phaseSnapshots.shift();
    }
  }

  clearPhaseSnapshots(): void {
    this.phaseSnapshots = [];
    this.redoSnapshots = [];
  }

  // ── Move history ──────────────────────────────────────────────────────────

  recordMove(record: MoveRecord): void {
    this.moveHistory.push(record);
  }

  clearMoveHistory(): void {
    this.moveHistory = [];
  }

  // ── Can undo/redo? ────────────────────────────────────────────────────────

  canUndo(): boolean {
    return this.moveHistory.length > 0 || this.phaseSnapshots.length >= 2;
  }

  canRedo(): boolean {
    return this.redoSnapshots.length > 0;
  }

  // ── Undo/Redo actions ────────────────────────────────────────────────────

  /** Undo the last individual move, or fall back to phase-level undo */
  undo(): void {
    if (this.moveHistory.length > 0) {
      this.undoLastMove();
    } else {
      this.undoPhase();
    }
    this.updateButtons();
  }

  /** Redo the last undone phase snapshot */
  redo(): void {
    if (this.redoSnapshots.length === 0) {
      this.callbacks.showToast('Nothing to redo', 'info');
      return;
    }
    const snapshot = this.redoSnapshots.pop()!;
    // Save current state to phaseSnapshots so we can undo again
    this.phaseSnapshots.push(this.state.saveToJSON());
    if (this.phaseSnapshots.length > 10) this.phaseSnapshots.shift();

    this.state.loadFromJSON(snapshot);
    this.moveHistory = [];
    this.renderer.render();
    this.callbacks.renderMinimap();
    this.callbacks.updateTurnInfo();
    this.callbacks.updatePhaseInfo();
    this.callbacks.updateFactionPanel();
    this.callbacks.updateActionButtons();
    this.callbacks.showToast('Redo!', 'success');
    this.updateButtons();
  }

  private undoLastMove(): void {
    const lastAction = this.moveHistory.pop()!;

    if (lastAction.type === 'queue') {
      const idx = this.state.pendingMoves.findIndex(
        m => m.fromTerritoryId === lastAction.data.from && m.toTerritoryId === lastAction.data.to,
      );
      if (idx !== -1) this.state.pendingMoves.splice(idx, 1);
      this.callbacks.showToast('Attack cancelled', 'info');
    } else if (lastAction.type === 'move') {
      const from = this.state.territories.get(lastAction.data.to);
      const to = this.state.territories.get(lastAction.data.from);
      if (from && to) {
        for (const unit of lastAction.data.units) {
          const destUnit = from.units.find((u: any) => u.unitTypeId === unit.unitTypeId);
          if (destUnit && destUnit.movedCount) {
            destUnit.movedCount = Math.max(0, destUnit.movedCount - unit.count);
          }
          from.removeUnits(unit.unitTypeId, unit.count);
          to.addUnits(unit.unitTypeId, unit.count);
        }
      }
      this.callbacks.showToast('Move undone', 'info');
    } else if (lastAction.type === 'mobilize') {
      const { territoryId, cost, units } = lastAction.data as {
        territoryId: string;
        cost: number;
        units: { unitTypeId: string; count: number }[];
      };
      this.callbacks.undoMobilize(territoryId, cost, units);
      this.callbacks.showToast('Mobilization undone', 'info');
    }

    this.callbacks.updateActionButtons();
    this.renderer.render();
    soundManager.play('click');
  }

  private undoPhase(): void {
    if (this.phaseSnapshots.length < 2) {
      this.callbacks.showToast('Nothing to undo', 'info');
      return;
    }

    // Save current state to redo stack before reverting
    const currentSnapshot = this.phaseSnapshots.pop()!;
    this.redoSnapshots.push(currentSnapshot);
    if (this.redoSnapshots.length > 10) this.redoSnapshots.shift();

    const previousSnapshot = this.phaseSnapshots[this.phaseSnapshots.length - 1];
    if (!previousSnapshot) {
      this.callbacks.showToast('Nothing to undo', 'info');
      return;
    }

    this.state.loadFromJSON(previousSnapshot);
    this.moveHistory = [];

    this.renderer.render();
    this.callbacks.renderMinimap();
    this.callbacks.updateTurnInfo();
    this.callbacks.updatePhaseInfo();
    this.callbacks.updateFactionPanel();
    this.callbacks.updateActionButtons();

    this.callbacks.showToast('Phase undone!', 'success');
    soundManager.play('click');
  }

  // ── Button sync ───────────────────────────────────────────────────────────

  /** @deprecated Use updateButtons() */
  updateButton(): void { this.updateButtons(); }

  updateButtons(): void {
    const undoBtn = document.getElementById('btn-undo') as HTMLButtonElement | null;
    const redoBtn = document.getElementById('btn-redo') as HTMLButtonElement | null;

    if (undoBtn) {
      undoBtn.disabled = !this.canUndo();
      if (this.moveHistory.length > 0) {
        const last = this.moveHistory[this.moveHistory.length - 1];
        if (last.type === 'mobilize') {
          undoBtn.textContent = '↩️ Undo Mobilize';
          undoBtn.title = 'Undo last mobilization';
        } else {
          undoBtn.textContent = '↩️ Undo Move';
          undoBtn.title = 'Undo last move';
        }
      } else if (this.phaseSnapshots.length >= 2) {
        undoBtn.textContent = '↩️ Undo Phase';
        undoBtn.title = 'Revert to start of phase';
      } else {
        undoBtn.textContent = '↩️ Back';
        undoBtn.title = 'Nothing to undo';
      }
    }

    if (redoBtn) {
      redoBtn.disabled = !this.canRedo();
      redoBtn.title = this.canRedo() ? 'Redo last undone phase' : 'Nothing to redo';
    }
  }
}
