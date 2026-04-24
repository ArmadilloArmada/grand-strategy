/**
 * Shared types for the AI Web Worker interface.
 * Plain objects only — no class imports.
 */

export interface AIWorkerTerritory {
  id: string;
  owner: string | null;
  originalOwner: string | null;
  type: string; // 'land' | 'sea'
  production: number;
  isCapital: boolean;
  hasFactory: boolean;
  adjacentTo: string[];
  units: { unitTypeId: string; count: number }[];
}

export interface AIWorkerFaction {
  id: string;
  ipcs: number;
  capital: string;
  isDefeated: boolean;
}

export interface AIWorkerUnitType {
  id: string;
  attack: number;
  defense: number;
  movement: number;
  cost: number;
  domain: string;
}

export interface AIWorkerRelations {
  [key: string]: 'war' | 'pact' | 'alliance' | 'neutral';
}

export interface AIWorkerState {
  factionId: string;
  ipcs: number;
  territories: AIWorkerTerritory[];
  factions: AIWorkerFaction[];
  unitTypes: AIWorkerUnitType[];
  relations: AIWorkerRelations;
  personality: {
    aggression: number;
    defense: number;
    expansion: number;
    economy: number;
    riskTolerance: number;
  };
}

export type AIPlannedAction =
  | { type: 'mobilize'; territoryId: string }
  | { type: 'attack'; fromId: string; toId: string; unitTypeId: string; count: number }
  | { type: 'move'; fromId: string; toId: string; unitTypeId: string; count: number };

export interface AIWorkerRequest {
  state: AIWorkerState;
}

export interface AIWorkerResponse {
  actions: AIPlannedAction[];
  evaluations: { territoryId: string; strategicValue: number; threatLevel: number }[];
}
