/**
 * StatsUI - Game statistics modal
 */

import { GameState } from '../engine/GameState';
import { statisticsManager } from '../engine/StatisticsManager';
import { getPersistentStats } from '../engine/PersistentStats';
import { turnLog } from '../engine/TurnLog';

export class StatsUI {
  constructor(private state: GameState) {}

  show(): void {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.remove('hidden');
    this.update();
  }

  close(): void {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  update(): void {
    const allStats = statisticsManager.getAllStats();
    const faction = this.state.getCurrentFaction();

    const turnsEl = document.getElementById('stat-turns');
    const battlesEl = document.getElementById('stat-battles');
    const durationEl = document.getElementById('stat-duration');
    const veteransEl = document.getElementById('stat-veterans');

    if (turnsEl) turnsEl.textContent = String(allStats.totalTurns);
    if (battlesEl) battlesEl.textContent = String(allStats.totalBattles);
    if (durationEl) durationEl.textContent = `${statisticsManager.getGameDuration()}m`;

    let totalVeterans = 0;
    for (const [, stats] of allStats.factionStats) {
      totalVeterans += stats.veteranUnits + stats.eliteUnits;
    }
    if (veteransEl) veteransEl.textContent = String(totalVeterans);

    const leaderboardEl = document.getElementById('stats-leaderboard');
    if (leaderboardEl) {
      const leaderboard = statisticsManager.getLeaderboard();
      const rankIcons = ['🥇', '🥈', '🥉', '4️⃣'];

      leaderboardEl.innerHTML = leaderboard.map((entry, i) => {
        const factionData = this.state.factionRegistry.get(entry.factionId);
        return `
          <div class="leaderboard-row ${i === 0 ? 'first' : ''}">
            <div class="leaderboard-rank">${rankIcons[i] || (i + 1)}</div>
            <div class="leaderboard-name" style="color: ${factionData?.color || '#fff'}">
              ${factionData?.name || entry.factionId}
            </div>
            <div class="leaderboard-score">${entry.score} pts</div>
          </div>
        `;
      }).join('');
    }

    const playerStatsEl = document.getElementById('stats-player');
    if (playerStatsEl && faction) {
      const stats = statisticsManager.getFactionStats(faction.id);
      if (stats) {
        playerStatsEl.innerHTML = `
          <div class="player-stat"><span class="player-stat-label">Units Produced</span><span class="player-stat-value">${stats.unitsProduced}</span></div>
          <div class="player-stat"><span class="player-stat-label">Units Lost</span><span class="player-stat-value">${stats.unitsLost}</span></div>
          <div class="player-stat"><span class="player-stat-label">Units Killed</span><span class="player-stat-value">${stats.unitsKilled}</span></div>
          <div class="player-stat"><span class="player-stat-label">Territories Captured</span><span class="player-stat-value">${stats.territoriesCaptured}</span></div>
          <div class="player-stat"><span class="player-stat-label">Battles Won</span><span class="player-stat-value">${stats.battlesWon}</span></div>
          <div class="player-stat"><span class="player-stat-label">Battles Lost</span><span class="player-stat-value">${stats.battlesLost}</span></div>
          <div class="player-stat"><span class="player-stat-label">Total Income</span><span class="player-stat-value">${stats.totalIncomeEarned} IPCs</span></div>
          <div class="player-stat"><span class="player-stat-label">Total Spent</span><span class="player-stat-value">${stats.totalIPCsSpent} IPCs</span></div>
          <div class="player-stat"><span class="player-stat-label">Tech Researched</span><span class="player-stat-value">${stats.techResearched}</span></div>
        `;
      }
    }

    const persistentEl = document.getElementById('stats-persistent');
    if (persistentEl) {
      const data = getPersistentStats();
      let html = '';
      if (data.totalGames === 0) {
        html = '<p style="color: #888;">No games recorded yet.</p>';
      } else {
        const avgLen = data.totalGames > 0 ? (data.totalDurationMinutes ?? 0) / data.totalGames : 0;
        html += `<div class="stat-card" style="grid-column: 1 / -1;"><strong>Total games:</strong> ${data.totalGames} &nbsp;|&nbsp; <strong>Avg length:</strong> ${avgLen.toFixed(1)}m</div>`;
        for (const [fid, f] of Object.entries(data.byFaction)) {
          const factionData = this.state.factionRegistry.get(fid);
          const winRate = f.gamesPlayed > 0 ? ((f.wins / f.gamesPlayed) * 100).toFixed(0) : '0';
          html += `<div class="stat-card" style="border-left: 3px solid ${factionData?.color ?? '#666'}">
            <strong>${factionData?.name ?? fid}</strong><br>
            Played: ${f.gamesPlayed} &nbsp; Wins: ${f.wins} &nbsp; Win rate: ${winRate}%
          </div>`;
        }
      }
      persistentEl.innerHTML = html;
    }

    const turnLogEl = document.getElementById('stats-turn-log') as HTMLTextAreaElement;
    if (turnLogEl) {
      turnLogEl.value = turnLog.exportText() || '(No log entries yet)';
    }
  }
}
