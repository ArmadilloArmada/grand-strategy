import { describe, expect, it } from 'vitest';
import {
  getAdvisorEndLabel,
  getNextPhaseButtonLabel,
  getSimplePhaseLabel,
  isQuickPlayEndTurn,
} from '../hud/PhaseButtonLabels';

describe('PhaseButtonLabels', () => {
  it('shows Command for quick play phase in simple mode', () => {
    expect(getSimplePhaseLabel('play', 'quick', 'fallback')).toBe('Command');
  });

  it('uses End Turn for quick play end-button label regardless of simple mode', () => {
    expect(getNextPhaseButtonLabel('play', 'quick', true)).toBe('End Turn');
    expect(getNextPhaseButtonLabel('play', 'quick', false)).toBe('End Turn');
  });

  it('does not use legacy Act labels for classic simple mode', () => {
    expect(getNextPhaseButtonLabel('purchase', 'classic', true)).toBe('Combat Move');
    expect(getNextPhaseButtonLabel('purchase', 'classic', true)).not.toBe('Act');
  });

  it('maps collect income to End Turn in simple mode', () => {
    expect(getNextPhaseButtonLabel('production', 'classic', true)).toBe('End Turn');
    expect(getSimplePhaseLabel('collect_income', 'classic', 'fallback')).toBe('End Turn');
  });

  it('detects quick play end-turn state for human turns', () => {
    expect(isQuickPlayEndTurn('quick', 'play', true)).toBe(true);
    expect(isQuickPlayEndTurn('quick', 'play', false)).toBe(false);
    expect(isQuickPlayEndTurn('classic', 'purchase', true)).toBe(false);
  });

  it('advisor uses End Turn in quick and play contexts', () => {
    expect(getAdvisorEndLabel('quick', 'play')).toBe('End Turn');
    expect(getAdvisorEndLabel('classic', 'play')).toBe('End Turn');
    expect(getAdvisorEndLabel('classic', 'purchase')).toBe('End Phase');
    expect(getAdvisorEndLabel('classic', 'collect_income')).toBe('End Turn');
  });
});
