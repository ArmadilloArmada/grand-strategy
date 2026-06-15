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
  activeStackLabel?: string | null;
  selectAllTypes?: boolean;
  readyStackCount?: number;
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
      combat_move: 'Click your territory to select units; drag to move or click an enemy to attack',
      move: 'Click your territory to select units; drag to move',
      play: 'Mobilize (🏭), move units, and attack — then End Turn',
      combat: 'Resolving queued battles...',
      noncombat_move: 'Move units without attacking',
      production: 'Placing your purchased units...',
      collect_income: 'Collecting income...',
      end: 'Collecting income...',
      orders: 'Click your territory to select units; drag to move or click an enemy to attack',
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
      combat_move: 'First turn: drag from one of your territories with units to a highlighted neighbor.',
      move: 'First turn: drag from one of your territories with units to a highlighted neighbor.',
      play: 'First turn: mobilize at your capital or factory, then drag units to a highlighted neighbor.',
      orders: 'First turn: drag from a territory with units to a highlighted destination.',
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
    const {
      phase, faction, territory, isHumanTurn, isBuildPhase, isMovementPhase, isCombatPhase, isEndPhase,
      selectAllTypes, readyStackCount,
    } = input;
    let className = 'context-helper';

    if (!isHumanTurn) {
      // AI turns already use the dedicated top activity banner.
      // Hide the bottom helper to avoid duplicate status messaging.
      className += ' hidden';
      return { text: '', className };
    }

    if (phase === 'play') {
      return this.getUnifiedPlayGuidance(faction, territory, className, input.activeStackLabel, selectAllTypes, readyStackCount);
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
        const navalText = this.getNavalMobilizeHint(faction?.id);
        return {
          text: `Click highlighted territories to mobilize forces (${canMobilize} available, ${faction?.ipcs || 0} IPCs).${preferredText}${navalText}`,
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
      return this.getMovementGuidance(
        phase, faction, territory, className, input.activeStackLabel, selectAllTypes, readyStackCount,
      );
    }

    if (isCombatPhase) {
      if (this.state.pendingMoves.length > 0) {
        return {
          text: `${this.state.pendingMoves.length} battle${this.state.pendingMoves.length !== 1 ? 's' : ''} to resolve. Press A to resolve.`,
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

  private getUnifiedPlayGuidance(
    faction: Faction | undefined,
    territory: Territory | undefined,
    className: string,
    activeStackLabel?: string | null,
    selectAllTypes?: boolean,
    readyStackCount?: number,
  ): { text: string; className: string; tipId?: string; tipMessage?: string } {
    const mobilizeOptions = this.mobilizationSystem.getMobilizationOptions();
    const canMobilize = mobilizeOptions.filter(o => o.canMobilize).length;
    const movement = this.getMovementGuidance(
      'play',
      faction,
      territory,
      className,
      activeStackLabel,
      selectAllTypes,
      readyStackCount,
    );

    if (territory && territory.owner === faction?.id) {
      if (canMobilize > 0) {
        movement.text = `🏭 ${canMobilize} mobilization${canMobilize === 1 ? '' : 's'} available · ${movement.text}`;
      }
      return movement;
    }

    if (canMobilize > 0) {
      return {
        text: `Mobilize forces (🏭 ${canMobilize} available), then move or attack with your units.`,
        className,
        tipId: 'unified-play',
        tipMessage: 'Build, move, and fight in any order during your turn. Click End Turn when finished.',
      };
    }

    return movement;
  }

  private getMovementGuidance(
    phase: string,
    faction: Faction | undefined,
    territory: Territory | undefined,
    className: string,
    activeStackLabel?: string | null,
    selectAllTypes?: boolean,
    readyStackCount?: number,
  ): { text: string; className: string; tipId?: string; tipMessage?: string } {
    const mixedStackTip = selectAllTypes
      ? 'All unit types selected — each stack moves once. Drag to reposition, click enemies to attack.'
      : (readyStackCount ?? 0) >= 2
        ? 'Multiple stacks here — use Tab to cycle, or pick "All Unit Types" to command every ready stack.'
        : 'Use Tab to cycle stacks. Drag to move, click enemy to attack.';

    if (territory && territory.owner === faction?.id) {
      const availableUnits = territory.units.reduce((sum, pu) => sum + territory.getAvailableUnitCount(pu.unitTypeId), 0);
      if (availableUnits > 0) {
        if (activeStackLabel) {
          return {
            text: activeStackLabel,
            className,
            tipId: 'movement',
            tipMessage: mixedStackTip,
          };
        }
        const allowAttacks = ['combat_move', 'move', 'orders', 'action', 'play'].includes(phase);
        const targetIds = new Set<string>();
        const attackIds = new Set<string>();
        const transportIds = new Set<string>();
        const coastalStrikeIds = new Set<string>();
        for (const pu of territory.units) {
          for (const move of this.movementValidator.getValidMoves(pu.unitTypeId, territory.id, allowAttacks)) {
            if (move.isAttack) attackIds.add(move.territoryId);
            else targetIds.add(move.territoryId);
            if (move.viaTransport) transportIds.add(move.viaTransport);
            if (move.coastalStrike) coastalStrikeIds.add(move.territoryId);
          }
        }
        const moveCount = targetIds.size;
        const attackCount = attackIds.size;
        const transportCount = transportIds.size;
        const coastalCount = coastalStrikeIds.size;
        const targetText = attackCount > 0
          ? `${moveCount} move target${moveCount !== 1 ? 's' : ''}, ${attackCount} attack target${attackCount !== 1 ? 's' : ''}`
          : `${moveCount} move target${moveCount !== 1 ? 's' : ''}`;
        const transportText = transportCount > 0 ? `, ${transportCount} amphib route${transportCount !== 1 ? 's' : ''}` : '';
        const coastalText = coastalCount > 0 ? `, ${coastalCount} coastal strike${coastalCount !== 1 ? 's' : ''}` : '';
        return {
          text: `${territory.name}: ${availableUnits} ready unit${availableUnits !== 1 ? 's' : ''} — drag to move, click enemy to attack (${targetText}${transportText}${coastalText})`,
          className,
          tipId: 'movement',
          tipMessage: 'Green = reposition (drag). Red/orange = strike targets (click). Artillery, ships, and anti-air bombard without entering the target tile.',
        };
      }
      return {
        text: `All units in ${territory.name} have acted. Select another territory.`,
        className: `${className} hint`,
      };
    }

    const navalMove = this.getNavalMovementHint(faction?.id);
    return {
      text: `Click one of your territories with ready units. Drag to move; click an enemy to attack.${navalMove}`,
      className,
    };
  }

  private mapHasSignificantSea(): boolean {
    let sea = 0;
    let land = 0;
    for (const t of this.state.territories.values()) {
      if (t.isSea()) sea++;
      else land++;
    }
    return sea > 0 && sea / (sea + land) >= 0.12;
  }

  private getNavalMobilizeHint(factionId: string | undefined): string {
    if (!this.mapHasSignificantSea()) return '';
    const coastal = this.mobilizationSystem.getMobilizationOptions()
      .find(o => o.canMobilize && o.type === 'coastal');
    if (!coastal) return '';
    return ` Island maps: ground units self-embark across oceans; mobilize marines at ${coastal.territory.name} for assaults.`;
  }

  private getNavalMovementHint(_factionId: string | undefined): string {
    if (!this.mapHasSignificantSea()) return '';
    return ' Drag ground units across sea tiles to reach islands — no transport ship required.';
  }
}
