import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState';
import { MovementValidator } from '../MovementValidator';
import { DataLoader } from '../../loaders/DataLoader';
import gridWorldMap from '../../../assets/maps/grid-world-map.json';
import gridWorldMapMega from '../../../assets/maps/grid-world-map-mega.json';
import unitsData from '../../../assets/units/wwii-units.json';
import factionsData from '../../../assets/factions/world-factions.json';
import type { MapData } from '../../loaders/MapLoader';
import type { FactionData } from '../../data/Faction';
import type { UnitTypeData } from '../../data/Unit';

function load(map: MapData, factionId: string, fromId: string) {
  const state = new GameState();
  new DataLoader(state).loadBundle({
    units: unitsData as unknown as UnitTypeData[],
    factions: factionsData as FactionData[],
    map,
  });
  state.currentFactionId = factionId;
  const from = state.territories.get(fromId)!;
  from.units = [{ unitTypeId: 'fighter', count: 1 }];
  return { state, validator: new MovementValidator(state) };
}

describe('fighter movement from Finland & Baltics', () => {
  it('grid map: can reach adjacent e_germany (friendly) in noncombat', () => {
    const { validator } = load(gridWorldMap as unknown as MapData, 'eastern_coalition', 'fin_balt');
    const moves = validator.getValidMoves('fighter', 'fin_balt', 'noncombat');
    expect(moves.some(m => m.territoryId === 'e_germany' && !m.isAttack)).toBe(true);
  });

  it('grid map: can attack adjacent enemy territory in combat', () => {
    const { state, validator } = load(gridWorldMap as unknown as MapData, 'eastern_coalition', 'fin_balt');
    const uk = state.territories.get('uk')!;
    uk.owner = 'atlantic_alliance';
    const moves = validator.getValidMoves('fighter', 'fin_balt', 'combined');
    expect(moves.some(m => m.territoryId === 'uk' && m.isAttack)).toBe(true);
  });

  it('grid map: cannot attack adjacent enemy during noncombat move', () => {
    const { state, validator } = load(gridWorldMap as unknown as MapData, 'eastern_coalition', 'fin_balt');
    const uk = state.territories.get('uk')!;
    uk.owner = 'atlantic_alliance';
    const noncombat = validator.getValidMoves('fighter', 'fin_balt', 'noncombat');
    expect(noncombat.some(m => m.territoryId === 'uk' && m.isAttack)).toBe(false);
  });

  it('mega map: northern fin_balt sub-tile reaches e_germany in two steps', () => {
    const { validator } = load(gridWorldMapMega as unknown as MapData, 'eastern_coalition', 'fin_balt__1_0');
    const moves = validator.getValidMoves('fighter', 'fin_balt__1_0', 'noncombat');
    const eGermany = moves.filter(m => m.territoryId.startsWith('e_germany'));
    expect(eGermany.length).toBeGreaterThan(0);
  });
});
