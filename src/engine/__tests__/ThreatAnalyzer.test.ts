import { describe, expect, it } from 'vitest';
import { GameState } from '../GameState';
import { calculateTerritoryThreat, getThreatenedTerritoryIds } from '../ThreatAnalyzer';
import { makeFactionData, makeTerritory, makeUnitData } from './testHelpers';

function buildThreatState(): GameState {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('player', { capital: 'capital' }));
  state.factionRegistry.register(makeFactionData('enemy', { capital: 'enemy_base' }));
  state.unitRegistry.register(makeUnitData({ id: 'infantry', attack: 1, defense: 2, cost: 3 }));
  state.unitRegistry.register(makeUnitData({ id: 'tank', attack: 3, defense: 3, cost: 6, canBlitz: true }));

  const front = makeTerritory('front', 'player', { adjacentTo: ['enemy_base', 'safe'] });
  front.addUnits('infantry', 1);

  const safe = makeTerritory('safe', 'player', { adjacentTo: ['front'] });
  safe.addUnits('infantry', 2);

  const enemyBase = makeTerritory('enemy_base', 'enemy', { adjacentTo: ['front'] });
  enemyBase.addUnits('tank', 2);

  state.territories.set('front', front);
  state.territories.set('safe', safe);
  state.territories.set('enemy_base', enemyBase);
  state.currentFactionId = 'player';

  return state;
}

describe('ThreatAnalyzer', () => {
  it('calculates adjacent enemy pressure and defense gap', () => {
    const state = buildThreatState();
    const faction = state.factionRegistry.get('player')!;
    const front = state.territories.get('front')!;

    const threat = calculateTerritoryThreat(state, front, faction);

    expect(threat.threatLevel).toBe(9);
    expect(threat.defenseStrength).toBe(3.5);
    expect(threat.defenseGap).toBe(5.5);
    expect(threat.attackerCount).toBe(2);
    expect(threat.enemyTerritoryIds).toEqual(['enemy_base']);
  });

  it('returns owned territories under immediate threat', () => {
    const state = buildThreatState();
    const faction = state.factionRegistry.get('player')!;

    expect(getThreatenedTerritoryIds(state, faction)).toEqual(new Set(['front']));
  });
});
