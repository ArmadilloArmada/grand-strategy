/**
 * GameRules - Configurable game rules and settings
 */

export interface GameRulesData {
  name: string;
  version: string;
  
  // Combat settings
  diceSides: number;              // Usually 6
  maxCombatRounds: number;        // 0 = unlimited
  attackerRetreatAllowed: boolean;
  defenderRetreatAllowed: boolean;
  
  // Economy settings
  baseIncomeMultiplier: number;   // Multiply territory production by this
  factoryProductionLimit: number; // Max units per factory per turn
  capitalBonusIPCs: number;       // Bonus for controlling your capital
  
  // Movement settings
  blitzingEnabled: boolean;       // Tanks can blitz
  airbaseRange: number;           // Extra range for air units from airbase
  
  // Victory conditions
  victoryType: 'capital' | 'economic' | 'territorial';
  victoryCapitalsRequired: number; // For capital victory
  victoryIPCThreshold: number;    // For economic victory
  victoryTerritoryCount: number;  // For territorial victory
  
  // Turn structure
  phases: GamePhase[];
}

export type GamePhase = 
  | 'purchase'
  | 'combat_move'
  | 'combat'
  | 'noncombat_move'
  | 'production'
  | 'collect_income';

export class GameRules {
  public readonly name: string;
  public readonly version: string;
  
  public readonly diceSides: number;
  public readonly maxCombatRounds: number;
  public readonly attackerRetreatAllowed: boolean;
  public readonly defenderRetreatAllowed: boolean;
  
  public readonly baseIncomeMultiplier: number;
  public readonly factoryProductionLimit: number;
  public readonly capitalBonusIPCs: number;
  
  public readonly blitzingEnabled: boolean;
  public readonly airbaseRange: number;
  
  public readonly victoryType: 'capital' | 'economic' | 'territorial';
  public readonly victoryCapitalsRequired: number;
  public readonly victoryIPCThreshold: number;
  public readonly victoryTerritoryCount: number;
  
  public readonly phases: GamePhase[];

  constructor(data: GameRulesData) {
    this.name = data.name;
    this.version = data.version;
    this.diceSides = data.diceSides;
    this.maxCombatRounds = data.maxCombatRounds;
    this.attackerRetreatAllowed = data.attackerRetreatAllowed;
    this.defenderRetreatAllowed = data.defenderRetreatAllowed;
    this.baseIncomeMultiplier = data.baseIncomeMultiplier;
    this.factoryProductionLimit = data.factoryProductionLimit;
    this.capitalBonusIPCs = data.capitalBonusIPCs;
    this.blitzingEnabled = data.blitzingEnabled;
    this.airbaseRange = data.airbaseRange;
    this.victoryType = data.victoryType;
    this.victoryCapitalsRequired = data.victoryCapitalsRequired;
    this.victoryIPCThreshold = data.victoryIPCThreshold;
    this.victoryTerritoryCount = data.victoryTerritoryCount;
    this.phases = data.phases;
  }

  /**
   * Get the next phase after the current one
   */
  getNextPhase(currentPhase: GamePhase): GamePhase | null {
    const index = this.phases.indexOf(currentPhase);
    if (index === -1 || index === this.phases.length - 1) {
      return null;
    }
    return this.phases[index + 1];
  }

  /**
   * Get the first phase of a turn
   */
  getFirstPhase(): GamePhase {
    return this.phases[0];
  }

  /**
   * Check if this is the last phase
   */
  isLastPhase(phase: GamePhase): boolean {
    return this.phases.indexOf(phase) === this.phases.length - 1;
  }

  /**
   * Create default rules
   */
  static createDefault(): GameRules {
    return new GameRules({
      name: 'Standard Rules',
      version: '1.0.0',
      diceSides: 6,
      maxCombatRounds: 0,
      attackerRetreatAllowed: true,
      defenderRetreatAllowed: false,
      baseIncomeMultiplier: 1,
      factoryProductionLimit: 10,
      capitalBonusIPCs: 5,
      blitzingEnabled: true,
      airbaseRange: 1,
      victoryType: 'capital',
      victoryCapitalsRequired: 3,
      victoryIPCThreshold: 200,
      victoryTerritoryCount: 25,
      phases: ['purchase', 'combat_move', 'combat', 'noncombat_move', 'production', 'collect_income'],
    });
  }
}