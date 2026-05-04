/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrategicAdvisor } from '../StrategicAdvisor';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('StrategicAdvisor', () => {
  it('renders strategic lines and dispatches action callbacks', () => {
    const onAction = vi.fn();
    const advisor = new StrategicAdvisor(onAction);

    advisor.update({
      visible: true,
      objectiveLine: 'Capture the port',
      threatLine: 'Capital threatened',
      opportunityLine: 'Weak border',
      economyLine: '20 IPC, +8/turn',
      mobilizationAdvice: 'Mobilize the capital.',
      coach: {
        headline: 'Take the port',
        detail: 'Your armor has a clean lane.',
        primaryLabel: 'Focus Port',
        primaryAction: 'focus-territory',
        territoryId: 'port',
        secondaryLabel: 'Threats',
        secondaryAction: 'threat-overlay',
      },
    });

    const panel = document.getElementById('strategic-advisor-panel');
    expect(panel?.classList.contains('hidden')).toBe(false);
    expect(panel?.textContent).toContain('Capture the port');
    expect(panel?.textContent).toContain('Take the port');

    document.querySelector<HTMLButtonElement>('[data-advisor-action="focus-territory"]')?.click();
    expect(onAction).toHaveBeenCalledWith('focus-territory', 'port');
  });

  it('hides without visible data or coach', () => {
    const advisor = new StrategicAdvisor(vi.fn());

    advisor.update({ visible: true });

    expect(document.getElementById('strategic-advisor-panel')?.classList.contains('hidden')).toBe(true);
  });

  it('toggles collapsed state from the header button', () => {
    const advisor = new StrategicAdvisor(vi.fn());

    advisor.update({
      visible: true,
      coach: {
        headline: 'Review',
        detail: 'Check the front.',
        primaryLabel: 'Threats',
        primaryAction: 'threat-overlay',
      },
    });

    document.getElementById('btn-advisor-collapse')?.click();
    expect(document.getElementById('strategic-advisor-panel')?.classList.contains('collapsed')).toBe(true);
  });
});
