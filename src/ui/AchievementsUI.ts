/**
 * AchievementsUI - Renders the achievements screen
 */

import { achievementSystem, Achievement } from '../engine/AchievementSystem';

class AchievementsUI {
  private container: HTMLElement | null = null;

  show(container: HTMLElement): void {
    this.container = container;
    this.render();
  }

  hide(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  private render(): void {
    if (!this.container) return;
    const achievements: Achievement[] = achievementSystem.getAchievements();
    const unlocked = achievements.filter(a => a.unlocked);

    let html = `<div style="margin-bottom:0.5rem;color:#aaa">${unlocked.length} / ${achievements.length} unlocked</div>`;
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem;">';
    for (const a of achievements) {
      const opacity = a.unlocked ? '1' : '0.35';
      html += `
        <div style="border:1px solid ${a.unlocked ? '#5a3' : '#444'};padding:0.75rem;border-radius:4px;opacity:${opacity};">
          <div style="font-size:1.5rem;margin-bottom:0.25rem">${a.icon}</div>
          <div style="font-weight:bold;color:${a.unlocked ? '#9f6' : '#aaa'}">${a.name}</div>
          <div style="font-size:0.8em;color:#888;margin-top:0.25rem">${a.description}</div>
          ${a.unlocked && a.unlockedAt ? `<div style="font-size:0.7em;color:#666;margin-top:0.25rem">Unlocked ${new Date(a.unlockedAt).toLocaleDateString()}</div>` : ''}
        </div>
      `;
    }
    html += '</div>';
    this.container.innerHTML = html;
  }
}

export const achievementsUI = new AchievementsUI();
