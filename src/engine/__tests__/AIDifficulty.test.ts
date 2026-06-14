import { describe, expect, it } from 'vitest';
import { GameState } from '../GameState';
import { MobilizationSystem } from '../MobilizationSystem';
import {
  applyDifficultyToPersonality,
  clonePersonality,
  getMaxMobilizationsForTurn,
  isNavalFleetSaturated,
  MOBILIZATION_LIMITS,
  shouldSkipNavalHeavyMobilization,
} from '../AIDifficulty';
import { getPersonality } from '../AIPersonalities';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

describe('AIDifficulty', () => {
  it('easy difficulty reduces naval focus and increases patience', () => {
    const personality = clonePersonality(getPersonality('balanced'));
    applyDifficultyToPersonality(personality, 'easy');
    expect(personality.naval).toBeLessThan(0.25);
    expect(personality.patience).toBeGreaterThanOrEqual(0.72);
  });

  it('hard difficulty keeps stronger naval focus than easy', () => {
    const easy = clonePersonality(getPersonality('naval'));
    const hard = clonePersonality(getPersonality('naval'));
    applyDifficultyToPersonality(easy, 'easy');
    applyDifficultyToPersonality(hard, 'hard');
    expect(hard.naval).toBeGreaterThan(easy.naval);
  });

  it('limits mobilizations per turn by difficulty', () => {
    expect(getMaxMobilizationsForTurn('easy', 0.5)).toBe(1);
    expect(getMaxMobilizationsForTurn('medium', 0.5)).toBe(2);
    expect(getMaxMobilizationsForTurn('hard', 0.5)).toBe(3);
    expect(getMaxMobilizationsForTurn('hard', 0.8)).toBe(2);
  });

  it('detects naval fleet saturation', () => {
    const limits = MOBILIZATION_LIMITS.medium;
    expect(isNavalFleetSaturated(20, 40, limits)).toBe(true);
    expect(isNavalFleetSaturated(4, 40, limits)).toBe(false);
  });

  it('skips coastal mobilization when navy is saturated on easy', () => {
    const state = new GameState();
    state.factionRegistry.register(makeFactionData('ai', { capital: 'port', allies: [], startingIPCs: 50 }));
    state.currentFactionId = 'ai';
    state.unitRegistry.register(makeUnitData({ id: 'destroyer', domain: 'sea' as any }));
    state.unitRegistry.register(makeUnitData({ id: 'transport', domain: 'sea' as any, transportCapacity: 2, attack: 0, defense: 0 }));
    state.unitRegistry.register(makeUnitData({ id: 'infantry' }));

    const sea = makeTerritory('sea1', 'ai', { type: 'sea' as any, adjacentTo: ['port'] });
    sea.addUnits('destroyer', 10);
    const port = makeTerritory('port', 'ai', {
      type: 'coastal' as any,
      production: 3,
      adjacentTo: ['sea1'],
    });
    state.territories.set('sea1', sea);
    state.territories.set('port', port);

    const sys = new MobilizationSystem(state);
    const coastalOption = sys.getTerritoryMobilization(port);
    expect(coastalOption.type).toBe('coastal');

    expect(shouldSkipNavalHeavyMobilization(
      coastalOption,
      10,
      6,
      MOBILIZATION_LIMITS.easy,
      'easy',
    )).toBe(true);

    expect(shouldSkipNavalHeavyMobilization(
      coastalOption,
      12,
      40,
      MOBILIZATION_LIMITS.hard,
      'hard',
    )).toBe(false);
  });
});
