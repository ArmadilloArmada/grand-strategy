/**
 * AI Web Worker — pure computation, no DOM or GameState class imports.
 * Receives a serialized state snapshot, returns planned actions + territory evaluations.
 */

import type {
  AIWorkerState,
  AIWorkerTerritory,
  AIWorkerRequest,
  AIWorkerResponse,
  AIPlannedAction,
} from './aiWorkerTypes';

// ── Territory evaluation ─────────────────────────────────────────────────────

function getEnemies(state: AIWorkerState): string[] {
  return state.factions
    .filter(f => f.id !== state.factionId && !f.isDefeated)
    .filter(f => (state.relations[`${state.factionId}|${f.id}`] ?? 'war') === 'war')
    .map(f => f.id);
}

function unitStrength(units: { unitTypeId: string; count: number }[], unitTypes: AIWorkerState['unitTypes'], stat: 'attack' | 'defense'): number {
  return units.reduce((sum, u) => {
    const ut = unitTypes.find(t => t.id === u.unitTypeId);
    return sum + (ut ? ut[stat] * u.count : u.count);
  }, 0);
}

function evaluateTerritory(
  territory: AIWorkerTerritory,
  state: AIWorkerState,
  enemies: string[]
): { strategicValue: number; threatLevel: number } {
  let strategicValue = territory.production;
  if (territory.isCapital) strategicValue += 15;
  if (territory.hasFactory) strategicValue += 5;
  if (territory.originalOwner === state.factionId) strategicValue += 3; // recapture bonus

  // Threat: sum of adjacent enemy combat strength
  let threatLevel = 0;
  for (const adjId of territory.adjacentTo) {
    const adj = state.territories.find(t => t.id === adjId);
    if (!adj || !adj.owner || !enemies.includes(adj.owner)) continue;
    threatLevel += unitStrength(adj.units, state.unitTypes, 'attack');
  }

  return { strategicValue, threatLevel };
}

// ── Attack planning ──────────────────────────────────────────────────────────

function planAttacks(state: AIWorkerState, enemies: string[]): AIPlannedAction[] {
  const actions: AIPlannedAction[] = [];
  const ownTerritories = state.territories.filter(t => t.owner === state.factionId && t.type !== 'sea');

  for (const src of ownTerritories) {
    const attackStrength = unitStrength(src.units, state.unitTypes, 'attack');
    if (attackStrength === 0) continue;

    // Find adjacent enemy territories
    const targets = src.adjacentTo
      .map(id => state.territories.find(t => t.id === id))
      .filter((t): t is AIWorkerTerritory => !!t && !!t.owner && enemies.includes(t.owner) && t.type !== 'sea')
      .sort((a, b) => {
        const evalA = evaluateTerritory(a, state, enemies);
        const evalB = evaluateTerritory(b, state, enemies);
        // Prefer high-value, low-defense targets
        return (evalB.strategicValue - unitStrength(b.units, state.unitTypes, 'defense')) -
               (evalA.strategicValue - unitStrength(a.units, state.unitTypes, 'defense'));
      });

    if (targets.length === 0) continue;
    const target = targets[0];
    const defenseStrength = unitStrength(target.units, state.unitTypes, 'defense');

    // Only attack if we have advantage (respect risk tolerance)
    const threshold = 1.0 + (1.0 - state.personality.riskTolerance) * 0.5;
    if (attackStrength < defenseStrength * threshold && state.personality.aggression <= 0.7) continue;

    // Queue all attackable units
    for (const unit of src.units) {
      if (unit.count > 0) {
        const ut = state.unitTypes.find(t => t.id === unit.unitTypeId);
        if (!ut || ut.domain === 'sea') continue;
        actions.push({ type: 'attack', fromId: src.id, toId: target.id, unitTypeId: unit.unitTypeId, count: unit.count });
      }
    }
  }

  return actions;
}

// ── Movement planning ────────────────────────────────────────────────────────

function planMoves(state: AIWorkerState, enemies: string[]): AIPlannedAction[] {
  const actions: AIPlannedAction[] = [];
  const ownTerritories = state.territories.filter(t => t.owner === state.factionId && t.type !== 'sea');

  for (const src of ownTerritories) {
    if (src.units.length === 0) continue;

    // Find adjacent own territories that are threatened or near the front
    const frontlineDests = src.adjacentTo
      .map(id => state.territories.find(t => t.id === id))
      .filter((t): t is AIWorkerTerritory => !!t && t.owner === state.factionId && t.type !== 'sea')
      .filter(t => t.adjacentTo.some(adjId => {
        const adj = state.territories.find(x => x.id === adjId);
        return adj && adj.owner && enemies.includes(adj.owner);
      }));

    if (frontlineDests.length === 0) continue;
    const dest = frontlineDests[0];

    // Move half the units toward frontline
    for (const unit of src.units) {
      const toMove = Math.floor(unit.count / 2);
      if (toMove === 0) continue;
      const ut = state.unitTypes.find(t => t.id === unit.unitTypeId);
      if (!ut || ut.domain === 'sea') continue;
      actions.push({ type: 'move', fromId: src.id, toId: dest.id, unitTypeId: unit.unitTypeId, count: toMove });
    }
  }

  return actions;
}

// ── Purchase planning ────────────────────────────────────────────────────────

function planPurchases(state: AIWorkerState): AIPlannedAction[] {
  const actions: AIPlannedAction[] = [];
  let remainingIPCs = state.ipcs;

  // Find own factory territories
  const factories = state.territories.filter(
    t => t.owner === state.factionId && t.hasFactory && t.type !== 'sea'
  );
  if (factories.length === 0) return actions;

  // Prefer infantry (cheapest, always useful) then tanks for aggression
  const preferredUnits = state.unitTypes
    .filter(u => u.domain === 'land')
    .sort((a, b) => {
      // Score: lower cost is better; aggression weights attack
      const scoreA = a.attack * state.personality.aggression + a.defense * state.personality.defense - a.cost * 0.1;
      const scoreB = b.attack * state.personality.aggression + b.defense * state.personality.defense - b.cost * 0.1;
      return scoreB - scoreA;
    });

  for (const unit of preferredUnits) {
    while (remainingIPCs >= unit.cost && actions.filter(a => a.type === 'mobilize').length < 6) {
      actions.push({ type: 'mobilize', territoryId: factories[0].id });
      remainingIPCs -= unit.cost;
    }
  }

  return actions;
}

// ── Main handler ─────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<AIWorkerRequest>) => {
  const { state } = e.data;
  const enemies = getEnemies(state);

  const evaluations = state.territories
    .filter(t => t.type !== 'sea')
    .map(t => ({ territoryId: t.id, ...evaluateTerritory(t, state, enemies) }));

  const actions: AIPlannedAction[] = [
    ...planPurchases(state),
    ...planAttacks(state, enemies),
    ...planMoves(state, enemies),
  ];

  const response: AIWorkerResponse = { actions, evaluations };
  self.postMessage(response);
};
