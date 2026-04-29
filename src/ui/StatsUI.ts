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
      const morale = faction.morale ?? (100 - (faction.warWeariness ?? 0));
      const moraleColor = morale >= 80 ? '#22c55e' : morale >= 50 ? '#fbbf24' : morale >= 25 ? '#f97316' : '#ef4444';
      const moraleLabel = morale >= 80 ? 'High' : morale >= 50 ? 'Normal' : morale >= 25 ? 'Low' : 'Collapsed';
      if (stats) {
        playerStatsEl.innerHTML = `
          <div class="player-stat"><span class="player-stat-label">Units Produced</span><span class="player-stat-value">${stats.unitsProduced}</span></div>
          <div class="player-stat"><span class="player-stat-label">Units Lost</span><span class="player-stat-value">${stats.unitsLost}</span></div>
          <div class="player-stat"><span class="player-stat-label">Units Killed</span><span class="player-stat-value">${stats.unitsKilled}</span></div>
          <div class="player-stat"><span class="player-stat-label">K/D Ratio</span><span class="player-stat-value">${stats.unitsLost > 0 ? (stats.unitsKilled / stats.unitsLost).toFixed(2) : '—'}</span></div>
          <div class="player-stat"><span class="player-stat-label">Territories Captured</span><span class="player-stat-value">${stats.territoriesCaptured}</span></div>
          <div class="player-stat"><span class="player-stat-label">Battles Won</span><span class="player-stat-value">${stats.battlesWon}</span></div>
          <div class="player-stat"><span class="player-stat-label">Battles Lost</span><span class="player-stat-value">${stats.battlesLost}</span></div>
          <div class="player-stat"><span class="player-stat-label">Win Rate</span><span class="player-stat-value">${stats.battlesWon + stats.battlesLost > 0 ? Math.round(stats.battlesWon / (stats.battlesWon + stats.battlesLost) * 100) + '%' : '—'}</span></div>
          <div class="player-stat"><span class="player-stat-label">Total Income</span><span class="player-stat-value">${stats.totalIncomeEarned} IPCs</span></div>
          <div class="player-stat"><span class="player-stat-label">Total Spent</span><span class="player-stat-value">${stats.totalIPCsSpent} IPCs</span></div>
          <div class="player-stat"><span class="player-stat-label">Tech Researched</span><span class="player-stat-value">${stats.techResearched}</span></div>
          <div class="player-stat"><span class="player-stat-label">Nukes Launched</span><span class="player-stat-value">${stats.nukesLaunched}</span></div>
          <div class="player-stat"><span class="player-stat-label">Espionage Ops</span><span class="player-stat-value">${stats.espionageOpsLaunched} (${stats.espionageSuccesses} success)</span></div>
          <div class="player-stat"><span class="player-stat-label">Pacts Formed</span><span class="player-stat-value">${stats.diplomaticPactsFormed}</span></div>
          <div class="player-stat"><span class="player-stat-label">Alliances Formed</span><span class="player-stat-value">${stats.diplomaticAlliancesFormed}</span></div>
          <div class="player-stat"><span class="player-stat-label">Fortifications Built</span><span class="player-stat-value">${stats.fortificationsBuilt}</span></div>
          <div class="player-stat"><span class="player-stat-label">War Weariness</span><span class="player-stat-value" style="color:${moraleColor}">${faction.warWeariness ?? 0}% — ${moraleLabel}</span></div>
          <div class="player-stat"><span class="player-stat-label">Combat Modifier</span><span class="player-stat-value" style="color:${moraleColor}">${morale >= 80 ? '+1' : morale >= 50 ? '0' : morale >= 35 ? '-1' : morale >= 20 ? '-2' : '-3'}</span></div>
        `;
      }
    }

    const moraleEl = document.getElementById('stats-morale');
    if (moraleEl) {
      const allFactions = this.state.factionRegistry.getAll().filter(f => !f.isDefeated);
      moraleEl.innerHTML = allFactions.map(f => {
        const morale = f.morale ?? (100 - (f.warWeariness ?? 0));
        const ww = f.warWeariness ?? 0;
        const color = morale >= 80 ? '#22c55e' : morale >= 50 ? '#fbbf24' : morale >= 25 ? '#f97316' : '#ef4444';
        const label = morale >= 80 ? 'High' : morale >= 50 ? 'Normal' : morale >= 25 ? 'Low' : 'Collapsed';
        const combatMod = morale >= 80 ? '+1' : morale >= 50 ? '0' : morale >= 35 ? '-1' : morale >= 20 ? '-2' : '-3';
        return `<div class="player-stat" style="border-left:3px solid ${f.color ?? '#666'};padding-left:6px;">
          <span class="player-stat-label" style="color:${f.colorLight ?? f.color}">${f.name}</span>
          <span class="player-stat-value" style="color:${color}">${label} (${ww}% weariness · combat ${combatMod})</span>
        </div>`;
      }).join('');
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
