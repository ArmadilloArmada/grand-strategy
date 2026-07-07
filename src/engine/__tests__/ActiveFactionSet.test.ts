/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { GameState } from '../GameState';
import { makeFactionData } from './testHelpers';

function buildState(): GameState {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('atlantic_alliance', { turnOrder: 1 }));
  state.factionRegistry.register(makeFactionData('eastern_coalition', { turnOrder: 2 }));
  state.factionRegistry.register(makeFactionData('pacific_union', { turnOrder: 3 }));
  state.factionRegistry.register(makeFactionData('southern_federation', { turnOrder: 4 }));
  return state;
}

describe('GameState save/load preserves Faction.isActive', () => {
  it('round-trips the active set through createSnapshot / restoreFromSnapshot', () => {
    const state = buildState();
    const eastern = state.factionRegistry.get('eastern_coalition')!;
    const pacific = state.factionRegistry.get('pacific_union')!;
    eastern.isActive = false;
    pacific.isActive = false;

    const snapshot = state.createSnapshot();

    // Mutate the live registry to confirm the restore actually overwrites.
    eastern.isActive = true;
    pacific.isActive = true;
    state.restoreFromSnapshot(snapshot);

    expect(state.factionRegistry.get('eastern_coalition')!.isActive).toBe(false);
    expect(state.factionRegistry.get('pacific_union')!.isActive).toBe(false);
    expect(state.factionRegistry.getActive().map(f => f.id)).toEqual([
      'atlantic_alliance',
      'southern_federation',
    ]);
  });

  it('treats pre-active-set saves as all-active for backward compatibility', () => {
    const state = buildState();
    const snapshot = state.createSnapshot();

    // Strip the new flag from every faction entry, simulating an older save.
    for (const f of snapshot.factions as unknown as Array<Record<string, unknown>>) {
      delete f.isActive;
    }
    // Force every live faction to inactive so we can prove the restore flips them back on.
    for (const f of state.factionRegistry.getAll()) f.isActive = false;

    state.restoreFromSnapshot(snapshot);

    for (const f of state.factionRegistry.getAll()) {
      expect(f.isActive).toBe(true);
    }
    expect(state.factionRegistry.getActive()).toHaveLength(4);
  });
});

describe('Diplomacy and espionage target lists respect the active set', () => {
  it('lists only active factions as diplomacy targets', () => {
    const state = buildState();
    state.factionRegistry.get('pacific_union')!.isActive = false;
    state.factionRegistry.get('southern_federation')!.isActive = false;

    const currentId = 'atlantic_alliance';
    const diplomacyTargets = state.factionRegistry
      .getActive()
      .filter(f => f.id !== currentId)
      .map(f => f.id);

    expect(diplomacyTargets).toEqual(['eastern_coalition']);
  });

  it('lists only active at-war factions as espionage targets', () => {
    const state = buildState();
    state.factionRegistry.get('pacific_union')!.isActive = false;
    state.factionRegistry.get('southern_federation')!.isActive = false;
    state.diplomacyManager.forceWar('atlantic_alliance', 'eastern_coalition');
    state.diplomacyManager.forceWar('atlantic_alliance', 'pacific_union');

    const factionId = 'atlantic_alliance';
    const espionageTargets = state.factionRegistry
      .getActive()
      .filter(
        f =>
          f.id !== factionId &&
          state.diplomacyManager.getRelation(factionId, f.id) === 'war',
      )
      .map(f => f.id);

    expect(espionageTargets).toEqual(['eastern_coalition']);
    expect(espionageTargets).not.toContain('pacific_union');
  });
});

describe('Turn order rendering uses the active set (HUD parity smoke test)', () => {
  it('only renders dots for active, undefeated factions', () => {
    const state = buildState();
    // Two-player game: deactivate Pacific + Southern.
    state.factionRegistry.get('pacific_union')!.isActive = false;
    state.factionRegistry.get('southern_federation')!.isActive = false;

    const container = document.createElement('div');
    container.id = 'turn-order';
    document.body.appendChild(container);

    // Inline minimal version of HUD.updateTurnOrder() so this test does not
    // need to construct the entire HUD class.
    const factions = state.factionRegistry.getActive();
    container.innerHTML = factions
      .map(f => `<div class="turn-order-item" data-faction-id="${f.id}"></div>`)
      .join('');

    const dots = container.querySelectorAll('.turn-order-item');
    expect(dots.length).toBe(2);
    expect(Array.from(dots).map(d => d.getAttribute('data-faction-id'))).toEqual([
      'atlantic_alliance',
      'eastern_coalition',
    ]);
  });
});
