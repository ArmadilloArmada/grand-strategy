/**
 * RulesetLoader - Loads and validates ruleset JSON files
 * Used by mods and custom game setups to override the default GameRules.
 */

import { GameRules, GameRulesData, GamePhase } from '../data/GameRules';

export interface RulesetData {
  id: string;
  name: string;
  description: string;
  rules: Partial<GameRulesData>;
}

export interface RulesetValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_PHASES: GamePhase[] = ['purchase', 'combat_move', 'combat', 'noncombat_move', 'production', 'collect_income'];

export class RulesetLoader {
  /**
   * Validate a RulesetData object, returning any errors.
   */
  validate(data: RulesetData): RulesetValidationResult {
    const errors: string[] = [];

    if (!data.id || typeof data.id !== 'string') errors.push('Missing or invalid "id"');
    if (!data.name || typeof data.name !== 'string') errors.push('Missing or invalid "name"');
    if (!data.rules || typeof data.rules !== 'object') {
      errors.push('Missing "rules" object');
      return { valid: false, errors };
    }

    const r = data.rules;
    if (r.diceSides !== undefined && (typeof r.diceSides !== 'number' || r.diceSides < 2)) {
      errors.push('"diceSides" must be a number >= 2');
    }
    if (r.maxCombatRounds !== undefined && (typeof r.maxCombatRounds !== 'number' || r.maxCombatRounds < 0)) {
      errors.push('"maxCombatRounds" must be a non-negative number');
    }
    if (r.baseIncomeMultiplier !== undefined && (typeof r.baseIncomeMultiplier !== 'number' || r.baseIncomeMultiplier <= 0)) {
      errors.push('"baseIncomeMultiplier" must be a positive number');
    }
    if (r.factoryProductionLimit !== undefined && (typeof r.factoryProductionLimit !== 'number' || r.factoryProductionLimit < 1)) {
      errors.push('"factoryProductionLimit" must be >= 1');
    }
    if (r.victoryType !== undefined && !['capital', 'economic', 'territorial'].includes(r.victoryType as string)) {
      errors.push('"victoryType" must be "capital", "economic", or "territorial"');
    }
    if (r.phases !== undefined) {
      if (!Array.isArray(r.phases) || r.phases.length === 0) {
        errors.push('"phases" must be a non-empty array');
      } else {
        for (const p of r.phases) {
          if (!VALID_PHASES.includes(p as GamePhase)) {
            errors.push(`Unknown phase "${p}"`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Load a RulesetData object and return the partial rules override.
   * Throws if validation fails.
   */
  load(data: RulesetData): Partial<GameRulesData> {
    const result = this.validate(data);
    if (!result.valid) {
      throw new Error(`Invalid ruleset "${data.id}": ${result.errors.join('; ')}`);
    }
    return data.rules ?? {};
  }

  /**
   * Parse a JSON string and return the partial rules override.
   * Returns an empty object and logs on parse or validation error.
   */
  loadFromJSON(json: string): Partial<GameRulesData> {
    try {
      const data: RulesetData = JSON.parse(json);
      return this.load(data);
    } catch (e) {
      console.error('[RulesetLoader] Failed to load ruleset:', e);
      return {};
    }
  }

  /**
   * Merge a partial rules override onto the default GameRules and return a new instance.
   */
  mergeWithDefaults(overrides: Partial<GameRulesData>): GameRules {
    const defaults = GameRules.createDefault();
    return new GameRules({
      name: overrides.name ?? defaults.name,
      version: overrides.version ?? defaults.version,
      diceSides: overrides.diceSides ?? defaults.diceSides,
      maxCombatRounds: overrides.maxCombatRounds ?? defaults.maxCombatRounds,
      attackerRetreatAllowed: overrides.attackerRetreatAllowed ?? defaults.attackerRetreatAllowed,
      defenderRetreatAllowed: overrides.defenderRetreatAllowed ?? defaults.defenderRetreatAllowed,
      baseIncomeMultiplier: overrides.baseIncomeMultiplier ?? defaults.baseIncomeMultiplier,
      factoryProductionLimit: overrides.factoryProductionLimit ?? defaults.factoryProductionLimit,
      capitalBonusIPCs: overrides.capitalBonusIPCs ?? defaults.capitalBonusIPCs,
      blitzingEnabled: overrides.blitzingEnabled ?? defaults.blitzingEnabled,
      airbaseRange: overrides.airbaseRange ?? defaults.airbaseRange,
      victoryType: overrides.victoryType ?? defaults.victoryType,
      victoryCapitalsRequired: overrides.victoryCapitalsRequired ?? defaults.victoryCapitalsRequired,
      victoryIPCThreshold: overrides.victoryIPCThreshold ?? defaults.victoryIPCThreshold,
      victoryTerritoryCount: overrides.victoryTerritoryCount ?? defaults.victoryTerritoryCount,
      phases: overrides.phases ?? defaults.phases,
    });
  }
}

export const rulesetLoader = new RulesetLoader();
