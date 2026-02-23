/**
 * EventsSystem - Random events and strategic decisions for grand strategy gameplay
 * Adds unpredictability and strategic depth to the game
 */

import { GameState } from './GameState';
import { Territory } from '../data/Territory';
import { Faction } from '../data/Faction';

export interface GameEvent {
  id: string;
  name: string;
  description: string;
  type: 'positive' | 'negative' | 'neutral' | 'choice';
  icon: string;
  effects: EventEffect[];
  choices?: EventChoice[];
  conditions?: EventCondition[];
  weight: number; // Probability weight (higher = more common)
  cooldownTurns: number; // Turns before this event can fire again
}

export interface EventEffect {
  type: 'ipc_bonus' | 'ipc_penalty' | 'production_bonus' | 'unit_spawn' | 'unit_loss' |
        'defense_bonus' | 'attack_bonus' | 'movement_bonus' | 'factory_damage' |
        'territory_revolt' | 'morale_boost' | 'intel_reveal';
  value?: number;
  target?: 'random_territory' | 'capital' | 'all' | 'frontline';
  duration?: number; // Turns the effect lasts
  unitType?: string;
}

export interface EventChoice {
  id: string;
  text: string;
  effects: EventEffect[];
  cost?: number; // IPC cost to choose this option
}

export interface EventCondition {
  type: 'at_war' | 'has_factory' | 'has_capital' | 'turn_number' | 'territory_count' |
        'ipc_amount' | 'losing' | 'winning';
  value?: number;
  comparison?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
}

export interface ActiveEffect {
  eventId: string;
  effect: EventEffect;
  factionId: string;
  territoryId?: string;
  expiresOnTurn: number;
}

// Pre-defined strategic events
export const STRATEGIC_EVENTS: GameEvent[] = [
  // Economic Events
  {
    id: 'industrial_boom',
    name: 'Industrial Boom',
    description: 'Your factories are operating at peak efficiency! Production output has increased.',
    type: 'positive',
    icon: '🏭',
    effects: [{ type: 'ipc_bonus', value: 10 }],
    weight: 15,
    cooldownTurns: 5,
  },
  {
    id: 'economic_recession',
    name: 'Economic Recession',
    description: 'A financial crisis has reduced your treasury.',
    type: 'negative',
    icon: '📉',
    effects: [{ type: 'ipc_penalty', value: 8 }],
    weight: 12,
    cooldownTurns: 6,
    conditions: [{ type: 'ipc_amount', value: 20, comparison: 'gt' }],
  },
  {
    id: 'resource_discovery',
    name: 'Resource Discovery',
    description: 'New resource deposits have been found in your territory.',
    type: 'positive',
    icon: '⛏️',
    effects: [{ type: 'production_bonus', value: 2, target: 'random_territory', duration: 5 }],
    weight: 10,
    cooldownTurns: 8,
  },
  
  // Military Events
  {
    id: 'volunteer_army',
    name: 'Volunteer Army',
    description: 'Patriots have joined your cause! Free infantry have arrived.',
    type: 'positive',
    icon: '🎖️',
    effects: [{ type: 'unit_spawn', unitType: 'infantry', value: 2, target: 'capital' }],
    weight: 12,
    cooldownTurns: 6,
  },
  {
    id: 'desertion',
    name: 'Desertion',
    description: 'Some troops have abandoned their posts.',
    type: 'negative',
    icon: '🏃',
    effects: [{ type: 'unit_loss', unitType: 'infantry', value: 1, target: 'frontline' }],
    weight: 8,
    cooldownTurns: 5,
    conditions: [{ type: 'at_war' }],
  },
  {
    id: 'military_exercise',
    name: 'Military Exercise',
    description: 'Your troops are battle-ready. Attack bonus this turn!',
    type: 'positive',
    icon: '⚔️',
    effects: [{ type: 'attack_bonus', value: 1, target: 'all', duration: 1 }],
    weight: 10,
    cooldownTurns: 4,
  },
  {
    id: 'fortification_complete',
    name: 'Fortification Complete',
    description: 'Defensive structures have been completed. Defense bonus!',
    type: 'positive',
    icon: '🛡️',
    effects: [{ type: 'defense_bonus', value: 1, target: 'frontline', duration: 3 }],
    weight: 10,
    cooldownTurns: 5,
  },
  
  // Intelligence Events
  {
    id: 'spy_network',
    name: 'Intelligence Report',
    description: 'Your spies have gathered intel on enemy positions.',
    type: 'positive',
    icon: '🕵️',
    effects: [{ type: 'intel_reveal' }],
    weight: 8,
    cooldownTurns: 4,
  },
  
  // Supply/Logistics Events
  {
    id: 'supply_convoy',
    name: 'Supply Convoy Arrives',
    description: 'A supply convoy has bolstered your war effort.',
    type: 'positive',
    icon: '🚚',
    effects: [{ type: 'ipc_bonus', value: 5 }, { type: 'movement_bonus', value: 1, duration: 2 }],
    weight: 12,
    cooldownTurns: 4,
  },
  {
    id: 'supply_disruption',
    name: 'Supply Lines Cut',
    description: 'Enemy action has disrupted supply routes.',
    type: 'negative',
    icon: '✂️',
    effects: [{ type: 'movement_bonus', value: -1, duration: 1 }],
    weight: 8,
    cooldownTurns: 4,
    conditions: [{ type: 'at_war' }],
  },
  
  // Political Events
  {
    id: 'popular_support',
    name: 'Popular Support',
    description: 'The people rally behind your cause!',
    type: 'positive',
    icon: '👥',
    effects: [{ type: 'morale_boost', value: 1 }, { type: 'ipc_bonus', value: 3 }],
    weight: 10,
    cooldownTurns: 6,
  },
  {
    id: 'factory_sabotage',
    name: 'Factory Sabotage',
    description: 'Saboteurs have damaged a factory.',
    type: 'negative',
    icon: '💥',
    effects: [{ type: 'factory_damage', target: 'random_territory' }],
    weight: 6,
    cooldownTurns: 8,
    conditions: [{ type: 'has_factory' }],
  },
  
  // Strategic Choice Events
  {
    id: 'foreign_aid',
    name: 'Foreign Aid Offer',
    description: 'A neutral power offers assistance. How will you respond?',
    type: 'choice',
    icon: '🤝',
    effects: [],
    choices: [
      {
        id: 'accept_money',
        text: 'Accept financial aid (+15 IPCs)',
        effects: [{ type: 'ipc_bonus', value: 15 }],
      },
      {
        id: 'accept_troops',
        text: 'Accept military aid (2 Infantry + 1 Tank)',
        effects: [
          { type: 'unit_spawn', unitType: 'infantry', value: 2, target: 'capital' },
          { type: 'unit_spawn', unitType: 'tank', value: 1, target: 'capital' },
        ],
      },
      {
        id: 'decline',
        text: 'Decline assistance (maintain independence)',
        effects: [{ type: 'morale_boost', value: 1 }],
      },
    ],
    weight: 5,
    cooldownTurns: 10,
  },
  {
    id: 'war_bonds',
    name: 'War Bonds Campaign',
    description: 'Should we launch a war bonds campaign?',
    type: 'choice',
    icon: '📜',
    effects: [],
    choices: [
      {
        id: 'aggressive_campaign',
        text: 'Aggressive campaign (+20 IPCs now, -3 IPCs/turn for 3 turns)',
        effects: [
          { type: 'ipc_bonus', value: 20 },
          { type: 'ipc_penalty', value: 3, duration: 3 },
        ],
      },
      {
        id: 'modest_campaign',
        text: 'Modest campaign (+8 IPCs)',
        effects: [{ type: 'ipc_bonus', value: 8 }],
      },
      {
        id: 'skip',
        text: 'Skip this opportunity',
        effects: [],
      },
    ],
    weight: 6,
    cooldownTurns: 8,
    conditions: [{ type: 'at_war' }],
  },
  {
    id: 'emergency_draft',
    name: 'Emergency Draft',
    description: 'Desperate times call for desperate measures.',
    type: 'choice',
    icon: '📋',
    effects: [],
    choices: [
      {
        id: 'full_draft',
        text: 'Full mobilization (4 Infantry, -10 IPCs)',
        effects: [
          { type: 'unit_spawn', unitType: 'infantry', value: 4, target: 'capital' },
          { type: 'ipc_penalty', value: 10 },
        ],
        cost: 10,
      },
      {
        id: 'partial_draft',
        text: 'Partial draft (2 Infantry, -5 IPCs)',
        effects: [
          { type: 'unit_spawn', unitType: 'infantry', value: 2, target: 'capital' },
          { type: 'ipc_penalty', value: 5 },
        ],
        cost: 5,
      },
      {
        id: 'no_draft',
        text: 'Maintain volunteer army only',
        effects: [],
      },
    ],
    weight: 4,
    cooldownTurns: 10,
    conditions: [{ type: 'losing' }],
  },
];

export class EventsSystem {
  private activeEffects: ActiveEffect[] = [];
  private eventCooldowns: Map<string, number> = new Map(); // eventId -> turn when available
  private eventHistory: { turn: number; eventId: string; factionId: string }[] = [];

  constructor(private state: GameState) {}

  /**
   * Roll for random event at start of a faction's turn
   * Returns an event or null if no event occurs
   */
  rollForEvent(factionId: string): GameEvent | null {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction || faction.isDefeated) return null;

    // 30% base chance of an event each turn
    const eventChance = 0.30;
    if (Math.random() > eventChance) return null;

    // Get eligible events
    const eligibleEvents = STRATEGIC_EVENTS.filter(event => {
      // Check cooldown
      const cooldownEnd = this.eventCooldowns.get(event.id) || 0;
      if (this.state.turnNumber < cooldownEnd) return false;

      // Check conditions
      if (event.conditions) {
        for (const condition of event.conditions) {
          if (!this.checkCondition(condition, faction)) return false;
        }
      }

      return true;
    });

    if (eligibleEvents.length === 0) return null;

    // Weight-based selection
    const totalWeight = eligibleEvents.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;
    
    for (const event of eligibleEvents) {
      roll -= event.weight;
      if (roll <= 0) {
        // Set cooldown
        this.eventCooldowns.set(event.id, this.state.turnNumber + event.cooldownTurns);
        this.eventHistory.push({ turn: this.state.turnNumber, eventId: event.id, factionId });
        return event;
      }
    }

    return eligibleEvents[0]; // Fallback
  }

  /**
   * Apply an event's effects to a faction
   */
  applyEvent(event: GameEvent, factionId: string, choiceId?: string): void {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return;

    let effects = event.effects;

    // If it's a choice event and a choice was made, use those effects
    if (event.type === 'choice' && choiceId && event.choices) {
      const choice = event.choices.find(c => c.id === choiceId);
      if (choice) {
        // Reject the choice entirely if the faction can't afford it
        if (choice.cost && faction.ipcs < choice.cost) return;
        if (choice.cost) faction.ipcs -= choice.cost;
        effects = choice.effects;
      }
    }

    for (const effect of effects) {
      this.applyEffect(effect, factionId);
    }

    this.state.emit('game_event', { event, factionId });
  }

  /**
   * Apply a single effect
   */
  private applyEffect(effect: EventEffect, factionId: string): void {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return;

    switch (effect.type) {
      case 'ipc_bonus':
        faction.ipcs += effect.value || 0;
        break;

      case 'ipc_penalty':
        faction.ipcs = Math.max(0, faction.ipcs - (effect.value || 0));
        break;

      case 'unit_spawn': {
        const targetTerritory = this.getTargetTerritory(effect.target, factionId);
        if (targetTerritory && effect.unitType) {
          targetTerritory.addUnits(effect.unitType, effect.value || 1);
        }
        break;
      }

      case 'unit_loss': {
        const targetTerritory = this.getTargetTerritory(effect.target, factionId);
        if (targetTerritory && effect.unitType) {
          targetTerritory.removeUnits(effect.unitType, effect.value || 1);
        }
        break;
      }

      case 'factory_damage': {
        const factories = this.getFactoryTerritories(factionId);
        if (factories.length > 0) {
          const target = factories[Math.floor(Math.random() * factories.length)];
          target.bombedUntilTurn = this.state.turnNumber + 2;
        }
        break;
      }

      case 'attack_bonus':
      case 'defense_bonus':
      case 'movement_bonus':
      case 'production_bonus':
        // Add to active effects with duration
        if (effect.duration && effect.duration > 0) {
          this.activeEffects.push({
            eventId: 'dynamic',
            effect,
            factionId,
            expiresOnTurn: this.state.turnNumber + effect.duration,
          });
        }
        break;
    }
  }

  /**
   * Get a target territory based on target type
   */
  private getTargetTerritory(target: string | undefined, factionId: string): Territory | null {
    const ownedTerritories = Array.from(this.state.territories.values())
      .filter(t => t.owner === factionId && t.isLand());

    if (ownedTerritories.length === 0) return null;

    switch (target) {
      case 'capital': {
        const faction = this.state.factionRegistry.get(factionId);
        return faction ? this.state.territories.get(faction.capital) || null : null;
      }

      case 'frontline': {
        // Territory adjacent to enemy
        const frontline = ownedTerritories.filter(t =>
          t.adjacentTo.some(adjId => {
            const adj = this.state.territories.get(adjId);
            return adj && adj.owner && adj.owner !== factionId;
          })
        );
        return frontline.length > 0 
          ? frontline[Math.floor(Math.random() * frontline.length)]
          : ownedTerritories[0];
      }

      case 'random_territory':
      default:
        return ownedTerritories[Math.floor(Math.random() * ownedTerritories.length)];
    }
  }

  /**
   * Get all factory territories for a faction
   */
  private getFactoryTerritories(factionId: string): Territory[] {
    return Array.from(this.state.territories.values())
      .filter(t => t.owner === factionId && t.hasFactory);
  }

  /**
   * Check if a condition is met
   */
  private checkCondition(condition: EventCondition, faction: Faction): boolean {
    switch (condition.type) {
      case 'at_war':
        // Assume always at war in this game
        return true;

      case 'has_factory':
        return this.getFactoryTerritories(faction.id).length > 0;

      case 'has_capital':
        const capital = this.state.territories.get(faction.capital);
        return capital?.owner === faction.id;

      case 'turn_number':
        return this.compareValue(this.state.turnNumber, condition.value || 0, condition.comparison);

      case 'territory_count': {
        const count = Array.from(this.state.territories.values())
          .filter(t => t.owner === faction.id).length;
        return this.compareValue(count, condition.value || 0, condition.comparison);
      }

      case 'ipc_amount':
        return this.compareValue(faction.ipcs, condition.value || 0, condition.comparison);

      case 'losing': {
        // Less territories than starting
        const currentCount = Array.from(this.state.territories.values())
          .filter(t => t.owner === faction.id).length;
        const startingCount = Array.from(this.state.territories.values())
          .filter(t => t.originalOwner === faction.id).length;
        return currentCount < startingCount * 0.7;
      }

      case 'winning': {
        // More territories than starting
        const currentCount = Array.from(this.state.territories.values())
          .filter(t => t.owner === faction.id).length;
        const startingCount = Array.from(this.state.territories.values())
          .filter(t => t.originalOwner === faction.id).length;
        return currentCount > startingCount * 1.3;
      }

      default:
        return true;
    }
  }

  /**
   * Compare values with comparison operator
   */
  private compareValue(actual: number, expected: number, comparison?: string): boolean {
    switch (comparison) {
      case 'gt': return actual > expected;
      case 'lt': return actual < expected;
      case 'eq': return actual === expected;
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
      default: return actual >= expected;
    }
  }

  /**
   * Get active effects for a faction
   */
  getActiveEffects(factionId: string): ActiveEffect[] {
    return this.activeEffects.filter(e => 
      e.factionId === factionId && e.expiresOnTurn > this.state.turnNumber
    );
  }

  /**
   * Get cumulative bonus from active effects
   */
  getEffectBonus(factionId: string, effectType: EventEffect['type']): number {
    return this.getActiveEffects(factionId)
      .filter(e => e.effect.type === effectType)
      .reduce((sum, e) => sum + (e.effect.value || 0), 0);
  }

  /**
   * Clean up expired effects
   */
  cleanupExpiredEffects(): void {
    this.activeEffects = this.activeEffects.filter(e => 
      e.expiresOnTurn > this.state.turnNumber
    );
  }

  /**
   * Serialize for save/load
   */
  serialize(): { 
    activeEffects: ActiveEffect[]; 
    eventCooldowns: [string, number][];
    eventHistory: { turn: number; eventId: string; factionId: string }[];
  } {
    return {
      activeEffects: this.activeEffects,
      eventCooldowns: Array.from(this.eventCooldowns.entries()),
      eventHistory: this.eventHistory,
    };
  }

  /**
   * Restore from save
   */
  restore(data: ReturnType<typeof this.serialize>): void {
    this.activeEffects = data.activeEffects || [];
    this.eventCooldowns = new Map(data.eventCooldowns || []);
    this.eventHistory = data.eventHistory || [];
  }
}
