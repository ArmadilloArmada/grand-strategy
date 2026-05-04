/**
 * VictoryScreen - Victory/defeat screen with stats and confetti
 */

import { GameState } from '../engine/GameState';
import { GameConfig } from '../engine/GameConfig';
import { statisticsManager } from '../engine/StatisticsManager';
import { achievementManager } from '../engine/AchievementManager';
import { soundManager } from '../audio/SoundManager';
import { recordGameEnd } from '../engine/PersistentStats';
import { settings } from './Settings';

export interface VictoryCallbacks {
  showMainMenu(): void;
}

export class VictoryScreen {
  private activeWinner: string | null = null;

  constructor(
    private state: GameState,
    private gameConfig: () => GameConfig,
    private callbacks: VictoryCallbacks
  ) {}

  show(data: { winner: string }): void {
    if (!data.winner) return;
    if (this.activeWinner === data.winner && document.getElementById('victory-modal')) return;
    document.getElementById('victory-modal')?.remove();
    this.activeWinner = data.winner;

    const config = this.gameConfig();
    const faction = this.state.factionRegistry.get(data.winner);
    const humanFactionIds = new Set(config.humanFactions ?? []);
    const isPlayerVictory = humanFactionIds.has(data.winner) || faction?.controlledBy === 'human';

    const factionIds = this.state.factionRegistry.getAll().map(f => f.id);
    if (factionIds.length > 0) {
      const durationMin = Math.max(0, (Date.now() - config.startTime) / 60000);
      const killsByFaction: Record<string, number> = {};
      const lossesByFaction: Record<string, number> = {};
      for (const fid of factionIds) {
        const fs = statisticsManager.getFactionStats(fid);
        killsByFaction[fid] = fs?.unitsKilled ?? 0;
        lossesByFaction[fid] = fs?.unitsLost ?? 0;
      }
      recordGameEnd(factionIds, data.winner, durationMin, {
        turns: this.state.turnNumber,
        mapId: config.mapId,
        mode: config.mode,
        difficulty: settings.getSetting('aiDifficulty'),
        killsByFaction,
        lossesByFaction,
      });
    }

    const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
    if (humanFaction) {
      const playerTerritories = this.state.getTerritoriesOwnedBy(humanFaction.id).length;
      const maxEnemyTerritories = Math.max(
        ...this.state.factionRegistry.getAll()
          .filter(f => f.id !== humanFaction.id)
          .map(f => this.state.getTerritoriesOwnedBy(f.id).length),
        0
      );
      const playerStats = statisticsManager.getFactionStats(humanFaction.id);
      achievementManager.checkGameEnd(isPlayerVictory, {
        faction: humanFaction.id,
        mapId: config.mapId,
        turns: this.state.turnNumber,
        unitsLost: playerStats?.unitsLost ?? 0,
        territoriesOwned: playerTerritories,
        enemyTerritoriesOwned: maxEnemyTerritories,
      });
    }

    if (isPlayerVictory) {
      soundManager.play('victory');
    } else {
      soundManager.play('defeat');
    }

    const stats = this.calculateGameStats();

    const allFactions = this.state.factionRegistry.getAll();
    const factionRows = allFactions
      .map(f => {
        const territories = this.state.getTerritoriesOwnedBy(f.id).length;
        const fStats = statisticsManager.getFactionStats(f.id);
        const isWinner = f.id === data.winner;
        return { f, territories, fStats, isWinner };
      })
      .sort((a, b) => b.territories - a.territories)
      .map((entry, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const highlight = entry.isWinner ? `background: rgba(0,0,0,0.06); border-radius: 6px;` : '';
        return `<tr style="${highlight}">
          <td style="padding: 0.4rem 0.5rem;">${medal}</td>
          <td style="padding: 0.4rem 0.5rem; font-weight: 600; color: ${entry.f.color};">${entry.f.name}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.territories}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.fStats?.unitsKilled ?? 0}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.fStats?.unitsLost ?? 0}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.fStats?.techResearched ?? 0}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.fStats?.nukesLaunched ?? 0}</td>
        </tr>`;
      }).join('');

    const durationMin = Math.round(Math.max(0, (Date.now() - config.startTime) / 60000));
    const durationStr = durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : `${durationMin}m`;

    // Build per-faction bar chart data
    const allFactionStats = allFactions.map(f => ({
      f,
      territories: this.state.getTerritoriesOwnedBy(f.id).length,
      fStats: statisticsManager.getFactionStats(f.id),
    }));
    const maxTerritories = Math.max(1, ...allFactionStats.map(x => x.territories));
    const maxKills = Math.max(1, ...allFactionStats.map(x => x.fStats?.unitsKilled ?? 0));
    const maxIncome = Math.max(1, ...allFactionStats.map(x => x.fStats?.totalIncomeEarned ?? 0));
    const maxTech = Math.max(1, ...allFactionStats.map(x => x.fStats?.techResearched ?? 0));
    const maxNukes = Math.max(1, ...allFactionStats.map(x => x.fStats?.nukesLaunched ?? 0));

    const barChart = (value: number, max: number, color: string) => {
      const pct = Math.round((value / max) * 100);
      return `<div style="display:flex;align-items:center;gap:0.4rem;margin-top:2px;">
        <div style="flex:1;background:rgba(0,0,0,0.12);border-radius:3px;height:10px;overflow:hidden;">
          <div style="width:${pct}%;background:${color};height:100%;border-radius:3px;transition:width 0.4s;"></div>
        </div>
        <span style="min-width:2.5rem;text-align:right;font-size:0.8rem;">${value}</span>
      </div>`;
    };

    const factionChartRows = allFactionStats
      .sort((a, b) => b.territories - a.territories)
      .map(({ f, territories, fStats }) => `
        <div style="margin-bottom:0.75rem;">
          <div style="font-weight:600;font-size:0.85rem;color:${f.color};margin-bottom:2px;">${f.id === data.winner ? '🏆 ' : ''}${f.name}</div>
          <div style="font-size:0.75rem;color:#888;">Territories</div>
          ${barChart(territories, maxTerritories, f.color)}
          <div style="font-size:0.75rem;color:#888;margin-top:4px;">Kills</div>
          ${barChart(fStats?.unitsKilled ?? 0, maxKills, f.color)}
          <div style="font-size:0.75rem;color:#888;margin-top:4px;">Total Income</div>
          ${barChart(fStats?.totalIncomeEarned ?? 0, maxIncome, f.color)}
          <div style="font-size:0.75rem;color:#888;margin-top:4px;">🔬 Tech Researched</div>
          ${barChart(fStats?.techResearched ?? 0, maxTech, f.color)}
          ${(fStats?.nukesLaunched ?? 0) > 0 ? `
          <div style="font-size:0.75rem;color:#888;margin-top:4px;">☢️ Nuclear Strikes</div>
          ${barChart(fStats?.nukesLaunched ?? 0, maxNukes, '#ef4444')}` : ''}
        </div>
      `).join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'victory-modal';
    modal.innerHTML = `
      <div class="modal-content" style="text-align: center; max-width: 620px;">
        <h2>${isPlayerVictory ? '🏆 VICTORY!' : '💀 DEFEAT'}</h2>
        <div style="font-size: 3.5rem; margin: 0.5rem 0;">${isPlayerVictory ? '👑' : '⚰️'}</div>
        <p style="font-size: 1.4rem; font-family: 'Cinzel', serif; color: ${faction?.color ?? '#333'}; margin: 0.25rem 0;">
          <strong>${faction?.name ?? data.winner}</strong>
        </p>
        <p style="font-size: 1rem; color: var(--text-muted); margin-bottom: 0.25rem;">
          ${isPlayerVictory ? 'has conquered the world!' : 'has defeated you!'}
          &nbsp;·&nbsp; Turn ${stats.turns} &nbsp;·&nbsp; ${durationStr}
        </p>
        <p style="font-size: 0.9rem; font-style: italic; color: ${faction?.color ?? 'var(--text-muted)'}; margin-bottom: 1.25rem; opacity: 0.85;">
          "${this.getVictoryFlavorText(data.winner, isPlayerVictory)}"
        </p>

        <div style="background: rgba(0,0,0,0.05); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; text-align: left;">
          <h3 style="text-align: center; margin: 0 0 0.75rem; font-size: 0.95rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Final Standings</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
            <thead>
              <tr style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid rgba(0,0,0,0.1);">
                <th style="padding: 0.25rem 0.5rem; text-align: left;"></th>
                <th style="padding: 0.25rem 0.5rem; text-align: left;">Faction</th>
                <th style="padding: 0.25rem 0.5rem;">Territories</th>
                <th style="padding: 0.25rem 0.5rem;">Kills</th>
                <th style="padding: 0.25rem 0.5rem;">Losses</th>
                <th style="padding: 0.25rem 0.5rem;">🔬 Tech</th>
                <th style="padding: 0.25rem 0.5rem;">☢️ Nukes</th>
              </tr>
            </thead>
            <tbody>${factionRows}</tbody>
          </table>
        </div>

        <div style="background: rgba(0,0,0,0.05); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; text-align: left;">
          <h3 style="text-align: center; margin: 0 0 0.75rem; font-size: 0.95rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Faction Comparison</h3>
          ${factionChartRows}
        </div>

        <div style="background: rgba(0,0,0,0.05); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; text-align: left;">
          <h3 style="text-align: center; margin: 0 0 0.75rem; font-size: 0.95rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Your Performance</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; font-size: 0.9rem;">
            <div>⚔️ Battles Fought</div><div style="text-align: right;"><strong>${stats.battlesFought}</strong></div>
            <div>💰 Total IPCs Earned</div><div style="text-align: right;"><strong>${stats.totalIncome}</strong></div>
            <div>🏭 Units Produced</div><div style="text-align: right;"><strong>${stats.unitsProduced}</strong></div>
            <div>💀 Enemies Destroyed</div><div style="text-align: right;"><strong>${stats.enemiesDestroyed}</strong></div>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button class="primary" id="btn-victory-play-again">🔄 Play Again</button>
          <button id="btn-victory-review">📊 Review Map</button>
          <button id="btn-victory-main-menu">🏠 Main Menu</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-victory-play-again')?.addEventListener('click', () => location.reload());
    document.getElementById('btn-victory-review')?.addEventListener('click', () => modal.remove());
    document.getElementById('btn-victory-main-menu')?.addEventListener('click', () => {
      modal.remove();
      this.activeWinner = null;
      this.callbacks.showMainMenu();
    });

    if (isPlayerVictory) {
      this.runConfetti(5000);
    }
  }

  reset(): void {
    this.activeWinner = null;
    document.getElementById('victory-modal')?.remove();
    document.querySelectorAll('.confetti-canvas').forEach(canvas => canvas.remove());
  }

  private getVictoryFlavorText(factionId: string, isPlayerWin: boolean): string {
    const lines: Record<string, { win: string[]; lose: string[] }> = {
      atlantic_alliance: {
        win:  ['Liberty does not merely survive — it prevails.',
               'The cost was great. The cause was greater.',
               'This is what freedom looks like.'],
        lose: ['The Alliance does not fall in a day. This is not over.',
               'We fought for what was right. History will remember that.',
               'Regroup. Rebuild. Return.'],
      },
      eastern_coalition: {
        win:  ['The Bear does not kneel. It has never kneeled.',
               'From the frozen steppe to the final capital — ours.',
               'Victory was inevitable. History agreed.'],
        lose: ['The Coalition bends but does not break. We will return.',
               'A setback, not a defeat. Remember the difference.',
               'The Motherland endures. Always.'],
      },
      pacific_union: {
        win:  ['Swift. Silent. Decisive. As it was always meant to be.',
               'The Pacific belongs to those who dare to cross it.',
               'Speed was our weapon. Victory is our reward.'],
        lose: ['The tide goes out. It also comes back in.',
               'We moved faster than anyone. Not fast enough today.',
               'The Union adapts. Watch us.'],
      },
      southern_federation: {
        win:  ['The underdog bites hardest. Remember that.',
               'Every jungle, every hill — they all fought for us today.',
               'You cannot defeat a people who refuse to lose.'],
        lose: ['The South rises. It always has. It always will.',
               'We were outgunned, not outmatched.',
               'We have fought with less and won with nothing. We continue.'],
      },
    };
    const pool = lines[factionId];
    if (!pool) return isPlayerWin ? 'A hard-fought victory.' : 'A battle lost, not the war.';
    const arr = isPlayerWin ? pool.win : pool.lose;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  runConfetti(durationMs: number): void {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10000;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;

    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#ff9f43', '#a29bfe'];
    const particles: { x: number; y: number; vx: number; vy: number; color: string; size: number; angle: number; spin: number }[] = [];
    for (let i = 0; i < 180; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
      });
    }

    const end = Date.now() + durationMs;
    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    };
    requestAnimationFrame(frame);
  }

  private calculateGameStats(): {
    turns: number;
    territoriesControlled: number;
    battlesFought: number;
    totalIncome: number;
    unitsProduced: number;
    enemiesDestroyed: number;
  } {
    const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
    const territories = humanFaction ? this.state.getTerritoriesOwnedBy(humanFaction.id) : [];
    const fStats = humanFaction ? statisticsManager.getFactionStats(humanFaction.id) : undefined;

    return {
      turns: this.state.turnNumber,
      territoriesControlled: territories.length,
      battlesFought: (fStats?.battlesWon ?? 0) + (fStats?.battlesLost ?? 0),
      totalIncome: fStats?.totalIncomeEarned ?? 0,
      unitsProduced: fStats?.unitsProduced ?? 0,
      enemiesDestroyed: fStats?.unitsKilled ?? 0,
    };
  }
}
