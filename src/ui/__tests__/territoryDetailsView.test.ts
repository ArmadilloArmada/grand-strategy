import { describe, expect, it } from 'vitest';
import { GameState } from '../../engine/GameState';
import type { ValidMove } from '../../engine/MovementValidator';
import { buildSimpleTerritoryDetails } from '../territoryDetailsView';
import { makeFactionData, makeTerritory, makeUnitData } from '../../engine/__tests__/testHelpers';

function baseState(): GameState {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('player', { name: 'Player', capital: 'home' }));
  state.factionRegistry.register(makeFactionData('enemy', { name: 'Enemy', capital: 'foe' }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry', domain: 'land' }));
  state.currentFactionId = 'player';
  return state;
}

const move = (isAttack: boolean): ValidMove => ({ territoryId: 't', isAttack } as ValidMove);

describe('buildSimpleTerritoryDetails', () => {
  it('shows the owner, tags and factory mobilize hint during build phase', () => {
    const state = baseState();
    state.currentPhase = 'purchase';
    const home = makeTerritory('home', 'player', { isCapital: true, hasFactory: true, production: 4 });
    state.territories.set('home', home);

    const html = buildSimpleTerritoryDetails(state, home, []);
    expect(html).toContain('Player');
    expect(html).toContain('Capital');
    expect(html).toContain('Factory');
    expect(html).toContain('Good place to mobilize.');
  });

  it('reports attack targets in range during movement with valid attack moves', () => {
    const state = baseState();
    state.currentPhase = 'combat_move';
    const home = makeTerritory('home', 'player', { production: 2 });
    home.units.push({ unitTypeId: 'infantry', count: 2 });
    state.territories.set('home', home);

    const html = buildSimpleTerritoryDetails(state, home, [move(true), move(false)]);
    expect(html).toContain('1 attack target in range.');
  });

  it('describes enemy territory when not owned', () => {
    const state = baseState();
    state.currentPhase = 'combat_move';
    const foe = makeTerritory('foe', 'enemy', { production: 3 });
    state.territories.set('foe', foe);

    const html = buildSimpleTerritoryDetails(state, foe, []);
    expect(html).toContain('Enemy');
    expect(html).toContain('Enemy territory.');
  });
});
