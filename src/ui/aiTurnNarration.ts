/**
 * Pure helpers for narrating AI turns and strategic events.
 *
 * Extracted from the main Game class so the presentation logic is testable in
 * isolation and the god-file shrinks. None of these touch DOM or class state.
 */

import type { GameState } from '../engine/GameState';

export interface AIFactionSummary {
  territories: number;
  units: number;
  ipcs: number;
  capitals: number;
}

export interface EventEffectSummary {
  type: string;
  value?: number;
  unitType?: string;
  duration?: number;
}

/** Snapshot a faction's holdings for before/after AI-turn comparisons. */
export function summarizeFactionForAI(state: GameState, factionId: string): AIFactionSummary {
  const faction = state.factionRegistry.get(factionId);
  const territories = Array.from(state.territories.values()).filter(t => t.owner === factionId);
  return {
    territories: territories.length,
    units: territories.reduce((sum, territory) => sum + territory.getTotalUnitCount(), 0),
    ipcs: faction?.ipcs ?? 0,
    capitals: territories.filter(t => t.isCapital).length,
  };
}

/** Human-readable summary of what an AI faction accomplished in its turn. */
export function describeAITurnDelta(before: AIFactionSummary, after: AIFactionSummary): string {
  const territoryDelta = after.territories - before.territories;
  const unitDelta = after.units - before.units;
  const ipcDelta = after.ipcs - before.ipcs;
  const parts: string[] = [];
  if (territoryDelta > 0) parts.push(`captured ${territoryDelta} territor${territoryDelta === 1 ? 'y' : 'ies'}`);
  if (territoryDelta < 0) parts.push(`lost ${Math.abs(territoryDelta)} territor${territoryDelta === -1 ? 'y' : 'ies'}`);
  if (unitDelta > 0) parts.push(`added ${unitDelta} units`);
  if (unitDelta < 0) parts.push(`lost ${Math.abs(unitDelta)} units`);
  if (ipcDelta > 0) parts.push(`banked +${ipcDelta} IPC`);
  if (ipcDelta < 0) parts.push(`spent ${Math.abs(ipcDelta)} IPC`);
  if (after.capitals > before.capitals) parts.unshift('captured a capital');
  return parts.length > 0 ? parts.slice(0, 3).join(', ') : 'held position and reorganized';
}

/** Short label for an AI personality's doctrine. */
export function describeAIDoctrine(personality?: string): string {
  switch (personality) {
    case 'aggressive': return 'aggressive';
    case 'defensive': return 'defensive';
    case 'economic': return 'economic';
    case 'balanced': return 'balanced';
    default: return 'standard';
  }
}

/** Render strategic-event effects as an HTML fragment for the event modal. */
export function formatEventEffects(effects: EventEffectSummary[]): string {
  if (effects.length === 0) return '<span style="color: #666;">No immediate effects</span>';

  return effects.map(e => {
    const sign = (e.value ?? 0) >= 0 ? '+' : '';
    switch (e.type) {
      case 'ipc_bonus': return `<span style="color: #22c55e;">💰 ${sign}${e.value} IPCs</span>`;
      case 'ipc_penalty': return `<span style="color: #ef4444;">💸 -${e.value} IPCs</span>`;
      case 'unit_spawn': return `<span style="color: #22c55e;">🎖️ +${e.value} ${e.unitType || 'units'}</span>`;
      case 'unit_loss': return `<span style="color: #ef4444;">☠️ -${e.value} ${e.unitType || 'units'}</span>`;
      case 'attack_bonus': return `<span style="color: #f59e0b;">⚔️ +${e.value} attack${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
      case 'defense_bonus': return `<span style="color: #3b82f6;">🛡️ +${e.value} defense${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
      case 'movement_bonus': return `<span style="color: #8b5cf6;">🚀 ${sign}${e.value} movement${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
      case 'production_bonus': return `<span style="color: #22c55e;">🏭 +${e.value} production${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
      case 'factory_damage': return `<span style="color: #ef4444;">💥 Factory damaged</span>`;
      case 'morale_boost': return `<span style="color: #22c55e;">✨ Morale boost</span>`;
      case 'intel_reveal': return `<span style="color: #3b82f6;">🕵️ Enemy intel revealed</span>`;
      default: return `<span>${e.type}</span>`;
    }
  }).join('<br>');
}
