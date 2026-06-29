import { beforeEach, describe, expect, it } from 'vitest';
import { GameState } from '../../engine/GameState';
import { makeFactionData, makeTerritory, makeUnitData } from '../../engine/__tests__/testHelpers';
import {
  buildUnitStackSelectorHtml,
  countReadyUnitStacks,
  renderUnitStackSelector,
} from '../hud/UnitStackSelector';

function buildNavalState(): GameState {
  const state = new GameState();
  state.factionRegistry.register(makeFactionData('blue', { turnOrder: 1 }));
  state.unitRegistry.register(makeUnitData({ id: 'cruiser', name: 'Cruiser', domain: 'sea', movement: 2, attack: 3, defense: 3 }));
  state.unitRegistry.register(makeUnitData({ id: 'submarine', name: 'Submarine', domain: 'sea', movement: 2, attack: 2, defense: 1 }));
  state.currentFactionId = 'blue';
  state.currentPhase = 'combat_move';
  return state;
}

describe('UnitStackSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="territory-unit-selector" class="hidden"></div>
      <div id="war-room-unit-slot" class="hidden">
        <div class="unit-stack-selector-body"></div>
      </div>
    `;
  });

  it('builds selectable chips for each ready stack type', () => {
    const state = buildNavalState();
    const sea = makeTerritory('pacific', 'blue', { type: 'sea' });
    sea.addUnits('cruiser', 2);
    sea.addUnits('submarine', 3);

    const html = buildUnitStackSelectorHtml(state, sea, {
      selectedUnitType: 'submarine',
      selectedMoveCount: 2,
      selectAllTypes: false,
      unitIcon: () => '🚢',
      escapeHtml: (v) => v,
    });

    expect(html).toContain('Active stack moves with all units by default');
    expect(html).toContain('Cruiser');
    expect(html).toContain('Submarine');
    expect(html).toContain('data-unit-type-id="cruiser"');
    expect(html).toContain('data-unit-type-id="submarine"');
    expect(html).toContain('unit-stack-chip selected');
    expect(html).toContain('data-stack-count-action="all"');
  });

  it('shows All label when move count is unset', () => {
    const state = buildNavalState();
    const sea = makeTerritory('pacific', 'blue', { type: 'sea' });
    sea.addUnits('cruiser', 4);

    const html = buildUnitStackSelectorHtml(state, sea, {
      selectedUnitType: 'cruiser',
      selectedMoveCount: null,
      selectAllTypes: false,
      unitIcon: () => '🚢',
      escapeHtml: (v) => v,
    });

    expect(html).toContain('All (4)');
    expect(html).toContain('unit-stack-count-all active');
  });

  it('counts ready stacks only for owned territories in movement phase', () => {
    const state = buildNavalState();
    const sea = makeTerritory('pacific', 'blue', { type: 'sea' });
    sea.addUnits('cruiser', 1);
    sea.addUnits('submarine', 1);
    sea.units.find(u => u.unitTypeId === 'cruiser')!.movedCount = 1;

    expect(countReadyUnitStacks(state, sea)).toBe(1);

    state.currentPhase = 'purchase';
    expect(countReadyUnitStacks(state, sea)).toBe(0);

    state.currentPhase = 'combat_move';
    sea.owner = 'red';
    expect(countReadyUnitStacks(state, sea)).toBe(0);
  });

  it('renders into HQ and War Room slots and clears when territory is null', () => {
    const state = buildNavalState();
    const sea = makeTerritory('pacific', 'blue', { type: 'sea' });
    sea.addUnits('cruiser', 1);
    sea.addUnits('submarine', 1);

    renderUnitStackSelector(state, sea, {
      selectedUnitType: null,
      selectedMoveCount: null,
      selectAllTypes: false,
      unitIcon: () => '⚓',
      escapeHtml: (v) => v,
    });

    const hq = document.getElementById('territory-unit-selector')!;
    const warRoom = document.getElementById('war-room-unit-slot')!;
    expect(hq.classList.contains('hidden')).toBe(false);
    expect(warRoom.classList.contains('hidden')).toBe(false);
    expect(hq.querySelectorAll('[data-unit-type-id]')).toHaveLength(2);
    expect(warRoom.querySelector('.unit-stack-selector-body')?.querySelectorAll('[data-unit-type-id]')).toHaveLength(2);

    renderUnitStackSelector(state, null, {
      selectedUnitType: null,
      selectedMoveCount: null,
      selectAllTypes: false,
      unitIcon: () => '⚓',
      escapeHtml: (v) => v,
    });

    expect(hq.classList.contains('hidden')).toBe(true);
    expect(warRoom.classList.contains('hidden')).toBe(true);
    expect(hq.innerHTML).toBe('');
  });

  it('shows All Unit Types button when multiple stacks are ready', () => {
    const state = buildNavalState();
    const sea = makeTerritory('pacific', 'blue', { type: 'sea' });
    sea.addUnits('cruiser', 2);
    sea.addUnits('submarine', 3);

    const html = buildUnitStackSelectorHtml(state, sea, {
      selectedUnitType: null,
      selectedMoveCount: null,
      selectAllTypes: true,
      unitIcon: () => '🚢',
      escapeHtml: (v) => v,
    });

    expect(html).toContain('data-stack-select-all-types');
    expect(html).toContain('All Unit Types');
    expect(html).toContain('unit-stack-all-types-btn selected');
    expect(html).toContain('unit-stack-chip-badge">Ready</span>');
  });
});
