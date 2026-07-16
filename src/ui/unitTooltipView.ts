/**
 * Builds the inner HTML for the unit hover tooltip. Pure: the caller handles
 * DOM lookup/positioning and supplies the unit's icon plus current tech/morale
 * context.
 */

import type { UnitType } from '../data/Unit';

/** Combat roll modifier derived from a faction's morale (0-100). */
export function moraleCombatModifier(morale: number): number {
  return morale >= 80 ? +1 : morale >= 50 ? 0 : morale >= 35 ? -1 : morale >= 20 ? -2 : -3;
}

export function buildUnitTooltipHtml(
  unitType: UnitType,
  icon: string,
  techAttackBonus: number,
  techDefenseBonus: number,
  morale: number,
): string {
  const atkDisplay = techAttackBonus
    ? `${unitType.attack} <span style="color:#22c55e;font-size:0.8em;">(+${techAttackBonus} tech)</span>`
    : String(unitType.attack);
  const defDisplay = techDefenseBonus
    ? `${unitType.defense} <span style="color:#22c55e;font-size:0.8em;">(+${techDefenseBonus} tech)</span>`
    : String(unitType.defense);

  const moraleMod = moraleCombatModifier(morale);
  const moraleColor = moraleMod > 0 ? '#22c55e' : moraleMod < 0 ? '#ef4444' : '#aaa';
  const moraleStr = moraleMod > 0 ? `+${moraleMod}` : String(moraleMod);

  return `
      <div class="tooltip-title">${icon} ${unitType.name}</div>
      <div class="tooltip-stat"><span>Attack:</span><span>${atkDisplay}</span></div>
      <div class="tooltip-stat"><span>Defense:</span><span>${defDisplay}</span></div>
      <div class="tooltip-stat"><span>Movement:</span><span>${unitType.movement}</span></div>
      <div class="tooltip-stat"><span>Cost:</span><span>${unitType.cost} IPCs</span></div>
      <div class="tooltip-stat"><span>Domain:</span><span>${unitType.domain}</span></div>
      ${unitType.hitPoints > 1 ? `<div class="tooltip-stat"><span>Hit Points:</span><span>${unitType.hitPoints}</span></div>` : ''}
      ${moraleMod !== 0 ? `<div class="tooltip-stat"><span>Morale mod:</span><span style="color:${moraleColor}">${moraleStr} all rolls</span></div>` : ''}
      ${unitType.canBlitz ? '<div style="color: #8b6914; margin-top: 0.5rem;">⚡ Can Blitz</div>' : ''}
      ${unitType.canBombard ? '<div style="color: #2563a8; margin-top: 0.25rem;">💥 Bombardment</div>' : ''}
      ${unitType.canStrategicBomb ? '<div style="color: #dc2626; margin-top: 0.25rem;">🏭 Strategic Bombing</div>' : ''}
      ${unitType.requiredTransport ? '<div style="color: #6366f1; margin-top: 0.25rem;">⚓ Needs Transport</div>' : ''}
    `;
}
