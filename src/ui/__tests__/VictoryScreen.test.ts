/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VictoryScreen } from '../VictoryScreen';
import { GameState } from '../../engine/GameState';
import { defaultConfig } from '../../engine/GameConfig';
import { makeFactionData, makeTerritory } from '../../engine/__tests__/testHelpers';

vi.mock('../../audio/SoundManager', () => ({
  soundManager: { play: vi.fn() },
}));

function makeVictoryScreen(): { state: GameState; screen: VictoryScreen } {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('atlantic_alliance', {
    name: 'Atlantic Alliance',
    capital: 'washington',
    turnOrder: 1,
  }));
  state.factionRegistry.register(makeFactionData('eastern_coalition', {
    name: 'Eastern Coalition',
    capital: 'moscow',
    turnOrder: 2,
  }));
  state.factionRegistry.get('atlantic_alliance')!.controlledBy = 'human';
  state.factionRegistry.get('eastern_coalition')!.controlledBy = 'ai';
  state.currentFactionId = 'eastern_coalition';
  state.territories.set('washington', makeTerritory('washington', 'atlantic_alliance'));
  state.territories.set('moscow', makeTerritory('moscow', 'eastern_coalition'));

  const screen = new VictoryScreen(
    state,
    () => ({
      ...defaultConfig,
      humanFactions: ['atlantic_alliance'],
      startTime: Date.now(),
    }),
    { showMainMenu: vi.fn() }
  );
  vi.spyOn(screen, 'runConfetti').mockImplementation(() => undefined);
  return { state, screen };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('VictoryScreen', () => {
  it('treats the configured human faction as the player even if it is not the current faction', () => {
    const { screen } = makeVictoryScreen();

    screen.show({ winner: 'atlantic_alliance' });

    expect(document.querySelector('#victory-modal h2')?.textContent).toContain('VICTORY');
    expect(document.querySelector('#victory-modal')?.textContent).toContain('has conquered the world');
    expect(document.querySelector('#victory-modal')?.textContent).not.toContain('has defeated you');
  });

  it('does not create duplicate victory modals for repeated winner events', () => {
    const { screen } = makeVictoryScreen();

    screen.show({ winner: 'atlantic_alliance' });
    screen.show({ winner: 'atlantic_alliance' });

    expect(document.querySelectorAll('#victory-modal')).toHaveLength(1);
  });
});
