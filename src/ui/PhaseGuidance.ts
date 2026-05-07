import { GameState } from '../engine/GameState';
import { MovementValidator } from '../engine/MovementValidator';
import { MobilizationSystem } from '../engine/MobilizationSystem';
import type { Faction } from '../data/Faction';
import type { Territory } from '../data/Territory';

export interface FirstTurnTip {
  tipId: string;
  message: string;
}

export interface ContextGuidanceInput {
  phase: string;
  faction: Faction | undefined;
  territory: Territory | undefined;
  isHumanTurn: boolean;
  isBuildPhase: boolean;
  isMovementPhase: boolean;
  isCombatPhase: boolean;
  isEndPhase: boolean;
}

export class PhaseGuidance {
  private previousContextText = '';

  constructor(
    private state: GameState,
    private movementValidator: MovementValidator,
    private mobilizationSystem: MobilizationSystem,
  ) {}

  getPhaseToast(phase: string): string | null {
    const tips: Record<string, string> = {
      purchase: 'Click Mobilize to buy units',
      build: 'Click Mobilize to buy and place units',
      combat_move: 'Click your territory, then click an enemy to attack',
      move: 'Click your territory, then click a highlighted destination',
      combat: 'Resolving queued battles...',
      noncombat_move: 'Move units without attacking',
      production: 'Placing your purchased units...',
      collect_income: 'Collecting income...',
      end: 'Collecting income...',
      orders: 'Click a territory, then click a destination',
      resolve: 'Resolving all actions...',
      action: 'Make one move or attack',
    };
    return tips[phase] ?? null;
  }

  getFirstTurnTip(turnNumber: number, phase: string): FirstTurnTip | null {
    if (turnNumber > 1) return null;

    const tips: Record<string, string> = {
      purchase: 'First turn: mobilize your capital or factory first. Those territories usually produce the strongest opening forces.',
      build: 'First turn: click a highlighted territory to mobilize defenders. Start with your capital or factory if you can afford it.',
      combat_move: 'First turn: select one of your territories with units, then click a highlighted neighbor to move or attack.',
      move: 'First turn: select one of your territories with units, then click a highlighted neighbor to move or attack.',
      orders: 'First turn: select a territory with units, then click a highlighted destination to issue orders.',
      action: 'First turn: make one strong move or attack, then click End Turn.',
      combat: 'Combat only happens after you move into enemy territory. If no battles are queued, continue to the next phase.',
      resolve: 'Resolve queued battles, then continue once the map is quiet.',
      noncombat_move: 'Use non-combat movement to reinforce fronts. You cannot attack in this phase.',
      production: 'Production places your reserved units. If nothing is waiting, click Next Phase.',
      collect_income: 'Income pays for the next round. Click End Turn after reviewing your IPCs.',
      end: 'Income pays for the next round. Click End Turn after reviewing your IPCs.',
    };

    const message = tips[phase];
    return message ? { tipId: `first-turn-${phase}`, message } : null;
  }

  updateContextHelper(input: ContextGuidanceInput): FirstTurnTip | null {
    const helper = document.getElementById('context-helper');
    const text = document.getElementById('context-helper-text');
    if (!helper || !text) return null;

    const guidance = this.getContextGuidance(input);
    helper.className = guidance.className;

    if (guidance.text !== this.previousContextText) {
      text.classList.remove('text-fade-in');
      void text.offsetWidth;
      text.textContent = guidance.text;
      text.classList.add('text-fade-in');
      this.previousContextText = guidance.text;
    }

    return guidance.tipId && guidance.tipMessage
      ? { tipId: guidance.tipId, message: guidance.tipMessage }
      : null;
  }

  private getContextGuidance(input: ContextGuidanceInput): {
    text: string;
    className: string;
    tipId?: string;
    tipMessage?: string;
  } {
    const { phase, faction, territory, isHumanTurn, isBuildPhase, isMovementPhase, isCombatPhase, isEndPhase } = input;
    let className = 'context-helper';

    if (!isHumanTurn) {
      // AI turns already use the dedicated top activity banner.
      // Hide the bottom helper to avoid duplicate status messaging.
      className += ' hidden';
      return { text: '', className };
    }

    if (isBuildPhase) {
      const mobilizeOptions = this.mobilizationSystem.getMobilizationOptions();
      const canMobilize = mobilizeOptions.filter(o => o.canMobilize).length;
      const alreadyMobilized = this.mobilizationSystem.getMobilizationCount();
      if (canMobilize > 0) {
        const preferred = mobilizeOptions.find(o => o.canMobilize);
        const preferredText = preferred
          ? ` Best first: ${preferred.territory.name} (${preferred.type}, ${preferred.cost} IPCs).`
          : '';
        return {
          text: `Click highlighted territories to mobilize forces (${canMobilize} available, ${faction?.ipcs || 0} IPCs).${preferredText}`,
          className,
          tipId: 'mobilize',
          tipMessage: 'Click highlighted territories to spawn defenders. Factories and capitals usually give the strongest value.',
        };
      }
      if (alreadyMobilized > 0) {
        className += ' success';
        return { text: `Mobilized ${alreadyMobilized} territories. Click "Next Phase" to continue.`, className };
      }
      className += ' warning';
      return { text: 'No affordable mobilizations remain. Click "Next Phase" to continue.', className };
    }

    if (isMovementPhase) {
      return this.getMovementGuidance(phase, faction, territory, className);
    }

    if (isCombatPhase) {
      if (this.state.pendingMoves.length > 0) {
        return {
          text: `${this.state.pendingMoves.length} battle${this.state.pendingMoves.length !== 1 ? 's' : ''} to resolve. Click "Resolve Combat".`,
          className,
          tipId: 'combat',
          tipMessage: 'Battles are resolved by dice rolls. Higher attack/defense = better odds!',
        };
      }
      className += ' success';
      return { text: 'No battles waiting. Click "Next Phase" to continue.', className };
    }

    if (isEndPhase) {
      const income = this.state.calculateIncome(faction?.id || '');
      className += ' success';
      return {
        text: `Collecting ${income} IPCs. Click "End Turn" to finish.`,
        className,
        tipId: 'income',
        tipMessage: 'You earn IPCs each turn from the territories you control.',
      };
    }

    return { text: `${phase} phase - Click "Next Phase" when ready.`, className };
  }

  private getMovementGuidance(
    phase: string,
    faction: Faction | undefined,
    territory: Territory | undefined,
    className: string,
  ): { text: string; className: string; tipId?: string; tipMessage?: string } {
    if (territory && territory.owner === faction?.id) {
      const availableUnits = territory.units.reduce((sum, pu) => sum + territory.getAvailableUnitCount(pu.unitTypeId), 0);
      if (availableUnits > 0) {
        const allowAttacks = ['combat_move', 'move', 'orders', 'action'].includes(phase);
        const targetIds = new Set<string>();
        const attackIds = new Set<string>();
        const transportIds = new Set<string>();
        for (const pu of territory.units) {
          for (const move of this.movementValidator.getValidMoves(pu.unitTypeId, territory.id, allowAttacks)) {
            if (move.isAttack) attackIds.add(move.territoryId);
            else targetIds.add(move.territoryId);
            if (move.viaTransport) transportIds.add(move.territoryId);
          }
        }
        const moveCount = targetIds.size;
        const attackCount = attackIds.size;
        const transportCount = transportIds.size;
        const targetText = attackCount > 0
          ? `${moveCount} move target${moveCount !== 1 ? 's' : ''}, ${attackCount} attack target${attackCount !== 1 ? 's' : ''}`
          : `${moveCount} move target${moveCount !== 1 ? 's' : ''}`;
        const transportText = transportCount > 0 ? `, ${transportCount} via transport` : '';
        return {
          text: `${territory.name}: click a highlighted neighbor for ${availableUnits} ready unit${availableUnits !== 1 ? 's' : ''} (${targetText}${transportText})`,
          className,
          tipId: 'movement',
          tipMessage: 'Units can act once per turn. Green highlights are moves; attack highlights start a battle preview.',
        };
      }
      return {
        text: `All units in ${territory.name} have acted. Select another territory.`,
        className: `${className} hint`,
      };
    }

    return {
      text: 'Select one of your territories with ready units, then click a highlighted neighbor to move or attack.',
      className,
    };
  }
}
