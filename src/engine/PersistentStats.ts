/**
 * PersistentStats - Tracks win/loss records and game history across sessions
 */

const STORAGE_KEY = 'grand-strategy-persistent-stats';

export interface FactionStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  totalTurns: number;
  totalUnitsKilled: number;
  totalUnitsLost: number;
}

export interface GameRecord {
  timestamp: number;
  winnerId: string;
  factionIds: string[];
  durationMin: number;
  turns: number;
  mapId: string;
  mode: string;
  difficulty: string;
}

export interface PersistentStatsData {
  totalGames: number;
  totalDurationMinutes: number;
  byFaction: Record<string, FactionStats>;
  recentGames: GameRecord[];   // last 20 games
}

function loadStats(): PersistentStatsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistentStatsData>;
      return {
        totalGames: parsed.totalGames ?? 0,
        totalDurationMinutes: parsed.totalDurationMinutes ?? 0,
        byFaction: parsed.byFaction ?? {},
        recentGames: parsed.recentGames ?? [],
      };
    }
  } catch {}
  return { totalGames: 0, totalDurationMinutes: 0, byFaction: {}, recentGames: [] };
}

function saveStats(data: PersistentStatsData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function recordGameEnd(
  factionIds: string[],
  winnerId: string,
  durationMin: number,
  extra?: { turns?: number; mapId?: string; mode?: string; difficulty?: string;
            killsByFaction?: Record<string, number>; lossesByFaction?: Record<string, number> }
): void {
  const data = loadStats();
  data.totalGames++;
  data.totalDurationMinutes = (data.totalDurationMinutes ?? 0) + durationMin;

  for (const fid of factionIds) {
    if (!data.byFaction[fid]) {
      data.byFaction[fid] = { gamesPlayed: 0, wins: 0, losses: 0, totalTurns: 0, totalUnitsKilled: 0, totalUnitsLost: 0 };
    }
    const fs = data.byFaction[fid];
    fs.gamesPlayed++;
    if (fid === winnerId) fs.wins++; else fs.losses++;
    fs.totalTurns += extra?.turns ?? 0;
    fs.totalUnitsKilled += extra?.killsByFaction?.[fid] ?? 0;
    fs.totalUnitsLost += extra?.lossesByFaction?.[fid] ?? 0;
  }

  const record: GameRecord = {
    timestamp: Date.now(),
    winnerId,
    factionIds,
    durationMin: Math.round(durationMin),
    turns: extra?.turns ?? 0,
    mapId: extra?.mapId ?? '',
    mode: extra?.mode ?? 'vs-ai',
    difficulty: extra?.difficulty ?? 'medium',
  };

  data.recentGames.unshift(record);
  if (data.recentGames.length > 20) data.recentGames.length = 20;

  saveStats(data);
}

export function getPersistentStats(): PersistentStatsData {
  return loadStats();
}

export function getWinRate(factionId: string): number {
  const data = loadStats();
  const fs = data.byFaction[factionId];
  if (!fs || fs.gamesPlayed === 0) return 0;
  return Math.round((fs.wins / fs.gamesPlayed) * 100);
}

export function getAverageGameLength(): number {
  const data = loadStats();
  if (data.totalGames === 0) return 0;
  return Math.round(data.totalDurationMinutes / data.totalGames);
}
