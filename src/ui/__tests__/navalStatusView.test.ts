import { describe, expect, it } from 'vitest';
import { GameState } from '../../engine/GameState';
import { SupplySystem } from '../../engine/SupplySystem';
import { getNavalStatusHtml } from '../navalStatusView';
import { makeFactionData, makeTerritory } from '../../engine/__tests__/testHelpers';

describe('getNavalStatusHtml', () => {
  it('returns empty string when there is no current faction', () => {
    const state = new GameState();
    const supply = new SupplySystem(state);
    const territory = makeTerritory('t', 'player');
    expect(getNavalStatusHtml(state, supply, territory)).toBe('');
  });

  it('returns empty string for a landlocked owned territory (no sea access)', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('player', { capital: 't' }));
    state.currentFactionId = 'player';
    const territory = makeTerritory('t', 'player', { adjacentTo: [] });
    state.territories.set('t', territory);
    const supply = new SupplySystem(state);
    expect(getNavalStatusHtml(state, supply, territory)).toBe('');
  });

  it('renders a sea-control block for a sea zone', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('player', { capital: 'land' }));
    state.currentFactionId = 'player';
    const sea = makeTerritory('sz', null, { type: 'sea', adjacentTo: [] });
    state.territories.set('sz', sea);
    const supply = new SupplySystem(state);
    const html = getNavalStatusHtml(state, supply, sea);
    expect(html).toContain('naval-status sea');
    expect(html).toContain('Neutral sea zone');
  });
});
