import { describe, it, expect } from 'vitest';
import wwiUnits from '../../../assets/units/wwi-units.json';
import wwiiUnits from '../../../assets/units/wwii-units.json';
import coldwarUnits from '../../../assets/units/coldwar-units.json';
import modernUnits from '../../../assets/units/modern-units.json';
import type { UnitTypeData } from '../../data/Unit';

type EraId = 'wwi' | 'wwii' | 'coldwar' | 'modern';

const ERA_UNITS: Record<EraId, UnitTypeData[]> = {
  wwi: wwiUnits as UnitTypeData[],
  wwii: wwiiUnits as UnitTypeData[],
  coldwar: coldwarUnits as UnitTypeData[],
  modern: modernUnits as UnitTypeData[],
};

function movement(era: EraId, unitId: string): number | undefined {
  return ERA_UNITS[era].find(u => u.id === unitId)?.movement;
}

describe('era unit movement progression', () => {
  const eras: EraId[] = ['wwi', 'wwii', 'coldwar', 'modern'];

  it('each era has at least one unit with movement defined', () => {
    for (const era of eras) {
      expect(ERA_UNITS[era].every(u => u.movement >= 1)).toBe(true);
    }
  });

  it('infantry speeds up from WWI baseline to modern', () => {
    expect(movement('wwi', 'infantry')).toBe(1);
    expect(movement('wwii', 'infantry')).toBe(1);
    expect(movement('coldwar', 'infantry')).toBe(1);
    expect(movement('modern', 'infantry')).toBe(2);
  });

  it('fighters gain range each era', () => {
    expect(movement('wwi', 'fighter')).toBe(2);
    expect(movement('wwii', 'fighter')).toBe(3);
    expect(movement('coldwar', 'fighter')).toBe(4);
    expect(movement('modern', 'fighter')).toBe(5);
  });

  it('destroyers gain range from WWI through modern', () => {
    expect(movement('wwi', 'destroyer')).toBe(2);
    expect(movement('wwii', 'destroyer')).toBe(2);
    expect(movement('coldwar', 'destroyer')).toBe(3);
    expect(movement('modern', 'destroyer')).toBe(4);
  });

  it('WWI naval units are slower than WWII equivalents', () => {
    expect(movement('wwi', 'battleship')!).toBeLessThan(movement('wwii', 'battleship')!);
    expect(movement('wwi', 'submarine')!).toBeLessThan(movement('wwii', 'submarine')!);
    expect(movement('wwi', 'transport')!).toBeLessThan(movement('wwii', 'transport')!);
  });

  it('modern armor outranges WWII armor', () => {
    expect(movement('wwii', 'tank')).toBe(2);
    expect(movement('modern', 'tank')).toBe(3);
  });

  it('later eras never reduce movement for shared unit ids', () => {
    for (const unitId of ['infantry', 'fighter', 'destroyer', 'submarine', 'transport']) {
      let lastMovement = 0;
      for (const era of eras) {
        const value = movement(era, unitId);
        if (value === undefined) continue;
        expect(value).toBeGreaterThanOrEqual(lastMovement);
        lastMovement = value;
      }
    }

    expect(movement('wwii', 'tank')).toBeLessThanOrEqual(movement('coldwar', 'tank')!);
    expect(movement('coldwar', 'tank')).toBeLessThanOrEqual(movement('modern', 'tank')!);
  });
});
