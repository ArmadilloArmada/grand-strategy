import type { TurnStyle } from '../../engine/GameConfig';

const PHASE_SEQUENCES: Record<string, string[]> = {
  quick: ['play', 'end'],
  move_for_move: ['play'],
  classic: ['purchase', 'combat_move', 'combat', 'noncombat_move', 'production', 'collect_income'],
  simple: ['move', 'attack', 'build', 'collect_income'],
  civilization: ['build', 'orders', 'resolve', 'end'],
  chess: ['action'],
};

const ADVANCED_PHASE_NAMES: Record<string, string> = {
  purchase: 'Mobilize',
  combat_move: 'Combat Move',
  combat: 'Combat',
  noncombat_move: 'Non-Combat Move',
  production: 'Mobilize',
  collect_income: 'Collect Income',
  build: 'Mobilize',
  move: 'Move',
  attack: 'Attack',
  play: 'Command',
  end: 'End Turn',
  orders: 'Orders',
  resolve: 'Resolve',
  action: 'Action',
};

const SIMPLE_PHASE_NAMES: Record<string, string> = {
  purchase: 'Build',
  combat_move: 'Combat Move',
  combat: 'Combat',
  noncombat_move: 'Move',
  production: 'Build',
  collect_income: 'End Turn',
  build: 'Mobilize',
  move: 'Move',
  attack: 'Attack',
  play: 'Command',
  end: 'End Turn',
  orders: 'Orders',
  resolve: 'Resolve',
  action: 'Action',
};

/** Short phase name shown in the ribbon when simple mode is on. */
export function getSimplePhaseLabel(
  phase: string,
  _turnStyle: TurnStyle,
  fallbackDisplayName: string,
): string {
  return SIMPLE_PHASE_NAMES[phase] ?? fallbackDisplayName;
}

/** Label for the ribbon end button when advancing to the next phase. */
export function getNextPhaseButtonLabel(
  currentPhase: string,
  turnStyle: TurnStyle,
  simpleMode: boolean,
): string {
  if (turnStyle === 'quick' && currentPhase === 'play') {
    return 'End Turn';
  }
  if (turnStyle === 'move_for_move' && currentPhase === 'play') {
    return 'End Turn';
  }

  const seq = PHASE_SEQUENCES[turnStyle] ?? PHASE_SEQUENCES.quick;
  const idx = seq.indexOf(currentPhase);
  const nextPhase = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : null;
  const names = simpleMode ? SIMPLE_PHASE_NAMES : ADVANCED_PHASE_NAMES;
  return nextPhase ? (names[nextPhase] ?? nextPhase) : 'Next';
}

/** Quick/simple command phase: ribbon button should read as End Turn, not next-phase name. */
export function isQuickPlayEndTurn(turnStyle: TurnStyle, phase: string, isHumanTurn: boolean): boolean {
  return turnStyle === 'quick' && phase === 'play' && isHumanTurn;
}

/** Co-pilot / advisor primary action when the player should finish the turn or phase. */
export function getAdvisorEndLabel(turnStyle: TurnStyle, phase: string): string {
  if (turnStyle === 'quick' || turnStyle === 'move_for_move' || phase === 'play') {
    return 'End Turn';
  }
  if (['collect_income', 'end'].includes(phase)) {
    return 'End Turn';
  }
  return 'End Phase';
}
