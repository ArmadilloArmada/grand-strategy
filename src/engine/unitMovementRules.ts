import type { UnitType } from '../data/Unit';

const SELF_EMBARK_UNIT_IDS = new Set(['infantry', 'mech_infantry', 'marines']);

/** Infantry-style units that may self-embark across friendly/neutral seas. */
export function usesImplicitAmphibious(unitType: UnitType): boolean {
  return unitType.domain === 'land' && SELF_EMBARK_UNIT_IDS.has(unitType.id);
}
