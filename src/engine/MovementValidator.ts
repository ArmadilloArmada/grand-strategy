/**
 * MovementValidator - Validates unit movement and pathfinding
 */

import { GameState, PendingMove } from './GameState';
import { UnitType } from '../data/Unit';

export interface MovementResult {
  valid: boolean;
  reason?: string;
  path?: string[];
  movementCost?: number;
}

export interface ValidMove {
  territoryId: string;
  path: string[];
  movementCost: number;
  isAttack: boolean;
  viaTransport?: string; // set when move requires a sea transport
}

export class MovementValidator {
  constructor(private state: GameState) {}

  /**
   * Validate a proposed move
   */
  validateMove(
    unitTypeId: string,
    _count: number,
    fromTerritoryId: string,
    toTerritoryId: string,
    isCombatMove: boolean
  ): MovementResult {
    const unitType = this.state.unitRegistry.get(unitTypeId);
    if (!unitType) {
      return { valid: false, reason: 'Unknown unit type' };
    }

    const fromTerritory = this.state.territories.get(fromTerritoryId);
    const toTerritory = this.state.territories.get(toTerritoryId);

    if (!fromTerritory || !toTerritory) {
      return { valid: false, reason: 'Invalid territory' };
    }

    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) {
      return { valid: false, reason: 'No current faction' };
    }

    if (fromTerritory.owner !== currentFaction.id) {
      return { valid: false, reason: 'You do not control the source territory' };
    }

    if (!unitType.canEnter(toTerritory.type)) {
      return { valid: false, reason: `${unitType.name} cannot enter ${toTerritory.type} territory` };
    }

    // Weather: air units grounded
    if (unitType.domain === 'air') {
      const weatherMods = this.state.systems.weatherSystem?.getWeatherModifiers('plains');
      if (weatherMods?.airGrounded) {
        return { valid: false, reason: 'Air units are grounded due to weather conditions' };
      }
    }

    const pathResult = this.findPath(fromTerritoryId, toTerritoryId, unitType);
    if (!pathResult.valid) {
      return pathResult;
    }

    const path = pathResult.path!;
    const movementCost = path.length - 1;

    // Apply faction movement bonus to land and air units (e.g. Pacific Union +1)
    const movementBonus = unitType.domain !== 'sea'
      ? (currentFaction.bonuses?.movementBonus ?? 0)
      : 0;

    // Island Hopping ability: transports gain +1 movement for the turn it was activated
    const islandHoppingTurns = this.state.systems.abilityState?.islandHoppingTurns;
    const islandHoppingBonus =
      unitType.id === 'transport' &&
      islandHoppingTurns?.get(currentFaction.id) === this.state.turnNumber
        ? 1 : 0;

    const weatherPenalty = (this.state.systems.weatherSystem && unitType.domain === 'land')
      ? (this.state.systems.weatherSystem.getWeatherModifiers('plains').movementPenalty ?? 0)
      : 0;

    const effectiveMovement = Math.max(1, unitType.movement + movementBonus + islandHoppingBonus - weatherPenalty);

    if (movementCost > effectiveMovement) {
      return { valid: false, reason: `Movement cost (${movementCost}) exceeds unit range (${effectiveMovement})` };
    }

    const isEnemyTerritory = toTerritory.owner !== null && 
      currentFaction.isEnemyOf(toTerritory.owner);

    if (!isCombatMove && isEnemyTerritory) {
      return { valid: false, reason: 'Cannot enter enemy territory during non-combat move' };
    }

    return {
      valid: true,
      path,
      movementCost,
    };
  }

  /**
   * Get all valid moves for a unit type from a territory
   */
  getValidMoves(
    unitTypeId: string,
    fromTerritoryId: string,
    isCombatMove: boolean
  ): ValidMove[] {
    const unitType = this.state.unitRegistry.get(unitTypeId);
    if (!unitType) return [];

    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) return [];

    // Weather: air units are grounded during fog/storm/blizzard
    if (unitType.domain === 'air') {
      const weatherMods = this.state.systems.weatherSystem?.getWeatherModifiers('plains');
      if (weatherMods?.airGrounded) return [];
    }

    // Check if there are any available units that haven't acted yet
    const availableCount = this.getAvailableUnits(fromTerritoryId, unitTypeId);
    if (availableCount <= 0) return [];

    const validMoves: ValidMove[] = [];
    const visited = new Set<string>();
    
    const queue: { territoryId: string; path: string[]; cost: number }[] = [
      { territoryId: fromTerritoryId, path: [fromTerritoryId], cost: 0 }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current.territoryId)) continue;
      visited.add(current.territoryId);

      if (current.territoryId !== fromTerritoryId) {
        const territory = this.state.territories.get(current.territoryId);
        if (territory) {
          const isEnemy = territory.owner !== null && currentFaction.isEnemyOf(territory.owner);
          
          if (isCombatMove || !isEnemy) {
            validMoves.push({
              territoryId: current.territoryId,
              path: current.path,
              movementCost: current.cost,
              isAttack: isEnemy,
            });
          }
        }
      }

      // Faction + tech movement bonus applies to land/air units
      const techManager = this.state.systems.technologyManager;
      const techMoveBonus = techManager?.getTechEffect(currentFaction.id)?.movementBonus ?? 0;
      const factionMoveBonus = unitType.domain !== 'sea'
        ? (currentFaction.bonuses?.movementBonus ?? 0) + techMoveBonus
        : 0;

      // Weather movement penalty (land units only; air immune when not grounded)
      const weatherSystem = this.state.systems.weatherSystem;
      const weatherPenalty = (weatherSystem && unitType.domain === 'land')
        ? (weatherSystem.getWeatherModifiers('plains').movementPenalty ?? 0)
        : 0;

      if (current.cost >= unitType.movement + factionMoveBonus - weatherPenalty) continue;

      const currentTerritory = this.state.territories.get(current.territoryId);
      if (!currentTerritory) continue;

      for (const adjId of currentTerritory.adjacentTo) {
        if (visited.has(adjId)) continue;

        const adjTerritory = this.state.territories.get(adjId);
        if (!adjTerritory) continue;

        if (!unitType.canEnter(adjTerritory.type)) continue;

        const isEnemy = adjTerritory.owner !== null && currentFaction.isEnemyOf(adjTerritory.owner);

        if (isEnemy) {
          // Diplomacy: can't attack a faction we have a pact with
          const pactRel = adjTerritory.owner
            ? this.state.diplomacyManager.getRelation(currentFaction.id, adjTerritory.owner)
            : 'war';
          if (pactRel === 'pact') continue;

          // Enemy territory is a valid attack target
          validMoves.push({
            territoryId: adjId,
            path: [...current.path, adjId],
            movementCost: current.cost + 1,
            isAttack: true,
          });

          // Blitz: can continue BFS only through EMPTY enemy territory.
          // Non-blitz units stop at any enemy territory.
          // Blitz units also stop at occupied enemy territory (must fight).
          const isOccupied = adjTerritory.getTotalUnitCount() > 0;
          if (!unitType.canBlitz || isOccupied) {
            continue; // Cannot pass through
          }
          // Fall through — blitz unit pushes empty enemy territory into the BFS queue
          // so it can attack the territory BEYOND it on the next step
        }

        // Zone of Control: during non-combat move, a friendly territory adjacent to an
        // enemy-occupied territory is a ZOC territory — units entering it must stop.
        // (Combat moves ignore ZOC; air units are always immune.)
        const nextPath = [...current.path, adjId];
        const nextCost = current.cost + 1;
        if (!isCombatMove && this.isInEnemyZOC(adjId, unitType.domain)) {
          // Unit CAN enter the ZOC territory but cannot continue beyond it
          validMoves.push({
            territoryId: adjId,
            path: nextPath,
            movementCost: nextCost,
            isAttack: false,
          });
          continue;
        }

        queue.push({
          territoryId: adjId,
          path: nextPath,
          cost: nextCost,
        });
      }
    }

    // For land units that require sea transport, also check transport routes
    if (unitType.domain === 'land' && unitType.requiredTransport) {
      const transportMoves = this.getTransportMoves(fromTerritoryId, unitType);
      for (const tm of transportMoves) {
        if (!isCombatMove && tm.isAttack) continue;
        // Don't duplicate moves that BFS already found on land
        if (!validMoves.some(m => m.territoryId === tm.territoryId)) {
          validMoves.push(tm);
        }
      }
    }

    return validMoves;
  }

  /**
   * Get total transport capacity in a sea zone owned by the current faction
   */
  private getTransportCapacity(seaZoneId: string): number {
    const seaZone = this.state.territories.get(seaZoneId);
    if (!seaZone) return 0;
    return seaZone.units.reduce((sum, pu) => {
      const ut = this.state.unitRegistry.get(pu.unitTypeId);
      return sum + (ut ? ut.transportCapacity * pu.count : 0);
    }, 0);
  }

  /**
   * Available transport capacity after accounting for already-queued loads
   */
  private getAvailableTransportCapacity(seaZoneId: string): number {
    const total = this.getTransportCapacity(seaZoneId);
    const alreadyLoaded = this.state.pendingMoves
      .filter(m => m.viaTransport === seaZoneId)
      .reduce((sum, m) => sum + m.count, 0);
    return Math.max(0, total - alreadyLoaded);
  }

  /**
   * Find all coastal territories reachable via sea transports from a land territory.
   * A land unit can hop from a coastal territory → sea zone (with transport) → adjacent coastal.
   */
  private getTransportMoves(fromTerritoryId: string, _unitType: UnitType): ValidMove[] {
    const moves: ValidMove[] = [];
    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) return moves;

    const fromTerritory = this.state.territories.get(fromTerritoryId);
    if (!fromTerritory || !fromTerritory.isLand()) return moves;

    // Look in every adjacent sea zone for friendly transports with spare capacity
    for (const seaId of fromTerritory.adjacentTo) {
      const seaZone = this.state.territories.get(seaId);
      if (!seaZone || seaZone.type !== 'sea') continue;
      const hasFriendlyFleet = seaZone.units.some(pu => {
        const unitType = this.state.unitRegistry.get(pu.unitTypeId);
        return !!unitType && unitType.domain === 'sea' && pu.count > 0;
      });
      const isFriendlySea = seaZone.owner === null || seaZone.owner === currentFaction.id;
      if (!isFriendlySea || !hasFriendlyFleet) continue;

      const capacity = this.getAvailableTransportCapacity(seaId);
      if (capacity <= 0) continue;

      // Every coastal territory adjacent to this sea zone is a valid unload point
      for (const destId of seaZone.adjacentTo) {
        if (destId === fromTerritoryId) continue;
        const dest = this.state.territories.get(destId);
        if (!dest || !dest.isLand()) continue;

        const isEnemy = dest.owner !== null && currentFaction.isEnemyOf(dest.owner);
        moves.push({
          territoryId: destId,
          path: [fromTerritoryId, seaId, destId],
          movementCost: 2,
          isAttack: isEnemy,
          viaTransport: seaId,
        });
      }
    }
    return moves;
  }

  /**
   * Returns true if a territory is within the Zone of Control (ZOC) of an enemy faction.
   * A territory is in ZOC if any adjacent territory is owned by an enemy and has units.
   * Air units are immune to ZOC; sea units are only affected by enemy sea units.
   */
  isInEnemyZOC(territoryId: string, unitDomain: string): boolean {
    if (unitDomain === 'air') return false;

    const territory = this.state.territories.get(territoryId);
    if (!territory) return false;

    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) return false;

    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (!adj || adj.owner === null) continue;
      if (!currentFaction.isEnemyOf(adj.owner)) continue;
      if (unitDomain === 'sea' && adj.type !== 'sea') continue;
      if (unitDomain === 'land' && adj.type === 'sea') continue;
      if (adj.getTotalUnitCount() > 0) return true;
    }
    return false;
  }

  /**
   * Find shortest path between two territories
   */
  private findPath(
    fromId: string,
    toId: string,
    unitType: UnitType
  ): MovementResult {
    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [
      { id: fromId, path: [fromId] }
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.id === toId) {
        return { valid: true, path: current.path, movementCost: current.path.length - 1 };
      }

      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const territory = this.state.territories.get(current.id);
      if (!territory) continue;

      for (const adjId of territory.adjacentTo) {
        if (visited.has(adjId)) continue;

        const adjTerritory = this.state.territories.get(adjId);
        if (!adjTerritory) continue;

        if (!unitType.canEnter(adjTerritory.type)) continue;

        queue.push({
          id: adjId,
          path: [...current.path, adjId],
        });
      }
    }

    return { valid: false, reason: 'No valid path found' };
  }

  /**
   * Get available units (not already committed to moves and haven't acted this turn)
   */
  getAvailableUnits(territoryId: string, unitTypeId: string): number {
    const territory = this.state.territories.get(territoryId);
    if (!territory) return 0;

    // Start with units that haven't acted yet this turn
    let count = territory.getAvailableUnitCount(unitTypeId);

    // Subtract those already committed to pending moves
    for (const move of this.state.pendingMoves) {
      if (move.fromTerritoryId === territoryId && move.unitTypeId === unitTypeId) {
        count -= move.count;
      }
    }

    return Math.max(0, count);
  }

  /**
   * Execute a pending move
   */
  executeMove(move: PendingMove): boolean {
    const fromTerritory = this.state.territories.get(move.fromTerritoryId);
    const toTerritory = this.state.territories.get(move.toTerritoryId);

    if (!fromTerritory || !toTerritory) return false;

    if (!fromTerritory.removeUnits(move.unitTypeId, move.count)) {
      return false;
    }

    // Capture neutral/unowned territory when moving in
    if (!toTerritory.owner && fromTerritory.owner) {
      toTerritory.owner = fromTerritory.owner;
    }

    toTerritory.addUnits(move.unitTypeId, move.count);

    // Mark units as having acted this turn (they've moved/attacked)
    toTerritory.markUnitsActed(move.unitTypeId, move.count);

    this.state.emit('units_moved', {
      unitTypeId: move.unitTypeId,
      count: move.count,
      from: move.fromTerritoryId,
      to: move.toTerritoryId,
      viaTransport: move.viaTransport,
    });

    return true;
  }

  /**
   * Execute all pending moves
   */
  executeAllPendingMoves(): void {
    for (const move of this.state.pendingMoves) {
      this.executeMove(move);
    }
    this.state.pendingMoves = [];
  }
}





