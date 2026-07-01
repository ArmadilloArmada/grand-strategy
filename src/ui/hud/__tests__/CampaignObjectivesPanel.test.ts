import { describe, it, expect, beforeEach } from 'vitest';
import { renderCampaignObjectivesPanel } from '../CampaignObjectivesPanel';

describe('CampaignObjectivesPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="campaign-objectives-panel" class="hidden">
        <div id="campaign-mission-name"></div>
        <div id="campaign-objectives-list"></div>
      </div>
      <div id="objectives-panel"></div>
    `;
  });

  it('hides the panel when no mission is active', () => {
    renderCampaignObjectivesPanel(null, []);
    expect(document.getElementById('campaign-objectives-panel')?.classList.contains('hidden')).toBe(true);
  });

  it('renders objective rows with progress markers', () => {
    renderCampaignObjectivesPanel(
      {
        id: 'tutorial_1',
        name: 'First Steps',
        description: '',
        mapId: 'tutorial',
        faction: 'atlantic_alliance',
        difficulty: 'easy',
        objectives: [],
        rewards: [],
        briefing: '',
        debriefingWin: '',
        debriefingLoss: '',
      },
      [
        { objective: { description: 'Capture the Contested Territory' }, met: true, progress: 'Done' },
        { objective: { description: 'Win a battle' }, met: false, progress: '0/1' },
      ],
    );

    const panel = document.getElementById('campaign-objectives-panel');
    expect(panel?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('campaign-mission-name')?.textContent).toBe('First Steps');
    expect(document.getElementById('campaign-objectives-list')?.textContent).toContain('Capture the Contested Territory');
    expect(document.getElementById('objectives-panel')?.classList.contains('hidden')).toBe(true);
  });
});
