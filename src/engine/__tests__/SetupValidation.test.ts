import { describe, expect, it } from 'vitest';
import type { FactionData } from '../../data/Faction';
import { getMaxCapturableCapitals, normalizeCapitalsToWin, normalizeHumanFactions } from '../SetupValidation';

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
