import type { FactionData } from '../data/Faction';
import type { GameMode } from './GameConfig';
import type { GameState } from './GameState';

export function normalizeHumanFactions(requestedFactionIds: string[] | undefined, availableFactions: FactionData[]): string[] {
  const playableIds = availableFactions
    .filter(faction => faction.isPlayable)
    .sort((a, b) => a.turnOrder - b.turnOrder)
    .map(faction => faction.id);

  if (playableIds.length === 0) return [];

  const validRequested = (requestedFactionIds ?? [])
    .filter((id, index, all) => all.indexOf(id) === index)
    .filter(id => playableIds.includes(id));

  return validRequested.length > 0 ? validRequested : [playableIds[0]];
}

export function getMaxCapturableCapitals(availableFactions: FactionData[]): number {
  const playableCount = availableFactions.filter(faction => faction.isPlayable).length;
  return Math.max(1, playableCount - 1);
}

export function normalizeCapitalsToWin(requestedCapitals: number | undefined, availableFactions: FactionData[]): number {
  const maxCapitals = getMaxCapturableCapitals(availableFactions);
  const safeValue = Number.isFinite(requestedCapitals) ? Math.floor(requestedCapitals ?? 1) : 1;
  return Math.min(Math.max(1, safeValue), maxCapitals);
}

export interface MatchSetupInput {
  mode: GameMode;
  humanFactionIds: string[];
  availableFactions: FactionData[];
  /** Selected opponent IDs from the setup modal (order preserved). */
  pickedOpponentIds?: string[];
  /** `'all'` or a numeric string from the opponent-count dropdown. */
  opponentCountRaw?: string;
}

export interface ResolvedMatchSetup {
  humanFactionIds: string[];
  aiOpponentIds: string[];
  activeFactionIds: string[];
  /** 0 means “all picked opponents” (legacy / no cap). */
  aiOpponentCount: number;
}

function addDeclaredAllies(
  activeIds: Set<string>,
  humanFactionIds: string[],
  availableFactions: FactionData[],
): void {
  for (const humanId of humanFactionIds) {
    const human = availableFactions.find(f => f.id === humanId);
    for (const ally of human?.allies ?? []) activeIds.add(ally);
  }
}

/** Resolve humans, AI opponents, and the active faction set for a new game. */
export function resolveMatchSetup(input: MatchSetupInput): ResolvedMatchSetup {
  const playable = input.availableFactions.filter(f => f.isPlayable);
  const humanFactionIds = normalizeHumanFactions(input.humanFactionIds, input.availableFactions);
  const activeIds = new Set<string>(humanFactionIds);
  addDeclaredAllies(activeIds, humanFactionIds, input.availableFactions);

  let aiOpponentIds: string[] = [];
  if (input.mode === 'vs-ai') {
    const candidates = playable
      .filter(f => !humanFactionIds.includes(f.id))
      .map(f => f.id);
    const picked = (input.pickedOpponentIds ?? []).filter(id => candidates.includes(id));
    const effectivePicked = picked.length > 0 ? picked : candidates;
    const countRaw = input.opponentCountRaw ?? 'all';
    const cap = countRaw === 'all'
      ? effectivePicked.length
      : Math.max(1, Math.min(parseInt(countRaw, 10) || effectivePicked.length, effectivePicked.length));
    aiOpponentIds = effectivePicked.slice(0, cap);
    for (const id of aiOpponentIds) activeIds.add(id);
  }

  const opponentCountRaw = input.opponentCountRaw ?? 'all';
  return {
    humanFactionIds,
    aiOpponentIds,
    activeFactionIds: Array.from(activeIds),
    aiOpponentCount: opponentCountRaw === 'all' ? 0 : aiOpponentIds.length,
  };
}

/** Max capturable enemy capitals given who is actually in the match. */
export function getMaxCapitalsForMatch(
  activeFactionIds: string[],
  humanFactionIds: string[],
  availableFactions: FactionData[],
): number {
  const humanSet = new Set(humanFactionIds);
  const allySet = new Set<string>();
  for (const humanId of humanFactionIds) {
    const human = availableFactions.find(f => f.id === humanId);
    for (const ally of human?.allies ?? []) allySet.add(ally);
  }
  const enemyCount = activeFactionIds.filter(
    id => !humanSet.has(id) && !allySet.has(id),
  ).length;
  return Math.max(1, enemyCount);
}

export function normalizeCapitalsToWinForMatch(
  requestedCapitals: number | undefined,
  activeFactionIds: string[],
  humanFactionIds: string[],
  availableFactions: FactionData[],
): number {
  const maxCapitals = getMaxCapitalsForMatch(activeFactionIds, humanFactionIds, availableFactions);
  const safeValue = Number.isFinite(requestedCapitals) ? Math.floor(requestedCapitals ?? 1) : 1;
  return Math.min(Math.max(1, safeValue), maxCapitals);
}

/** Apply participant flags and remove inactive factions from the map. */
export function applyMatchSetupToState(state: GameState, setup: ResolvedMatchSetup): void {
  for (const faction of state.factionRegistry.getAll()) {
    faction.isActive = setup.activeFactionIds.includes(faction.id);
    faction.controlledBy = setup.humanFactionIds.includes(faction.id) ? 'human' : 'ai';
  }
  withdrawInactiveFactionsFromMap(state);
}

/** Neutralize territories and units belonging to factions not in the match. */
export function withdrawInactiveFactionsFromMap(state: GameState): void {
  const inactiveIds = new Set(
    state.factionRegistry.getAll()
      .filter(f => !f.isActive)
      .map(f => f.id),
  );
  if (inactiveIds.size === 0) return;

  for (const territory of state.territories.values()) {
    if (territory.owner && inactiveIds.has(territory.owner)) {
      territory.owner = null;
      territory.units = [];
    }
  }

  for (const faction of state.factionRegistry.getAll()) {
    if (!faction.isActive) {
      faction.ipcs = 0;
    }
  }
}
