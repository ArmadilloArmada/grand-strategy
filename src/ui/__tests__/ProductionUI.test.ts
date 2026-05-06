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
});

