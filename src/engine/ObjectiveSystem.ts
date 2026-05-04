/**
 * ObjectiveSystem - Random mid-game bonus objectives
 *
 * Each turn a human faction may receive a new optional objective.
 * Completing it before the deadline earns a reward (IPC, research, units).
 * Up to 3 active objectives at once; oldest drops when the cap is exceeded.
 */

import { GameState } from './GameState';

export type ObjectiveRewardType = 'ipc' | 'research' | 'units';

export interface ObjectiveReward {
  type: ObjectiveRewardType;
  amount: number;
  unitTypeId?: string; // for type === 'units'
}

export type ObjectiveConditionType =
  | 'hold_territory'
  | 'capture_territory'
  | 'destroy_units'
  | 'earn_income'
  | 'survive_turns';

export interface Objective {
  id: string;
  title: string;
  description: string;
  reward: ObjectiveReward;
  deadline: number;       // turn number
  factionId: string;
  condition: {
    type: ObjectiveConditionType;
    territoryId?: string;
    territoryName?: string;
    count?: number;
    holdUntilTurn?: number;
  };
  progress: number;
  completed: boolean;
  failed: boolean;
}

const MAX_ACTIVE = 3;
const CHANCE_PER_TURN = 0.35; // 35 % chance to get a new objective each turn

export class ObjectiveSystem {
  private objectives: Objective[] = [];
  private idCounter = 0;
  private listeners: Array<(obj: Objective, event: 'new' | 'complete' | 'fail') => void> = [];
  private openingIssued: Set<string> = new Set();
  private mapId: string = 'grid';

  constructor(private state: GameState) {}

  setScenarioMap(mapId: string): void {
    this.mapId = mapId;
  }

  // ── Per-turn hook ─────────────────────────────────────────────────────────

  /**
   * Called at the start of a human faction's turn.
   * May generate a new objective and checks existing ones.
   */
  tick(factionId: string): void {
    this.checkFailures(factionId);
    this.ensureOpeningObjectives(factionId);

    const active = this.objectives.filter(o => o.factionId === factionId && !o.completed && !o.failed);
    if (active.length < MAX_ACTIVE && Math.random() < CHANCE_PER_TURN) {
      const obj = this.generateObjective(factionId);
      if (obj) {
        if (active.length >= MAX_ACTIVE) {
          // Drop oldest
          const oldest = active.sort((a, b) => a.deadline - b.deadline)[0];
          if (oldest) oldest.failed = true;
        }
        this.objectives.push(obj);
        this.emit(obj, 'new');
      }
    }
  }

  /**
   * Call after combat / income / turns to update progress.
   */
  recordEvent(factionId: string, type: ObjectiveConditionType, payload: {
    territoryId?: string;
    count?: number;
    income?: number;
  }): void {
    for (const obj of this.objectives) {
      if (obj.factionId !== factionId || obj.completed || obj.failed) continue;
      if (obj.condition.type !== type) continue;

      if (type === 'destroy_units' && payload.count) {
        obj.progress = Math.min((obj.condition.count ?? 1), obj.progress + payload.count);
      } else if (type === 'earn_income' && payload.income) {
        obj.progress = Math.min((obj.condition.count ?? 1), obj.progress + payload.income);
      } else if (type === 'capture_territory' && payload.territoryId === obj.condition.territoryId) {
        obj.progress = obj.condition.count ?? 1;
      }

      if (obj.progress >= (obj.condition.count ?? 1)) {
        this.complete(obj);
      }
    }
  }

  /**
   * Call at the start of each faction's turn to check hold conditions.
   */
  checkHoldConditions(factionId: string, currentTurn: number): void {
    const faction = this.state.factionRegistry.get(factionId);
    for (const obj of this.objectives) {
      if (obj.factionId !== factionId || obj.completed || obj.failed) continue;

      if (obj.condition.type === 'hold_territory') {
        const territory = this.state.territories.get(obj.condition.territoryId ?? '');
        if (territory?.owner !== factionId) {
          obj.failed = true;
          this.emit(obj, 'fail');
        } else if (currentTurn >= (obj.condition.holdUntilTurn ?? obj.deadline)) {
          this.complete(obj);
        }
      } else if (obj.condition.type === 'survive_turns') {
        // Progress each turn the capital is held
        const capitalHeld = faction && this.state.territories.get(faction.capital)?.owner === factionId;
        if (!capitalHeld) {
          obj.failed = true;
          this.emit(obj, 'fail');
        } else {
          obj.progress++;
          if (obj.progress >= (obj.condition.count ?? 5)) {
            this.complete(obj);
          }
        }
      }
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getActive(factionId: string): Objective[] {
    return this.objectives.filter(o => o.factionId === factionId && !o.completed && !o.failed);
  }

  getAll(factionId: string): Objective[] {
    return this.objectives.filter(o => o.factionId === factionId);
  }

  reset(): void {
    this.objectives = [];
    this.idCounter = 0;
    this.openingIssued.clear();
  }

  onChange(cb: (obj: Objective, event: 'new' | 'complete' | 'fail') => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  ensureOpeningObjectives(factionId: string): void {
    if (this.openingIssued.has(factionId) || this.state.turnNumber > 1) return;
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return;
    this.openingIssued.add(factionId);

    const capital = this.state.territories.get(faction.capital);
    if (capital?.owner === factionId) {
      const obj: Objective = {
        id: `obj_${++this.idCounter}`,
        title: 'Secure the Capital',
        description: `Hold ${capital.name} for the first 3 turns.`,
        reward: { type: 'ipc', amount: 20 },
        deadline: this.state.turnNumber + 4,
        factionId,
        condition: { type: 'survive_turns', count: 3 },
        progress: 0,
        completed: false,
        failed: false,
      };
      this.objectives.push(obj);
      this.emit(obj, 'new');
    }

    const scenarioObjective = this.generateScenarioOpeningObjective(factionId);
    if (scenarioObjective) {
      this.objectives.push(scenarioObjective);
      this.emit(scenarioObjective, 'new');
    }

    const enemyBorder = Array.from(this.state.territories.values())
      .filter(t => t.owner && faction.isEnemyOf(t.owner) && t.isLand())
      .map(t => {
        const friendlyAdjacency = t.adjacentTo.some(id => this.state.territories.get(id)?.owner === factionId);
        const value = t.production + (t.hasFactory ? 4 : 0) + (t.isCapital ? 8 : 0);
        return { territory: t, friendlyAdjacency, value };
      })
      .filter(t => t.friendlyAdjacency)
      .sort((a, b) => b.value - a.value)[0]?.territory;

    if (enemyBorder) {
      const obj: Objective = {
        id: `obj_${++this.idCounter}`,
        title: 'Opening Offensive',
        description: `Capture ${enemyBorder.name} before turn ${this.state.turnNumber + 5}.`,
        reward: { type: 'ipc', amount: 25 },
        deadline: this.state.turnNumber + 5,
        factionId,
        condition: { type: 'capture_territory', territoryId: enemyBorder.id, territoryName: enemyBorder.name, count: 1 },
        progress: 0,
        completed: false,
        failed: false,
      };
      this.objectives.push(obj);
      this.emit(obj, 'new');
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private generateScenarioOpeningObjective(factionId: string): Objective | null {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return null;

    const turn = this.state.turnNumber;
    const targetValue = (t: import('../data/Territory').Territory): number =>
      t.production + (t.hasFactory ? 5 : 0) + (t.isCapital ? 10 : 0) + (t.type === 'coastal' ? 2 : 0);

    const adjacentEnemy = Array.from(this.state.territories.values())
      .filter(t => t.owner && faction.isEnemyOf(t.owner) && t.isLand())
      .filter(t => t.adjacentTo.some(id => this.state.territories.get(id)?.owner === factionId));
    const ownedLand = Array.from(this.state.territories.values()).filter(t => t.owner === factionId && t.isLand());

    const pickCapture = (title: string, prefix: string, candidates: typeof adjacentEnemy, reward = 18): Objective | null => {
      const target = candidates.sort((a, b) => targetValue(b) - targetValue(a))[0];
      if (!target) return null;
      return {
        id: `obj_${++this.idCounter}`,
        title,
        description: `${prefix} ${target.name} before turn ${turn + 5}.`,
        reward: { type: 'ipc', amount: reward },
        deadline: turn + 5,
        factionId,
        condition: { type: 'capture_territory', territoryId: target.id, territoryName: target.name, count: 1 },
        progress: 0,
        completed: false,
        failed: false,
      };
    };

    const pickHold = (title: string, prefix: string, candidates: typeof ownedLand, reward = 16): Objective | null => {
      const target = candidates.sort((a, b) => targetValue(b) - targetValue(a))[0];
      if (!target) return null;
      return {
        id: `obj_${++this.idCounter}`,
        title,
        description: `${prefix} ${target.name} for 3 turns.`,
        reward: { type: 'ipc', amount: reward },
        deadline: turn + 5,
        factionId,
        condition: { type: 'hold_territory', territoryId: target.id, territoryName: target.name, holdUntilTurn: turn + 3 },
        progress: 0,
        completed: false,
        failed: false,
      };
    };

    if (this.mapId.includes('pacific') || this.mapId.includes('archipelago')) {
      return pickCapture('Island Hopping', 'Seize the coastal stepping stone at',
        adjacentEnemy.filter(t => t.type === 'coastal' || t.adjacentTo.some(id => this.state.territories.get(id)?.type === 'sea')), 22);
    }
    if (this.mapId.includes('europe') || this.mapId.includes('eastern-front')) {
      return pickCapture('Break the Front', 'Punch through the main line and capture',
        adjacentEnemy.filter(t => t.hasFactory || t.isCapital || t.production >= 3), 22);
    }
    if (this.mapId.includes('africa') || this.mapId.includes('mediterranean')) {
      return pickHold('Secure the Route', 'Keep the supply route open at',
        ownedLand.filter(t => !t.isCapital && (t.type === 'coastal' || t.hasFactory)), 18);
    }
    if (this.mapId.includes('americas')) {
      return pickCapture('Hemisphere Pressure', 'Control the approach by taking',
        adjacentEnemy.filter(t => t.production >= 3 || t.hasFactory), 20);
    }
    if (this.mapId.includes('arctic')) {
      return pickHold('Hold the Ice Road', 'Protect the northern route at',
        ownedLand.filter(t => !t.isCapital && (t.production >= 2 || t.hasFactory)), 18);
    }
    if (this.mapId.includes('skirmish')) {
      return pickCapture('First Blood', 'Win the first border clash at', adjacentEnemy, 16);
    }

    return null;
  }

  private checkFailures(factionId: string): void {
    const turn = this.state.turnNumber;
    for (const obj of this.objectives) {
      if (obj.factionId !== factionId || obj.completed || obj.failed) continue;
      if (turn > obj.deadline) {
        obj.failed = true;
        this.emit(obj, 'fail');
      }
    }
  }

  private complete(obj: Objective): void {
    obj.completed = true;
    this.applyReward(obj);
    this.emit(obj, 'complete');
  }

  private applyReward(obj: Objective): void {
    const faction = this.state.factionRegistry.get(obj.factionId);
    if (!faction) return;
    if (obj.reward.type === 'ipc') {
      faction.addIPCs(obj.reward.amount);
    } else if (obj.reward.type === 'units' && obj.reward.unitTypeId) {
      // Spawn units at capital
      const capital = this.state.territories.get(faction.capital);
      if (capital) capital.addUnits(obj.reward.unitTypeId, obj.reward.amount);
    }
    // 'research' reward is informational — TechnologyManager can pick it up via event
    this.state.emit('objective_reward', { factionId: obj.factionId, reward: obj.reward });
  }

  private emit(obj: Objective, event: 'new' | 'complete' | 'fail'): void {
    for (const cb of this.listeners) cb(obj, event);
  }

  private generateObjective(factionId: string): Objective | null {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return null;

    const turn = this.state.turnNumber;
    const id = `obj_${++this.idCounter}`;
    const deadline = turn + 4 + Math.floor(Math.random() * 3); // 4–6 turns

    const templates: Array<() => Objective | null> = [
      // Hold a random friendly territory
      () => {
        const owned = Array.from(this.state.territories.values())
          .filter(t => t.owner === factionId && !t.isCapital && t.isLand());
        if (owned.length === 0) return null;
        const t = owned[Math.floor(Math.random() * owned.length)];
        const holdTurns = 2 + Math.floor(Math.random() * 2);
        return {
          id, factionId, completed: false, failed: false, progress: 0,
          title: 'Hold the Line',
          description: `Hold ${t.name} for ${holdTurns} turns.`,
          reward: { type: 'ipc', amount: 15 + holdTurns * 5 },
          deadline,
          condition: { type: 'hold_territory', territoryId: t.id, territoryName: t.name, holdUntilTurn: turn + holdTurns },
        };
      },
      // Capture an adjacent enemy territory
      () => {
        const adjacent = Array.from(this.state.territories.values()).filter(t => {
          if (t.owner === factionId || !t.owner) return false;
          const f = this.state.factionRegistry.get(t.owner);
          return f && faction.isEnemyOf(f.id);
        });
        if (adjacent.length === 0) return null;
        const t = adjacent[Math.floor(Math.random() * adjacent.length)];
        return {
          id, factionId, completed: false, failed: false, progress: 0,
          title: 'Offensive Push',
          description: `Capture ${t.name} before turn ${deadline}.`,
          reward: { type: 'ipc', amount: 20 },
          deadline,
          condition: { type: 'capture_territory', territoryId: t.id, territoryName: t.name, count: 1 },
        };
      },
      // Destroy enemy units
      () => {
        const count = 5 + Math.floor(Math.random() * 6) * 5; // 5,10,15,20,25,30
        return {
          id, factionId, completed: false, failed: false, progress: 0,
          title: 'Attrit the Enemy',
          description: `Destroy ${count} enemy units before turn ${deadline}.`,
          reward: { type: 'ipc', amount: count },
          deadline,
          condition: { type: 'destroy_units', count },
        };
      },
      // Earn income
      () => {
        const target = 20 + Math.floor(Math.random() * 4) * 10; // 20,30,40,50
        return {
          id, factionId, completed: false, failed: false, progress: 0,
          title: 'War Economy',
          description: `Collect ${target} IPCs in income before turn ${deadline}.`,
          reward: { type: 'ipc', amount: Math.floor(target * 0.5) },
          deadline,
          condition: { type: 'earn_income', count: target },
        };
      },
      // Survive turns with capital held
      () => {
        const turns = 3 + Math.floor(Math.random() * 3); // 3–5 turns
        return {
          id, factionId, completed: false, failed: false, progress: 0,
          title: 'Hold the Homefront',
          description: `Keep your capital secure for ${turns} more turns.`,
          reward: { type: 'ipc', amount: 15 + turns * 5 },
          deadline: turn + turns + 2,
          condition: { type: 'survive_turns', count: turns },
        };
      },
    ];

    // Shuffle and pick first valid
    const shuffled = templates.sort(() => Math.random() - 0.5);
    for (const fn of shuffled) {
      const result = fn();
      if (result) return result;
    }
    return null;
  }
}
