import { describe, expect, it } from 'vitest';
import {
  describeAITurnDelta,
  describeAIDoctrine,
  formatEventEffects,
  type AIFactionSummary,
} from '../aiTurnNarration';
import { escapeHtml } from '../htmlEscape';

const base: AIFactionSummary = { territories: 5, units: 10, ipcs: 20, capitals: 1 };

describe('describeAITurnDelta', () => {
  it('reports captured territories and banked IPC', () => {
    const after: AIFactionSummary = { territories: 7, units: 12, ipcs: 25, capitals: 1 };
    const text = describeAITurnDelta(base, after);
    expect(text).toContain('captured 2 territories');
    expect(text).toContain('added 2 units');
    expect(text).toContain('banked +5 IPC');
  });

  it('uses singular for a single territory and reports losses', () => {
    const after: AIFactionSummary = { territories: 4, units: 8, ipcs: 15, capitals: 1 };
    const text = describeAITurnDelta(base, after);
    expect(text).toContain('lost 1 territory');
    expect(text).toContain('lost 2 units');
    expect(text).toContain('spent 5 IPC');
  });

  it('prioritizes a captured capital', () => {
    const after: AIFactionSummary = { territories: 6, units: 11, ipcs: 22, capitals: 2 };
    expect(describeAITurnDelta(base, after).startsWith('captured a capital')).toBe(true);
  });

  it('falls back to a hold message when nothing changed', () => {
    expect(describeAITurnDelta(base, { ...base })).toBe('held position and reorganized');
  });

  it('caps the summary at three clauses', () => {
    const after: AIFactionSummary = { territories: 7, units: 12, ipcs: 25, capitals: 2 };
    expect(describeAITurnDelta(base, after).split(', ').length).toBeLessThanOrEqual(3);
  });
});

describe('describeAIDoctrine', () => {
  it('maps known personalities', () => {
    expect(describeAIDoctrine('aggressive')).toBe('aggressive');
    expect(describeAIDoctrine('economic')).toBe('economic');
  });
  it('defaults to standard for unknown/undefined', () => {
    expect(describeAIDoctrine(undefined)).toBe('standard');
    expect(describeAIDoctrine('mystery')).toBe('standard');
  });
});

describe('formatEventEffects', () => {
  it('shows a placeholder when there are no effects', () => {
    expect(formatEventEffects([])).toContain('No immediate effects');
  });
  it('formats known effect types', () => {
    const html = formatEventEffects([{ type: 'ipc_bonus', value: 10 }, { type: 'factory_damage' }]);
    expect(html).toContain('+10 IPCs');
    expect(html).toContain('Factory damaged');
    expect(html).toContain('<br>');
  });
  it('renders unknown types by name', () => {
    expect(formatEventEffects([{ type: 'weird_effect' }])).toContain('weird_effect');
  });
});

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<script>"x" & 'y'`)).toBe('&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;');
  });
  it('leaves safe text untouched', () => {
    expect(escapeHtml('Normal Save 1')).toBe('Normal Save 1');
  });
});
