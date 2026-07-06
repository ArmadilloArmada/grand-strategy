import type { CampaignMission } from '../../engine/CampaignManager';

export interface CampaignObjectiveResult {
  objective: { description: string };
  met: boolean;
  progress: string;
}

/** Refresh the in-game campaign mission objectives sidebar. */
export function renderCampaignObjectivesPanel(
  mission: CampaignMission | null,
  results: CampaignObjectiveResult[],
): void {
  const panel = document.getElementById('campaign-objectives-panel');
  const listEl = document.getElementById('campaign-objectives-list');
  const nameEl = document.getElementById('campaign-mission-name');
  if (!panel || !listEl || !nameEl) return;

  if (!mission) {
    panel.classList.add('hidden');
    return;
  }

  nameEl.textContent = mission.name;
  listEl.innerHTML = results.map(r => {
    const icon = r.met ? '✅' : '⬜';
    return `<div style="display:flex;gap:6px;align-items:flex-start;">
      <span style="flex-shrink:0;">${icon}</span>
      <span style="${r.met ? 'color:#4ade80;' : ''}">${r.objective.description} <span style="color:#5b9bd5;">(${r.progress})</span></span>
    </div>`;
  }).join('');

  panel.classList.remove('hidden');
  document.getElementById('objectives-panel')?.classList.add('hidden');
}
