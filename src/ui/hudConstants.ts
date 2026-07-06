import type { UnitEra } from '../engine/GameConfig';

export const UNIT_ICONS: Record<string, string> = {
  infantry: '🚶',
  mech_infantry: '🏃',
  marines: '🪖',
  tank: '🛡️',
  artillery: '💥',
  anti_air: '🎯',
  marine: '🪖',
  guards: '🛡',
  raider: '⚡',
  guerrilla: '🌿',
  partisan: '🗡',
  fighter: '✈️',
  bomber: '🛩️',
  battleship: '🚢',
  carrier: '🛳️',
  cruiser: '⛵',
  destroyer: '🚤',
  submarine: '🐋',
  transport: '📦',
};

const NAVAL_ERA_ICONS: Record<UnitEra, Partial<Record<string, string>>> = {
  wwi: {
    battleship: '⚓',
    destroyer: '🛶',
    submarine: '🦈',
    transport: '⛵',
  },
  wwii: {
    battleship: '🚢',
    carrier: '🛳️',
    cruiser: '⛵',
    destroyer: '🚤',
    submarine: '🐋',
    transport: '📦',
  },
  coldwar: {
    battleship: '🚢',
    carrier: '🛳️',
    cruiser: '⚓',
    destroyer: '🛡️',
    submarine: '🐳',
    transport: '🚢',
  },
  modern: {
    battleship: '🚢',
    carrier: '✈️',
    cruiser: '🛡️',
    destroyer: '⚔️',
    submarine: '🔱',
    transport: '🏗️',
  },
};

export function getUnitIcon(unitTypeId: string, era?: UnitEra): string {
  if (era) {
    const eraIcon = NAVAL_ERA_ICONS[era]?.[unitTypeId];
    if (eraIcon) return eraIcon;
  }
  return UNIT_ICONS[unitTypeId] ?? '⬜';
}
