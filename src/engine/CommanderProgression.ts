/**
 * CommanderProgression - XP, leveling, and trait system for named commanders.
 *
 * Commanders earn XP from battles. Each level-up unlocks a new trait that
 * provides a permanent combat bonus. At level 5 (Legendary) the commander
 * gains a unique capstone bonus.
 *
 * XP thresholds: 10 / 30 / 60 / 100 (cumulative) for levels 2-5.
 */

import { Commander, CommanderTrait, CommanderTraitId } from '../data/Territory';
import { CombatState } from './CombatResolver';

// ── Trait pool ────────────────────────────────────────────────────────────────

export const ALL_TRAITS: Record<CommanderTraitId, CommanderTrait> = {
  iron_discipline: {
    id: 'iron_discipline',
    name: 'Iron Discipline',
    description: '+1 defense for all units in this commander\'s combat.',
  },
  aggressive_push: {
    id: 'aggressive_push',
    name: 'Aggressive Push',
    description: '+1 attack for all units in this commander\'s combat.',
  },
  veteran_eye: {
    id: 'veteran_eye',
    name: 'Veteran\'s Eye',
    description: 'Veteran units under this commander count as double-veteran (+2 instead of +1).',
  },
  last_stand: {
    id: 'last_stand',
    name: 'Last Stand',
    description: '+2 defense for all units when fewer than 3 active units remain.',
  },
  shock_doctrine: {
    id: 'shock_doctrine',
    name: 'Shock Doctrine',
    description: '+1 attack in round 1 of combat only.',
  },
  supply_master: {
    id: 'supply_master',
    name: 'Supply Master',
    description: 'This commander\'s units ignore the out-of-supply -1 penalty.',
  },
  air_coordination: {
    id: 'air_coordination',
    name: 'Air Coordination',
    description: '+1 attack and defense for air units fighting in the same combat.',
  },
  legendary: {
    id: 'legendary',
    name: 'Legendary',
    description: '+1 attack AND +1 defense for all units. (Capstone — Level 5)',
  },
};

// XP required to reach each level (cumulative)
const XP_THRESHOLDS = [0, 10, 30, 60, 100]; // indices 0-4 = levels 1-5

// Trait unlocked at each level (level 2-5)
const LEVEL_TRAITS: CommanderTraitId[][] = [
  [],                                     // level 1 — no trait
  ['iron_discipline', 'aggressive_push'], // level 2 — choose one (attacker vs defender playstyle)
  ['veteran_eye', 'shock_doctrine'],      // level 3
  ['last_stand', 'supply_master', 'air_coordination'], // level 4
  ['legendary'],                          // level 5 — always legendary
];

// ── XP awards ─────────────────────────────────────────────────────────────────

/** XP granted to the winning side's commander after a battle. */
const XP_WIN = 8;
/** XP granted to the losing side's commander (survived battle). */
const XP_LOSS = 3;
/** Extra XP for every 3 enemy units killed. */
const XP_PER_KILLS = 2;

// ── Commander death chance ────────────────────────────────────────────────────
// When a side loses, their commander has a small chance of being killed.
const COMMANDER_DEATH_CHANCE_ON_LOSS = 0.15;

// ── Public API ────────────────────────────────────────────────────────────────

export interface XPResult {
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  /** Trait IDs the player may now choose from (if leveled up). Caller picks one. */
  traitChoices: CommanderTraitId[];
  commanderDied: boolean;
}

/**
 * Award XP to a commander after a battle and handle leveling.
 * Returns information about the level-up (if any) so the UI can prompt
 * the player to choose a trait.
 *
 * For AI factions the first available trait choice is auto-selected.
 */
export function awardBattleXP(
  commander: Commander,
  won: boolean,
  enemiesKilled: number,
  isPlayerFaction: boolean,
): XPResult {
  const prev = getLevel(commander);
  const prevXP = commander.xp ?? 0;
  const killBonus = Math.floor(enemiesKilled / 3) * XP_PER_KILLS;
  const gained = (won ? XP_WIN : XP_LOSS) + killBonus;

  // Update records
  commander.xp = prevXP + gained;
  if (won) commander.battlesWon = (commander.battlesWon ?? 0) + 1;
  else     commander.battlesLost = (commander.battlesLost ?? 0) + 1;

  // Check for death before leveling
  let commanderDied = false;
  if (!won && Math.random() < COMMANDER_DEATH_CHANCE_ON_LOSS) {
    commanderDied = true;
    return { previousLevel: prev, newLevel: prev, leveledUp: false, traitChoices: [], commanderDied: true };
  }

  const newLevel = getLevel(commander);
  const leveledUp = newLevel > prev;
  let traitChoices: CommanderTraitId[] = [];

  if (leveledUp) {
    // Traits available for this new level (filter out already-owned)
    const ownedIds = new Set((commander.traits ?? []).map(t => t.id));
    const candidates = LEVEL_TRAITS[newLevel - 1].filter(id => !ownedIds.has(id));

    if (isPlayerFaction) {
      // Return choices — caller / UI must call selectTrait()
      traitChoices = candidates;
    } else {
      // AI: auto-pick first candidate
      if (candidates.length > 0) selectTrait(commander, candidates[0]);
    }
  }

  return { previousLevel: prev, newLevel, leveledUp, traitChoices, commanderDied };
}

/**
 * Permanently grant a trait to a commander.
 * Call this after the player picks from the trait choices returned by awardBattleXP.
 */
export function selectTrait(commander: Commander, traitId: CommanderTraitId): void {
  if (!commander.traits) commander.traits = [];
  const already = commander.traits.find(t => t.id === traitId);
  if (!already) commander.traits.push(ALL_TRAITS[traitId]);
}

/**
 * Compute the current level (1-5) based on cumulative XP.
 */
export function getLevel(commander: Commander): number {
  const xp = commander.xp ?? 0;
  let level = 1;
  for (let i = XP_THRESHOLDS.length - 1; i >= 1; i--) {
    if (xp >= XP_THRESHOLDS[i]) { level = i + 1; break; }
  }
  return Math.min(5, level);
}

/**
 * Returns the XP needed to reach the next level, or null at max level.
 */
export function xpToNextLevel(commander: Commander): number | null {
  const lvl = getLevel(commander);
  if (lvl >= 5) return null;
  return XP_THRESHOLDS[lvl] - (commander.xp ?? 0);
}

// ── Combat bonus accessor ─────────────────────────────────────────────────────

export interface CommanderCombatBonuses {
  attackBonus: number;
  defenseBonus: number;
  airAttackBonus: number;
  airDefenseBonus: number;
  veteranMultiplier: number;  // 1 = normal, 2 = double-veteran
  ignoreSupplyPenalty: boolean;
  round1AttackBonus: number;
  lastStandDefenseBonus: number;   // applied when active units < 3
}

/**
 * Derive all combat bonuses from a commander's current traits (and base stats).
 * The base attackBonus / defenseBonus from the commander definition are included.
 */
export function getCommanderCombatBonuses(
  commander: Commander,
  activeUnitCount: number,
  currentRound: number,
): CommanderCombatBonuses {
  const traits = commander.traits ?? [];
  const has = (id: CommanderTraitId) => traits.some(t => t.id === id);

  const bonuses: CommanderCombatBonuses = {
    attackBonus:          commander.attackBonus,
    defenseBonus:         commander.defenseBonus,
    airAttackBonus:       0,
    airDefenseBonus:      0,
    veteranMultiplier:    1,
    ignoreSupplyPenalty:  false,
    round1AttackBonus:    0,
    lastStandDefenseBonus: 0,
  };

  if (has('legendary')) {
    bonuses.attackBonus  += 1;
    bonuses.defenseBonus += 1;
  }
  if (has('aggressive_push'))  bonuses.attackBonus  += 1;
  if (has('iron_discipline'))  bonuses.defenseBonus += 1;
  if (has('veteran_eye'))      bonuses.veteranMultiplier = 2;
  if (has('supply_master'))    bonuses.ignoreSupplyPenalty = true;
  if (has('air_coordination')) { bonuses.airAttackBonus += 1; bonuses.airDefenseBonus += 1; }
  if (has('shock_doctrine') && currentRound === 1) bonuses.round1AttackBonus += 1;
  if (has('last_stand') && activeUnitCount < 3)    bonuses.lastStandDefenseBonus += 2;

  return bonuses;
}

// ── Battle outcome hook ───────────────────────────────────────────────────────

export interface BattleXPOutcome {
  attackerResult: XPResult | null;
  defenderResult: XPResult | null;
}

/**
 * Called by CombatResolver.finalizeCombat.
 * Finds commanders in both sides, awards XP, and returns the outcomes.
 *
 * playerFactionIds: human faction ids — those factions get manual trait picks; AI auto-picks for others.
 */
export function processBattleXP(
  combat: CombatState,
  attackerCommander: Commander | null,
  defenderCommander: Commander | null,
  playerFactionIds: string[],
): BattleXPOutcome {
  const attackerWon  = combat.winner === 'attacker';
  const defenderWon  = combat.winner === 'defender';

  const atkKills = combat.rounds.reduce((s, r) => s + r.defenderCasualties.reduce((s2, c) => s2 + c.count, 0), 0);
  const defKills = combat.rounds.reduce((s, r) => s + r.attackerCasualties.reduce((s2, c) => s2 + c.count, 0), 0);

  let attackerResult: XPResult | null = null;
  let defenderResult: XPResult | null = null;

  if (attackerCommander) {
    attackerResult = awardBattleXP(
      attackerCommander,
      attackerWon,
      atkKills,
      playerFactionIds.includes(combat.attackingFactionId),
    );
  }

  if (defenderCommander) {
    defenderResult = awardBattleXP(
      defenderCommander,
      defenderWon,
      defKills,
      playerFactionIds.includes(combat.defendingFactionId),
    );
  }

  return { attackerResult, defenderResult };
}
