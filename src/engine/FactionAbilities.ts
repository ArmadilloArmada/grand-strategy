/**
 * FactionAbilities - Unique special powers for each faction
 *
 * Each faction has one signature ability usable once every N turns.
 * The player activates it via a dedicated HUD button during their turn.
 */

import { GameState } from './GameState';

export interface FactionAbility {
  id: string;
  factionId: string;
  name: string;
  description: string;
  flavorText: string;
  cost: number;           // IPC cost (0 = free)
  cooldownTurns: number;
  needsTarget: boolean;   // Whether the player must select a territory
  targetFilter?: 'enemy' | 'friendly' | 'any';
}

export interface AbilityCooldownState {
  lastUsedTurn: number;
}

const STORAGE_KEY = 'grand_strategy_faction_abilities';

// Ability Definitions

export const FACTION_ABILITIES: FactionAbility[] = [
  {
    id: 'marshall_plan',
    factionId: 'atlantic_alliance',
    name: 'Marshall Plan',
    description: 'Spend 20 IPCs to inject 15 IPCs into your economy AND generate +5 IPC next turn from trade dividends.',
    flavorText: 'Rebuild. Reinvest. Dominate.',
    cost: 20,
    cooldownTurns: 6,
    needsTarget: false,
  },
  {
    id: 'scorched_earth',
    factionId: 'eastern_coalition',
    name: 'Scorched Earth',
    description: 'Select a friendly territory. Destroy its infrastructure - it generates no income for 3 turns but enemy units there take -1 attack and cannot be reinforced.',
    flavorText: 'Give them nothing. Take it all back.',
    cost: 0,
    cooldownTurns: 5,
    needsTarget: true,
    targetFilter: 'friendly',
  },
  {
    id: 'island_hopping',
    factionId: 'pacific_union',
    name: 'Island Hopping',
    description: 'All your transports gain +1 movement this turn, and units they carry may attack immediately after landing.',
    flavorText: 'Strike where they least expect it.',
    cost: 10,
    cooldownTurns: 4,
    needsTarget: false,
  },
  {
    id: 'guerrilla_surge',
    factionId: 'southern_federation',
    name: 'Guerrilla Surge',
    description: 'Select an enemy territory. Spawn 2 partisan infantry there - they disrupt supply and cost the enemy 1 turn to clear.',
    flavorText: 'Every jungle, every hill - a trap.',
    cost: 5,
    cooldownTurns: 4,
    needsTarget: true,
    targetFilter: 'enemy',
  },
];

// Runtime Effects

/**
 * Applies the ability effect to the game state. Returns a human-readable result string.
 */
export function applyFactionAbility(
  abilityId: string,
  factionId: string,
  state: GameState,
  targetTerritoryId?: string
): string {
  const faction = state.factionRegistry.get(factionId);
  if (!faction) return 'Error: faction not found.';

  const abilityState = state.systems.abilityState;

  switch (abilityId) {
    case 'marshall_plan': {
      faction.addIPCs(15);
      if (abilityState) {
        const prev = abilityState.pendingIPCBonuses.get(factionId) ?? 0;
        abilityState.pendingIPCBonuses.set(factionId, prev + 5);
      }
      return '+15 IPCs injected. +5 IPC trade dividend next income phase.';
    }

    case 'scorched_earth': {
      if (!targetTerritoryId) return 'No territory selected.';
      const t = state.territories.get(targetTerritoryId);
      if (!t) return 'Territory not found.';
      if (abilityState) {
        abilityState.scorchedTerritories.set(targetTerritoryId, state.turnNumber + 3);
      }
      return `${t.name} scorched. No income for 3 turns; enemy attack penalised there.`;
    }

    case 'island_hopping': {
      if (abilityState) {
        abilityState.islandHoppingTurns.set(factionId, state.turnNumber);
      }
      return 'Transports gain +1 movement. Landed units may attack this turn.';
    }

    case 'guerrilla_surge': {
      if (!targetTerritoryId) return 'No territory selected.';
      const t = state.territories.get(targetTerritoryId);
      if (!t) return 'Territory not found.';
      t.addUnits('partisan', 2);
      return `2 partisan infantry spawned in ${t.name}. Enemy supply disrupted.`;
    }

    default:
      return 'Unknown ability.';
  }
}

// Cooldown Manager

export class FactionAbilityManager {
  private cooldowns: Map<string, AbilityCooldownState> = new Map();

  constructor() {
    this.load();
  }

  getAbilityForFaction(factionId: string): FactionAbility | undefined {
    return FACTION_ABILITIES.find(a => a.factionId === factionId);
  }

  isReady(factionId: string, currentTurn: number): boolean {
    const ability = this.getAbilityForFaction(factionId);
    if (!ability) return false;
    const state = this.cooldowns.get(factionId);
    if (!state) return true;
    return currentTurn - state.lastUsedTurn >= ability.cooldownTurns;
  }

  turnsUntilReady(factionId: string, currentTurn: number): number {
    const ability = this.getAbilityForFaction(factionId);
    if (!ability) return 0;
    const state = this.cooldowns.get(factionId);
    if (!state) return 0;
    return Math.max(0, ability.cooldownTurns - (currentTurn - state.lastUsedTurn));
  }

  markUsed(factionId: string, currentTurn: number): void {
    this.cooldowns.set(factionId, { lastUsedTurn: currentTurn });
    this.save();
  }

  reset(): void {
    this.cooldowns.clear();
    this.save();
  }

  private save(): void {
    try {
      const data = Object.fromEntries(this.cooldowns.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, AbilityCooldownState>;
      for (const [k, v] of Object.entries(data)) this.cooldowns.set(k, v);
    } catch {}
  }
}

export const factionAbilityManager = new FactionAbilityManager();
