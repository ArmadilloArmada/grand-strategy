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
import { hasSeaAccess, resolveTerritoryForNavalUnitPlacement, spawnUnitsOnTerritory } from './navalPlacement';

export interface ReserveUnit {
  unitTypeId: string;
  count: number;
}

export interface DeploymentZone {
  territory: Territory;
  type: 'factory' | 'capital' | 'frontline' | 'rear' | 'naval_base' | 'coastal_port';
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
      if (territory.owner !== faction.id) continue;

      if (territory.type === 'sea') {
        const touchesOwnedLand = territory.adjacentTo.some(adjId => {
          const adj = this.state.territories.get(adjId);
          return adj?.owner === faction.id && adj.isLand();
        });
        if (territory.owner !== faction.id && !touchesOwnedLand) continue;

        const currentDeployments = this.pendingDeployments
          .filter(d => d.territoryId === territory.id)
          .reduce((sum, d) => sum + d.count, 0);
        const maxCapacity = Math.max(2, Math.min(5, territory.production + 2));
        zones.push({
          territory,
          type: 'naval_base',
          maxCapacity,
          currentDeployments,
          remainingCapacity: Math.max(0, maxCapacity - currentDeployments),
        });
        continue;
      }

      if (!territory.isLand()) continue;

      let type: DeploymentZone['type'] = 'rear';
      let maxCapacity = 1;

      const isFrontline = territory.adjacentTo.some(adjId => {
        const adj = this.state.territories.get(adjId);
        return adj && adj.owner && adj.owner !== faction.id && adj.isLand();
      });

      if (territory.hasFactory && !territory.isFactoryDisabled(this.state.turnNumber)) {
        type = 'factory';
        maxCapacity = Math.min(territory.production, 3);
      } else if (territory.id === faction.capital) {
        type = 'capital';
        maxCapacity = 2;
      } else if (isFrontline) {
        type = 'frontline';
        maxCapacity = 1;
      } else if (territory.type === 'coastal' || hasSeaAccess(this.state, territory)) {
        type = 'coastal_port';
        maxCapacity = 2;
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

    // Sort: naval bases & factories first, then coastal ports, capital, frontline, rear
    const typeOrder = { naval_base: 0, factory: 1, coastal_port: 2, capital: 3, frontline: 4, rear: 5 };
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

    // Resolve naval units into valid sea zones (coastal ports redirect to adjacent sea).
    let deployTerritoryId = territoryId;
    const unitType = this.state.unitRegistry.get(unitTypeId);
    const selectedTerritory = this.state.territories.get(territoryId);
    if (unitType?.domain === 'sea' && selectedTerritory) {
      const resolved = resolveTerritoryForNavalUnitPlacement(
        this.state,
        selectedTerritory,
        unitTypeId,
        faction.id,
      );
      if (!resolved) {
        return { success: false, reason: 'No valid sea zone for naval deployment' };
      }
      deployTerritoryId = resolved.id;
    }

    const deployTerritory = this.state.territories.get(deployTerritoryId);
    if (unitType?.domain === 'land' && deployTerritory?.type === 'sea') {
      return { success: false, reason: 'Land units cannot deploy to sea zones' };
    }
    if (unitType?.domain === 'sea' && deployTerritory?.type === 'land') {
      return { success: false, reason: 'Naval units cannot deploy to land tiles' };
    }

    // Check deployment zone capacity
    const zones = this.getDeploymentZones();
    const zone = zones.find(z => z.territory.id === deployTerritoryId)
      ?? zones.find(z => z.territory.id === territoryId);
    
    if (!zone) {
      return { success: false, reason: 'Invalid deployment zone' };
    }

    if (zone.remainingCapacity < count) {
      return { success: false, reason: `Zone can only accept ${zone.remainingCapacity} more units` };
    }

    // Add to pending deployments
    const existing = this.pendingDeployments.find(
      d => d.unitTypeId === unitTypeId && d.territoryId === deployTerritoryId
    );

    if (existing) {
      existing.count += count;
    } else {
      this.pendingDeployments.push({ unitTypeId, count, territoryId: deployTerritoryId });
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

      const placed = spawnUnitsOnTerritory(
        this.state,
        faction.id,
        order.territoryId,
        order.unitTypeId,
        order.count,
      );
      if (!placed.success) {
        this.addToReserve(faction.id, order.unitTypeId, order.count);
        continue;
      }

      deployed += order.count;
      territories.add(placed.territoryId ?? order.territoryId);
    }

    // Clear pending deployments
    this.pendingDeployments = [];

    this.state.emit('units_produced', {
      factionId: faction.id,
      placedCount: deployed,
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

    const zones = this.getDeploymentZones();

    for (const reserve of [...reserves]) {
      let remaining = reserve.count;
      const unitType = this.state.unitRegistry.get(reserve.unitTypeId);
      const isNaval = unitType?.domain === 'sea';
      const eligibleZones = zones.filter(z =>
        isNaval ? (z.territory.type === 'sea' || z.territory.isLand()) : z.territory.isLand(),
      );
      const landTypeOrder: Record<DeploymentZone['type'], number> = {
        factory: 0, coastal_port: 1, capital: 2, frontline: 3, rear: 4, naval_base: 99,
      };
      const navalTypeOrder: Record<DeploymentZone['type'], number> = {
        naval_base: 0, coastal_port: 1, factory: 2, capital: 3, frontline: 4, rear: 5,
      };
      const typeOrder = isNaval ? navalTypeOrder : landTypeOrder;

      const sortedZones = [...eligibleZones].sort((a, b) => {
        if (isNaval) {
          const orderDiff = typeOrder[a.type] - typeOrder[b.type];
          if (orderDiff !== 0) return orderDiff;
        } else {
          const aIsFrontlineFactory = a.type === 'factory' && this.isFrontline(a.territory);
          const bIsFrontlineFactory = b.type === 'factory' && this.isFrontline(b.territory);
          if (aIsFrontlineFactory && !bIsFrontlineFactory) return -1;
          if (!aIsFrontlineFactory && bIsFrontlineFactory) return 1;
          const orderDiff = typeOrder[a.type] - typeOrder[b.type];
          if (orderDiff !== 0) return orderDiff;
        }
        return b.remainingCapacity - a.remainingCapacity;
      });

      for (const zone of sortedZones) {
        if (remaining === 0) break;
        if (zone.remainingCapacity === 0) continue;

        const toDeploy = Math.min(remaining, zone.remainingCapacity);
        const result = this.queueDeployment(reserve.unitTypeId, zone.territory.id, toDeploy);
        if (result.success) {
          remaining -= toDeploy;
          zone.remainingCapacity -= toDeploy;
          zone.currentDeployments += toDeploy;
        }
      }
    }

    if (this.pendingDeployments.length === 0) {
      return { deployed: 0, territories: [] };
    }

    return this.executeDeployments();
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
