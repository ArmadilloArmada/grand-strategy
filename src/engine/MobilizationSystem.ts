/**
 * MobilizationSystem - Territory-based unit recruitment
 * 
 * Instead of buying specific units and deploying them, players "mobilize" territories.
 * Each territory type spawns different units:
 * - Factories: Tanks, Artillery, Mech Infantry
 * - Capital: Mixed forces (Infantry, Tanks, Fighters)
 * - Coastal: Naval units (Destroyer, Transport) + Infantry (naval spawns in adjacent sea)
 * - Regular Land: Infantry
 * - Sea Zones: Cannot be mobilized
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';

export interface MobilizationOption {
  territory: Territory;
  cost: number;
  units: { unitTypeId: string; count: number }[];
  type: 'factory' | 'capital' | 'coastal' | 'land';
  canMobilize: boolean;
  reason?: string;
}

export interface MobilizationResult {
  success: boolean;
  reason?: string;
  unitsSpawned?: { unitTypeId: string; count: number }[];
}

export class MobilizationSystem {
  // Track mobilizations this turn (each territory can only be mobilized once per turn)
  private mobilizedThisTurn: Set<string> = new Set();
  
  constructor(private state: GameState) {}

  /**
   * Get all territories that can be mobilized by the current faction
   */
  getMobilizationOptions(): MobilizationOption[] {
    const faction = this.state.getCurrentFaction();
    if (!faction) return [];

    const options: MobilizationOption[] = [];

    for (const territory of this.state.territories.values()) {
      if (territory.owner !== faction.id) continue;
      if (territory.type === 'sea') continue; // Can't mobilize sea zones

      const option = this.getTerritoryMobilization(territory);
      options.push(option);
    }

    // Sort by type priority: factories first, then capital, coastal, land
    const typePriority = { factory: 0, capital: 1, coastal: 2, land: 3 };
    options.sort((a, b) => typePriority[a.type] - typePriority[b.type]);

    return options;
  }

  /**
   * Get mobilization details for a specific territory
   */
  getTerritoryMobilization(territory: Territory): MobilizationOption {
    const faction = this.state.getCurrentFaction();
    const alreadyMobilized = this.mobilizedThisTurn.has(territory.id);
    
    let type: MobilizationOption['type'] = 'land';
    let cost = 0;
    let units: { unitTypeId: string; count: number }[] = [];
    let canMobilize = true;
    let reason: string | undefined;

    // Determine territory type and what it produces
    if (territory.hasFactory && !territory.isFactoryDisabled(this.state.turnNumber)) {
      type = 'factory';
      cost = 12;
      units = [
        { unitTypeId: 'tank', count: 1 },
        { unitTypeId: 'artillery', count: 1 },
        { unitTypeId: 'infantry', count: 2 }
      ];
    } else if (territory.isCapital) {
      type = 'capital';
      cost = 10;
      units = [
        { unitTypeId: 'infantry', count: 3 },
        { unitTypeId: 'tank', count: 1 },
        { unitTypeId: 'fighter', count: 1 }
      ];
    } else if (territory.type === 'coastal') {
      type = 'coastal';
      cost = 10;
      // Check if adjacent to sea - if so, can produce naval
      const hasSeaAccess = territory.adjacentTo.some(adjId => {
        const adj = this.state.territories.get(adjId);
        return adj?.type === 'sea';
      });
      
      if (hasSeaAccess) {
        units = [
          { unitTypeId: 'infantry', count: 2 },
          { unitTypeId: 'destroyer', count: 1 },
          { unitTypeId: 'transport', count: 1 },
        ];
      } else {
        units = [
          { unitTypeId: 'infantry', count: 3 }
        ];
      }
    } else {
      type = 'land';
      cost = 5;
      units = [
        { unitTypeId: 'infantry', count: 2 }
      ];
    }

    // Scale cost and units by territory production value
    const productionMultiplier = Math.max(1, territory.production / 2);
    if (productionMultiplier > 1 && type !== 'factory' && type !== 'capital') {
      // Higher production territories give more units
      for (const unit of units) {
        unit.count = Math.ceil(unit.count * productionMultiplier);
      }
      cost = Math.ceil(cost * (1 + (productionMultiplier - 1) * 0.5));
    }

    // Swap in faction-specific unique unit (replace one infantry per package)
    if (faction) {
      const uniqueUnit = this.state.unitRegistry.getAll()
        .find(u => u.factionId === faction.id);
      if (uniqueUnit) {
        const infantry = units.find(u => u.unitTypeId === 'infantry');
        if (infantry && infantry.count > 0) {
          infantry.count -= 1;
          if (infantry.count === 0) units = units.filter(u => u.unitTypeId !== 'infantry');
          units.push({ unitTypeId: uniqueUnit.id, count: 1 });
        }
      }
    }

    // Apply faction unit cost discount (e.g., Southern Federation "People's Army": -1 IPC per unit)
    const unitCostDiscount = faction?.bonuses?.unitCostDiscount ?? 0;
    if (unitCostDiscount > 0) {
      const totalUnits = units.reduce((sum, u) => sum + u.count, 0);
      cost = Math.max(1, cost - unitCostDiscount * totalUnits);
    }

    // Resource bonuses — territories with strategic resources grant production advantages
    if (territory.resource) {
      switch (territory.resource) {
        case 'oil':
          // Oil: reduces mobilization cost by 2 (fuel subsidizes logistics)
          cost = Math.max(1, cost - 2);
          break;
        case 'steel':
          // Steel: factory territories add an extra tank to output
          if (type === 'factory') units.push({ unitTypeId: 'tank', count: 1 });
          break;
        case 'food':
          // Food: land territories add an extra infantry to output
          if (type === 'land' || type === 'capital') units.push({ unitTypeId: 'infantry', count: 1 });
          break;
        case 'rare_earth':
          // Rare earth: reduces cost slightly (export revenue funds the war chest)
          cost = Math.max(1, cost - 1);
          break;
        case 'uranium':
          // Uranium: already boosts nuclear readiness in NuclearSystem
          break;
      }
    }

    // Check if can mobilize
    if (alreadyMobilized) {
      canMobilize = false;
      reason = 'Already mobilized this turn';
    } else if (faction && faction.ipcs < cost) {
      canMobilize = false;
      reason = `Need ${cost} IPCs (have ${faction.ipcs})`;
    }

    return {
      territory,
      cost,
      units,
      type,
      canMobilize,
      reason
    };
  }

  /**
   * Mobilize a territory - spawn units and deduct IPCs
   */
  mobilize(territoryId: string): MobilizationResult {
    const faction = this.state.getCurrentFaction();
    if (!faction) {
      return { success: false, reason: 'No active faction' };
    }

    const territory = this.state.territories.get(territoryId);
    if (!territory) {
      return { success: false, reason: 'Territory not found' };
    }

    if (territory.owner !== faction.id) {
      return { success: false, reason: 'You do not control this territory' };
    }

    const option = this.getTerritoryMobilization(territory);
    
    if (!option.canMobilize) {
      return { success: false, reason: option.reason };
    }

    // Deduct IPCs
    faction.spendIPCs(option.cost);

    // Spawn land units on this territory; sea-domain units go into an adjacent sea zone
    // (MovementValidator counts lift capacity in sea tiles — coastal-only naval never enabled amphib moves.)
    const navalSpawnSeaId =
      option.type === 'coastal' ? this.getCoastalMobilizationSeaId(territory) : null;

    for (const unit of option.units) {
      const ut = this.state.unitRegistry.get(unit.unitTypeId);
      const spawnId = navalSpawnSeaId && ut?.domain === 'sea' ? navalSpawnSeaId : territoryId;
      const spawnTerritory = this.state.territories.get(spawnId);
      if (!spawnTerritory) continue;
      spawnTerritory.addUnits(unit.unitTypeId, unit.count);
      spawnTerritory.markUnitsActed(unit.unitTypeId, unit.count);
    }

    // Mark territory as mobilized this turn
    this.mobilizedThisTurn.add(territoryId);

    this.state.emit('territory_mobilized', {
      territoryId,
      units: option.units,
      cost: option.cost
    });

    return {
      success: true,
      unitsSpawned: option.units
    };
  }

  /**
   * Get total IPCs spent on mobilization this turn
   */
  getMobilizationSpending(): number {
    let total = 0;
    for (const territoryId of this.mobilizedThisTurn) {
      const territory = this.state.territories.get(territoryId);
      if (territory) {
        const option = this.getTerritoryMobilization(territory);
        total += option.cost;
      }
    }
    return total;
  }

  /**
   * Get number of territories mobilized this turn
   */
  getMobilizationCount(): number {
    return this.mobilizedThisTurn.size;
  }

  /**
   * Check if a territory was mobilized this turn
   */
  wasMobilized(territoryId: string): boolean {
    return this.mobilizedThisTurn.has(territoryId);
  }

  /**
   * Reverse a single mobilization (undo): refund units and unmark the territory.
   * The caller is responsible for refunding IPCs.
   */
  undoMobilize(territoryId: string): void {
    this.mobilizedThisTurn.delete(territoryId);
  }

  /** Deterministic adjacent sea for spawning naval units from a coastal mobilization. */
  private getCoastalMobilizationSeaId(territory: Territory): string | null {
    if (territory.type !== 'coastal') return null;
    const seas = territory.adjacentTo
      .filter(id => this.state.territories.get(id)?.type === 'sea')
      .sort();
    return seas[0] ?? null;
  }

  /**
   * Reset mobilization tracking (called at start of faction's turn)
   */
  resetForNewTurn(): void {
    this.mobilizedThisTurn.clear();
  }

  /**
   * Serialize for save/load
   */
  serialize(): { mobilizedThisTurn: string[] } {
    return {
      mobilizedThisTurn: Array.from(this.mobilizedThisTurn)
    };
  }

  /**
   * Restore from save
   */
  restore(data: { mobilizedThisTurn: string[] }): void {
    this.mobilizedThisTurn = new Set(data.mobilizedThisTurn || []);
  }
}
