import { describe, it, expect } from 'vitest';
import { canIssueOrdersFromTerritory, territoryHasAvailableUnits } from '../territoryControl';
import { makeTerritory } from './testHelpers';

describe('territoryControl', () => {
  it('allows orders from owned land', () => {
    const land = makeTerritory('land', 'player');
    expect(canIssueOrdersFromTerritory(land, 'player')).toBe(true);
  });

  it('blocks orders from enemy land without friendly units', () => {
    const land = makeTerritory('land', 'enemy');
    expect(canIssueOrdersFromTerritory(land, 'player')).toBe(false);
  });

  it('allows naval orders from neutral sea with friendly fleet', () => {
    const sea = makeTerritory('sea1', null, { type: 'sea' });
    sea.units.push({ unitTypeId: 'destroyer', count: 1 });
    expect(canIssueOrdersFromTerritory(sea, 'player')).toBe(true);
  });

  it('blocks naval orders when fleet has already acted', () => {
    const sea = makeTerritory('sea1', null, { type: 'sea' });
    sea.units.push({ unitTypeId: 'destroyer', count: 1 });
    sea.markUnitsActed('destroyer', 1);
    expect(canIssueOrdersFromTerritory(sea, 'player')).toBe(false);
    expect(territoryHasAvailableUnits(sea)).toBe(false);
  });
});
