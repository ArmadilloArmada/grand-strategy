/**
 * EspionageSystem - Covert operations between factions.
 * Three operations: intel gathering, factory sabotage, tech theft.
 */

import { GameState } from './GameState';
import { battleLog } from '../ui/BattleLog';

export type EspionageOpType =
  | 'steal_intel'
  | 'sabotage'
  | 'steal_tech'
  | 'assassinate_general'
  | 'economic_disruption'
  | 'propaganda_campaign'
  | 'steal_nuclear_secrets'
  | 'infrastructure_attack';

export interface EspionageOp {
  type: EspionageOpType;
  label: string;
  description: string;
  cost: number;
  successChance: number; // 0–1
}

export const ESPIONAGE_OPS: EspionageOp[] = [
  {
    type: 'steal_intel',
    label: '📊 Gather Intelligence',
    description: 'Reveal all enemy units in one territory for 3 turns.',
    cost: 5,
    successChance: 0.70,
  },
  {
    type: 'sabotage',
    label: '💣 Sabotage Factory',
    description: 'Bomb a random enemy factory, disabling production for 1 turn.',
    cost: 10,
    successChance: 0.55,
  },
  {
    type: 'steal_tech',
    label: '🔬 Steal Technology',
    description: 'Copy 5 research points from the enemy\'s current project.',
    cost: 15,
    successChance: 0.40,
  },
  {
    type: 'assassinate_general',
    label: '🗡️ Assassinate General',
    description: 'Eliminate a key enemy commander — reduces their attack by 1 for 3 turns.',
    cost: 20,
    successChance: 0.35,
  },
  {
    type: 'economic_disruption',
    label: '💸 Economic Disruption',
    description: 'Sabotage enemy financial networks, stealing 15% of their treasury.',
    cost: 15,
    successChance: 0.45,
  },
  {
    type: 'propaganda_campaign',
    label: '📢 Propaganda Campaign',
    description: 'Spread disinformation, raising enemy war weariness by 20 points.',
    cost: 10,
    successChance: 0.60,
  },
  {
    type: 'steal_nuclear_secrets',
    label: '☢️ Steal Nuclear Secrets',
    description: 'Acquire enemy nuclear research — boosts your own readiness by 30%.',
    cost: 25,
    successChance: 0.30,
  },
  {
    type: 'infrastructure_attack',
    label: '💣 Infrastructure Attack',
    description: 'Damage two enemy factories, disabling production for 2 turns each.',
    cost: 20,
    successChance: 0.40,
  },
];

export interface EspionageResult {
  success: boolean;
  exposed: boolean;
  opType: EspionageOpType;
  initiatorId: string;
  targetFactionId: string;
  detail: string;
}

export class EspionageSystem {
  // territoryId -> turn when intel expires
  private intelRevealed: Map<string, number> = new Map();

  constructor(private state: GameState) {}

  /**
   * Execute an espionage operation.
   * Returns the result (success/failure/exposure).
   */
  executeOperation(
    initiatorId: string,
    targetFactionId: string,
    opType: EspionageOpType
  ): EspionageResult {
    const op = ESPIONAGE_OPS.find(o => o.type === opType)!;
    const initiator = this.state.factionRegistry.get(initiatorId);
    const target = this.state.factionRegistry.get(targetFactionId);

    if (!initiator || !target) {
      return { success: false, exposed: false, opType, initiatorId, targetFactionId, detail: 'Invalid faction.' };
    }

    if (initiator.ipcs < op.cost) {
      return { success: false, exposed: false, opType, initiatorId, targetFactionId, detail: 'Insufficient IPCs.' };
    }

    initiator.ipcs -= op.cost;
    // Target's counter-intelligence reduces success chance
    const counterIntel = target.bonuses?.counterIntelBonus ?? 0;
    const adjustedChance = op.successChance * (1 - counterIntel);
    const success = Math.random() < adjustedChance;
    // 15% exposure chance on failure
    const exposed = !success && Math.random() < 0.15;

    let detail = '';

    if (success) {
      detail = this.applyEffect(opType, initiatorId, targetFactionId);
    } else {
      detail = `Operation detected by ${target.name}!`;
      if (exposed) {
        // Worsened relations: force to war if not already
        const current = this.state.diplomacyManager.getRelation(initiatorId, targetFactionId);
        if (current !== 'war') {
          this.state.diplomacyManager.forceWar(initiatorId, targetFactionId);
        }
        detail += ' Diplomatic relations damaged.';
      }
    }

    const result: EspionageResult = { success, exposed, opType, initiatorId, targetFactionId, detail };

    this.state.emit('espionage_result', result);
    battleLog.logCombat(
      this.state.turnNumber,
      initiator.name,
      initiator.color,
      `🕵️ ${success ? '✓' : '✗'} ${op.label}: ${detail}`
    );

    return result;
  }

  private applyEffect(opType: EspionageOpType, initiatorId: string, targetFactionId: string): string {
    const target = this.state.factionRegistry.get(targetFactionId)!;

    switch (opType) {
      case 'steal_intel': {
        // Reveal all territories owned by target for 3 turns
        const revealUntil = this.state.turnNumber + 3;
        for (const t of this.state.territories.values()) {
          if (t.owner === targetFactionId) {
            this.intelRevealed.set(t.id, revealUntil);
          }
        }
        return `Intelligence gathered on ${target.name} (3 turns).`;
      }

      case 'sabotage': {
        const factories = Array.from(this.state.territories.values())
          .filter(t => t.owner === targetFactionId && t.hasFactory);
        if (factories.length === 0) return `No factories found in ${target.name}.`;
        const picked = factories[Math.floor(Math.random() * factories.length)];
        picked.bombedUntilTurn = this.state.turnNumber + 1;
        return `${picked.name}'s factory sabotaged for 1 turn.`;
      }

      case 'steal_tech': {
        const techManager = this.state.systems.technologyManager;
        if (techManager) {
          const targetTech = techManager.getFactionTechPublic?.(targetFactionId);
          if (targetTech?.currentResearch) {
            const initiatorTech = techManager.getFactionTechPublic?.(initiatorId);
            if (initiatorTech) {
              initiatorTech.researchProgress = (initiatorTech.researchProgress ?? 0) + 5;
              return `5 research points stolen from ${target.name}'s ${targetTech.currentResearch} program.`;
            }
          }
        }
        const stolen = Math.floor(target.ipcs * 0.05);
        target.ipcs = Math.max(0, target.ipcs - stolen);
        return `Stole ${stolen} IPC worth of research secrets from ${target.name}.`;
      }

      case 'assassinate_general': {
        // Mark target faction with a temporary attack penalty via war weariness proxy
        target.warWeariness = Math.min(100, target.warWeariness + 15);
        return `Enemy general eliminated! ${target.name}'s war weariness increased by 15.`;
      }

      case 'economic_disruption': {
        const take = Math.floor(target.ipcs * 0.15);
        target.ipcs = Math.max(0, target.ipcs - take);
        this.state.factionRegistry.get(initiatorId)!.ipcs += take;
        return `Disrupted ${target.name}'s economy — seized ${take} IPCs.`;
      }

      case 'propaganda_campaign': {
        target.warWeariness = Math.min(100, target.warWeariness + 20);
        return `Propaganda campaign successful — ${target.name}'s war weariness +20.`;
      }

      case 'steal_nuclear_secrets': {
        const initiatorFaction = this.state.factionRegistry.get(initiatorId)!;
        initiatorFaction.nuclearReadiness = Math.min(100, initiatorFaction.nuclearReadiness + 30);
        return `Nuclear secrets stolen from ${target.name}! Your readiness +30%.`;
      }

      case 'infrastructure_attack': {
        const factories = Array.from(this.state.territories.values())
          .filter(t => t.owner === targetFactionId && t.hasFactory);
        const count = Math.min(2, factories.length);
        const names: string[] = [];
        for (let i = 0; i < count; i++) {
          const f = factories[Math.floor(Math.random() * factories.length)];
          f.bombedUntilTurn = Math.max(f.bombedUntilTurn ?? 0, this.state.turnNumber + 2);
          names.push(f.name);
        }
        return `Infrastructure attacked: ${names.join(', ')} disabled for 2 turns.`;
      }

      default:
        return 'Operation complete.';
    }
  }

  /**
   * Reveal all territories owned by a faction for a given number of turns.
   */
  revealFactionIntel(targetFactionId: string, turns: number): void {
    const revealUntil = this.state.turnNumber + turns;
    for (const t of this.state.territories.values()) {
      if (t.owner === targetFactionId) {
        this.intelRevealed.set(t.id, revealUntil);
      }
    }
  }

  /**
   * Check if a territory's units are currently revealed to a specific faction.
   */
  isIntelRevealed(territoryId: string): boolean {
    const expiry = this.intelRevealed.get(territoryId);
    if (expiry === undefined) return false;
    if (this.state.turnNumber > expiry) {
      this.intelRevealed.delete(territoryId);
      return false;
    }
    return true;
  }

  /**
   * Expire old intel entries.
   */
  tick(): void {
    for (const [id, expiry] of this.intelRevealed) {
      if (this.state.turnNumber > expiry) this.intelRevealed.delete(id);
    }
  }
}
