/**
 * Scenario / simple-campaign briefing overlay markup + data. Extracted from the
 * Game god-class; pure builders (no DOM). Callers create the overlay element and
 * wire the buttons.
 */

export interface ScenarioBriefing {
  title: string;
  subtitle: string;
  goals: string[];
  doctrine: string;
}

/** Per-scenario briefing copy for the guided quick-start operations. */
export const SCENARIO_BRIEFINGS: Record<string, ScenarioBriefing> = {
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
    subtitle: 'Learn the clean loop: build, move, fight, review.',
    goals: ['Follow Do This Next.', 'Attack only when the preview looks favorable.', 'Watch moved units become ready next turn.'],
    doctrine: 'Aggressive AI: looks for early attacks and weak borders.',
  },
};

/** Build the operation-briefing card HTML for a resolved briefing. */
export function buildScenarioBriefingHtml(briefing: ScenarioBriefing): string {
  return `
      <div class="scenario-briefing-card">
        <div class="scenario-briefing-kicker">Operation Briefing</div>
        <h2>${briefing.title}</h2>
        <p class="scenario-briefing-subtitle">${briefing.subtitle}</p>
        <div class="scenario-briefing-goals">
          ${briefing.goals.map((goal, index) => `
            <div class="scenario-briefing-goal">
              <span>${index + 1}</span>
              <strong>${goal}</strong>
            </div>
          `).join('')}
        </div>
        <div class="scenario-briefing-doctrine">${briefing.doctrine}</div>
        <div class="scenario-briefing-actions">
          <button class="primary" id="btn-start-command">Start Command</button>
          <button id="btn-briefing-copilot">Show Co-Pilot</button>
        </div>
      </div>
    `;
}

/** Static briefing shown for the Simple Campaign quick start. */
export function buildSimpleCampaignBriefingHtml(): string {
  return `
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
}
