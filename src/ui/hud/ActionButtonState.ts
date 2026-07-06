import { isBuildPhase, isCombatPhase, isMovementPhase } from './PhaseHelpers';

export interface HudPhaseFlags {
  movementPhase: boolean;
  buildPhase: boolean;
  combatPhase: boolean;
  endPhase: boolean;
}

export function getHudPhaseFlags(phase: string): HudPhaseFlags {
  return {
    movementPhase: isMovementPhase(phase),
    buildPhase: isBuildPhase(phase),
    combatPhase: isCombatPhase(phase),
    endPhase: ['collect_income', 'end'].includes(phase),
  };
}

export function getMoveButtonState(args: {
  movementPhase: boolean;
  isHumanTurn: boolean;
  hasAvailableUnits: boolean;
}): { canMove: boolean; labelHtml: string; title: string } {
  const { movementPhase, isHumanTurn, hasAvailableUnits } = args;
  const canMove = movementPhase && isHumanTurn && hasAvailableUnits;
  if (canMove) {
    return {
      canMove: true,
      labelHtml: '🚶 Move Units <kbd class="kbd-hint">M</kbd>',
      title: 'Click a highlighted friendly/empty territory to move units',
    };
  }
  return {
    canMove: false,
    labelHtml: '🚶 Move <kbd class="kbd-hint">M</kbd>',
    title: movementPhase ? 'Select one of your territories with ready units' : 'Only available in movement phases',
  };
}

export function getAttackButtonState(args: {
  movementPhase: boolean;
  combatPhase: boolean;
  isHumanTurn: boolean;
  hasAttackTargets: boolean;
  pendingMoveCount: number;
}): { labelHtml: string; disabled: boolean; title: string } {
  const { movementPhase, combatPhase, isHumanTurn, hasAttackTargets, pendingMoveCount } = args;
  if (movementPhase && isHumanTurn) {
    return {
      labelHtml: hasAttackTargets ? '⚔️ Attack Target <kbd class="kbd-hint">A</kbd>' : '⚔️ Attack <kbd class="kbd-hint">A</kbd>',
      disabled: !hasAttackTargets,
      title: hasAttackTargets
        ? 'Open battle preview for available attack target'
        : 'Select your territory, then click an enemy territory to attack',
    };
  }
  if (combatPhase) {
    const hasQueuedBattles = pendingMoveCount > 0;
    return {
      labelHtml: '⚔️ Resolve Combat',
      disabled: !hasQueuedBattles || !isHumanTurn,
      title: hasQueuedBattles ? 'Resolve queued battles' : 'No battles waiting',
    };
  }
  return {
    labelHtml: '⚔️ Attack <kbd class="kbd-hint">A</kbd>',
    disabled: true,
    title: 'Only available in movement/combat phases',
  };
}

export function getBuildButtonState(args: {
  buildPhase: boolean;
  isHumanTurn: boolean;
  canMobilize: boolean;
  turnStyle: string;
}): { canBuild: boolean; title: string } {
  const { buildPhase, isHumanTurn, canMobilize, turnStyle } = args;
  const freeformBuild = (turnStyle === 'move_for_move' || turnStyle === 'quick') && isHumanTurn;
  const canBuild = freeformBuild || (buildPhase && isHumanTurn);
  if (!canBuild) {
    return {
      canBuild: false,
      title: !isHumanTurn
        ? 'Wait for your turn'
        : turnStyle === 'move_for_move' || turnStyle === 'quick'
        ? 'Wait for your turn'
        : 'Only available in Purchase/Production phase',
    };
  }
  if (turnStyle === 'move_for_move' || turnStyle === 'quick') {
    return {
      canBuild: true,
      title: 'Open the build menu anytime (B)',
    };
  }
  return {
    canBuild: true,
    title: canMobilize
      ? 'Mobilize forces at your territories (B)'
      : 'Not enough IPCs or all territories already mobilized',
  };
}

export function getStrategicBombButtonState(args: {
  movementPhase: boolean;
  combatPhase: boolean;
  isHumanTurn: boolean;
  hasBombers: boolean;
}): { show: boolean; disabled: boolean } {
  const { movementPhase, combatPhase, isHumanTurn, hasBombers } = args;
  const show = (combatPhase || movementPhase) && isHumanTurn && hasBombers;
  return { show, disabled: !show };
}

export function getFortifyButtonState(args: {
  buildPhase: boolean;
  isHumanTurn: boolean;
  hasFortSystem: boolean;
  isOwnedLandSelection: boolean;
  isUnderFortCap: boolean;
  canBuildFort: boolean;
  upgradeCost: number | null;
  nextFortLevel: number;
}): { show: boolean; disabled: boolean; title?: string } {
  const {
    buildPhase,
    isHumanTurn,
    hasFortSystem,
    isOwnedLandSelection,
    isUnderFortCap,
    canBuildFort,
    upgradeCost,
    nextFortLevel,
  } = args;

  const show = buildPhase && isHumanTurn && hasFortSystem;
  const disabled = !(show && isOwnedLandSelection && isUnderFortCap && canBuildFort);
  if (!show || !isOwnedLandSelection) return { show, disabled };

  return {
    show,
    disabled,
    title: upgradeCost !== null
      ? `Build fortification for ${upgradeCost} IPCs (+${nextFortLevel} defense bonus)`
      : 'Territory is fully fortified',
  };
}

export function getNuclearButtonState(args: {
  isHumanTurn: boolean;
  hasTech: boolean;
  readiness: number;
  canLaunch: boolean;
}): { show: boolean; disabled: boolean; title: string; labelHtml: string } {
  const { isHumanTurn, hasTech, readiness, canLaunch } = args;
  const show = isHumanTurn && (hasTech || readiness > 0);
  if (canLaunch) {
    return {
      show,
      disabled: false,
      title: '☢️ Ready to launch! Click to select target.',
      labelHtml: '☢️ Launch Nuke',
    };
  }

  const barFill = `<span style="display:inline-block;width:${readiness}%;height:3px;background:#ef4444;border-radius:2px;vertical-align:middle;"></span><span style="display:inline-block;width:${100 - readiness}%;height:3px;background:#444;border-radius:2px;vertical-align:middle;"></span>`;
  return {
    show,
    disabled: true,
    title: `☢️ Nuclear readiness: ${readiness}% (need 100%)`,
    labelHtml: `☢️ ${readiness}%<br><span style="display:inline-flex;width:100%;gap:1px;">${barFill}</span>`,
  };
}

export function getEndPhaseButtonState(args: {
  isEndPhase: boolean;
  nextLabel: string;
  isHumanTurn: boolean;
  noPendingMoves: boolean;
  noActiveCombat: boolean;
  noSelection: boolean;
}): { labelHtml: string; shouldPulse: boolean } {
  const { isEndPhase, nextLabel, isHumanTurn, noPendingMoves, noActiveCombat, noSelection } = args;
  return {
    labelHtml: isEndPhase
      ? '✓ End Turn <kbd class="kbd-hint">↵</kbd>'
      : `➡️ ${nextLabel} <kbd class="kbd-hint">↵</kbd>`,
    shouldPulse: isHumanTurn && noPendingMoves && noActiveCombat && noSelection,
  };
}
