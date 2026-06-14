/**
 * Dedicated HUD chrome for Move-for-Move turn style.
 * No build/move/collect phases — build is on-demand, End Turn collects income.
 */

import { GameState } from '../../engine/GameState';
import { TurnManager } from '../../engine/TurnManager';

export interface MoveForMoveHUDView {
  turnOwnerName: string;
  turnOwnerColor: string;
  activeFactionName: string;
  activeFactionColor: string;
  isHumanActive: boolean;
  isTurnOwner: boolean;
  canPass: boolean;
  canEndTurn: boolean;
  endButtonLabel: string;
  contextLine: string;
  detailLine: string;
}

export function buildMoveForMoveView(
  state: GameState,
  turnManager: TurnManager,
): MoveForMoveHUDView {
  const faction = state.getCurrentFaction();
  const ownerId = turnManager.moveForMoveTurnOwnerId;
  const owner = ownerId ? state.factionRegistry.get(ownerId) : faction;
  const isHumanActive = faction?.controlledBy === 'human';
  const isTurnOwner = Boolean(faction && ownerId && faction.id === ownerId);
  const canPass = isHumanActive && turnManager.isMoveForMoveSegmentActive();
  const canEndTurn = Boolean(
    isHumanActive &&
    ownerId &&
    faction &&
    faction.id === ownerId &&
    faction.controlledBy === 'human',
  );

  let contextLine = 'Select a territory to move or attack.';
  let detailLine = '';

  if (isHumanActive) {
    if (isTurnOwner) {
      contextLine = 'Your turn — click 🏭 Build anytime, then move one stack at a time.';
      detailLine = 'Each move passes to the next player. End Turn when finished.';
    } else {
      contextLine = 'Your move — relocate one stack or attack, then the next player goes.';
      detailLine = 'You can still open 🏭 Build before or after moving.';
    }
  } else if (faction) {
    contextLine = `${faction.name} is playing…`;
    detailLine = owner
      ? `${owner.name}'s turn window — players alternate one move at a time.`
      : 'Players alternate one move at a time.';
  }

  return {
    turnOwnerName: owner?.name ?? faction?.name ?? '—',
    turnOwnerColor: owner?.colorLight ?? owner?.color ?? '#94a3b8',
    activeFactionName: faction?.name ?? '—',
    activeFactionColor: faction?.colorLight ?? faction?.color ?? '#94a3b8',
    isHumanActive,
    isTurnOwner,
    canPass,
    canEndTurn,
    endButtonLabel: 'End Turn',
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
    rail.setAttribute('role', 'status');
    rail.setAttribute('aria-label', 'Move for move status');
    rail.innerHTML = `
      <span class="mfm-mode-badge">↔️ Move for Move</span>
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

    document.body.classList.toggle('mfm-move-segment', view.isHumanActive);

    const statusEl = document.getElementById('mfm-status');
    if (statusEl) {
      if (view.isHumanActive) {
        statusEl.innerHTML = view.isTurnOwner
          ? `<strong style="color:${view.activeFactionColor}">Your turn</strong> · ${view.turnOwnerName}`
          : `<strong style="color:${view.activeFactionColor}">Your move</strong> · ${view.turnOwnerName}'s turn`;
      } else {
        statusEl.innerHTML = `<span style="color:${view.activeFactionColor}">${view.activeFactionName}</span> · ${view.turnOwnerName}'s turn window`;
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
      phaseEl.textContent = '↔️ Move for Move';
      phaseEl.classList.remove('hidden');
    }
  }
}
