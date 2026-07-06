/**
 * AI Personalities - Different AI behavior patterns
 * Makes AI opponents more varied and interesting
 */

export interface AIPersonality {
  id: string;
  name: string;
  description: string;
  icon: string;
  
  // Behavior weights (0-1)
  aggression: number;      // How likely to attack vs defend
  expansion: number;       // Priority on capturing territories
  economy: number;         // Priority on building factories/income
  naval: number;           // Priority on naval forces
  air: number;             // Priority on air forces
  defense: number;         // Priority on defensive positions
  
  // Strategic preferences
  preferredUnitTypes: string[];
  avoidedUnitTypes: string[];
  
  // Decision modifiers
  riskTolerance: number;   // Willingness to take risky attacks (0-1)
  patience: number;        // How long to build up before attacking (0-1)
  adaptation: number;      // How quickly to change strategy (0-1)
  
  // Special behaviors
  specialBehaviors: string[];
}

export const AI_PERSONALITIES: AIPersonality[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'A well-rounded opponent with no particular focus',
    icon: '⚖️',
    aggression: 0.5,
    expansion: 0.5,
    economy: 0.5,
    naval: 0.5,
    air: 0.5,
    defense: 0.5,
    preferredUnitTypes: [],
    avoidedUnitTypes: [],
    riskTolerance: 0.5,
    patience: 0.5,
    adaptation: 0.5,
    specialBehaviors: [],
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Favors constant attacks and offensive operations',
    icon: '⚔️',
    aggression: 0.9,
    expansion: 0.7,
    economy: 0.3,
    naval: 0.5,
    air: 0.6,
    defense: 0.2,
    preferredUnitTypes: ['tank', 'fighter', 'bomber'],
    avoidedUnitTypes: ['anti_air', 'artillery'],
    riskTolerance: 0.8,
    patience: 0.2,
    adaptation: 0.4,
    specialBehaviors: ['blitz_attacks', 'ignore_losses'],
  },
  {
    id: 'defensive',
    name: 'Defensive',
    description: 'Builds strong defenses and counterattacks',
    icon: '🛡️',
    aggression: 0.2,
    expansion: 0.3,
    economy: 0.6,
    naval: 0.4,
    air: 0.5,
    defense: 0.9,
    preferredUnitTypes: ['infantry', 'artillery', 'anti_air'],
    avoidedUnitTypes: ['bomber'],
    riskTolerance: 0.2,
    patience: 0.8,
    adaptation: 0.3,
    specialBehaviors: ['fortify_borders', 'counterattack_only'],
  },
  {
    id: 'economic',
    name: 'Economic',
    description: 'Focuses on building a strong economy before striking',
    icon: '💰',
    aggression: 0.3,
    expansion: 0.4,
    economy: 0.9,
    naval: 0.4,
    air: 0.4,
    defense: 0.6,
    preferredUnitTypes: ['infantry'],
    avoidedUnitTypes: ['battleship', 'carrier'],
    riskTolerance: 0.3,
    patience: 0.9,
    adaptation: 0.4,
    specialBehaviors: ['factory_priority', 'save_ipcs'],
  },
  {
    id: 'naval',
    name: 'Admiral',
    description: 'Prioritizes naval dominance and island hopping',
    icon: '⚓',
    aggression: 0.5,
    expansion: 0.6,
    economy: 0.5,
    naval: 0.95,
    air: 0.7,
    defense: 0.4,
    preferredUnitTypes: ['battleship', 'carrier', 'submarine', 'destroyer', 'fighter'],
    avoidedUnitTypes: ['artillery'],
    riskTolerance: 0.5,
    patience: 0.5,
    adaptation: 0.5,
    specialBehaviors: ['control_seas', 'amphibious_focus'],
  },
  {
    id: 'blitz',
    name: 'Blitzkrieg',
    description: 'Fast, mobile warfare with tanks and aircraft',
    icon: '⚡',
    aggression: 0.85,
    expansion: 0.8,
    economy: 0.3,
    naval: 0.2,
    air: 0.8,
    defense: 0.1,
    preferredUnitTypes: ['tank', 'mech_infantry', 'fighter', 'bomber'],
    avoidedUnitTypes: ['infantry', 'battleship'],
    riskTolerance: 0.7,
    patience: 0.1,
    adaptation: 0.6,
    specialBehaviors: ['deep_strikes', 'encirclement'],
  },
  {
    id: 'turtle',
    name: 'Turtle',
    description: 'Extremely defensive, waits for the perfect moment',
    icon: '🐢',
    aggression: 0.1,
    expansion: 0.2,
    economy: 0.7,
    naval: 0.3,
    air: 0.4,
    defense: 0.95,
    preferredUnitTypes: ['infantry', 'artillery', 'anti_air', 'fighter'],
    avoidedUnitTypes: ['tank', 'bomber'],
    riskTolerance: 0.1,
    patience: 0.95,
    adaptation: 0.2,
    specialBehaviors: ['maximum_defense', 'only_sure_attacks'],
  },
  {
    id: 'unpredictable',
    name: 'Unpredictable',
    description: 'Random and chaotic - hard to counter',
    icon: '🎲',
    aggression: 0.5,
    expansion: 0.5,
    economy: 0.5,
    naval: 0.5,
    air: 0.5,
    defense: 0.5,
    preferredUnitTypes: [],
    avoidedUnitTypes: [],
    riskTolerance: 0.7,
    patience: 0.3,
    adaptation: 0.9,
    specialBehaviors: ['random_focus', 'surprise_attacks'],
  },
  {
    id: 'historical',
    name: 'Historical',
    description: 'Follows historical strategies for each faction',
    icon: '📜',
    aggression: 0.5,
    expansion: 0.5,
    economy: 0.5,
    naval: 0.5,
    air: 0.5,
    defense: 0.5,
    preferredUnitTypes: [],
    avoidedUnitTypes: [],
    riskTolerance: 0.5,
    patience: 0.5,
    adaptation: 0.3,
    specialBehaviors: ['historical_priorities', 'faction_specific'],
  },
  {
    id: 'adaptive',
    name: 'Adaptive',
    description: 'Learns from the game and counters your strategy',
    icon: '🧠',
    aggression: 0.5,
    expansion: 0.5,
    economy: 0.5,
    naval: 0.5,
    air: 0.5,
    defense: 0.5,
    preferredUnitTypes: [],
    avoidedUnitTypes: [],
    riskTolerance: 0.5,
    patience: 0.5,
    adaptation: 0.95,
    specialBehaviors: ['counter_player', 'analyze_threats'],
  },
];

/**
 * Get personality by ID
 */
export function getPersonality(id: string): AIPersonality {
  return AI_PERSONALITIES.find(p => p.id === id) || AI_PERSONALITIES[0];
}

/**
 * Get random personality
 */
export function getRandomPersonality(): AIPersonality {
  return AI_PERSONALITIES[Math.floor(Math.random() * AI_PERSONALITIES.length)];
}

/**
 * Calculate attack priority based on personality
 */
export function calculateAttackPriority(
  personality: AIPersonality,
  attackerStrength: number,
  defenderStrength: number,
  territoryValue: number
): number {
  const odds = attackerStrength / (defenderStrength + 0.1);
  const baseValue = territoryValue * personality.expansion;
  const aggMod = personality.aggression;
  const riskMod = personality.riskTolerance;
  
  // Higher aggression = more likely to attack
  // Higher risk tolerance = accepts worse odds
  const oddsThreshold = 1.0 - (riskMod * 0.5); // 0.5 to 1.0
  
  if (odds < oddsThreshold) {
    return 0; // Don't attack if odds are too bad
  }
  
  return baseValue * aggMod * Math.min(odds, 2);
}

/**
 * Calculate unit production priority
 */
export function calculateUnitPriority(
  personality: AIPersonality,
  unitType: string,
  currentComposition: Map<string, number>
): number {
  let priority = 1.0;
  
  // Check preferred/avoided
  if (personality.preferredUnitTypes.includes(unitType)) {
    priority *= 1.5;
  }
  if (personality.avoidedUnitTypes.includes(unitType)) {
    priority *= 0.3;
  }
  
  // Apply personality weights
  if (['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'marines'].includes(unitType)) {
    priority *= personality.naval;

    let navalTotal = 0;
    let landTotal = 0;
    for (const [id, count] of currentComposition) {
      if (['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'marines'].includes(id)) {
        navalTotal += count;
      } else if (id !== 'fighter' && id !== 'bomber') {
        landTotal += count;
      }
    }
    if (navalTotal >= 8) priority *= 0.45;
    if (navalTotal >= 16) priority *= 0.35;
    if (landTotal > 0 && navalTotal / landTotal > 0.35) priority *= 0.4;
  }
  if (['fighter', 'bomber'].includes(unitType)) {
    priority *= personality.air;

    let airTotal = 0;
    let landTotal = 0;
    for (const [id, count] of currentComposition) {
      if (id === 'fighter' || id === 'bomber') {
        airTotal += count;
      } else if (!['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'marines'].includes(id)) {
        landTotal += count;
      }
    }
    if (airTotal >= 6) priority *= 0.45;
    if (airTotal >= 12) priority *= 0.35;
    if (landTotal > 0 && airTotal / landTotal > 0.2) priority *= 0.4;
  }
  if (['infantry', 'artillery', 'anti_air'].includes(unitType)) {
    priority *= personality.defense;
  }
  if (['tank', 'mech_infantry'].includes(unitType)) {
    priority *= personality.aggression;
  }
  
  return priority;
}