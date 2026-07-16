/**
 * Pure text helpers for the New Game setup summary. Extracted from HUD so the
 * branching copy logic is testable without a DOM.
 */

import type { FactionData } from '../data/Faction';
import type { TurnStyle, VictoryType } from '../engine/GameConfig';

/** Dropdown label for a faction option, e.g. "Atlantic Alliance - Industrial Powerhouse". */
export function getFactionOptionLabel(faction: FactionData): string {
  return `${faction.name}${faction.playstyle ? ` - ${faction.playstyle}` : ''}`;
}

/** One-line strategic-plan hint shown in the setup summary. */
export function buildSetupPlanLine(
  mapId: string,
  victoryType: VictoryType,
  turnStyle: TurnStyle,
  aiDifficulty: string,
  aiPersonality: string,
): string {
  const mapPlan = mapId.includes('mega')
    ? 'expect broad fronts; use overlays and secure factories early'
    : mapId.includes('pacific') || mapId.includes('archipelago')
      ? 'control sea lanes before overcommitting land forces'
      : mapId.includes('skirmish') || mapId === 'tutorial'
        ? 'short opening; first captures decide tempo'
        : 'balance capital defense with one early border attack';
  const victoryPlan = victoryType === 'economic'
    ? 'protect production'
    : victoryType === 'domination'
      ? 'expand steadily'
      : victoryType === 'elimination'
        ? 'preserve armies'
        : 'watch enemy capitals';
  const aiPlan = aiDifficulty === 'hard' || ['aggressive', 'blitz', 'adaptive'].includes(aiPersonality)
    ? 'AI pressure will arrive early'
    : aiPersonality === 'economic'
      ? 'AI will build before striking'
      : aiPersonality === 'defensive'
        ? 'AI will punish weak attacks'
        : 'AI posture is flexible';
  const pace = turnStyle === 'classic' ? 'classic pacing' : turnStyle === 'quick' ? 'faster decisions' : 'variant pacing';
  return `${mapPlan}; ${victoryPlan}; ${aiPlan}; ${pace}`;
}
