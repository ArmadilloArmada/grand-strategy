/**
 * Campaign and scenario briefing overlays — extracted from main.ts (Horizon 3).
 */

import { funnelTracker } from '../engine/FunnelTracker';

export function showSimpleCampaignBriefing(): void {
  document.getElementById('scenario-briefing-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'scenario-briefing-overlay';
  overlay.className = 'scenario-briefing-overlay';
  overlay.innerHTML = `
    <div class="scenario-briefing-card">
      <div class="scenario-briefing-kicker">Simple Campaign</div>
      <h2>Your First Command</h2>
      <p class="scenario-briefing-subtitle">One command phase per turn — mobilize, move, attack, then End Turn. The Co-Pilot will guide each step.</p>
      <div class="scenario-briefing-goals">
        <div class="scenario-briefing-goal"><span>1</span><strong>Mobilize your capital or a factory to raise troops.</strong></div>
        <div class="scenario-briefing-goal"><span>2</span><strong>Move into a neighboring enemy territory and attack — use Play Tactical (T) on contested fights.</strong></div>
        <div class="scenario-briefing-goal"><span>3</span><strong>Capture 2 enemy capitals before turn 25 to win.</strong></div>
      </div>
      <div class="scenario-briefing-doctrine">Easy AI · Favorable economy · Co-Pilot coaching enabled</div>
      <div class="scenario-briefing-actions">
        <button class="primary" id="btn-start-command">Begin Turn 1</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('btn-start-command')?.addEventListener('click', () => {
    funnelTracker.track('briefing_dismiss', { once: true });
    overlay.remove();
  });
}

const SCENARIO_BRIEFINGS: Record<string, { title: string; subtitle: string; goals: string[]; doctrine: string }> = {
  'hold-capital': {
    title: 'Hold the Capital',
    subtitle: 'Protect Washington D.C. long enough to turn the front line.',
    goals: ['Build defenders first.', 'Use the Threats overlay to spot danger.', 'End the turn when the co-pilot has no urgent warning.'],
    doctrine: 'Defensive AI: reinforces strongholds and punishes exposed capitals.',
  },
  'factory-rush': {
    title: 'Factory Rush',
    subtitle: 'Win by turning production into unstoppable pressure.',
    goals: ['Use Buy & Auto-Deploy in factory territories.', 'Protect production hubs.', 'Bank income when the front is stable.'],
    doctrine: 'Economic AI: expands factories and tries to outproduce you.',
  },
  'first-war': {
    title: 'First War',
    subtitle: 'A short guided campaign focused on your first attack.',
    goals: ['Follow the co-pilot highlights.', 'Mobilize, then push into enemy territory.', 'Use End Turn when actions are done.'],
    doctrine: 'Aggressive AI: probes weak borders and contests capitals early.',
  },
};

export function showScenarioBriefing(scenario: string): void {
  document.getElementById('scenario-briefing-overlay')?.remove();
  const data = SCENARIO_BRIEFINGS[scenario];
  if (!data) return;

  const overlay = document.createElement('div');
  overlay.id = 'scenario-briefing-overlay';
  overlay.className = 'scenario-briefing-overlay';
  overlay.innerHTML = `
    <div class="scenario-briefing-card">
      <div class="scenario-briefing-kicker">Scenario</div>
      <h2>${data.title}</h2>
      <p class="scenario-briefing-subtitle">${data.subtitle}</p>
      <div class="scenario-briefing-goals">
        ${data.goals.map((g, i) => `<div class="scenario-briefing-goal"><span>${i + 1}</span><strong>${g}</strong></div>`).join('')}
      </div>
      <div class="scenario-briefing-doctrine">${data.doctrine}</div>
      <div class="scenario-briefing-actions">
        <button class="primary" id="btn-start-command">Begin Turn 1</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('btn-start-command')?.addEventListener('click', () => {
    funnelTracker.track('briefing_dismiss', { once: true });
    overlay.remove();
  });
}
