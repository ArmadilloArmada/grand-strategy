import { describe, expect, it } from 'vitest';
import { GameState } from '../../engine/GameState';
import { buildFactionSummaryHtml } from '../factionSummaryView';
import { makeFactionData, makeTerritory, makeUnitData } from '../../engine/__tests__/testHelpers';

function stateWithFaction(): GameState {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('player', { name: 'Atlantic Alliance', capital: 'cap' }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry' }));
  state.currentFactionId = 'player';
  return state;
}

describe('buildFactionSummaryHtml', () => {
  it('prompts to select a territory when there is no current faction', () => {
    const state = new GameState();
    expect(buildFactionSummaryHtml(state)).toContain('Click any territory to inspect it');
  });

  it('renders the faction banner and stat grid', () => {
    const state = stateWithFaction();
    const cap = makeTerritory('cap', 'player', { isCapital: true, production: 5 });
    cap.units.push({ unitTypeId: 'infantry', count: 3 });
    state.territories.set('cap', cap);

    const html = buildFactionSummaryHtml(state);
    expect(html).toContain('Atlantic Alliance');
    expect(html).toContain('Territories');
    expect(html).toContain('⭐ cap');
    expect(html).toContain('✓ Secured');
  });

  it('flags the capital as under threat when an enemy is adjacent with units', () => {
    const state = stateWithFaction();
    state.factionRegistry.register(makeFactionData('enemy', { capital: 'foe' }));
    const cap = makeTerritory('cap', 'player', { isCapital: true, adjacentTo: ['foe'] });
    const foe = makeTerritory('foe', 'enemy', { adjacentTo: ['cap'] });
    foe.units.push({ unitTypeId: 'infantry', count: 2 });
    state.territories.set('cap', cap);
    state.territories.set('foe', foe);

    expect(buildFactionSummaryHtml(state)).toContain('⚠ Under threat');
  });
});
