/**
 * ReserveSystem - Strategic Reserve Pool for unit deployment
 * 
 * New production flow:
 * 1. Purchase Phase: Buy units → they enter the Reserve Pool
 * 2. Combat Phase: Resolve battles
 * 3. Deployment Phase: Deploy reserves to controlled territories
 * 
 * Deployment rules:
 * - Factories: Deploy up to factory capacity (territory production value)
 * - Capital: +3 bonus deployment slots
 * - Frontline (adjacent to enemy): 2 units max per territory
 * - Rear territories (no factory, not frontline): 1 unit max
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';

export interface ReserveUnit {
  unitTypeId: string;
  count: number;
}

export interface DeploymentZone {
  territory: Territory;
  type: 'factory' | 'capital' | 'frontline' | 'rear';
  maxCapacity: number;
  currentDeployments: number;
  remainingCapacity: number;
}

export interface DeploymentOrder {
  unitTypeId: string;
  count: number;
  territoryId: string;
}

export class ReserveSystem {
  // Reserve pool per faction
  private reserves: Map<string, ReserveUnit[]> = new Map();
  // Pending deployments for current turn
  private pendingDeployments: DeploymentOrder[] = [];

  constructor(private state: GameState) {}

  /**
   * Get reserve pool for a faction
   */
  getReserves(factionId: string): ReserveUnit[] {
    return this.reserves.get(factionId) || [];
  }

  /**
   * Get reserve pool for current faction
   */
  getCurrentReserves(): ReserveUnit[] {
    const faction = this.state.getCurrentFaction();
    if (!faction) return [];
    return this.getReserves(faction.id);
  }

  /**
   * Get total units in reserve
   */
  getReserveCount(factionId: string): number {
    const reserves = this.getReserves(factionId);
    return reserves.reduce((sum, r) => sum + r.count, 0);
  }

  /**
   * Add units to reserve pool (called during purchase)
   */
  addToReserve(factionId: string, unitTypeId: string, count: number): void {
    if (!this.reserves.has(factionId)) {
      this.reserves.set(factionId, []);
    }
    
    const pool = this.reserves.get(factionId)!;
    const existing = pool.find(r => r.unitTypeId === unitTypeId);
    
    if (existing) {
      existing.count += count;
    } else {
      pool.push({ unitTypeId, count });
    }

    this.state.emit('reserve_updated', { factionId, reserves: pool });
  }

  /**
   * Remove units from reserve (for deployment)
   */
  removeFromReserve(factionId: string, unitTypeId: string, count: number): boolean {
    const pool = this.reserves.get(factionId);
    if (!pool) return false;

    const existing = pool.find(r => r.unitTypeId === unitTypeId);
    if (!existing || existing.count < count) return false;

    existing.count -= count;
    if (existing.count === 0) {
      const index = pool.indexOf(existing);
      pool.splice(index, 1);
    }

    return true;
  }

  /**
   * Get available deployment zones for current faction
   */
  getDeploymentZones(): DeploymentZone[] {
    const faction = this.state.getCurrentFaction();
    if (!faction) return [];

    const zones: DeploymentZone[] = [];

    for (const territory of this.state.territories.values()) {
      if (territory.owner !== faction.id || !territory.isLand()) continue;

      let type: DeploymentZone['type'] = 'rear';
      let maxCapacity = 1; // Base capacity for rear territories

      // Check if this is a frontline territory (adjacent to enemy)
      const isFrontline = territory.adjacentTo.some(adjId => {
        const adj = this.state.territories.get(adjId);
        return adj && adj.owner && adj.owner !== faction.id && adj.isLand();
      });

      // Determine zone type and capacity (reduced for balance)
      if (territory.hasFactory && !territory.isFactoryDisabled(this.state.turnNumber)) {
        type = 'factory';
        maxCapacity = Math.min(territory.production, 3); // Factory capacity = production value (max 3)
      } else if (territory.id === faction.capital) {
        type = 'capital';
        maxCapacity = 2; // Capital has moderate capacity
      } else if (isFrontline) {
        type = 'frontline';
        maxCapacity = 1; // Frontline gets limited reinforcements
      }

      // Capital bonus: +2 slots if it's the capital with a factory
      if (territory.id === faction.capital && territory.hasFactory) {
        maxCapacity += 2;
      }

      // Calculate current deployments to this territory
      const currentDeployments = this.pendingDeployments
        .filter(d => d.territoryId === territory.id)
        .reduce((sum, d) => sum + d.count, 0);

      zones.push({
        territory,
        type,
        maxCapacity,
        currentDeployments,
        remainingCapacity: Math.max(0, maxCapacity - currentDeployments),
      });
    }

    // Sort: factories first, then capital, then frontline, then rear
    const typeOrder = { factory: 0, capital: 1, frontline: 2, rear: 3 };
    zones.sort((a, b) => {
      const orderDiff = typeOrder[a.type] - typeOrder[b.type];
      if (orderDiff !== 0) return orderDiff;
      return b.remainingCapacity - a.remainingCapacity;
    });

    return zones;
  }

  /**
   * Queue a deployment order
   */
  queueDeployment(unitTypeId: string, territoryId: string, count: number = 1): { 
    success: boolean; 
    reason?: string 
  } {
    const faction = this.state.getCurrentFaction();
    if (!faction) {
      return { success: false, reason: 'No current faction' };
    }

    // Check if unit is in reserve
    const reserves = this.getReserves(faction.id);
    const reserve = reserves.find(r => r.unitTypeId === unitTypeId);
    const availableInReserve = reserve ? reserve.count : 0;
    
    // Count already queued deployments of this unit type
    const alreadyQueued = this.pendingDeployments
      .filter(d => d.unitTypeId === unitTypeId)
      .reduce((sum, d) => sum + d.count, 0);

    if (availableInReserve - alreadyQueued < count) {
      return { success: false, reason: 'Not enough units in reserve' };
    }

    // Check deployment zone capacity
    const zones = this.getDeploymentZones();
    const zone = zones.find(z => z.territory.id === territoryId);
    
    if (!zone) {
      return { success: false, reason: 'Invalid deployment zone' };
    }

    if (zone.remainingCapacity < count) {
      return { success: false, reason: `Zone can only accept ${zone.remainingCapacity} more units` };
    }

    // Add to pending deployments
    const existing = this.pendingDeployments.find(
      d => d.unitTypeId === unitTypeId && d.territoryId === territoryId
    );

    if (existing) {
      existing.count += count;
    } else {
      this.pendingDeployments.push({ unitTypeId, count, territoryId });
    }

    return { success: true };
  }

  /**
   * Remove a deployment from the queue
   */
  unqueueDeployment(unitTypeId: string, territoryId: string, count: number = 1): boolean {
    const existing = this.pendingDeployments.find(
      d => d.unitTypeId === unitTypeId && d.territoryId === territoryId
    );

    if (!existing || existing.count < count) return false;

    existing.count -= count;
    if (existing.count === 0) {
      const index = this.pendingDeployments.indexOf(existing);
      this.pendingDeployments.splice(index, 1);
    }

    return true;
  }

  /**
   * Get pending deployments
   */
  getPendingDeployments(): DeploymentOrder[] {
    return [...this.pendingDeployments];
  }

  /**
   * Cancel all pending deployments and return units to reserve
   */
  clearPendingDeployments(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;
    for (const order of this.pendingDeployments) {
      this.addToReserve(faction.id, order.unitTypeId, order.count);
    }
    this.pendingDeployments = [];
  }

  /**
   * Execute all pending deployments (called at end of deployment phase)
   */
  executeDeployments(): { deployed: number; territories: string[] } {
    const faction = this.state.getCurrentFaction();
    if (!faction) return { deployed: 0, territories: [] };

    let deployed = 0;
    const territories = new Set<string>();

    for (const order of this.pendingDeployments) {
      const territory = this.state.territories.get(order.territoryId);
      if (!territory || territory.owner !== faction.id) continue;

      // Remove from reserve
      if (!this.removeFromReserve(faction.id, order.unitTypeId, order.count)) continue;

      // Add to territory
      territory.addUnits(order.unitTypeId, order.count);
      deployed += order.count;
      territories.add(order.territoryId);
    }

    // Clear pending deployments
    this.pendingDeployments = [];

    this.state.emit('units_deployed', {
      factionId: faction.id, 
      count: deployed,
      territories: Array.from(territories)
    });

    return { deployed, territories: Array.from(territories) };
  }

  /**
   * Auto-deploy reserves (for AI or quick deploy)
   * Prioritizes: frontline factories > regular factories > capital > frontline > rear
   */
  autoDeployReserves(factionId: string): { deployed: number; territories: string[] } {
    const reserves = this.getReserves(factionId);
    if (reserves.length === 0) return { deployed: 0, territories: [] };

    const faction = this.state.getCurrentFaction();
    if (!faction || faction.id !== factionId) return { deployed: 0, territories: [] };

    // Get zones sorted by priority
    const zones = this.getDeploymentZones();
    
    // Prioritize frontline factories, then other factories
    zones.sort((a, b) => {
      const aIsFrontlineFactory = a.type === 'factory' && this.isFrontline(a.territory);
      const bIsFrontlineFactory = b.type === 'factory' && this.isFrontline(b.territory);
      
      if (aIsFrontlineFactory && !bIsFrontlineFactory) return -1;
      if (!aIsFrontlineFactory && bIsFrontlineFactory) return 1;
      
      const typeOrder = { factory: 0, capital: 1, frontline: 2, rear: 3 };
      return typeOrder[a.type] - typeOrder[b.type];
    });

    let deployed = 0;
    const territories = new Set<string>();

    // Deploy each unit type
    for (const reserve of [...reserves]) {
      let remaining = reserve.count;

      for (const zone of zones) {
        if (remaining === 0) break;
        if (zone.remainingCapacity === 0) continue;

        const toDeploy = Math.min(remaining, zone.remainingCapacity);
        
        const result = this.queueDeployment(reserve.unitTypeId, zone.territory.id, toDeploy);
        if (result.success) {
          remaining -= toDeploy;
          zone.remainingCapacity -= toDeploy;
          zone.currentDeployments += toDeploy;
          deployed += toDeploy;
          territories.add(zone.territory.id);
        }
      }
    }

    // Execute the deployments
    if (deployed > 0) {
      this.executeDeployments();
    }

    return { deployed, territories: Array.from(territories) };
  }

  /**
   * Check if a territory is on the frontline
   */
  private isFrontline(territory: Territory): boolean {
    const faction = this.state.getCurrentFaction();
    if (!faction) return false;

    return territory.adjacentTo.some(adjId => {
      const adj = this.state.territories.get(adjId);
      return adj && adj.owner && adj.owner !== faction.id && adj.isLand();
    });
  }

  /**
   * Serialize for save/load
   */
  serialize(): { reserves: [string, ReserveUnit[]][]; pending: DeploymentOrder[] } {
    return {
      reserves: Array.from(this.reserves.entries()),
      pending: this.pendingDeployments,
    };
  }

  /**
   * Restore from save
   */
  restore(data: ReturnType<typeof this.serialize>): void {
    this.reserves = new Map(data.reserves || []);
    this.pendingDeployments = data.pending || [];
  }
}
