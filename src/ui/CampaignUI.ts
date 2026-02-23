/**
 * CampaignUI - Renders the campaign selection screen
 */

import { campaignManager, CampaignMission } from '../engine/CampaignManager';

class CampaignUI {
  private container: HTMLElement | null = null;
  private startCallback: ((mission: CampaignMission, campaignId: string) => void) | null = null;

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

  onStart(cb: (mission: CampaignMission, campaignId: string) => void): void {
    this.startCallback = cb;
  }

  private render(): void {
    if (!this.container) return;
    const campaigns = campaignManager.getCampaigns();

    if (campaigns.length === 0) {
      this.container.innerHTML = '<p style="color:#888;padding:1rem;">No campaigns available.</p>';
      return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:1rem;">';
    for (const campaign of campaigns) {
      const progress = campaignManager.getProgress(campaign.id);
      const completedCount = progress?.completedMissions.length ?? 0;
      html += `
        <div style="border:1px solid #444;padding:1rem;border-radius:4px;">
          <h3 style="margin:0 0 0.5rem">${campaign.icon} ${campaign.name}</h3>
          <p style="color:#aaa;margin:0 0 0.75rem;font-size:0.9em">${campaign.description}</p>
          <p style="color:#888;font-size:0.8em">Progress: ${completedCount}/${campaign.missions.length} missions</p>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;">
      `;
      for (let i = 0; i < campaign.missions.length; i++) {
        const mission = campaign.missions[i];
        const completed = progress?.completedMissions.includes(mission.id);
        const isCurrent = i === (progress?.currentMissionIndex ?? 0);
        const locked = !completed && !isCurrent && i > (progress?.currentMissionIndex ?? 0);
        html += `
          <button
            data-campaign="${campaign.id}"
            data-mission-idx="${i}"
            style="padding:0.4rem 0.8rem;background:${completed ? '#1a4a1a' : isCurrent ? '#1a2a4a' : '#2a2a2a'};
                   border:1px solid ${completed ? '#2a7a2a' : isCurrent ? '#2a5aaa' : '#444'};
                   color:${locked ? '#666' : '#eee'};border-radius:3px;cursor:${locked ? 'default' : 'pointer'};"
            ${locked ? 'disabled' : ''}
          >
            ${completed ? '✓ ' : ''}${mission.name}
          </button>
        `;
      }
      html += '</div></div>';
    }
    html += '</div>';
    this.container.innerHTML = html;

    // Attach click handlers
    this.container.querySelectorAll('button[data-campaign]').forEach(btn => {
      btn.addEventListener('click', () => {
        const campaignId = (btn as HTMLElement).dataset['campaign']!;
        const missionIdx = parseInt((btn as HTMLElement).dataset['missionIdx']!, 10);
        const campaign = campaigns.find(c => c.id === campaignId);
        if (!campaign) return;
        const mission = campaign.missions[missionIdx];
        if (mission && this.startCallback) {
          this.startCallback(mission, campaignId);
        }
      });
    });
  }
}

export const campaignUI = new CampaignUI();
