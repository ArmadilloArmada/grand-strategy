/**
 * Dedicated HUD chrome for Move-for-Move turn style.
 * Replaces the generic 6-step phase rail with Build → Alternating Moves → Collect.
 */

import { GameState } from '../../engine/GameState';
import { TurnManager } from '../../engine/TurnManager';
import { isBuildPhase, isMovementPhase } from './PhaseHelpers';

export type MoveForMoveMacroPhase = 'build' | 'move' | 'end';

export interface MoveForMoveHUDView {
  macroPhase: MoveForMoveMacroPhase;
  turnOwnerName: string;
  turnOwnerColor: string;
  activeFactionName: string;
  activeFactionColor: string;
  isHumanActive: boolean;
  isSegmentActive: boolean;
  canPass: boolean;
  endButtonLabel: string;
  contextLine: string;
  detailLine: string;
}

export function buildMoveForMoveView(
  state: GameState,
  turnManager: TurnManager,
): MoveForMoveHUDView {
  const phase = state.currentPhase as string;
  const faction = state.getCurrentFaction();
  const ownerId = turnManager.moveForMoveTurnOwnerId;
  const owner = ownerId ? state.factionRegistry.get(ownerId) : faction;
  const segmentActive = turnManager.isMoveForMoveSegmentActive();

  let macroPhase: MoveForMoveMacroPhase = 'build';
  if (isBuildPhase(phase)) macroPhase = 'build';
  else if (isMovementPhase(phase) && segmentActive) macroPhase = 'move';
  else macroPhase = 'end';

  const isHumanActive = faction?.controlledBy === 'human';
  const canPass = macroPhase === 'move' && isHumanActive;

  let endButtonLabel = 'End Phase';
  let contextLine = 'Select a territory to begin.';
  let detailLine = '';

  if (macroPhase === 'build') {
    endButtonLabel = 'Done Building';
    contextLine = isHumanActive
      ? 'Mobilize units, then finish building to open the shared move round.'
      : `${faction?.name ?? 'Opponent'} is mobilizing…`;
    detailLine = 'You can keep buying until you click Done Building.';
  } else if (macroPhase === 'move') {
    endButtonLabel = owner?.controlledBy === 'human' ? 'Finish Move Round' : 'Finish Moving';
    if (isHumanActive) {
      contextLine = 'Your move — relocate one stack or attack, then the next player goes.';
      detailLine = 'Green = move, red = attack. Use Pass if you want to skip this turn.';
    } else {
      contextLine = `${faction?.name ?? 'Opponent'} is moving…`;
      detailLine = owner
        ? `${owner.name}'s move round — players alternate one move at a time.`
        : 'Players alternate one move at a time.';
    }
  } else {
    endButtonLabel = 'Collect & End Turn';
    contextLine = isHumanActive
      ? 'Collect income and review your turn.'
      : `${faction?.name ?? 'Opponent'} is collecting income…`;
    detailLine = 'Next up: your build phase when your turn comes around again.';
  }

  return {
    macroPhase,
    turnOwnerName: owner?.name ?? faction?.name ?? '—',
    turnOwnerColor: owner?.colorLight ?? owner?.color ?? '#94a3b8',
    activeFactionName: faction?.name ?? '—',
    activeFactionColor: faction?.colorLight ?? faction?.color ?? '#94a3b8',
    isHumanActive,
    isSegmentActive: segmentActive,
    canPass,
    endButtonLabel,
    contextLine,
    detailLine,
  };
}

export class MoveForMoveHUD {
  private mounted = false;

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;

    const ribbonCenter = document.querySelector('.ribbon-center');
    if (!ribbonCenter || document.getElementById('mfm-progress')) return;

    const rail = document.createElement('div');
    rail.id = 'mfm-progress';
    rail.className = 'mfm-progress hidden';
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', 'Move for move phase');
    rail.innerHTML = `
      <div class="mfm-step" data-mfm-step="build">
        <span class="mfm-step-icon">🏭</span>
        <span class="mfm-step-label">Build</span>
      </div>
      <div class="mfm-connector"></div>
      <div class="mfm-step" data-mfm-step="move">
        <span class="mfm-step-icon">↔️</span>
        <span class="mfm-step-label">Move Round</span>
      </div>
      <div class="mfm-connector"></div>
      <div class="mfm-step" data-mfm-step="end">
        <span class="mfm-step-icon">💰</span>
        <span class="mfm-step-label">Collect</span>
      </div>
      <div id="mfm-status" class="mfm-status"></div>
    `;
    ribbonCenter.appendChild(rail);

    const actionLeft = document.querySelector('.rba-left');
    if (actionLeft && !document.getElementById('btn-mfm-pass')) {
      const passBtn = document.createElement('button');
      passBtn.id = 'btn-mfm-pass';
      passBtn.className = 'mfm-pass-btn hidden';
      passBtn.type = 'button';
      passBtn.title = 'Skip your move and pass to the next player';
      passBtn.setAttribute('aria-label', 'Pass move');
      passBtn.textContent = '⏭ Pass Move';
      const buildBtn = document.getElementById('btn-build');
      if (buildBtn?.nextSibling) {
        actionLeft.insertBefore(passBtn, buildBtn.nextSibling);
      } else {
        actionLeft.appendChild(passBtn);
      }
    }
  }

  setEnabled(enabled: boolean): void {
    document.body.classList.toggle('move-for-move-mode', enabled);
    document.getElementById('mfm-progress')?.classList.toggle('hidden', !enabled);
    document.getElementById('phase-progress')?.classList.toggle('hidden', enabled);
    if (!enabled) {
      document.body.classList.remove('mfm-move-segment');
    }
  }

  render(view: MoveForMoveHUDView): void {
    this.mount();

    document.body.classList.toggle('mfm-move-segment', view.macroPhase === 'move' && view.isSegmentActive);

    const steps = ['build', 'move', 'end'];
    const activeIdx = steps.indexOf(view.macroPhase);

    document.querySelectorAll<HTMLElement>('.mfm-step').forEach(el => {
      const step = el.dataset.mfmStep ?? '';
      const idx = steps.indexOf(step);
      el.classList.remove('active', 'completed', 'active-pop');
      if (idx < activeIdx) el.classList.add('completed');
      else if (idx === activeIdx) el.classList.add('active', 'active-pop');
    });

    document.querySelectorAll('.mfm-connector').forEach((el, i) => {
      el.classList.toggle('completed', i < activeIdx);
    });

    const statusEl = document.getElementById('mfm-status');
    if (statusEl) {
      if (view.macroPhase === 'move' && view.isSegmentActive) {
        statusEl.innerHTML = view.isHumanActive
          ? `<strong style="color:${view.activeFactionColor}">Your move</strong> · ${view.turnOwnerName}'s round`
          : `<span style="color:${view.activeFactionColor}">${view.activeFactionName}</span> moving · ${view.turnOwnerName}'s round`;
      } else if (view.macroPhase === 'build') {
        statusEl.innerHTML = `<span style="color:${view.activeFactionColor}">${view.activeFactionName}</span> building`;
      } else {
        statusEl.innerHTML = `<span style="color:${view.activeFactionColor}">${view.activeFactionName}</span> collecting`;
      }
    }

    const passBtn = document.getElementById('btn-mfm-pass') as HTMLButtonElement | null;
    if (passBtn) {
      passBtn.classList.toggle('hidden', !view.canPass);
      passBtn.disabled = !view.canPass;
    }

    const contextEl = document.getElementById('context-helper-text');
    if (contextEl) {
      contextEl.innerHTML = `<strong>${view.contextLine}</strong>${view.detailLine ? `<br><span class="mfm-detail">${view.detailLine}</span>` : ''}`;
    }

    const phaseEl = document.getElementById('current-phase');
    if (phaseEl) {
      const labels: Record<MoveForMoveMacroPhase, string> = {
        build: '🏭 Build Phase',
        move: '↔️ Move for Move',
        end: '💰 Collect Income',
      };
      phaseEl.textContent = labels[view.macroPhase];
      phaseEl.classList.remove('hidden');
    }
  }

  getEndButtonLabel(view: MoveForMoveHUDView): string {
    return view.endButtonLabel;
  }
}
