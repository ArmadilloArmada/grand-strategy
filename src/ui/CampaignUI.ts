/**
 * CampaignUI - Renders the campaign selection screen, mission briefing, and debriefing
 */

import { campaignManager, CampaignMission } from '../engine/CampaignManager';

class CampaignUI {
  private container: HTMLElement | null = null;
  private startCallback: ((mission: CampaignMission, campaignId: string) => void) | null = null;
  private briefingEl: HTMLElement | null = null;
  private debriefingEl: HTMLElement | null = null;

  show(container: HTMLElement): void {
    this.container = container;
    this.render();
  }

  hide(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
    this.hideBriefing();
    this.hideDebriefing();
  }

  onStart(cb: (mission: CampaignMission, campaignId: string) => void): void {
    this.startCallback = cb;
  }

  showBriefing(
    mission: CampaignMission,
    _campaignId: string,
    onStart: () => void,
    onBack: () => void
  ): void {
    this.hideBriefing();
    const el = document.createElement('div');
    el.id = 'campaign-briefing-overlay';
    el.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const diffColors: Record<string, string> = { easy: '#22c55e', normal: '#f59e0b', hard: '#ef4444' };
    const diffColor = diffColors[mission.difficulty] ?? '#888';

    const objectivesHtml = mission.objectives
      .map(obj => `<li style="margin:0.4rem 0;color:#cbd5e1;">${obj.description}</li>`)
      .join('');

    const bonusHtml = mission.bonusObjectives?.length
      ? `<div style="margin-top:1rem;">
           <div style="color:#f59e0b;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem;">Bonus Objectives</div>
           <ul style="margin:0;padding-left:1.2rem;">
             ${mission.bonusObjectives.map(o => `<li style="margin:0.3rem 0;color:#94a3b8;">${o.description}</li>`).join('')}
           </ul>
         </div>`
      : '';

    const rewardsHtml = mission.rewards.length
      ? `<div style="margin-top:1rem;padding:0.75rem;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:6px;">
           <div style="color:#60a5fa;font-size:0.8rem;text-transform:uppercase;margin-bottom:0.4rem;">Rewards on completion</div>
           ${mission.rewards.map(r => `<div style="color:#93c5fd;font-size:0.85rem;">• ${r.description}</div>`).join('')}
         </div>`
      : '';

    el.innerHTML = `
      <div style="background:#12172b;border:1px solid #2d3a55;border-radius:12px;max-width:600px;width:90%;max-height:85vh;overflow-y:auto;padding:2rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:1.5rem;">
          <div>
            <div style="color:#475569;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;">Mission Briefing</div>
            <h2 style="margin:0.3rem 0 0;font-size:1.5rem;color:#f1f5f9;">${mission.name}</h2>
            <div style="color:#64748b;font-size:0.85rem;margin-top:0.2rem;">${mission.description}</div>
          </div>
          <span style="flex-shrink:0;color:${diffColor};font-size:0.75rem;padding:0.3rem 0.7rem;border:1px solid ${diffColor};border-radius:4px;text-transform:uppercase;margin-left:1rem;">${mission.difficulty}</span>
        </div>

        <p style="color:#94a3b8;font-style:italic;border-left:3px solid #334155;padding-left:1rem;margin:0 0 1.5rem;">"${mission.briefing}"</p>

        <div style="margin-bottom:0.5rem;">
          <div style="color:#3b82f6;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.5rem;">Objectives</div>
          <ul style="margin:0;padding-left:1.2rem;">${objectivesHtml}</ul>
          ${bonusHtml}
        </div>

        ${rewardsHtml}

        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:2rem;">
          <button id="briefing-back-btn"
            style="padding:0.55rem 1.1rem;background:transparent;color:#94a3b8;border:1px solid #334155;border-radius:6px;cursor:pointer;">
            Back
          </button>
          <button id="briefing-start-btn"
            style="padding:0.55rem 1.5rem;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:1rem;">
            Launch Mission
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this.briefingEl = el;

    el.querySelector('#briefing-back-btn')!.addEventListener('click', () => {
      this.hideBriefing();
      onBack();
    });
    el.querySelector('#briefing-start-btn')!.addEventListener('click', () => {
      this.hideBriefing();
      onStart();
    });
  }

  hideBriefing(): void {
    this.briefingEl?.remove();
    this.briefingEl = null;
  }

  showDebriefing(
    mission: CampaignMission,
    won: boolean,
    appliedRewards: string[],
    nextMission: CampaignMission | null,
    onNext: () => void,
    onMainMenu: () => void
  ): void {
    this.hideDebriefing();
    const el = document.createElement('div');
    el.id = 'campaign-debriefing-overlay';
    el.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const resultColor = won ? '#22c55e' : '#ef4444';
    const resultLabel = won ? '✓ MISSION COMPLETE' : '✗ MISSION FAILED';
    const debriefText = won ? mission.debriefingWin : mission.debriefingLoss;

    const rewardsHtml =
      won && appliedRewards.length > 0
        ? `<div style="margin:1rem 0;padding:0.9rem;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:8px;">
             <div style="color:#22c55e;font-size:0.8rem;text-transform:uppercase;margin-bottom:0.5rem;">Rewards Earned</div>
             ${appliedRewards.map(r => `<div style="color:#86efac;font-size:0.9rem;">✓ ${r}</div>`).join('')}
           </div>`
        : '';

    const nextHtml = won
      ? nextMission
        ? `<div style="margin:1rem 0;padding:0.75rem;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:8px;">
             <div style="color:#60a5fa;font-size:0.8rem;text-transform:uppercase;margin-bottom:0.2rem;">Next Mission</div>
             <div style="color:#e2e8f0;font-weight:600;">${nextMission.name}</div>
             <div style="color:#94a3b8;font-size:0.85rem;">${nextMission.description}</div>
           </div>`
        : `<div style="margin:1rem 0;padding:0.75rem;background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.3);border-radius:8px;color:#fbbf24;text-align:center;">🏆 Campaign Complete!</div>`
      : '';

    const primaryBtn = won
      ? `<button id="debrief-next-btn"
           style="padding:0.55rem 1.5rem;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
           ${nextMission ? 'Next Mission ▶' : 'Finish Campaign'}
         </button>`
      : `<button id="debrief-retry-btn"
           style="padding:0.55rem 1.5rem;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
           Retry Mission
         </button>`;

    el.innerHTML = `
      <div style="background:#12172b;border:1px solid #2d3a55;border-radius:12px;max-width:540px;width:90%;max-height:85vh;overflow-y:auto;padding:2rem;">
        <div style="text-align:center;margin-bottom:1.5rem;">
          <div style="color:${resultColor};font-size:1rem;font-weight:700;letter-spacing:0.12em;">${resultLabel}</div>
          <h2 style="margin:0.4rem 0;color:#f1f5f9;">${mission.name}</h2>
        </div>

        <p style="color:#94a3b8;font-style:italic;border-left:3px solid #334155;padding-left:1rem;margin:0 0 1rem;">"${debriefText}"</p>

        ${rewardsHtml}
        ${nextHtml}

        <div style="display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.5rem;">
          <button id="debrief-menu-btn"
            style="padding:0.55rem 1.1rem;background:transparent;color:#94a3b8;border:1px solid #334155;border-radius:6px;cursor:pointer;">
            Return to Campaign
          </button>
          ${primaryBtn}
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this.debriefingEl = el;

    el.querySelector('#debrief-menu-btn')!.addEventListener('click', () => {
      this.hideDebriefing();
      onMainMenu();
    });

    const nextBtn = el.querySelector('#debrief-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.hideDebriefing();
        onNext();
      });
    }

    const retryBtn = el.querySelector('#debrief-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.hideDebriefing();
        onMainMenu();
      });
    }
  }

  hideDebriefing(): void {
    this.debriefingEl?.remove();
    this.debriefingEl = null;
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
      const unlocked = campaignManager.isCampaignUnlocked(campaign.id);
      const progress = campaignManager.getProgress(campaign.id);
      const completedCount = progress?.completedMissions.length ?? 0;
      const isComplete = progress?.completedAt !== undefined;

      const borderColor = isComplete ? '#2a7a2a' : unlocked ? '#444' : '#333';
      const bgColor = isComplete ? '#0f2a0f' : unlocked ? '#1e1e1e' : '#161616';

      html += `
        <div style="border:1px solid ${borderColor};padding:1rem;border-radius:4px;background:${bgColor};opacity:${unlocked ? '1' : '0.55'};">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
            <h3 style="margin:0">${campaign.icon} ${campaign.name}</h3>
            ${isComplete ? '<span style="color:#4caf50;font-size:0.8em;margin-left:auto;">COMPLETE</span>' : ''}
            ${!unlocked ? '<span style="color:#888;font-size:0.8em;margin-left:auto;">🔒 LOCKED</span>' : ''}
          </div>
          <p style="color:#aaa;margin:0 0 0.5rem;font-size:0.9em">${campaign.description}</p>
          ${campaign.unlockCondition && !unlocked
            ? `<p style="color:#666;font-size:0.8em;margin:0 0 0.5rem;">Complete another campaign to unlock</p>`
            : `<p style="color:#888;font-size:0.8em;margin:0 0 0.5rem;">Progress: ${completedCount}/${campaign.missions.length} missions</p>`
          }
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;">
      `;

      for (let i = 0; i < campaign.missions.length; i++) {
        const mission = campaign.missions[i];
        const completed = progress?.completedMissions.includes(mission.id);
        const isCurrent = unlocked && i === (progress?.currentMissionIndex ?? 0);
        const missionLocked = !unlocked || (!completed && !isCurrent && i > (progress?.currentMissionIndex ?? 0));
        html += `
          <button
            data-campaign="${campaign.id}"
            data-mission-idx="${i}"
            style="padding:0.4rem 0.8rem;
                   background:${completed ? '#1a4a1a' : isCurrent ? '#1a2a4a' : '#2a2a2a'};
                   border:1px solid ${completed ? '#2a7a2a' : isCurrent ? '#2a5aaa' : '#444'};
                   color:${missionLocked ? '#555' : '#eee'};
                   border-radius:3px;cursor:${missionLocked ? 'default' : 'pointer'};"
            ${missionLocked ? 'disabled' : ''}
          >
            ${completed ? '✓ ' : isCurrent ? '▶ ' : ''}${mission.name}
          </button>
        `;
      }
      html += '</div></div>';
    }
    html += '</div>';
    this.container.innerHTML = html;

    // Attach click handlers
    this.container.querySelectorAll('button[data-campaign]:not([disabled])').forEach(btn => {
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
