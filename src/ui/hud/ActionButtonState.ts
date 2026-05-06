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
  const canBuild = buildPhase && isHumanTurn;
  if (!canBuild) {
    return {
      canBuild: false,
      title: !isHumanTurn
        ? 'Wait for your turn'
        : `Only available in ${turnStyle === 'quick' ? 'Build' : 'Purchase/Production'} phase`,
    };
  }
  return {
    canBuild: true,
    title: canMobilize
      ? 'Mobilize forces at your territories (B)'
      : 'Not enough IPCs or all territories already mobilized',
  };
}
