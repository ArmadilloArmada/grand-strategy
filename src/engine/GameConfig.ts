/**
 * GameConfig - Stores game setup options and victory conditions
 */

export type VictoryType = 'capitals' | 'domination' | 'economic' | 'elimination';
export type GameMode = 'vs-ai' | 'hotseat';

/**
 * Turn Style - how the turn structure works
 */
export type TurnStyle = 
  | 'classic'      // 6-phase TripleA style
  | 'quick'        // Simplified: Command (build/move/attack) → End
  | 'spectator'    // Pause between each AI turn
  | 'action'       // Pause after every move/attack
  | 'civilization' // Each unit moves OR attacks once per turn
  | 'chess'        // One action per turn, alternating
  | 'move_for_move'; // All factions build, then alternate one move at a time

export const TURN_STYLE_INFO: Record<TurnStyle, { name: string; description: string; icon: string }> = {
  quick: {
    name: 'Simple',
    description: 'One command phase: mobilize, move, and attack freely — then End Turn.',
    icon: '⚡'
  },
  classic: {
    name: 'Classic',
    description: '6 phases with separate combat and non-combat moves. For strategy veterans.',
    icon: '🎲'
  },
  spectator: {
    name: 'Spectator AI',
    description: 'Pauses after AI turns so you can review their moves on the map.',
    icon: '👀'
  },
  action: {
    name: 'Action-by-Action',
    description: 'Pauses after every move for careful review. Very slow pace.',
    icon: '🎯'
  },
  civilization: {
    name: 'Civilization',
    description: 'Each unit can move OR attack (not both). Like Civ games!',
    icon: '🏛️'
  },
  chess: {
    name: 'Chess',
    description: 'One action per turn, then opponent goes. Pure tactics!',
    icon: '♟️'
  },
  move_for_move: {
    name: 'Move for Move',
    description: 'Build anytime with the 🏭 button. Each move passes to the next player. End Turn to collect.',
    icon: '↔️'
  }
};

export type UnitEra = 'wwi' | 'wwii' | 'coldwar' | 'modern';

export const UNIT_ERA_INFO: Record<UnitEra, { name: string; description: string; icon: string }> = {
  wwi: {
    name: 'World War I (1914)',
    description: 'Slow trench warfare. Most units move 1 tile; cavalry and destroyers reach 2.',
    icon: '🎖️'
  },
  wwii: {
    name: 'World War II (1942)',
    description: 'Classic combined arms. Standard mobility — land 1–2, air 3–4, naval 2.',
    icon: '⚔️'
  },
  coldwar: {
    name: 'Cold War (1970)',
    description: 'Jet age. Armor and fleets move 3 tiles; jets reach 4–5.',
    icon: '☢️'
  },
  modern: {
    name: 'Modern (2020)',
    description: 'High-tech warfare. Motorized land 2–3, air 5–6, naval task forces up to 4.',
    icon: '🛰️'
  }
};

export interface GameConfig {
  // Map (id from map registry)
  mapId: string;
  // Unit era
  unitEra: UnitEra;
  // Game mode
  mode: GameMode;
  humanFactions: string[]; // Faction IDs controlled by humans
  /**
   * AI opponent faction IDs explicitly chosen at New Game setup. When
   * `aiOpponentCount` is smaller than the list, only the first N are used.
   * Undefined = "all map factions minus humans" (legacy behavior).
   */
  aiOpponents?: string[];
  /** Maximum number of AI opponents to activate. 0 / undefined = no cap. */
  aiOpponentCount?: number;
  /** Match-scoped AI tuning chosen from New Game setup. */
  aiDifficulty?: 'easy' | 'medium' | 'hard';
  aiPersonality?: string;
  /**
   * Resolved set of faction IDs participating in the current game session
   * (humans + their allies + chosen opponents, capped by aiOpponentCount).
   * Computed in startNewGame; undefined on old saves means "all".
   */
  activeFactionIds?: string[];

  // Turn style
  turnStyle: TurnStyle;

  /**
   * Optional RNG seed. When set (non-empty), the game is fully deterministic:
   * the same seed reproduces identical combat, AI decisions, and events. When
   * empty/undefined the game uses non-deterministic randomness (Math.random).
   */
  seed?: string;

  // Victory conditions
  victoryType: VictoryType;
  capitalsToWin: number;      // For capitals victory
  territoriesPercent: number;  // For domination victory
  economicTarget: number;      // For economic victory
  turnLimit: number;           // 0 = unlimited
  
  // Options
  fogOfWar: boolean;
  autoSave: boolean;
  simpleMode: boolean;
  /** Streamlined first-game coaching (Simple Campaign quick start). */
  guidedOnboarding?: boolean;
  phaseTimerSeconds: number; // 0 = disabled; max seconds per phase (human only)
  
  // Tracking
  startTime: number;
  totalIPCsEarned: Map<string, number>;
  battlesWon: Map<string, number>;
  territoriesCaptured: Map<string, number>;
}

/** Serializable subset of GameConfig stored in save slots (no Map fields). */
export type PersistedGameConfig = Pick<GameConfig,
  | 'mapId'
  | 'unitEra'
  | 'mode'
  | 'humanFactions'
  | 'aiOpponents'
  | 'aiOpponentCount'
  | 'aiDifficulty'
  | 'aiPersonality'
  | 'activeFactionIds'
  | 'turnStyle'
  | 'seed'
  | 'victoryType'
  | 'capitalsToWin'
  | 'territoriesPercent'
  | 'economicTarget'
  | 'turnLimit'
  | 'fogOfWar'
  | 'autoSave'
  | 'simpleMode'
  | 'phaseTimerSeconds'
>;

export function serializeGameConfig(config: GameConfig): PersistedGameConfig {
  return {
    mapId: config.mapId,
    unitEra: config.unitEra,
    mode: config.mode,
    humanFactions: [...config.humanFactions],
    aiOpponents: config.aiOpponents ? [...config.aiOpponents] : undefined,
    aiOpponentCount: config.aiOpponentCount,
    aiDifficulty: config.aiDifficulty,
    aiPersonality: config.aiPersonality,
    activeFactionIds: config.activeFactionIds ? [...config.activeFactionIds] : undefined,
    turnStyle: config.turnStyle,
    seed: config.seed,
    victoryType: config.victoryType,
    capitalsToWin: config.capitalsToWin,
    territoriesPercent: config.territoriesPercent,
    economicTarget: config.economicTarget,
    turnLimit: config.turnLimit,
    fogOfWar: config.fogOfWar,
    autoSave: config.autoSave,
    simpleMode: config.simpleMode,
    phaseTimerSeconds: config.phaseTimerSeconds,
  };
}

export function mergePersistedGameConfig(base: GameConfig, saved: PersistedGameConfig): GameConfig {
  return {
    ...base,
    ...saved,
    humanFactions: [...saved.humanFactions],
    aiOpponents: saved.aiOpponents ? [...saved.aiOpponents] : base.aiOpponents,
    activeFactionIds: saved.activeFactionIds ? [...saved.activeFactionIds] : base.activeFactionIds,
    totalIPCsEarned: base.totalIPCsEarned,
    battlesWon: base.battlesWon,
    territoriesCaptured: base.territoriesCaptured,
    startTime: base.startTime,
  };
}

export const defaultConfig: GameConfig = {
  mapId: 'grid',
  unitEra: 'wwii',
  mode: 'vs-ai',
  humanFactions: ['atlantic_alliance'],
  aiOpponents: undefined,
  aiOpponentCount: 0,
  aiDifficulty: 'medium',
  aiPersonality: 'default',
  activeFactionIds: undefined,

  turnStyle: 'classic',
  
  victoryType: 'capitals',
  capitalsToWin: 3,
  territoriesPercent: 75,
  economicTarget: 500,
  turnLimit: 50,
  
  fogOfWar: true,
  autoSave: true,
  simpleMode: true,
  phaseTimerSeconds: 0,
  
  startTime: Date.now(),
  totalIPCsEarned: new Map(),
  battlesWon: new Map(),
  territoriesCaptured: new Map(),
};

/**
 * Check victory conditions
 */
export function checkVictory(
  config: GameConfig,
  state: {
    factionRegistry: { getAll: () => any[]; getActive?: () => any[]; getActiveIncludingDefeated?: () => any[] };
    territories: Map<string, any>;
    turnNumber: number;
  }
): { winner: string | null; reason: string } {
  const factions = state.factionRegistry.getActive
    ? state.factionRegistry.getActive()
    : state.factionRegistry.getAll().filter((f: any) => !f.isDefeated);
  
  // Only one faction left = winner
  if (factions.length === 1) {
    return { winner: factions[0].id, reason: 'Last faction standing!' };
  }
  
  // Check based on victory type
  switch (config.victoryType) {
    case 'capitals': {
      for (const faction of factions) {
        let capturedCapitals = 0;
        for (const other of (state.factionRegistry.getActiveIncludingDefeated
          ? state.factionRegistry.getActiveIncludingDefeated()
          : state.factionRegistry.getAll())) {
          if (other.id === faction.id) continue;
          const capitalTerritory = state.territories.get(other.capital);
          if (capitalTerritory && capitalTerritory.owner === faction.id) {
            capturedCapitals++;
          }
        }
        if (capturedCapitals >= config.capitalsToWin) {
          return { winner: faction.id, reason: `Captured ${capturedCapitals} enemy capitals!` };
        }
      }
      break;
    }
    
    case 'domination': {
      const totalTerritories = Array.from(state.territories.values())
        .filter(t => t.type === 'land').length;
      
      for (const faction of factions) {
        const ownedCount = Array.from(state.territories.values())
          .filter(t => t.owner === faction.id && t.type === 'land').length;
        const percent = (ownedCount / totalTerritories) * 100;
        
        if (percent >= config.territoriesPercent) {
          return { winner: faction.id, reason: `Controls ${Math.round(percent)}% of the world!` };
        }
      }
      break;
    }
    
    case 'economic': {
      for (const faction of factions) {
        const total = config.totalIPCsEarned.get(faction.id) || 0;
        if (total >= config.economicTarget) {
          return { winner: faction.id, reason: `Earned ${total} IPCs total!` };
        }
      }
      break;
    }
    
    case 'elimination': {
      // Already handled by "only one faction left" check above
      break;
    }
  }
  
  // Turn limit reached - winner by territory count
  if (config.turnLimit > 0 && state.turnNumber >= config.turnLimit) {
    if (factions.length === 0) return { winner: null, reason: 'Draw — all factions eliminated.' };
    let maxTerritories = 0;
    let leader = factions[0];
    
    for (const faction of factions) {
      const count = Array.from(state.territories.values())
        .filter(t => t.owner === faction.id).length;
      if (count > maxTerritories) {
        maxTerritories = count;
        leader = faction;
      }
    }
    
    return { winner: leader.id, reason: `Turn limit reached! Most territories: ${maxTerritories}` };
  }
  
  return { winner: null, reason: '' };
}
