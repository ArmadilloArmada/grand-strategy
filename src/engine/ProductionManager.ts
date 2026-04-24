/**
 * ProductionManager - Handles unit purchasing with Strategic Reserve system
 * 
 * New Flow:
 * 1. Purchase Phase: Buy units → go to Reserve Pool
 * 2. Deployment Phase: Deploy reserves to territories
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';
import { UnitType } from '../data/Unit';
import { ReserveSystem, DeploymentZone, ReserveUnit } from './ReserveSystem';

export interface PurchaseResult {
  success: boolean;
  reason?: string;
}

export interface PlacementResult {
  success: boolean;
  reason?: string;
  placedCount?: number;
}

// Simple purchase order (no factory assignment)
export interface SimplePurchaseOrder {
  unitTypeId: string;
  count: number;
}

export class ProductionManager {
  private reserveSystem: ReserveSystem;
  private simplePurchaseQueue: SimplePurchaseOrder[] = [];

  constructor(private state: GameState) {
    this.reserveSystem = new ReserveSystem(state);
  }

  /**
   * Get the reserve system for deployment operations
   */
  getReserveSystem(): ReserveSystem {
    return this.reserveSystem;
  }

  /**
   * Get available units for purchase
   */
  getAvailableUnits(): UnitType[] {
    return this.state.unitRegistry.getAll();
  }

  /**
   * Get factories where current faction can produce (for reference)
   */
  getAvailableFactories(): Territory[] {
    const faction = this.state.getCurrentFaction();
    if (!faction) return [];
    return this.state.getFactories(faction.id);
  }

  /**
   * Calculate factory capacity (for AI compatibility)
   */
  getFactoryCapacity(territoryId: string): number {
    const territory = this.state.territories.get(territoryId);
    if (!territory || !territory.hasFactory) return 0;
    
    const faction = this.state.getCurrentFaction();
    if (!faction || territory.owner !== faction.id) return 0;
    
    return Math.max(territory.production, 3);
  }

  /**
   * Calculate total cost of current purchase queue (new simplified system)
   */
  getTotalPurchaseCost(): number {
    let total = 0;
    for (const order of this.simplePurchaseQueue) {
      const unitType = this.state.unitRegistry.get(order.unitTypeId);
      if (unitType) {
        total += unitType.cost * order.count;
      }
    }
    return total;
  }

  /**
   * Get remaining IPCs after queued purchases
   */
  getRemainingIPCs(): number {
    const faction = this.state.getCurrentFaction();
    if (!faction) return 0;
    return faction.ipcs - this.getTotalPurchaseCost();
  }

  /**
   * Get maximum units that can be purchased (based on total deployment capacity)
   */
  getMaxPurchaseCapacity(): number {
    const zones = this.reserveSystem.getDeploymentZones();
    return zones.reduce((sum, z) => sum + z.maxCapacity, 0);
  }

  /**
   * Get current total units queued for purchase
   */
  getTotalQueuedUnits(): number {
    return this.simplePurchaseQueue.reduce((sum, o) => sum + o.count, 0);
  }

  // ==================== NEW SIMPLIFIED PURCHASE SYSTEM ====================

  /**
   * Add unit to purchase queue (no factory selection needed)
   */
  queueSimplePurchase(unitTypeId: string, count: number = 1): PurchaseResult {
    const faction = this.state.getCurrentFaction();
    if (!faction) {
      return { success: false, reason: 'No current faction' };
    }

    const unitType = this.state.unitRegistry.get(unitTypeId);
    if (!unitType) {
      return { success: false, reason: 'Unknown unit type' };
    }

    const totalCost = unitType.cost * count;
    if (totalCost > this.getRemainingIPCs()) {
      return { success: false, reason: 'Insufficient IPCs' };
    }

    // Check deployment capacity (can't buy more than we can deploy)
    const maxCapacity = this.getMaxPurchaseCapacity();
    const currentInQueue = this.getTotalQueuedUnits();
    const currentInReserve = this.reserveSystem.getReserveCount(faction.id);
    
    if (currentInQueue + currentInReserve + count > maxCapacity) {
      return { 
        success: false, 
        reason: `Deployment capacity limit (${maxCapacity - currentInQueue - currentInReserve} remaining)` 
      };
    }

    // Add to queue
    const existing = this.simplePurchaseQueue.find(o => o.unitTypeId === unitTypeId);
    if (existing) {
      existing.count += count;
    } else {      this.simplePurchaseQueue.push({ unitTypeId, count });
    }

    return { success: true };
  }

  /**
   * Remove a unit from the purchase queue
   */
  removeFromQueue(unitTypeId: string, count: number = 1): void {
    const order = this.simplePurchaseQueue.find(o => o.unitTypeId === unitTypeId);
    if (!order) return;
    order.count -= count;
    if (order.count <= 0) {
      this.simplePurchaseQueue = this.simplePurchaseQueue.filter(o => o.unitTypeId !== unitTypeId);
    }
  }

  /**
   * Get current purchase queue
   */
  getPurchaseQueue(): SimplePurchaseOrder[] {
    return [...this.simplePurchaseQueue];
  }

  /**
   * Confirm purchases: deduct IPCs and move units to reserve.
   * Atomic — IPCs are only deducted after all reserve insertions succeed.
   */
  confirmPurchases(): boolean {
    const faction = this.state.getCurrentFaction();
    if (!faction) return false;

    const totalCost = this.getTotalPurchaseCost();
    if (totalCost > faction.ipcs) return false;

    // Snapshot the queue so we can roll back if something throws
    const snapshot = [...this.simplePurchaseQueue];
    try {
      for (const order of snapshot) {
        this.reserveSystem.addToReserve(faction.id, order.unitTypeId, order.count);
      }
    } catch (err) {
      // Roll back any partial reserve additions
      for (const order of snapshot) {
        try { this.reserveSystem.removeFromReserve(faction.id, order.unitTypeId, order.count); } catch { /* best-effort */ }
      }
      console.error('[ProductionManager] confirmPurchases failed, rolled back:', err);
      return false;
    }

    faction.ipcs -= totalCost;
    this.simplePurchaseQueue = [];
    return true;
  }

  /**
   * Clear purchase queue without confirming
   */
  clearQueue(): void {
    this.simplePurchaseQueue = [];
  }

  /**
   * Get deployment zones for the current faction
   */
  getDeploymentZones(): DeploymentZone[] {
    return this.reserveSystem.getDeploymentZones();
  }

  /**
   * Get current faction reserves (proxy to ReserveSystem)
   */
  getCurrentReserves(): ReserveUnit[] {
    return this.reserveSystem.getCurrentReserves();
  }

  /**
   * Queue a deployment (proxy to ReserveSystem)
   */
  queueDeployment(unitTypeId: string, territoryId: string, count: number = 1) {
    return this.reserveSystem.queueDeployment(unitTypeId, territoryId, count);
  }

  /**
   * Remove from deployment queue (proxy to ReserveSystem)
   */
  removeDeployment(unitTypeId: string, territoryId: string, count: number = 1): boolean {
    return this.reserveSystem.unqueueDeployment(unitTypeId, territoryId, count);
  }

  /**
   * Execute all queued deployments (proxy to ReserveSystem)
   */
  executeDeployments() {
    return this.reserveSystem.executeDeployments();
  }

  /**
   * Auto-deploy all reserves (proxy to ReserveSystem)
   */
  autoDeployReserves() {
    const faction = this.state.getCurrentFaction();
    if (!faction) return { deployed: 0, territories: [] };
    return this.reserveSystem.autoDeployReserves(faction.id);
  }

  /**
   * Reset for new turn
   */
  resetForNewTurn(): void {
    this.simplePurchaseQueue = [];
    this.reserveSystem.clearPendingDeployments();
  }
}
