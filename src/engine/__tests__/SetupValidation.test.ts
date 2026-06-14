import { describe, expect, it } from 'vitest';
import type { FactionData } from '../../data/Faction';
import { GameState } from '../GameState';
import { makeFactionData, makeTerritory } from './testHelpers';
import {
  applyMatchSetupToState,
  getMaxCapturableCapitals,
  getMaxCapitalsForMatch,
  normalizeCapitalsToWin,
  normalizeCapitalsToWinForMatch,
  normalizeHumanFactions,
  resolveMatchSetup,
} from '../SetupValidation';

const factions: FactionData[] = [
  { id: 'alpha', name: 'Alpha', color: '#111111', colorLight: '#333333', capital: 'a', startingIPCs: 10, turnOrder: 2, isPlayable: true, allies: [] },
  { id: 'bravo', name: 'Bravo', color: '#222222', colorLight: '#444444', capital: 'b', startingIPCs: 10, turnOrder: 1, isPlayable: true, allies: [] },
  { id: 'neutral', name: 'Neutral', color: '#555555', colorLight: '#777777', capital: 'n', startingIPCs: 0, turnOrder: 3, isPlayable: false, allies: [] },
];

describe('normalizeHumanFactions', () => {
  it('keeps valid playable faction selections in order without duplicates', () => {
    expect(normalizeHumanFactions(['alpha', 'alpha', 'bravo'], factions)).toEqual(['alpha', 'bravo']);
  });

  it('drops stale or non-playable faction ids', () => {
    expect(normalizeHumanFactions(['atlantic_alliance', 'neutral', 'alpha'], factions)).toEqual(['alpha']);
  });

  it('falls back to the first playable faction by turn order', () => {
    expect(normalizeHumanFactions(['missing'], factions)).toEqual(['bravo']);
    expect(normalizeHumanFactions(undefined, factions)).toEqual(['bravo']);
  });
});

describe('capital victory setup validation', () => {
  it('limits capturable capitals to the number of opposing playable factions', () => {
    expect(getMaxCapturableCapitals(factions)).toBe(1);
    expect(normalizeCapitalsToWin(3, factions)).toBe(1);
  });

  it('keeps capital victory requirements within a playable range', () => {
    const fourPlayerFactions = [
      ...factions,
      { id: 'charlie', name: 'Charlie', color: '#333333', colorLight: '#555555', capital: 'c', startingIPCs: 10, turnOrder: 3, isPlayable: true, allies: [] },
      { id: 'delta', name: 'Delta', color: '#444444', colorLight: '#666666', capital: 'd', startingIPCs: 10, turnOrder: 4, isPlayable: true, allies: [] },
    ];
    expect(getMaxCapturableCapitals(fourPlayerFactions)).toBe(3);
    expect(normalizeCapitalsToWin(0, fourPlayerFactions)).toBe(1);
    expect(normalizeCapitalsToWin(2, fourPlayerFactions)).toBe(2);
    expect(normalizeCapitalsToWin(99, fourPlayerFactions)).toBe(3);
  });
});

const fourPlayerFactions: FactionData[] = [
  { id: 'alpha', name: 'Alpha', color: '#111111', colorLight: '#333333', capital: 'a_cap', startingIPCs: 10, turnOrder: 1, isPlayable: true, allies: [] },
  { id: 'bravo', name: 'Bravo', color: '#222222', colorLight: '#444444', capital: 'b_cap', startingIPCs: 10, turnOrder: 2, isPlayable: true, allies: [] },
  { id: 'charlie', name: 'Charlie', color: '#333333', colorLight: '#555555', capital: 'c_cap', startingIPCs: 10, turnOrder: 3, isPlayable: true, allies: [] },
  { id: 'delta', name: 'Delta', color: '#444444', colorLight: '#666666', capital: 'd_cap', startingIPCs: 10, turnOrder: 4, isPlayable: true, allies: [] },
];

describe('resolveMatchSetup', () => {
  it('caps AI opponents to the selected count', () => {
    const setup = resolveMatchSetup({
      mode: 'vs-ai',
      humanFactionIds: ['alpha'],
      availableFactions: fourPlayerFactions,
      pickedOpponentIds: ['bravo', 'charlie', 'delta'],
      opponentCountRaw: '1',
    });
    expect(setup.aiOpponentIds).toEqual(['bravo']);
    expect(setup.activeFactionIds).toEqual(['alpha', 'bravo']);
  });

  it('activates only selected human factions in hot seat', () => {
    const setup = resolveMatchSetup({
      mode: 'hotseat',
      humanFactionIds: ['alpha', 'bravo'],
      availableFactions: fourPlayerFactions,
    });
    expect(setup.aiOpponentIds).toEqual([]);
    expect(setup.activeFactionIds).toEqual(['alpha', 'bravo']);
  });

  it('includes declared allies in the active set', () => {
    const alliedFactions: FactionData[] = [
      { id: 'allies', name: 'Allies', color: '#1', colorLight: '#2', capital: 'a', startingIPCs: 10, turnOrder: 1, isPlayable: true, allies: ['partner'] },
      { id: 'partner', name: 'Partner', color: '#3', colorLight: '#4', capital: 'p', startingIPCs: 10, turnOrder: 2, isPlayable: true, allies: ['allies'] },
      { id: 'enemy', name: 'Enemy', color: '#5', colorLight: '#6', capital: 'e', startingIPCs: 10, turnOrder: 3, isPlayable: true, allies: [] },
    ];
    const setup = resolveMatchSetup({
      mode: 'vs-ai',
      humanFactionIds: ['allies'],
      availableFactions: alliedFactions,
      pickedOpponentIds: ['enemy'],
      opponentCountRaw: '1',
    });
    expect(setup.activeFactionIds).toEqual(['allies', 'partner', 'enemy']);
  });
});

describe('withdrawInactiveFactionsFromMap', () => {
  it('neutralizes territories and units for factions not in the match', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('alpha', { turnOrder: 1 }));
    state.factionRegistry.register(makeFactionData('bravo', { turnOrder: 2 }));
    state.factionRegistry.register(makeFactionData('charlie', { turnOrder: 3 }));
    state.territories.set('a_cap', makeTerritory('a_cap', 'alpha', { isCapital: true }));
    state.territories.set('b_cap', makeTerritory('b_cap', 'bravo', { isCapital: true }));
    state.territories.set('c_cap', makeTerritory('c_cap', 'charlie', { isCapital: true }));
    state.territories.get('b_cap')!.addUnits('infantry', 3);
    state.territories.get('c_cap')!.addUnits('infantry', 2);

    applyMatchSetupToState(state, {
      humanFactionIds: ['alpha'],
      aiOpponentIds: ['bravo'],
      activeFactionIds: ['alpha', 'bravo'],
      aiOpponentCount: 1,
    });

    expect(state.factionRegistry.getActive().map(f => f.id)).toEqual(['alpha', 'bravo']);
    expect(state.territories.get('b_cap')!.owner).toBe('bravo');
    expect(state.territories.get('c_cap')!.owner).toBeNull();
    expect(state.territories.get('c_cap')!.units).toHaveLength(0);
    expect(state.factionRegistry.get('charlie')!.ipcs).toBe(0);
  });
});

describe('normalizeCapitalsToWinForMatch', () => {
  it('limits capitals victory to active enemy count', () => {
    const active = ['alpha', 'bravo'];
    expect(getMaxCapitalsForMatch(active, ['alpha'], fourPlayerFactions)).toBe(1);
    expect(normalizeCapitalsToWinForMatch(3, active, ['alpha'], fourPlayerFactions)).toBe(1);
  });
});
