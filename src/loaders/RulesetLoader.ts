/**
 * RulesetLoader - Loads and parses ruleset JSON files
 */

import { GameRules } from '../data/GameRules';

export interface RulesetData {
  id: string;
  name: string;
  description: string;
  rules: Partial<GameRules>;
}

export class RulesetLoader {
  load(data: RulesetData): Partial<GameRules> {
    return data.rules ?? {};
  }

  loadFromJSON(json: string): Partial<GameRules> {
    try {
      const data: RulesetData = JSON.parse(json);
      return this.load(data);
    } catch (e) {
      console.error('Failed to parse ruleset JSON:', e);
      return {};
    }
  }
}

export const rulesetLoader = new RulesetLoader();
