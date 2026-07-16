import { describe, expect, it } from 'vitest';
import {
  SCENARIO_BRIEFINGS,
  buildScenarioBriefingHtml,
  buildSimpleCampaignBriefingHtml,
} from '../scenarioBriefingView';

describe('SCENARIO_BRIEFINGS', () => {
  it('defines the three guided quick-start scenarios', () => {
    expect(Object.keys(SCENARIO_BRIEFINGS).sort()).toEqual(['factory-rush', 'first-war', 'hold-capital']);
  });
});

describe('buildScenarioBriefingHtml', () => {
  it('renders title, subtitle, numbered goals and doctrine', () => {
    const html = buildScenarioBriefingHtml(SCENARIO_BRIEFINGS['hold-capital']);
    expect(html).toContain('Hold the Capital');
    expect(html).toContain('scenario-briefing-doctrine');
    expect(html).toContain('<span>1</span>');
    expect(html).toContain('<span>3</span>');
    expect(html).toContain('id="btn-start-command"');
    expect(html).toContain('id="btn-briefing-copilot"');
  });
});

describe('buildSimpleCampaignBriefingHtml', () => {
  it('renders the first-command briefing with a Begin Turn 1 button', () => {
    const html = buildSimpleCampaignBriefingHtml();
    expect(html).toContain('Your First Command');
    expect(html).toContain('Begin Turn 1');
  });
});
