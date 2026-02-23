/**
 * PersistentStats - Tracks win/loss records across games using localStorage
 */

const STORAGE_KEY = 'grand-strategy-persistent-stats';

interface FactionStats {
  gamesPlayed: number;
  wins: number;
}

interface PersistentStatsData {
  totalGames: number;
  totalDurationMinutes: number;
  byFaction: Record<string, FactionStats>;
}

function loadStats(): PersistentStatsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { totalGames: 0, totalDurationMinutes: 0, byFaction: {} };
}

function saveStats(data: PersistentStatsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function recordGameEnd(factionIds: string[], winnerId: string, durationMin: number): void {
  const data = loadStats();
  data.totalGames++;
  data.totalDurationMinutes = (data.totalDurationMinutes ?? 0) + durationMin;
  for (const fid of factionIds) {
    if (!data.byFaction[fid]) data.byFaction[fid] = { gamesPlayed: 0, wins: 0 };
    data.byFaction[fid].gamesPlayed++;
    if (fid === winnerId) data.byFaction[fid].wins++;
  }
  saveStats(data);
}

export function getPersistentStats(): PersistentStatsData {
  return loadStats();
}
