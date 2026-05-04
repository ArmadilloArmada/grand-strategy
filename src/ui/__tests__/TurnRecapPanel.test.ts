/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurnRecapPanel, TurnRecapStats } from '../TurnRecapPanel';
import type { Faction } from '../../data/Faction';

const faction = {
  id: 'atlantic_alliance',
  name: 'Atlantic Alliance',
  color: '#2255aa',
  colorLight: '#77aaff',
} as Faction;

const recap: TurnRecapStats = {
  factionId: 'atlantic_alliance',
  battles: 2,
  captures: 1,
  mobilizations: 3,
  unitsMobilized: 8,
  income: 24,
  unitsLost: 4,
  enemyUnitsDestroyed: 6,
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('TurnRecapPanel', () => {
  it('renders and dismisses phase recap rows', () => {
    vi.useFakeTimers();
    const panel = new TurnRecapPanel();

    panel.showPhase({ phaseName: 'Combat', battles: 2, captures: 1, unitsLostThisGame: 5 });

    const card = document.getElementById('phase-recap-card');
    expect(card?.textContent).toContain('Combat - Complete');
    expect(card?.textContent).toContain('Battles fought');
    expect(card?.textContent).toContain('Territories captured');

    card?.click();
    expect(document.getElementById('phase-recap-card')).toBeNull();
  });

  it('replaces old phase recap cards', () => {
    const panel = new TurnRecapPanel();

    panel.showPhase({ phaseName: 'Move', battles: 0, captures: 0, unitsLostThisGame: 0 });
    panel.showPhase({ phaseName: 'Income', battles: 0, captures: 0, unitsLostThisGame: 0 });

    expect(document.querySelectorAll('#phase-recap-card')).toHaveLength(1);
    expect(document.getElementById('phase-recap-card')?.textContent).toContain('Income - Complete');
  });

  it('renders turn recap exchange and next-step hints', () => {
    vi.useFakeTimers();
    const panel = new TurnRecapPanel();

    panel.showTurn({
      faction,
      turnNumber: 4,
      recap,
      nextDangerName: 'Western Front',
      nextObjectiveTitle: 'Hold the Line',
    });

    const card = document.getElementById('turn-recap-card');
    expect(card?.textContent).toContain('Turn 4 Recap');
    expect(card?.textContent).toContain('Atlantic Alliance');
    expect(card?.textContent).toContain('Combat exchange');
    expect(card?.textContent).toContain('+2');
    expect(card?.textContent).toContain('Western Front');
    expect(card?.textContent).toContain('Hold the Line');

    document.querySelector<HTMLButtonElement>('.recap-close')?.click();
    expect(document.getElementById('turn-recap-card')).toBeNull();
  });
});
