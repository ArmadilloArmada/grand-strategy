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
  attackBonus?: number;
  defenseBonus?: number;
  movementBonus?: number;
  incomeBonus?: number;
  productionBonus?: number;
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
];

export class TechnologyManager {
  private factionTech: Map<string, FactionTech> = new Map();

  constructor(_state: GameState) {}

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

    ft.researchProgress += points;
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
    const combined: TechEffect = {};
    for (const techId of ft.researched) {
      const tech = TECHNOLOGIES.find(t => t.id === techId);
      if (!tech) continue;
      if (tech.effect.attackBonus) combined.attackBonus = (combined.attackBonus ?? 0) + tech.effect.attackBonus;
      if (tech.effect.defenseBonus) combined.defenseBonus = (combined.defenseBonus ?? 0) + tech.effect.defenseBonus;
      if (tech.effect.movementBonus) combined.movementBonus = (combined.movementBonus ?? 0) + tech.effect.movementBonus;
      if (tech.effect.incomeBonus) combined.incomeBonus = (combined.incomeBonus ?? 0) + tech.effect.incomeBonus;
      if (tech.effect.productionBonus) combined.productionBonus = (combined.productionBonus ?? 0) + tech.effect.productionBonus;
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
