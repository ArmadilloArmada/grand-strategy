/**
 * Scenario - Premade game setups (map + factions + victory conditions + unit overrides)
 */

import { VictoryType } from './GameConfig';

export interface ScenarioFactionSetup {
  factionId: string;
  controlledBy: 'human' | 'ai';
  startingIPCs: number;
  /** IDs of territories this faction starts owning (overrides map defaults) */
  ownedTerritoryIds?: string[];
  /** Extra units placed at turn 1 */
  startingUnits?: { territoryId: string; unitTypeId: string; count: number }[];
}

export interface ScenarioData {
  id: string;
  name: string;
  description: string;
  mapId: string;           // References a map file in assets/maps/
  victoryType: VictoryType;
  turnLimit: number;
  capitalsToWin?: number;
  territoriesPercent?: number;
  economicTarget?: number;
  /** Factions to include and their initial state */
  factions: ScenarioFactionSetup[];
  /** Suggested human player faction */
  humanFactions?: string[];
  /** Flavour text shown in the mission briefing */
  briefing: string;
  /** Historical date/period label */
  period: string;
  /** Difficulty rating 1–5 */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  mapId: string;
  victoryType: VictoryType;
  turnLimit: number;
  period: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

// ── Preset Scenarios ──────────────────────────────────────────────────────

export const SCENARIOS: ScenarioData[] = [
  // ── 1. Tutorial — Small Island Campaign ──────────────────────────────────
  {
    id: 'tutorial_islands',
    name: 'Island Skirmish',
    description: 'A simple two-faction clash on a small island map. Perfect for learning the basics.',
    mapId: 'islands',
    victoryType: 'capitals',
    turnLimit: 15,
    capitalsToWin: 1,
    period: 'Modern',
    difficulty: 1,
    briefing:
      'Two rival powers fight for control of a strategic island chain. Capture the enemy capital to win.\n\n' +
      'This scenario is designed for new players learning movement, combat, and production.',
    humanFactions: ['allies'],
    factions: [
      { factionId: 'allies', controlledBy: 'human', startingIPCs: 30 },
      { factionId: 'axis',   controlledBy: 'ai',    startingIPCs: 30 },
    ],
  },

  // ── 2. Operation Overlord — D-Day, 1944 ────────────────────────────────
  {
    id: 'overlord_1944',
    name: 'Operation Overlord',
    description: 'The Allied invasion of Nazi-occupied Europe. Break through the Atlantic Wall and liberate France.',
    mapId: 'europe',
    victoryType: 'capitals',
    turnLimit: 20,
    capitalsToWin: 2,
    period: 'World War II — June 1944',
    difficulty: 3,
    briefing:
      'June 6, 1944. The largest amphibious assault in history is underway. Allied forces storm the beaches of Normandy ' +
      'against dug-in German defenders. Drive inland, liberate Paris, and push to Berlin before Germany can reinforce.\n\n' +
      'Allies start with naval superiority. Germany holds strong defensive lines. Capture 2 enemy capitals to win.',
    humanFactions: ['allies'],
    factions: [
      {
        factionId: 'allies',
        controlledBy: 'human',
        startingIPCs: 45,
        startingUnits: [
          { territoryId: 'england', unitTypeId: 'infantry', count: 6 },
          { territoryId: 'england', unitTypeId: 'transport', count: 3 },
          { territoryId: 'england', unitTypeId: 'destroyer', count: 2 },
          { territoryId: 'england', unitTypeId: 'fighter', count: 3 },
        ],
      },
      {
        factionId: 'germany',
        controlledBy: 'ai',
        startingIPCs: 40,
        startingUnits: [
          { territoryId: 'france', unitTypeId: 'infantry', count: 4 },
          { territoryId: 'france', unitTypeId: 'tank', count: 2 },
          { territoryId: 'germany', unitTypeId: 'infantry', count: 5 },
          { territoryId: 'germany', unitTypeId: 'anti_air', count: 2 },
          { territoryId: 'germany', unitTypeId: 'fighter', count: 2 },
        ],
      },
    ],
  },

  // ── 3. Battle of Britain — 1940 ──────────────────────────────────────────
  {
    id: 'battle_of_britain_1940',
    name: 'Battle of Britain',
    description:
      'Germany must achieve air superiority over Britain and pave the way for Operation Sea Lion. Britain fights for survival.',
    mapId: 'europe',
    victoryType: 'capitals',
    turnLimit: 12,
    capitalsToWin: 1,
    period: 'World War II — Summer 1940',
    difficulty: 4,
    briefing:
      'Summer 1940. France has fallen. Germany launches a massive air campaign to destroy the Royal Air Force and break ' +
      'British resolve. Britain must hold the skies long enough for reinforcements to arrive.\n\n' +
      'Germany wins by capturing London. Britain wins by surviving the turn limit.',
    humanFactions: ['britain'],
    factions: [
      {
        factionId: 'germany',
        controlledBy: 'ai',
        startingIPCs: 55,
        startingUnits: [
          { territoryId: 'france',  unitTypeId: 'fighter', count: 6 },
          { territoryId: 'france',  unitTypeId: 'bomber',  count: 4 },
          { territoryId: 'germany', unitTypeId: 'infantry', count: 8 },
          { territoryId: 'germany', unitTypeId: 'tank',    count: 4 },
          { territoryId: 'germany', unitTypeId: 'transport', count: 3 },
        ],
      },
      {
        factionId: 'britain',
        controlledBy: 'human',
        startingIPCs: 30,
        startingUnits: [
          { territoryId: 'england', unitTypeId: 'fighter',  count: 5 },
          { territoryId: 'england', unitTypeId: 'anti_air', count: 3 },
          { territoryId: 'england', unitTypeId: 'infantry', count: 4 },
          { territoryId: 'england', unitTypeId: 'destroyer', count: 4 },
        ],
      },
    ],
  },

  // ── 4. Pacific War — 1942 ─────────────────────────────────────────────────
  {
    id: 'pacific_1942',
    name: 'Pacific Storm',
    description:
      'Six months after Pearl Harbor, Japan has seized most of the Pacific. The USA must stop the expansion and begin the long road back.',
    mapId: 'pacific',
    victoryType: 'domination',
    turnLimit: 25,
    territoriesPercent: 60,
    period: 'World War II — Mid 1942',
    difficulty: 3,
    briefing:
      'Mid 1942. Japan\'s lightning advance has swept across the Pacific. Midway looms on the horizon — a decisive carrier battle ' +
      'that will determine who rules the Pacific for years to come.\n\n' +
      'Control 60% of the map\'s territories to achieve victory. Naval superiority is key.',
    humanFactions: ['usa'],
    factions: [
      {
        factionId: 'japan',
        controlledBy: 'ai',
        startingIPCs: 50,
        startingUnits: [
          { territoryId: 'japan',          unitTypeId: 'carrier',    count: 3 },
          { territoryId: 'japan',          unitTypeId: 'fighter',    count: 4 },
          { territoryId: 'japan',          unitTypeId: 'battleship', count: 2 },
          { territoryId: 'japan',          unitTypeId: 'infantry',   count: 6 },
          { territoryId: 'south_pacific',  unitTypeId: 'destroyer',  count: 3 },
        ],
      },
      {
        factionId: 'usa',
        controlledBy: 'human',
        startingIPCs: 40,
        startingUnits: [
          { territoryId: 'hawaii',        unitTypeId: 'carrier',   count: 2 },
          { territoryId: 'hawaii',        unitTypeId: 'fighter',   count: 3 },
          { territoryId: 'hawaii',        unitTypeId: 'destroyer', count: 3 },
          { territoryId: 'west_usa',      unitTypeId: 'infantry',  count: 4 },
          { territoryId: 'west_usa',      unitTypeId: 'bomber',    count: 2 },
        ],
      },
    ],
  },

  // ── 5. World at War — Full Global Conflict ─────────────────────────────
  {
    id: 'world_at_war',
    name: 'World at War',
    description:
      'The full global conflict. Axis vs Allies across Europe, Africa, Asia, and the Pacific. The most complex and epic scenario.',
    mapId: 'world',
    victoryType: 'capitals',
    turnLimit: 40,
    capitalsToWin: 3,
    period: 'World War II — 1942',
    difficulty: 5,
    briefing:
      '1942. The world is ablaze. Germany drives into Russia, Japan expands across Asia, and the United States has just entered the war. ' +
      'The fate of civilization hangs in the balance.\n\n' +
      'Capture 3 enemy capitals to win. This is the definitive grand strategy experience — every decision matters.',
    humanFactions: ['allies'],
    factions: [
      { factionId: 'allies',  controlledBy: 'human', startingIPCs: 60 },
      { factionId: 'germany', controlledBy: 'ai',    startingIPCs: 55 },
      { factionId: 'japan',   controlledBy: 'ai',    startingIPCs: 50 },
      { factionId: 'italy',   controlledBy: 'ai',    startingIPCs: 25 },
      { factionId: 'ussr',    controlledBy: 'ai',    startingIPCs: 40 },
      { factionId: 'usa',     controlledBy: 'ai',    startingIPCs: 45 },
    ],
  },
];

// ── ScenarioRegistry ──────────────────────────────────────────────────────

export class ScenarioRegistry {
  private scenarios: Map<string, ScenarioData> = new Map();

  constructor(scenarios: ScenarioData[] = SCENARIOS) {
    for (const s of scenarios) {
      this.scenarios.set(s.id, s);
    }
  }

  /** Register a custom scenario (e.g. from a mod). */
  register(scenario: ScenarioData): void {
    this.scenarios.set(scenario.id, scenario);
  }

  get(id: string): ScenarioData | undefined {
    return this.scenarios.get(id);
  }

  getAll(): ScenarioData[] {
    return Array.from(this.scenarios.values());
  }

  /** Summary list suitable for a scenario-select UI. */
  getMetaList(): ScenarioMeta[] {
    return this.getAll().map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      mapId: s.mapId,
      victoryType: s.victoryType,
      turnLimit: s.turnLimit,
      period: s.period,
      difficulty: s.difficulty,
    }));
  }
}

export const scenarioRegistry = new ScenarioRegistry();
