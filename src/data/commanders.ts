/**
 * commanders.ts - Named general/commander pool per faction
 * Commanders attach to unit stacks and provide combat bonuses.
 * They are assigned at game start to capital territories.
 */

import { Commander } from './Territory';

export interface CommanderPool {
  factionId: string;
  commanders: Commander[];
}

export const COMMANDER_POOLS: CommanderPool[] = [
  {
    factionId: 'atlantic_alliance',
    commanders: [
      {
        id: 'aa_1', name: 'General Marshall', attackBonus: 1, defenseBonus: 1, factionId: 'atlantic_alliance',
        ability: { type: 'inspire', name: 'Inspire', description: 'All units in this territory gain +1 defense for 1 round.', cooldownTurns: 3 },
      },
      {
        id: 'aa_2', name: 'Admiral Hayes', attackBonus: 2, defenseBonus: 0, factionId: 'atlantic_alliance',
        ability: { type: 'blitz', name: 'Blitz Order', description: 'Units in this combat gain +1 attack on the next roll.', cooldownTurns: 4 },
      },
      {
        id: 'aa_3', name: 'Colonel Reyes', attackBonus: 0, defenseBonus: 2, factionId: 'atlantic_alliance',
        ability: { type: 'fortify', name: 'Fortify', description: 'This territory gains +2 defense bonus for 1 full turn.', cooldownTurns: 4 },
      },
    ],
  },
  {
    factionId: 'eastern_coalition',
    commanders: [
      {
        id: 'ec_1', name: 'Marshal Volkov', attackBonus: 1, defenseBonus: 1, factionId: 'eastern_coalition',
        ability: { type: 'rally', name: 'Rally', description: 'Restore 1 casualty per round in the current combat (once per battle).', cooldownTurns: 3 },
      },
      {
        id: 'ec_2', name: 'General Petrov', attackBonus: 2, defenseBonus: 0, factionId: 'eastern_coalition',
        ability: { type: 'blitz', name: 'Blitz Order', description: 'Units in this combat gain +1 attack on the next roll.', cooldownTurns: 4 },
      },
      {
        id: 'ec_3', name: 'Colonel Ivanova', attackBonus: 0, defenseBonus: 2, factionId: 'eastern_coalition',
        ability: { type: 'fortify', name: 'Fortify', description: 'This territory gains +2 defense bonus for 1 full turn.', cooldownTurns: 4 },
      },
    ],
  },
  {
    factionId: 'pacific_union',
    commanders: [
      {
        id: 'pu_1', name: 'Admiral Tanaka', attackBonus: 1, defenseBonus: 1, factionId: 'pacific_union',
        ability: { type: 'inspire', name: 'Inspire', description: 'All units in this territory gain +1 defense for 1 round.', cooldownTurns: 3 },
      },
      {
        id: 'pu_2', name: 'General Yamamoto', attackBonus: 2, defenseBonus: 0, factionId: 'pacific_union',
        ability: { type: 'blitz', name: 'Blitz Order', description: 'Units in this combat gain +1 attack on the next roll.', cooldownTurns: 4 },
      },
      {
        id: 'pu_3', name: 'Colonel Kim', attackBonus: 0, defenseBonus: 2, factionId: 'pacific_union',
        ability: { type: 'fortify', name: 'Fortify', description: 'This territory gains +2 defense bonus for 1 full turn.', cooldownTurns: 4 },
      },
    ],
  },
  {
    factionId: 'southern_federation',
    commanders: [
      {
        id: 'sf_1', name: 'General Romero', attackBonus: 1, defenseBonus: 1, factionId: 'southern_federation',
        ability: { type: 'rally', name: 'Rally', description: 'Restore 1 casualty per round in the current combat (once per battle).', cooldownTurns: 3 },
      },
      {
        id: 'sf_2', name: 'Admiral Santos', attackBonus: 2, defenseBonus: 0, factionId: 'southern_federation',
        ability: { type: 'blitz', name: 'Blitz Order', description: 'Units in this combat gain +1 attack on the next roll.', cooldownTurns: 4 },
      },
      {
        id: 'sf_3', name: 'Colonel Okafor', attackBonus: 0, defenseBonus: 2, factionId: 'southern_federation',
        ability: { type: 'fortify', name: 'Fortify', description: 'This territory gains +2 defense bonus for 1 full turn.', cooldownTurns: 4 },
      },
    ],
  },
];

/**
 * Get the starting commander for a faction (first in pool)
 */
export function getStartingCommander(factionId: string): Commander | null {
  const pool = COMMANDER_POOLS.find(p => p.factionId === factionId);
  return pool?.commanders[0] ?? null;
}
