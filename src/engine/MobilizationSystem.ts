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
import { hasSeaAccess, spawnUnitsOnTerritory } from './navalPlacement';

export interface MobilizationOption {
  territory: Territory;
  cost: number;
  units: { unitTypeId: string; count: number }[];
  type: 'factory' | 'capital' | 'coastal' | 'land';
  canMobilize: boolean;
  reason?: string;
}

export interface SpawnedUnit {
  unitTypeId: string;
  count: number;
  territoryId: string;
}

export interface MobilizationResult {
  success: boolean;
  reason?: string;
  unitsSpawned?: SpawnedUnit[];
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
      cost = 11;
      units = [
        { unitTypeId: 'tank', count: 1 },
        { unitTypeId: 'artillery', count: 1 },
        { unitTypeId: 'infantry', count: 2 }
      ];
      if (hasSeaAccess(this.state, territory)) {
        this.appendNavalMobilizationUnits(units, territory);
      }
    } else if (territory.isCapital) {
      type = 'capital';
      cost = 9;
      units = [
        { unitTypeId: 'infantry', count: 3 },
        { unitTypeId: 'tank', count: 1 },
        { unitTypeId: 'fighter', count: 1 }
      ];
      if (hasSeaAccess(this.state, territory)) {
        this.appendNavalMobilizationUnits(units, territory);
      }
    } else if (territory.type === 'coastal' || hasSeaAccess(this.state, territory)) {
      type = 'coastal';
      cost = 9;

      if (hasSeaAccess(this.state, territory)) {
        units = [{ unitTypeId: 'infantry', count: 2 }];
        this.appendNavalMobilizationUnits(units, territory);
      } else {
        units = [
          { unitTypeId: 'infantry', count: 3 }
        ];
      }
    } else {
      type = 'land';
      cost = 4;
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

    // Faction elite infantry (e.g. Atlantic Alliance Marines) only on cheap land mobilizations.
    if (faction && type === 'land') {
      const uniqueUnit = this.state.unitRegistry.getAll()
        .find(u => u.factionId === faction.id && u.domain === 'land');
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

    const spawnedUnits: SpawnedUnit[] = [];
    for (const unit of option.units) {
      const result = spawnUnitsOnTerritory(
        this.state,
        faction.id,
        territoryId,
        unit.unitTypeId,
        unit.count,
      );
      if (!result.success || !result.territoryId) {
        for (const placed of spawnedUnits) {
          this.state.territories.get(placed.territoryId)?.removeUnits(placed.unitTypeId, placed.count);
        }
        faction.ipcs += option.cost;
        const unitName = this.state.unitRegistry.get(unit.unitTypeId)?.name ?? unit.unitTypeId;
        return {
          success: false,
          reason: result.reason ?? `Could not place ${unitName}`,
        };
      }
      const spawnTerritory = this.state.territories.get(result.territoryId);
      spawnTerritory?.markUnitsActed(unit.unitTypeId, unit.count);
      spawnedUnits.push({
        unitTypeId: unit.unitTypeId,
        count: unit.count,
        territoryId: result.territoryId,
      });
    }

    this.mobilizedThisTurn.add(territoryId);

    this.state.emit('territory_mobilized', {
      territoryId,
      units: spawnedUnits,
      cost: option.cost,
    });

    return {
      success: true,
      unitsSpawned: spawnedUnits,
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

  /** Naval units included in coastal and sea-access capital mobilizations. */
  private appendNavalMobilizationUnits(
    units: { unitTypeId: string; count: number }[],
    territory: Territory,
  ): void {
    units.push({ unitTypeId: 'transport', count: 1 });
    if (territory.production >= 2) {
      units.push({ unitTypeId: 'destroyer', count: 1 });
    }
    if (territory.production >= 3) {
      units.push({ unitTypeId: 'cruiser', count: 1 });
    }
    if (territory.production >= 4) {
      units.push({ unitTypeId: 'submarine', count: 1 });
    }
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
