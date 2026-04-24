/**
 * TechnologyManager - Handles technology research and upgrades
 */

import { GameState } from './GameState';

export interface Technology {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  effect: TechEffect;
  category: 'infantry' | 'armor' | 'air' | 'naval' | 'economy' | 'special';
  prerequisites?: string[];
}

export interface TechEffect {
  [key: string]: unknown;
  attackBonus?: number;
  defenseBonus?: number;
  movementBonus?: number;
  incomeBonus?: number;
  productionBonus?: number;
  infantryAttackBonus?: number;
  infantryDefenseBonus?: number;
  navalAttackBonus?: number;
  navalDefenseBonus?: number;
  airAttackBonus?: number;
  specialAbility?: string;
}

export interface FactionTech {
  researched: Set<string>;
  currentResearch: string | null;
  researchProgress: number;
}

// Available technologies
export const TECHNOLOGIES: Technology[] = [
  // Infantry
  {
    id: 'improved_infantry',
    name: 'Improved Infantry',
    description: 'Infantry gain +1 Defense',
    cost: 10,
    icon: '🛡️',
    effect: { defenseBonus: 1 },
    category: 'infantry',
  },
  {
    id: 'elite_training',
    name: 'Elite Training',
    description: 'Infantry gain +1 Attack',
    cost: 15,
    icon: '⚔️',
    effect: { attackBonus: 1 },
    category: 'infantry',
    prerequisites: ['improved_infantry'],
  },
  
  // Armor
  {
    id: 'heavy_tanks',
    name: 'Heavy Tanks',
    description: 'Tanks gain +1 Attack',
    cost: 12,
    icon: '🔥',
    effect: { attackBonus: 1 },
    category: 'armor',
  },
  {
    id: 'blitzkrieg',
    name: 'Blitzkrieg Tactics',
    description: 'Tanks gain +1 Movement',
    cost: 15,
    icon: '⚡',
    effect: { movementBonus: 1 },
    category: 'armor',
    prerequisites: ['heavy_tanks'],
  },
  
  // Air
  {
    id: 'long_range_aircraft',
    name: 'Long Range Aircraft',
    description: 'Fighters & Bombers gain +1 Movement',
    cost: 12,
    icon: '✈️',
    effect: { movementBonus: 1 },
    category: 'air',
  },
  {
    id: 'jet_engines',
    name: 'Jet Engines',
    description: 'Fighters gain +1 Attack and Defense',
    cost: 20,
    icon: '🚀',
    effect: { attackBonus: 1, defenseBonus: 1 },
    category: 'air',
    prerequisites: ['long_range_aircraft'],
  },
  
  // Naval
  {
    id: 'advanced_shipyards',    name: 'Advanced Shipyards',
    description: 'Naval units gain +1 Defense',
    cost: 12,
    icon: '⚓',
    effect: { defenseBonus: 1 },
    category: 'naval',
  },
  {
    id: 'submarine_warfare',
    name: 'Submarine Warfare',
    description: 'Submarines gain +1 Attack',
    cost: 15,
    icon: '🌊',
    effect: { attackBonus: 1 },
    category: 'naval',
    prerequisites: ['advanced_shipyards'],
  },
  // Economy
  {
    id: 'industrialization',
    name: 'Industrialization',
    description: '+10% income from all territories',
    cost: 15,
    icon: '🏭',
    effect: { incomeBonus: 0.1 },
    category: 'economy',
  },
  {
    id: 'war_economy',
    name: 'War Economy',
    description: '+15% production capacity',
    cost: 20,
    icon: '⚙️',
    effect: { productionBonus: 0.15 },
    category: 'economy',
    prerequisites: ['industrialization'],
  },
  // Special
  {
    id: 'nuclear_program',
    name: 'Nuclear Program',
    description: 'Develop nuclear weapons. Readiness charges over 5 turns, then launch a devastating strike.',
    cost: 40,
    icon: '☢️',
    effect: { specialAbility: 'nuclear_strike' },
    category: 'special',
    prerequisites: ['jet_engines'],
  },
  {
    id: 'espionage_network',
    name: 'Espionage Network',
    description: 'Expand your intelligence services: lower espionage costs and higher success rates.',
    cost: 20,
    icon: '🕵️',
    effect: { specialAbility: 'espionage_bonus' },
    category: 'special',
  },

  // Infantry (new)
  {
    id: 'fortified_positions',
    name: 'Fortified Positions',
    description: 'Infantry dig into prepared defensive positions, gaining +1 Defense.',
    cost: 10,
    icon: '🪖',
    effect: { infantryDefenseBonus: 1 },
    category: 'infantry',
  },
  {
    id: 'assault_tactics',
    name: 'Assault Tactics',
    description: 'Aggressive assault doctrine drives infantry forward with +1 Attack.',
    cost: 15,
    icon: '🗡️',
    effect: { infantryAttackBonus: 1 },
    category: 'infantry',
    prerequisites: ['elite_training'],
  },

  // Armor (new)
  {
    id: 'rocket_artillery',
    name: 'Rocket Artillery',
    description: 'Long-range rockets suppress enemy offensives, giving all defenders +1 Defense.',
    cost: 12,
    icon: '🚀',
    effect: { defenseBonus: 1 },
    category: 'armor',
    prerequisites: ['heavy_tanks'],
  },

  // Air (new)
  {
    id: 'radar_network',
    name: 'Radar Network',
    description: 'Radar-guided targeting gives all air units +1 Attack.',
    cost: 10,
    icon: '📡',
    effect: { airAttackBonus: 1 },
    category: 'air',
  },
  {
    id: 'carrier_superiority',
    name: 'Carrier Superiority',
    description: 'Advanced carrier doctrine trains elite naval aviators, giving air units +1 Attack.',
    cost: 15,
    icon: '🛩️',
    effect: { airAttackBonus: 1 },
    category: 'air',
    prerequisites: ['long_range_aircraft'],
  },

  // Naval (new)
  {
    id: 'destroyer_screen',
    name: 'Destroyer Screen',
    description: 'Destroyer escort formations protect the battle fleet, giving naval units +1 Defense.',
    cost: 10,
    icon: '🛡️',
    effect: { navalDefenseBonus: 1 },
    category: 'naval',
  },
  {
    id: 'wolfpack_tactics',
    name: 'Wolfpack Tactics',
    description: 'Coordinated submarine packs overwhelm convoy escorts, giving naval units +1 Attack.',
    cost: 12,
    icon: '🐺',
    effect: { navalAttackBonus: 1 },
    category: 'naval',
    prerequisites: ['submarine_warfare'],
  },

  // Economy (new)
  {
    id: 'lend_lease',
    name: 'Lend-Lease Protocol',
    description: 'Allied aid programs and wartime trade boost income by +8%.',
    cost: 10,
    icon: '🤝',
    effect: { incomeBonus: 0.08 },
    category: 'economy',
  },
];

export class TechnologyManager {
  private factionTech: Map<string, FactionTech> = new Map();

  constructor(private state: GameState) {}

  initFaction(factionId: string): void {
    this.getFactionTech(factionId);
  }

  private getFactionTech(factionId: string): FactionTech {
    if (!this.factionTech.has(factionId)) {
      this.factionTech.set(factionId, {
        researched: new Set(),
        currentResearch: null,
        researchProgress: 0,
      });
    }
    return this.factionTech.get(factionId)!;
  }

  getResearched(factionId: string): Set<string> {
    return this.getFactionTech(factionId).researched;
  }

  /** Public accessor for espionage/external systems */
  getFactionTechPublic(factionId: string): FactionTech {
    return this.getFactionTech(factionId);
  }

  getResearchedTech(factionId: string): Technology[] {
    const researched = this.getResearched(factionId);
    return TECHNOLOGIES.filter(t => researched.has(t.id));
  }

  getAvailableTech(factionId: string): Technology[] {
    return this.getAvailable(factionId);
  }

  hasTech(factionId: string, techId: string): boolean {
    return this.getFactionTech(factionId).researched.has(techId);
  }

  getCurrentResearch(factionId: string): string | null {
    return this.getFactionTech(factionId).currentResearch;
  }

  startResearch(factionId: string, techId: string): boolean {
    const tech = TECHNOLOGIES.find(t => t.id === techId);
    if (!tech) return false;

    const ft = this.getFactionTech(factionId);
    if (ft.researched.has(techId)) return false;
    if (tech.prerequisites?.some(p => !ft.researched.has(p))) return false;

    ft.currentResearch = techId;
    ft.researchProgress = 0;
    return true;
  }

  advanceResearch(factionId: string, points: number): string | null {
    const ft = this.getFactionTech(factionId);
    if (!ft.currentResearch) return null;

    const tech = TECHNOLOGIES.find(t => t.id === ft.currentResearch);
    if (!tech) return null;

    // Apply faction research speed bonus (Atlantic Alliance gets +25% research points)
    const faction = this.state?.factionRegistry?.get(factionId);
    const speedBonus = faction?.bonuses?.researchSpeedBonus ?? 0;
    ft.researchProgress += Math.round(points * (1 + speedBonus));
    if (ft.researchProgress >= tech.cost) {
      ft.researched.add(ft.currentResearch);
      const completed = ft.currentResearch;
      ft.currentResearch = null;
      ft.researchProgress = 0;
      return completed;
    }
    return null;
  }

  getTechEffect(factionId: string): TechEffect {
    const ft = this.getFactionTech(factionId);
    const combined: TechEffect = {
      attackBonus: 0, defenseBonus: 0, movementBonus: 0,
      incomeBonus: 0, productionBonus: 0,
      infantryAttackBonus: 0, infantryDefenseBonus: 0,
      navalAttackBonus: 0, navalDefenseBonus: 0, airAttackBonus: 0,
    };
    for (const techId of ft.researched) {
      const tech = TECHNOLOGIES.find(t => t.id === techId);
      if (!tech) continue;
      combined.attackBonus!          += tech.effect.attackBonus          ?? 0;
      combined.defenseBonus!         += tech.effect.defenseBonus         ?? 0;
      combined.movementBonus!        += tech.effect.movementBonus        ?? 0;
      combined.incomeBonus!          += tech.effect.incomeBonus          ?? 0;
      combined.productionBonus!      += tech.effect.productionBonus      ?? 0;
      combined.infantryAttackBonus!  += tech.effect.infantryAttackBonus  ?? 0;
      combined.infantryDefenseBonus! += tech.effect.infantryDefenseBonus ?? 0;
      combined.navalAttackBonus!     += tech.effect.navalAttackBonus     ?? 0;
      combined.navalDefenseBonus!    += tech.effect.navalDefenseBonus    ?? 0;
      combined.airAttackBonus!       += tech.effect.airAttackBonus       ?? 0;
    }
    return combined;
  }

  getAvailable(factionId: string): Technology[] {
    const ft = this.getFactionTech(factionId);
    return TECHNOLOGIES.filter(t =>
      !ft.researched.has(t.id) &&
      (!t.prerequisites || t.prerequisites.every(p => ft.researched.has(p)))
    );
  }

  serialize(factionId: string): object {
    const ft = this.getFactionTech(factionId);
    return {
      researched: [...ft.researched],
      currentResearch: ft.currentResearch,
      researchProgress: ft.researchProgress,
    };
  }

  deserialize(factionId: string, data: any): void {
    this.factionTech.set(factionId, {
      researched: new Set(data.researched ?? []),
      currentResearch: data.currentResearch ?? null,
      researchProgress: data.researchProgress ?? 0,
    });
  }
}
