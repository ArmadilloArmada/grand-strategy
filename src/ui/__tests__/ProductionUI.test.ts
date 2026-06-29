import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductionUI } from '../ProductionUI';
import { soundManager } from '../../audio/SoundManager';

function makeCallbacks() {
  return {
    showToast: () => undefined,
    updateMobilizationHighlights: () => undefined,
    updateSelectionInfo: () => undefined,
    onMobilized: () => undefined,
  };
}

describe('ProductionUI factory hub', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    vi.restoreAllMocks();
    vi.spyOn(soundManager, 'play').mockImplementation(() => undefined);
  });

  it('toggles fh-open class when opening and closing tray', () => {
    document.body.innerHTML = `
      <div id="factory-hub-tray" class="hidden"></div>
      <div id="fh-unit-list"></div>
      <div id="fh-order-list"></div>
    `;

    const state = {
      getCurrentFaction: () => ({ id: 'f1', name: 'Faction', color: '#fff', ipcs: 10 }),
      unitRegistry: { getByDomain: () => [] },
    };
    const productionManager = {
      clearQueue: () => undefined,
      getTotalPurchaseCost: () => 0,
      getRemainingIPCs: () => 10,
      getPurchaseQueue: () => [],
      getMaxPurchaseCapacity: () => 10,
      getTotalQueuedUnits: () => 0,
      getReserveSystem: () => ({ getReserveCount: () => 0 }),
    };

    const ui = new ProductionUI(state as any, {} as any, productionManager as any, {} as any, makeCallbacks());
    ui.showFactoryHub();

    expect(document.body.classList.contains('fh-open')).toBe(true);
    expect(document.getElementById('factory-hub-tray')?.classList.contains('hidden')).toBe(false);

    ui.closeFactoryHub();
    expect(document.body.classList.contains('fh-open')).toBe(false);
    expect(document.getElementById('factory-hub-tray')?.classList.contains('hidden')).toBe(true);
  });

  it('optimizeFactoryHubOrders never exceeds remaining IPC budget', () => {
    let remaining = 11;
    const queue: Array<{ unitTypeId: string; count: number; cost: number }> = [];
    const costs: Record<string, number> = { infantry: 3, artillery: 4, tank: 6, bomber: 12 };

    const state = {
      getCurrentFaction: () => ({ id: 'f1', name: 'Faction', color: '#fff', ipcs: 11 }),
      unitRegistry: {
        getByDomain: () => [
          { id: 'infantry', cost: 3, factionId: null },
          { id: 'artillery', cost: 4, factionId: null },
          { id: 'tank', cost: 6, factionId: null },
          { id: 'bomber', cost: 12, factionId: null },
        ],
      },
    };

    const productionManager = {
      clearQueue: () => {
        queue.length = 0;
        remaining = 11;
      },
      getRemainingIPCs: () => remaining,
      queueSimplePurchase: (unitId: string) => {
        const cost = costs[unitId];
        if (cost > remaining) return { success: false, reason: 'Too expensive' };
        remaining -= cost;
        const existing = queue.find(q => q.unitTypeId === unitId);
        if (existing) existing.count += 1;
        else queue.push({ unitTypeId: unitId, count: 1, cost });
        return { success: true };
      },
      getTotalPurchaseCost: () => queue.reduce((sum, q) => sum + q.count * q.cost, 0),
      getPurchaseQueue: () => queue.map(({ cost: _cost, ...rest }) => rest),
      getMaxPurchaseCapacity: () => 50,
      getTotalQueuedUnits: () => queue.reduce((sum, q) => sum + q.count, 0),
      getReserveSystem: () => ({ getReserveCount: () => 0 }),
    };

    const ui = new ProductionUI(state as any, {} as any, productionManager as any, {} as any, makeCallbacks());
    ui.optimizeFactoryHubOrders();

    expect(productionManager.getTotalPurchaseCost()).toBeLessThanOrEqual(11);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every(q => q.unitTypeId !== 'bomber')).toBe(true);
  });

  it('quick build plans fill orders and update the summary without exceeding budget', () => {
    document.body.innerHTML = `
      <div id="factory-hub-tray">
        <button class="fh-plan" data-plan="attack"></button>
        <button class="fh-plan active" data-plan="balanced"></button>
      </div>
      <button id="fh-btn-buy-deploy" disabled></button>
      <div id="fh-quick-summary"></div>
      <div id="fh-unit-list"></div>
      <div id="fh-order-list"></div>
      <div id="fh-ipc-total"></div>
      <div id="fh-ipc-spent"></div>
      <div id="fh-ipc-remain"></div>
      <div id="fh-budget-fill"></div>
      <button id="fh-btn-confirm"></button>
      <div id="fh-cap-used"></div>
      <div id="fh-cap-max"></div>
    `;

    let remaining = 14;
    const queue: Array<{ unitTypeId: string; count: number; cost: number }> = [];
    const units = [
      { id: 'infantry', name: 'Infantry', cost: 3, attack: 1, defense: 2, movement: 1, domain: 'land', factionId: null },
      { id: 'artillery', name: 'Artillery', cost: 4, attack: 2, defense: 2, movement: 1, domain: 'land', factionId: null },
      { id: 'tank', name: 'Tank', cost: 6, attack: 3, defense: 3, movement: 2, domain: 'land', factionId: null },
      { id: 'bomber', name: 'Bomber', cost: 12, attack: 4, defense: 1, movement: 6, domain: 'air', factionId: null },
    ];
    const costs = Object.fromEntries(units.map(u => [u.id, u.cost]));

    const state = {
      getCurrentFaction: () => ({ id: 'f1', name: 'Faction', color: '#fff', ipcs: 14 }),
      unitRegistry: {
        getAll: () => units,
        getByDomain: () => units,
        get: (id: string) => units.find(u => u.id === id),
      },
    };
    const productionManager = {
      clearQueue: () => {
        queue.length = 0;
        remaining = 14;
      },
      getRemainingIPCs: () => remaining,
      queueSimplePurchase: (unitId: string) => {
        const cost = costs[unitId];
        if (cost > remaining) return { success: false, reason: 'Too expensive' };
        remaining -= cost;
        const existing = queue.find(q => q.unitTypeId === unitId);
        if (existing) existing.count += 1;
        else queue.push({ unitTypeId: unitId, count: 1, cost });
        return { success: true };
      },
      getTotalPurchaseCost: () => queue.reduce((sum, q) => sum + q.count * q.cost, 0),
      getPurchaseQueue: () => queue.map(({ cost: _cost, ...rest }) => rest),
      getMaxPurchaseCapacity: () => 50,
      getTotalQueuedUnits: () => queue.reduce((sum, q) => sum + q.count, 0),
      getReserveSystem: () => ({ getReserveCount: () => 0 }),
    };

    const ui = new ProductionUI(state as any, {} as any, productionManager as any, {} as any, makeCallbacks());
    ui.applyQuickBuildPlan('attack');

    expect(productionManager.getTotalPurchaseCost()).toBeLessThanOrEqual(14);
    expect(queue.length).toBeGreaterThan(0);
    expect((document.getElementById('fh-btn-buy-deploy') as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById('fh-quick-summary')?.textContent).toContain('Attack: spend');
  });
});
