import type { FactionData } from '../data/Faction';

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
