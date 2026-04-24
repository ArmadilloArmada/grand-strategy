/**
 * AchievementsUI - Renders the achievements screen
 */

import { achievementManager, Achievement } from '../engine/AchievementManager';

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
    const achievements: Achievement[] = achievementManager.getAll();
    const unlocked = achievementManager.getUnlocked();

    const categories = ['combat', 'territory', 'economy', 'special', 'campaign'] as const;
    const categoryLabels: Record<string, string> = {
      combat: '⚔️ Combat', territory: '🗺️ Territory',
      economy: '💰 Economy', special: '✨ Special', campaign: '🎯 Campaign',
    };

    let html = `<div style="margin-bottom:1rem;color:#aaa">${unlocked.length} / ${achievements.length} unlocked (${achievementManager.getCompletionPercent()}%)</div>`;

    for (const cat of categories) {
      const catAchievements = achievements.filter(a => a.category === cat);
      if (catAchievements.length === 0) continue;

      html += `<div style="margin-bottom:0.5rem;font-size:0.85em;color:#888;text-transform:uppercase;letter-spacing:1px">${categoryLabels[cat]}</div>`;
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.75rem;margin-bottom:1.25rem;">';

      for (const a of catAchievements) {
        const progress = achievementManager.getProgress(a.id);
        const isUnlocked = progress?.unlocked ?? false;
        const unlockedAt = progress?.unlockedAt;

        if (a.hidden && !isUnlocked) {
          html += `
            <div style="border:1px solid #333;padding:0.75rem;border-radius:4px;opacity:0.4;">
              <div style="font-size:1.5rem;margin-bottom:0.25rem">🔒</div>
              <div style="font-weight:bold;color:#666">Hidden</div>
              <div style="font-size:0.8em;color:#555;margin-top:0.25rem">???</div>
            </div>`;
          continue;
        }

        const opacity = isUnlocked ? '1' : '0.35';
        const borderColor = isUnlocked ? '#5a3' : '#444';
        const nameColor = isUnlocked ? '#9f6' : '#aaa';

        html += `
          <div style="border:1px solid ${borderColor};padding:0.75rem;border-radius:4px;opacity:${opacity};">
            <div style="font-size:1.5rem;margin-bottom:0.25rem">${a.icon}</div>
            <div style="font-weight:bold;color:${nameColor}">${a.name}</div>
            <div style="font-size:0.8em;color:#888;margin-top:0.25rem">${a.description}</div>
            ${isUnlocked && unlockedAt ? `<div style="font-size:0.7em;color:#666;margin-top:0.25rem">Unlocked ${new Date(unlockedAt).toLocaleDateString()}</div>` : ''}
          </div>`;
      }

      html += '</div>';
    }

    this.container.innerHTML = html;
  }
}

export const achievementsUI = new AchievementsUI();
