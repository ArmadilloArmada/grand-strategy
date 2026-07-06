/**
 * MovementValidator - Validates unit movement and pathfinding
 */

import { GameState, PendingMove } from './GameState';
import { UnitType } from '../data/Unit';
import { Territory } from '../data/Territory';
import { canIssueOrdersFromTerritory } from './territoryControl';
import { canLandUnitStrikeNaval, canLandUnitEngageNaval } from './NavalSystem';
import { claimSeaZoneForFaction, hasSeaAccess } from './navalPlacement';
import {
  getGridNeighborIds,
  getNavalReachNeighborIds,
  isNavalReachNeighbor,
  shouldAllowHorizontalWrap,
} from './gridAdjacency';
import { normalizeMoveContext, type MovePhaseContext } from './movePhaseContext';

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
  /** Shore bombardment / coastal artillery / land barrage — attackers stay in the source tile */
  coastalStrike?: boolean;
  rangedStrike?: boolean;
  /** Set when merging moves from multiple stacks in all-types command mode. */
  unitTypeId?: string;
}

import { usesImplicitAmphibious } from './unitMovementRules';

export { usesImplicitAmphibious } from './unitMovementRules';

export class MovementValidator {
  constructor(private state: GameState) {}

  /** Grid maps use 8-way adjacency; hand-drawn maps keep explicit adjacentTo links. */
  private getTerritoryNeighbors(territory: Territory, unitType?: UnitType): string[] {
    const allowWrap = unitType ? shouldAllowHorizontalWrap(this.state, unitType, territory) : false;
    return getGridNeighborIds(this.state, territory, { allowHorizontalWrap: allowWrap });
  }

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

    if (!canIssueOrdersFromTerritory(fromTerritory, currentFaction.id)) {
      return { valid: false, reason: 'You do not control the source territory' };
    }

    if (!unitType.canEnter(toTerritory.type)) {
      const rangedStrike = isCombatMove && this.isRangedStrike(fromTerritory, toTerritory, unitType);
      const amphibiousEmbark =
        this.usesImplicitAmphibious(unitType)
        && toTerritory.type === 'sea'
        && this.canMoveIntoTerritory(unitType, fromTerritory, toTerritory);
      if (!rangedStrike && !amphibiousEmbark) {
        return { valid: false, reason: `${unitType.name} cannot enter ${toTerritory.type} territory` };
      }
    }

    // Weather: air units grounded
    if (unitType.domain === 'air') {
      const weatherMods = this.state.systems.weatherSystem?.getWeatherModifiers('plains');
      if (weatherMods?.airGrounded) {
        return { valid: false, reason: 'Air units are grounded due to weather conditions' };
      }
    }

    const pathResult = this.isRangedStrike(fromTerritory, toTerritory, unitType) && isCombatMove
      ? { valid: true as const, path: [fromTerritoryId, toTerritoryId] }
      : this.findPath(fromTerritoryId, toTerritoryId, unitType);
    if (!pathResult.valid) {
      return pathResult;
    }

    const path = pathResult.path!;
    const movementCost = this.isRangedStrike(fromTerritory, toTerritory, unitType) && isCombatMove
      ? 0
      : this.computePathMovementCost(path, unitType);

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
    moveContext: boolean | MovePhaseContext,
  ): ValidMove[] {
    const phaseContext = normalizeMoveContext(moveContext);
    const isCombatMove = phaseContext !== 'noncombat';
    const includeRanged = isCombatMove;
    const unitType = this.state.unitRegistry.get(unitTypeId);
    if (!unitType) return [];

    const fromTerritory = this.state.territories.get(fromTerritoryId);
    if (!fromTerritory) return [];
    if (unitType.domain === 'land' && fromTerritory.type === 'sea' && !this.usesImplicitAmphibious(unitType)) {
      return [];
    }

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
              viaTransport: this.getSeaTransitId(current.path),
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

      for (const adjId of this.getTerritoryNeighbors(currentTerritory, unitType)) {
        if (visited.has(adjId)) continue;

        const adjTerritory = this.state.territories.get(adjId);
        if (!adjTerritory) continue;

        if (!this.canMoveIntoTerritory(unitType, currentTerritory, adjTerritory)) continue;

        const isEnemy = adjTerritory.owner !== null && currentFaction.isEnemyOf(adjTerritory.owner);

        if (isEnemy) {
          // Ranged units bombard from afar — they never enter enemy land during assault phase
          if (unitType.attackRange > 1) continue;

          // Diplomacy: can't attack a faction we have a pact with
          const pactRel = adjTerritory.owner
            ? this.state.diplomacyManager.getRelation(currentFaction.id, adjTerritory.owner)
            : 'war';
          if (pactRel === 'pact') continue;

          if (isCombatMove) {
            const attackPath = [...current.path, adjId];
            const attackCost = current.cost + this.getMovementStepCost(currentTerritory, adjTerritory, unitType);
            validMoves.push({
              territoryId: adjId,
              path: attackPath,
              movementCost: attackCost,
              isAttack: true,
              viaTransport: this.getSeaTransitId(attackPath),
            });
          }

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
        const nextCost = current.cost + this.getMovementStepCost(currentTerritory, adjTerritory, unitType);
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

    // Ranged strikes: sea→shore, artillery→fleet, land barrage
    if (includeRanged) {
      for (const coastalMove of this.getCoastalStrikeMoves(fromTerritoryId, unitType, isCombatMove)) {
        if (!validMoves.some(m => m.territoryId === coastalMove.territoryId)) {
          validMoves.push(coastalMove);
        }
      }
      for (const barrageMove of this.getLandBarrageMoves(fromTerritoryId, unitType, isCombatMove)) {
        if (!validMoves.some(m => m.territoryId === barrageMove.territoryId)) {
          validMoves.push(barrageMove);
        }
      }
    }

    return validMoves;
  }

  /** Adjacent cross-domain attack targets where the attacker never leaves its tile. */
  private getCoastalStrikeMoves(
    fromTerritoryId: string,
    unitType: UnitType,
    isCombatMove: boolean,
  ): ValidMove[] {
    if (!isCombatMove || !unitType.canAttack()) return [];

    const fromTerritory = this.state.territories.get(fromTerritoryId);
    const currentFaction = this.state.getCurrentFaction();
    if (!fromTerritory || !currentFaction) return [];

    const moves: ValidMove[] = [];

    if (unitType.domain === 'sea' && fromTerritory.type === 'sea') {
      for (const adjId of getNavalReachNeighborIds(this.state, fromTerritory)) {
        if (adjId === fromTerritoryId) continue;
        const adj = this.state.territories.get(adjId);
        if (!adj || !adj.isLand()) continue;
        if (!adj.owner || !currentFaction.isEnemyOf(adj.owner)) continue;
        const pactRel = this.state.diplomacyManager.getRelation(currentFaction.id, adj.owner);
        if (pactRel === 'pact') continue;
        if (moves.some(m => m.territoryId === adjId)) continue;
        moves.push({
          territoryId: adjId,
          path: [fromTerritoryId, adjId],
          movementCost: 1,
          isAttack: true,
          coastalStrike: true,
          rangedStrike: true,
        });
      }
    }

    if (unitType.domain === 'land' && fromTerritory.isLand() && canLandUnitStrikeNaval(unitType)) {
      for (const adjId of getNavalReachNeighborIds(this.state, fromTerritory)) {
        const adj = this.state.territories.get(adjId);
        if (!adj || adj.type !== 'sea') continue;
        const hasEnemyFleet = adj.units.some(pu => {
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          return ut?.domain === 'sea' && pu.count > 0;
        });
        const enemySeaOwner = adj.owner && currentFaction.isEnemyOf(adj.owner);
        if (!enemySeaOwner && !hasEnemyFleet) continue;
        if (adj.owner) {
          const pactRel = this.state.diplomacyManager.getRelation(currentFaction.id, adj.owner);
          if (pactRel === 'pact') continue;
        }
        if (moves.some(m => m.territoryId === adjId)) continue;
        moves.push({
          territoryId: adjId,
          path: [fromTerritoryId, adjId],
          movementCost: 1,
          isAttack: true,
          coastalStrike: true,
          rangedStrike: true,
        });
      }
    }

    if (unitType.domain === 'land' && fromTerritory.isLand() && canLandUnitEngageNaval(unitType) && !canLandUnitStrikeNaval(unitType)) {
      const onCoast = fromTerritory.type === 'coastal' || hasSeaAccess(this.state, fromTerritory);
      if (!onCoast) return moves;

      for (const adjId of this.getTerritoryNeighbors(fromTerritory, unitType)) {
        const adj = this.state.territories.get(adjId);
        if (!adj || adj.type !== 'sea') continue;
        const hasEnemyFleet = adj.units.some(pu => {
          const ut = this.state.unitRegistry.get(pu.unitTypeId);
          return ut?.domain === 'sea' && pu.count > 0;
        });
        const enemySeaOwner = adj.owner && currentFaction.isEnemyOf(adj.owner);
        if (!enemySeaOwner && !hasEnemyFleet) continue;
        if (adj.owner) {
          const pactRel = this.state.diplomacyManager.getRelation(currentFaction.id, adj.owner);
          if (pactRel === 'pact') continue;
        }
        if (moves.some(m => m.territoryId === adjId)) continue;
        moves.push({
          territoryId: adjId,
          path: [fromTerritoryId, adjId],
          movementCost: 1,
          isAttack: true,
          coastalStrike: true,
          rangedStrike: true,
        });
      }
    }

    return moves;
  }

  /** True when a combat move fires across a coast without entering the target tile. */
  isCoastalStrike(
    from: import('../data/Territory').Territory,
    to: import('../data/Territory').Territory,
    unitType: UnitType,
  ): boolean {
    if (unitType.domain === 'sea' && from.type === 'sea' && to.isLand()) {
      return isNavalReachNeighbor(this.state, from, to);
    }
    if (unitType.domain === 'land' && from.isLand() && to.type === 'sea' && canLandUnitStrikeNaval(unitType)) {
      return isNavalReachNeighbor(this.state, from, to);
    }
    if (unitType.domain === 'land' && from.isLand() && to.type === 'sea' && canLandUnitEngageNaval(unitType) && !canLandUnitStrikeNaval(unitType)) {
      const onCoast = from.type === 'coastal' || hasSeaAccess(this.state, from);
      return onCoast && this.getTerritoryNeighbors(from, unitType).includes(to.id);
    }
    return false;
  }

  /** Land artillery / ranged units striking enemy land without entering the tile. */
  isLandBarrageStrike(
    from: import('../data/Territory').Territory,
    to: import('../data/Territory').Territory,
    unitType: UnitType,
  ): boolean {
    if (unitType.domain !== 'land' || !from.isLand() || !to.isLand()) return false;
    if (unitType.attackRange <= 1) return false;
    const currentFaction = this.state.getCurrentFaction();
    if (!to.owner || !currentFaction?.isEnemyOf(to.owner)) return false;
    const dist = this.getStrikeDistance(from.id, to.id);
    return dist >= 0 && dist <= unitType.attackRange;
  }

  /** Any attack where the striker stays on its source tile. */
  isRangedStrike(
    from: import('../data/Territory').Territory,
    to: import('../data/Territory').Territory,
    unitType: UnitType,
  ): boolean {
    return this.isCoastalStrike(from, to, unitType) || this.isLandBarrageStrike(from, to, unitType);
  }

  /** Shortest path length between territories (graph hops). */
  getStrikeDistance(fromTerritoryId: string, toTerritoryId: string): number {
    if (fromTerritoryId === toTerritoryId) return 0;
    const visited = new Set<string>([fromTerritoryId]);
    const queue: { id: string; dist: number }[] = [{ id: fromTerritoryId, dist: 0 }];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const territory = this.state.territories.get(current.id);
      if (!territory) continue;
      for (const adjId of this.getTerritoryNeighbors(territory)) {
        if (visited.has(adjId)) continue;
        if (adjId === toTerritoryId) return current.dist + 1;
        visited.add(adjId);
        queue.push({ id: adjId, dist: current.dist + 1 });
      }
    }
    return -1;
  }

  /** Enemy land targets within attack range — attacker never leaves its tile. */
  private getLandBarrageMoves(
    fromTerritoryId: string,
    unitType: UnitType,
    isCombatMove: boolean,
  ): ValidMove[] {
    if (!isCombatMove || !unitType.canAttack() || unitType.attackRange <= 1) return [];

    const fromTerritory = this.state.territories.get(fromTerritoryId);
    const currentFaction = this.state.getCurrentFaction();
    if (!fromTerritory || !currentFaction || !fromTerritory.isLand()) return [];

    const moves: ValidMove[] = [];
    const visited = new Set<string>([fromTerritoryId]);
    const queue: { id: string; dist: number }[] = [{ id: fromTerritoryId, dist: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.dist >= unitType.attackRange) continue;

      const territory = this.state.territories.get(current.id);
      if (!territory) continue;

      for (const adjId of this.getTerritoryNeighbors(territory, unitType)) {
        if (visited.has(adjId)) continue;
        visited.add(adjId);

        const adj = this.state.territories.get(adjId);
        if (!adj) continue;

        const nextDist = current.dist + 1;
        if (adj.isLand() && adj.owner && currentFaction.isEnemyOf(adj.owner)) {
          const pactRel = this.state.diplomacyManager.getRelation(currentFaction.id, adj.owner);
          if (pactRel !== 'pact' && !moves.some(m => m.territoryId === adjId)) {
            moves.push({
              territoryId: adjId,
              path: [fromTerritoryId, adjId],
              movementCost: nextDist,
              isAttack: true,
              rangedStrike: true,
            });
          }
        }

        if (nextDist < unitType.attackRange) {
          queue.push({ id: adjId, dist: nextDist });
        }
      }
    }

    return moves;
  }

  /** Each map step costs 1 MP, including sea legs for amphibious units. */
  private getMovementStepCost(_from: Territory, _to: Territory, _unitType: UnitType): number {
    return 1;
  }

  private computePathMovementCost(path: string[], unitType: UnitType): number {
    let cost = 0;
    for (let i = 1; i < path.length; i++) {
      const from = this.state.territories.get(path[i - 1]);
      const to = this.state.territories.get(path[i]);
      if (!from || !to) continue;
      cost += this.getMovementStepCost(from, to, unitType);
    }
    return cost;
  }

  private usesImplicitAmphibious(unitType: UnitType): boolean {
    return usesImplicitAmphibious(unitType);
  }

  /** First sea zone crossed when a path uses self-embark amphibious movement. */
  private getSeaTransitId(path: string[]): string | undefined {
    for (let i = 1; i < path.length; i++) {
      const t = this.state.territories.get(path[i]);
      if (t?.type === 'sea') return path[i];
    }
    return undefined;
  }

  /**
   * Whether a unit may step into a territory during pathfinding.
   * Land units with requiredTransport may self-embark through friendly/neutral seas.
   */
  private canMoveIntoTerritory(
    unitType: UnitType,
    fromTerritory: Territory,
    toTerritory: Territory,
  ): boolean {
    if (unitType.canEnter(toTerritory.type)) return true;

    if (!this.usesImplicitAmphibious(unitType) || toTerritory.type !== 'sea') {
      return false;
    }

    if (!fromTerritory.isLand() && fromTerritory.type !== 'sea') {
      return false;
    }

    const faction = this.state.getCurrentFaction();
    if (!faction) return false;

    if (toTerritory.owner !== null && faction.isEnemyOf(toTerritory.owner)) {
      return false;
    }

    return true;
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

    for (const adjId of this.getTerritoryNeighbors(territory)) {
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
        return { valid: true, path: current.path, movementCost: this.computePathMovementCost(current.path, unitType) };
      }

      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const territory = this.state.territories.get(current.id);
      if (!territory) continue;

      for (const adjId of this.getTerritoryNeighbors(territory, unitType)) {
        if (visited.has(adjId)) continue;

        const adjTerritory = this.state.territories.get(adjId);
        if (!adjTerritory) continue;

        if (!this.canMoveIntoTerritory(unitType, territory, adjTerritory)) continue;

        queue.push({
          id: adjId,
          path: [...current.path, adjId],
        });
      }
    }

    return { valid: false, reason: 'No valid path found' };
  }

  /**
   * Whether a faction still has units that can move or attack this turn.
   */
  factionHasMovableUnits(factionId: string): boolean {
    for (const territory of this.state.territories.values()) {
      if (!canIssueOrdersFromTerritory(territory, factionId)) continue;
      for (const pu of territory.units) {
        if (territory.getAvailableUnitCount(pu.unitTypeId) <= 0) continue;
        const unitType = this.state.unitRegistry.get(pu.unitTypeId);
        if (!unitType) continue;
        const moves = this.getValidMoves(pu.unitTypeId, territory.id, true);
        if (moves.length > 0) return true;
      }
    }
    return false;
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

    const unitType = this.state.unitRegistry.get(move.unitTypeId);
    if (!unitType) return false;

    if (move.rangedStrike || move.coastalStrike) {
      fromTerritory.markUnitsActed(move.unitTypeId, move.count);
      this.state.emit('units_moved', {
        unitTypeId: move.unitTypeId,
        count: move.count,
        from: move.fromTerritoryId,
        to: move.toTerritoryId,
        rangedStrike: true,
      });
      return true;
    }

    const embarkingOnSea =
      this.usesImplicitAmphibious(unitType)
      && toTerritory.type === 'sea'
      && this.canMoveIntoTerritory(unitType, fromTerritory, toTerritory);
    if (!unitType.canEnter(toTerritory.type) && !embarkingOnSea) return false;
    if (
      unitType.domain === 'land'
      && fromTerritory.type === 'sea'
      && toTerritory.type === 'sea'
      && !this.usesImplicitAmphibious(unitType)
    ) {
      return false;
    }

    if (!fromTerritory.removeUnits(move.unitTypeId, move.count)) {
      return false;
    }

    const movingFaction = fromTerritory.owner ?? this.state.currentFactionId;
    // Capture neutral/unowned territory when moving in
    if (!toTerritory.owner && movingFaction) {
      toTerritory.owner = movingFaction;
    }

    toTerritory.addUnits(move.unitTypeId, move.count);
    if (embarkingOnSea && movingFaction) {
      claimSeaZoneForFaction(this.state, toTerritory, movingFaction);
    }

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





