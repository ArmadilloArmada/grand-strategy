/**
 * CombatUI - Combat modal, battle preview, and attack resolution UI
 */

import { GameState } from '../engine/GameState';
import { CombatResolver, CombatState } from '../engine/CombatResolver';
import {
  countTerritoryDefendersIncludingOffshore,
  buildStrategicDefenderPreview,
  canLandUnitStrikeNaval,
} from '../engine/NavalSystem';
import {
  computePreviewCombatTotals,
  estimateVictoryChance,
  type PreviewAttackerEntry,
} from '../engine/combatPreviewOdds';
import { getTerritoryNeighborIds } from '../engine/gridAdjacency';
import { MapRenderer } from '../renderer/MapRenderer';
import { soundManager } from '../audio/SoundManager';
import { battleLog } from './BattleLog';
import { UNIT_ICONS } from './hudConstants';
import { generateBattleNarrative } from '../engine/BattleNarrator';
import { settings } from './Settings';
import { statisticsManager } from '../engine/StatisticsManager';
import {
  applyTacticalVictoryBonuses,
  type TacticalOutcomeMeta,
} from '../engine/TacticalBattleEngine';
import { TacticalBattleUI } from './TacticalBattleUI';
import { MovementValidator } from '../engine/MovementValidator';

export interface CombatCallbacks {
  showToast(msg: string, type: 'success' | 'info' | 'error'): void;
  renderMinimap(): void;
  updateFactionPanel(): void;
  updateSelectionInfo(): void;
  updateActionButtons(): void;
  afterUnitAction?: (fromId?: string, toId?: string) => void;
  getSelectedUnitType?: () => string | null;
  getSelectedMoveCount?: () => number | null;
}

export interface BattlePreviewStats {
  attackPower: number;
  defensePower: number;
  effectiveDefense: number;
  attackerUnitCount: number;
  defenderUnitCount: number;
  odds: number;
  expectedAttackerHits: number;
  expectedDefenderHits: number;
  riskLabel: string;
  riskClass: 'good' | 'even' | 'bad';
  riskDetail: string;
  commitmentAdvice: string;
  swingFactors: string[];
}

export class CombatUI {
  private activeCombat: CombatState | null = null;
  private pendingCombats: string[] = [];
  private pendingAttackFrom: string | null = null;
  private pendingAttackTarget: string | null = null;
  private tacticalBattleUI = new TacticalBattleUI();
  private lastCombatWasTactical = false;
  private pendingTacticalMeta: TacticalOutcomeMeta | null = null;
  private previewKeyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private state: GameState,
    private renderer: MapRenderer,
    private combatResolver: CombatResolver,
    private callbacks: CombatCallbacks
  ) {}

  getActiveCombat(): CombatState | null {
    return this.activeCombat;
  }

  // ==================== COMBAT MODAL ====================

  showCombatModal(combat: CombatState): void {
    this.activeCombat = combat;

    // Switch combined modal to battle phase (opens it if not already open)
    const modal = document.getElementById('combat-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.remove('combat-preview-open');
      modal.classList.add('combat-battle-open');
      document.getElementById('combat-phase-preview')?.classList.add('hidden');
      const battlePhase = document.getElementById('combat-phase-battle');
      if (battlePhase) {
        battlePhase.classList.remove('hidden');
        battlePhase.classList.add('combat-phase-enter');
        requestAnimationFrame(() => battlePhase.classList.remove('combat-phase-enter'));
      }
      const title = document.getElementById('combat-modal-title');
      if (title) title.textContent = '⚔️ Battle!';
    }

    soundManager.play('combat_start');
    soundManager.playMusic('combat');

    const territoryEl = document.getElementById('combat-territory');
    const territory = this.state.territories.get(combat.territoryId);
    if (territoryEl && territory) {
      territoryEl.textContent = `Battle for ${territory.name}`;
    }

    const logEl = document.getElementById('combat-log');
    if (logEl) logEl.innerHTML = '<em>Combat begins! Click Roll Dice to attack...</em>';

    this.updateCombatDisplay();
  }

  updateCombatDisplay(): void {
    if (!this.activeCombat) return;

    const attackerEl = document.getElementById('attacker-units');
    const defenderEl = document.getElementById('defender-units');
    const oddsEl = document.getElementById('odds-text');

    if (oddsEl && !this.activeCombat.isComplete) {
      const attackPower = this.activeCombat.attackers.reduce((sum, cu) => {
        return sum + (cu.count - cu.casualties) * cu.unitType.attack;
      }, 0);
      const defensePower = this.activeCombat.defenders.reduce((sum, cu) => {
        return sum + (cu.count - cu.casualties) * cu.unitType.defense;
      }, 0);

      const total = attackPower + defensePower;
      const attackerOdds = total > 0 ? Math.round((attackPower / total) * 100) : 50;

      let oddsColor = '#888';
      let oddsText = 'Even odds';
      if (attackerOdds >= 70) { oddsColor = '#22c55e'; oddsText = 'Strong attack'; }
      else if (attackerOdds >= 55) { oddsColor = '#84cc16'; oddsText = 'Slight advantage'; }
      else if (attackerOdds <= 30) { oddsColor = '#ef4444'; oddsText = 'Risky attack'; }
      else if (attackerOdds <= 45) { oddsColor = '#f97316'; oddsText = 'Slight disadvantage'; }

      oddsEl.innerHTML = `<span style="color: ${oddsColor};">${oddsText}</span> · Attack: ${attackPower} vs Defense: ${defensePower}`;
    } else if (oddsEl && this.activeCombat.isComplete) {
      oddsEl.textContent = 'Battle complete!';
    }

    if (attackerEl) {
      let html = '';
      for (const cu of this.activeCombat.attackers) {
        const active = cu.count - cu.casualties;
        const icon = UNIT_ICONS[cu.unitType.id] || '⬜';
        const statusColor = active === 0 ? '#999' : (cu.casualties > 0 ? '#d97706' : '#059669');
        const veteranBadge = cu.veteranCount && cu.veteranCount > 0 ? '<span style="color:#8b6914;margin-left:4px;">⭐</span>' : '';
        html += `<div class="combat-unit">
          <span>${icon} ${cu.unitType.name} (A:${cu.unitType.attack})${veteranBadge}</span>
          <span style="color: ${statusColor}; font-weight: bold;">${active} / ${cu.count}</span>
        </div>`;
      }
      attackerEl.innerHTML = html || '<em>No attackers</em>';
    }

    if (defenderEl) {
      let html = '';
      for (const cu of this.activeCombat.defenders) {
        const active = cu.count - cu.casualties;
        const icon = UNIT_ICONS[cu.unitType.id] || '⬜';
        const statusColor = active === 0 ? '#999' : (cu.casualties > 0 ? '#d97706' : '#059669');
        const veteranBadge = cu.veteranCount && cu.veteranCount > 0 ? '<span style="color:#8b6914;margin-left:4px;">⭐</span>' : '';
        html += `<div class="combat-unit">
          <span>${icon} ${cu.unitType.name} (D:${cu.unitType.defense})${veteranBadge}</span>
          <span style="color: ${statusColor}; font-weight: bold;">${active} / ${cu.count}</span>
        </div>`;
      }
      if (this.activeCombat.defenders.length === 0) {
        html = '<em style="color: #666;">No defending units</em>';
      }
      defenderEl.innerHTML = html;
    }

    const rollBtn = document.getElementById('btn-roll-combat') as HTMLButtonElement;
    const retreatBtn = document.getElementById('btn-retreat') as HTMLButtonElement;
    const closeBtn = document.getElementById('btn-close-combat') as HTMLButtonElement;
    const isComplete = this.activeCombat.isComplete;

    if (rollBtn) {
      rollBtn.disabled = isComplete;
      rollBtn.textContent = isComplete ? '🎲 Complete' : '🎲 Roll Dice';
    }
    if (retreatBtn) retreatBtn.disabled = !this.combatResolver.canRetreat(this.activeCombat);
    if (closeBtn) {
      closeBtn.disabled = !isComplete;
      closeBtn.textContent = this.pendingCombats.length > 0 ? `Next Battle (${this.pendingCombats.length})` : '✓ Continue';
    }
  }

  onRollCombat(): void {
    if (!this.activeCombat || this.activeCombat.isComplete) return;

    const rollBtn = document.getElementById('btn-roll-combat') as HTMLButtonElement | null;
    if (rollBtn) rollBtn.disabled = true;

    const diceRow = document.getElementById('combat-dice-row');
    const atkGroup = document.getElementById('attacker-dice');
    const defGroup = document.getElementById('defender-dice');
    const MAX_DICE = 8;

    if (diceRow && atkGroup && defGroup && this.activeCombat) {
      const atkCount = Math.min(this.activeCombat.attackers.reduce((s, a) => s + a.count - a.casualties, 0), MAX_DICE);
      const defCount = Math.min(this.activeCombat.defenders.reduce((s, d) => s + d.count - d.casualties, 0), MAX_DICE);
      const makePips = (count: number) => Array.from({ length: count }, () => `<span class="dice-pip rolling">1</span>`).join('');
      atkGroup.innerHTML = makePips(atkCount);
      defGroup.innerHTML = makePips(defCount);
      diceRow.classList.remove('hidden');
    }

    soundManager.play('dice_roll');

    // Cycle random numbers on every pip while the dice are "rolling"
    const cycleInterval = setInterval(() => {
      document.querySelectorAll<HTMLElement>('.dice-pip.rolling').forEach(pip => {
        pip.textContent = String(Math.ceil(Math.random() * 6));
      });
    }, 80);

    setTimeout(() => {
      clearInterval(cycleInterval);
      if (!this.activeCombat) return;
      const result = this.combatResolver.resolveCombatRound(this.activeCombat);

      if (atkGroup && defGroup) {
        const renderPips = (group: HTMLElement, rolls: typeof result.attackerRolls, totalActive: number) => {
          const shown = rolls.slice(0, MAX_DICE);
          const overflow = totalActive - shown.length;
          group.innerHTML = shown.map(r => {
            const cls = r.isCritical ? 'critical' : (r.isHit ? 'hit' : 'miss');
            return `<span class="dice-pip ${cls}" title="${r.unitName}: ${r.roll} vs ${r.targetValue}">${r.roll}</span>`;
          }).join('') + (overflow > 0 ? `<span class="dice-overflow-label">+${overflow}</span>` : '');
        };
        const atkActive = this.activeCombat.attackers.reduce((s, a) => s + (a.count - a.casualties), 0);
        const defActive = this.activeCombat.defenders.reduce((s, d) => s + (d.count - d.casualties), 0);
        renderPips(atkGroup, result.attackerRolls, atkActive);
        renderPips(defGroup, result.defenderRolls, defActive);

        // Landing pop — stagger each pip slightly so they "settle" in sequence
        const allPips = document.querySelectorAll<HTMLElement>('.dice-pip:not(.rolling)');
        allPips.forEach((pip, i) => {
          setTimeout(() => {
            pip.classList.add('dice-land');
            setTimeout(() => pip.classList.remove('dice-land'), 400);
          }, i * 35);
        });
      }

      const totalHits = result.attackerHits + result.defenderHits;
      const totalCrits = result.attackerCriticals + result.defenderCriticals;
      if (totalHits > 0) {
        soundManager.play('hit');
        if (totalCrits > 0) this.flashCombatScreen('#ffd700', 0.35);
        else if (totalHits >= 3)  this.flashCombatScreen('#ef4444', 0.22);
      } else {
        soundManager.play('miss');
      }

      const logEl = document.getElementById('combat-log');
      if (logEl) {
        let logHtml = logEl.querySelectorAll('.round-header').length > 3 ? '' : logEl.innerHTML;
        logHtml += `<div class="round-header">═══ Round ${result.round} ═══</div>`;

        if (result.attackerRolls.length > 0) {
          logHtml += `<div><strong>Attackers roll:</strong></div>`;
          for (const roll of result.attackerRolls) {
            const icon = UNIT_ICONS[roll.unitTypeId] || '⬜';
            const cls = roll.isCritical ? 'critical' : (roll.isHit ? 'hit' : 'miss');
            const hitText = roll.isCritical ? '💥💥 CRITICAL!' : (roll.isHit ? '💥 HIT!' : 'miss');
            logHtml += `<div class="${cls}">${icon} ${roll.unitName}: <span class="dice">${roll.roll}</span> vs ${roll.targetValue} → ${hitText}</div>`;
          }
        }
        if (result.defenderRolls.length > 0) {
          logHtml += `<div><strong>Defenders roll:</strong></div>`;
          for (const roll of result.defenderRolls) {
            const icon = UNIT_ICONS[roll.unitTypeId] || '⬜';
            const cls = roll.isCritical ? 'critical' : (roll.isHit ? 'hit' : 'miss');
            const hitText = roll.isCritical ? '💥💥 CRITICAL!' : (roll.isHit ? '💥 HIT!' : 'miss');
            logHtml += `<div class="${cls}">${icon} ${roll.unitName}: <span class="dice">${roll.roll}</span> vs ${roll.targetValue} → ${hitText}</div>`;
          }
        }
        const critText = (result.attackerCriticals + result.defenderCriticals) > 0
          ? ` (${result.attackerCriticals + result.defenderCriticals} criticals!)` : '';
        logHtml += `<div style="margin-top:0.5rem;padding:0.5rem;background:rgba(0,0,0,0.1);border-radius:4px;">
          <strong>Hits:</strong> Attackers scored ${result.attackerHits}, Defenders scored ${result.defenderHits}${critText}
        </div>`;
        logEl.innerHTML = logHtml;
        logEl.scrollTop = logEl.scrollHeight;
      }

      this.updateCombatDisplay();

      if (this.activeCombat?.isComplete) {
        const winner = this.activeCombat.winner;
        const resultText = winner === 'attacker' ? '🏆 ATTACKERS VICTORIOUS!'
          : winner === 'defender' ? '🛡️ DEFENDERS HOLD!'
          : '💀 MUTUAL DESTRUCTION!';
        const logEl2 = document.getElementById('combat-log');
        if (logEl2) {
          logEl2.innerHTML += `<div style="text-align:center;font-size:1.2rem;font-weight:bold;margin-top:1rem;color:${winner === 'attacker' ? '#059669' : '#dc2626'};">${resultText}</div>`;
          logEl2.scrollTop = logEl2.scrollHeight;
        }
      }

      setTimeout(() => {
        if (rollBtn) rollBtn.disabled = !!this.activeCombat?.isComplete;
      }, 150);
    }, 650);
  }

  onAutoResolve(): void {
    if (!this.activeCombat || this.activeCombat.isComplete) return;

    const logEl = document.getElementById('combat-log');
    if (logEl) logEl.innerHTML = '';

    let rounds = 0;
    const maxRounds = 50;
    while (!this.activeCombat.isComplete && rounds < maxRounds) {
      this.combatResolver.resolveCombatRound(this.activeCombat);
      rounds++;
    }

    soundManager.play('dice_roll');
    setTimeout(() => soundManager.play('hit'), 300);

    if (logEl) {
      const winner = this.activeCombat.winner;
      const resultText = winner === 'attacker'
        ? '🏆 ATTACKERS VICTORIOUS!'
        : winner === 'defender'
        ? '🛡️ DEFENDERS HOLD!'
        : '💀 MUTUAL DESTRUCTION!';
      logEl.innerHTML = `<div style="text-align: center; padding: 1rem;">
        <div style="font-size: 1.2rem; font-weight: bold; color: ${winner === 'attacker' ? '#059669' : '#dc2626'};">${resultText}</div>
        <div style="margin-top: 0.5rem; color: #666;">Resolved in ${rounds} round${rounds !== 1 ? 's' : ''}</div>
      </div>`;
    }

    this.updateCombatDisplay();
  }

  onRetreat(): void {
    if (!this.activeCombat) return;

    const combatTerritory = this.state.territories.get(this.activeCombat.territoryId);
    if (!combatTerritory) return;

    for (const adjId of getTerritoryNeighborIds(this.state, combatTerritory)) {
      const adj = this.state.territories.get(adjId);
      if (adj?.owner === this.activeCombat.attackingFactionId) {
        this.combatResolver.processRetreat(this.activeCombat, adjId);
        soundManager.play('retreat');
        soundManager.playMusic('gameplay');
        this.callbacks.showToast('Forces retreated!', 'info');
        this.finishCurrentCombat();
        return;
      }
    }

    this.callbacks.showToast('No valid retreat route!', 'info');
  }

  onCloseCombat(): void {
    if (!this.activeCombat || !this.activeCombat.isComplete) return;
    this.finishCurrentCombat();
  }

  finishCurrentCombat(): void {
    let handoffFrom: string | undefined;
    let handoffTo: string | undefined;
    if (this.activeCombat) {
      const combat = this.activeCombat;
      handoffFrom = combat.sourceTerritory ?? undefined;
      handoffTo = combat.territoryId;
      const sourceTerritory = combat.sourceTerritory ? this.state.territories.get(combat.sourceTerritory) : null;
      const targetTerritory = this.state.territories.get(combat.territoryId);

      if (sourceTerritory) {
        for (const cu of combat.attackers) {
          sourceTerritory.removeUnits(cu.unitType.id, cu.count);
        }
      }

      let tacticalSavedUnits = 0;
      if (this.pendingTacticalMeta || this.lastCombatWasTactical) {
        combat.resolvedTactically = true;
      }
      if (this.pendingTacticalMeta) {
        combat.tacticalCleanWin = this.pendingTacticalMeta.cleanWin;
        if (combat.winner === 'attacker') {
          const bonus = applyTacticalVictoryBonuses(combat, this.pendingTacticalMeta);
          tacticalSavedUnits = bonus.savedUnits;
        }
      }

      this.combatResolver.finalizeCombat(combat);

      if (combat.stayInPlace && sourceTerritory) {
        for (const cu of combat.attackers) {
          const surviving = cu.count - cu.casualties;
          if (surviving <= 0) continue;
          sourceTerritory.addUnits(cu.unitType.id, surviving);
          sourceTerritory.markUnitsActed(cu.unitType.id, surviving);
        }
      } else if (sourceTerritory && combat.winner !== 'attacker') {
        for (const cu of combat.attackers) {
          const surviving = cu.count - cu.casualties;
          if (surviving <= 0) continue;
          sourceTerritory.addUnits(cu.unitType.id, surviving);
          sourceTerritory.markUnitsActed(cu.unitType.id, surviving);
        }
      } else if (combat.winner === 'attacker') {
        for (const cu of combat.attackers) {
          const surviving = cu.count - cu.casualties;
          if (surviving <= 0) continue;
          if (cu.unitType.domain === 'sea' && sourceTerritory?.type === 'sea') {
            sourceTerritory.markUnitsActed(cu.unitType.id, surviving);
          } else if (cu.unitType.domain !== 'sea') {
            const dest = this.state.territories.get(combat.territoryId);
            dest?.markUnitsActed(cu.unitType.id, surviving);
          }
        }
      }

      const attackerLosses: Record<string, number> = {};
      for (const cu of combat.attackers) {
        if (cu.casualties > 0) attackerLosses[cu.unitType.id] = (attackerLosses[cu.unitType.id] ?? 0) + cu.casualties;
      }
      const defenderLosses: Record<string, number> = {};
      for (const cu of combat.defenders) {
        if (cu.casualties > 0) defenderLosses[cu.unitType.id] = (defenderLosses[cu.unitType.id] ?? 0) + cu.casualties;
      }
      const attackerLossText = this.formatLosses(attackerLosses);
      const defenderLossText = this.formatLosses(defenderLosses);
      const targetName = targetTerritory?.name ?? combat.territoryId;
      const recap = combat.stayInPlace
        ? (combat.winner === 'attacker'
          ? `Barrage on ${targetName} succeeded. Lost ${attackerLossText}; enemy lost ${defenderLossText}.`
          : combat.winner === 'defender'
          ? `${targetName} held after barrage. Lost ${attackerLossText}; enemy lost ${defenderLossText}.`
          : `${targetName} emptied. Both sides destroyed.`)
        : (combat.winner === 'attacker'
        ? `Captured ${targetName}. Lost ${attackerLossText}; enemy lost ${defenderLossText}.`
        : combat.winner === 'defender'
        ? `${targetName} held. Lost ${attackerLossText}; enemy lost ${defenderLossText}.`
        : `${targetName} emptied. Both sides destroyed.`);

      if (combat.winner === 'attacker') {
        this.callbacks.showToast(recap, 'success');
        soundManager.play('capture');
      } else if (combat.winner === 'defender') {
        this.callbacks.showToast(recap, 'info');
      } else {
        this.callbacks.showToast(recap, 'info');
      }
      const attackerFaction = this.state.factionRegistry.get(combat.attackingFactionId);
      battleLog.logCombat(this.state.turnNumber, attackerFaction?.name ?? 'Attacker', attackerFaction?.color ?? '#94a3b8', recap);

      if (this.lastCombatWasTactical || this.pendingTacticalMeta) {
        const won = combat.winner === 'attacker';
        statisticsManager.trackTacticalBattle(combat.attackingFactionId, won);
        if (won && tacticalSavedUnits > 0) {
          this.callbacks.showToast(
            `Tactical victory! Morale boosted — ${tacticalSavedUnits} unit${tacticalSavedUnits === 1 ? '' : 's'} saved.`,
            'success',
          );
        } else if (won && this.pendingTacticalMeta?.cleanWin) {
          this.callbacks.showToast('Clean tactical victory! Troops hold the line with high morale.', 'success');
        } else if (won) {
          this.callbacks.showToast('Tactical victory secured.', 'success');
        }
        this.lastCombatWasTactical = false;
        this.pendingTacticalMeta = null;
        soundManager.playMusic('gameplay');
      }

      // Battle narrative
      if (settings.getSetting('battleNarratives')) {
        const atkFaction = this.state.factionRegistry.get(combat.attackingFactionId);
        const defFaction = this.state.factionRegistry.get(combat.defendingFactionId);
        const atkCommander = combat.sourceTerritory
          ? this.state.territories.get(combat.sourceTerritory)?.units.find(u => u.commander)?.commander?.name
          : undefined;
        const defCommander = targetTerritory?.units.find(u => u.commander)?.commander?.name;
        const atkCasualties = combat.attackers.reduce((s, cu) => s + cu.casualties, 0);
        const defCasualties = combat.defenders.reduce((s, cu) => s + cu.casualties, 0);
        const narrative = generateBattleNarrative({
          territoryName: targetTerritory?.name ?? combat.territoryId,
          attackerFactionName: atkFaction?.name ?? 'Attacker',
          defenderFactionName: defFaction?.name ?? 'Defender',
          attackerCasualties: atkCasualties,
          defenderCasualties: defCasualties,
          winner: combat.winner,
          attackerCommander: atkCommander,
          defenderCommander: defCommander,
          turnNumber: this.state.turnNumber,
          isCapital: targetTerritory?.isCapital ?? false,
          isWinter: this.state.currentSeason === 'winter',
        });
        this.showNarrativeToast(narrative);
      }

      this.state.pendingMoves = this.state.pendingMoves.filter(
        m => m.toTerritoryId !== combat.territoryId
      );
    }

    this.closeCombatModal();
    this.renderer.render();
    this.callbacks.renderMinimap();
    this.callbacks.updateFactionPanel();
    if (handoffFrom) {
      this.callbacks.afterUnitAction?.(handoffFrom, handoffTo);
    } else {
      this.callbacks.afterUnitAction?.();
    }
    this.startNextCombat();
  }

  private formatLosses(losses: Record<string, number>): string {
    const parts = Object.entries(losses)
      .filter(([, count]) => count > 0)
      .map(([unitTypeId, count]) => {
        const unit = this.state.unitRegistry.get(unitTypeId);
        return `${count} ${unit?.name ?? unitTypeId}`;
      });
    return parts.length > 0 ? parts.join(', ') : 'nothing';
  }

  closeCombatModal(): void {
    const modal = document.getElementById('combat-modal');
    if (modal) modal.classList.add('hidden');
    this.activeCombat = null;
  }

  private showNarrativeToast(text: string): void {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast info';
    el.style.cssText = 'font-style:italic;border-left:4px solid #c9a227;max-width:380px;line-height:1.4;';
    el.textContent = `📜 ${text}`;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.4s';
      setTimeout(() => el.remove(), 400);
    }, 6000);
  }

  /** Play a brief pre-combat clash animation overlay, then resolve. */
  playCombatAnimation(attackerName: string, defenderName: string): Promise<void> {
    if (!settings.getSetting('battleAnimations')) return Promise.resolve();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'combat-animation-overlay';
      overlay.style.cssText = [
        'position:fixed','inset:0','z-index:8000','pointer-events:none',
        'display:flex','align-items:center','justify-content:center',
        'background:rgba(0,0,0,0.55)',
      ].join(';');
      overlay.innerHTML = `
        <div style="display:flex;align-items:center;gap:3rem;font-size:1.8rem;font-weight:bold;color:#fff;
                    text-shadow:0 2px 8px rgba(0,0,0,0.8);user-select:none;">
          <span id="anim-atk" style="transform:translateX(-120px);opacity:0;transition:all 0.35s ease;">
            ⚔️ ${attackerName}
          </span>
          <span style="font-size:2.5rem;animation:pulse 0.4s infinite alternate;">💥</span>
          <span id="anim-def" style="transform:translateX(120px);opacity:0;transition:all 0.35s ease;">
            ${defenderName} 🛡️
          </span>
        </div>
      `;
      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const atk = document.getElementById('anim-atk');
          const def = document.getElementById('anim-def');
          if (atk) { atk.style.transform = 'translateX(0)'; atk.style.opacity = '1'; }
          if (def) { def.style.transform = 'translateX(0)'; def.style.opacity = '1'; }
        });
      });

      setTimeout(() => {
        overlay.style.transition = 'opacity 0.25s';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.remove(); resolve(); }, 250);
      }, 800);
    });
  }

  /** Brief color flash over the combat modal to accent heavy hits. */
  private flashCombatScreen(color: string, opacity: number): void {
    const modal = document.getElementById('combat-modal');
    if (!modal) return;
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:9999;
      background:${color};opacity:${opacity};transition:opacity 0.3s ease;
    `;
    modal.style.position = 'relative';
    modal.appendChild(flash);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 320);
    }));
  }

  // ==================== ATTACK HANDLING ====================

  onAttackClick(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    this.pendingCombats = [];
    const combatTerritories = new Set<string>();

    for (const move of this.state.pendingMoves) {
      const target = this.state.territories.get(move.toTerritoryId);
      if (target) {
        if (target.owner && faction.isEnemyOf(target.owner)) {
          combatTerritories.add(move.toTerritoryId);
        } else if (!target.owner) {
          combatTerritories.add(move.toTerritoryId);
        }
      }
    }

    this.pendingCombats = Array.from(combatTerritories);

    if (this.pendingCombats.length === 0) {
      this.callbacks.showToast('No attacks queued', 'info');
      return;
    }

    this.startNextCombat();
  }

  startNextCombat(): void {
    if (this.pendingCombats.length === 0) {
      this.state.pendingMoves = [];
      this.callbacks.updateActionButtons();
      this.callbacks.showToast('All battles resolved!', 'success');
      return;
    }

    const territoryId = this.pendingCombats.shift()!;
    const territory = this.state.territories.get(territoryId);
    if (!territory) {
      this.startNextCombat();
      return;
    }

    const attackingMoves = this.state.pendingMoves.filter(m => m.toTerritoryId === territoryId);

    if (attackingMoves.length === 0) {
      this.startNextCombat();
      return;
    }

    const attackingUnits = attackingMoves.map(m => {
      const src = this.state.territories.get(m.fromTerritoryId);
      const pu = src?.units.find(u => u.unitTypeId === m.unitTypeId);
      return { unitTypeId: m.unitTypeId, count: m.count, veteranCount: pu?.veteranCount ?? 0 };
    });

    for (const move of attackingMoves) {
      const fromTerritory = this.state.territories.get(move.fromTerritoryId);
      if (fromTerritory) {
        fromTerritory.removeUnits(move.unitTypeId, move.count);
      }
    }

    if (!territory.owner || countTerritoryDefendersIncludingOffshore(this.state, territoryId, territory.owner) === 0) {
      const currentFaction = this.state.getCurrentFaction();
      if (currentFaction) {
        territory.owner = currentFaction.id;
        territory.units = [];
        for (const unit of attackingUnits) {
          territory.addUnits(unit.unitTypeId, unit.count);
        }
        this.callbacks.showToast(`Captured ${territory.name}!`, 'success');
        soundManager.play('capture');
        battleLog.logCapture(this.state.turnNumber, currentFaction.name, currentFaction.color, territory.name);
      }

      this.state.pendingMoves = this.state.pendingMoves.filter(m => m.toTerritoryId !== territoryId);
      this.renderer.render();
      this.startNextCombat();
      return;
    }

    const sourceTerritoryId = attackingMoves[0]?.fromTerritoryId;
    const combat = this.combatResolver.initiateCombat(
      territoryId,
      this.state.currentFactionId,
      attackingUnits,
      sourceTerritoryId,
    );

    if (combat) {
      // Flanking: attackers from more than one source territory get +1 attack
      const distinctSources = new Set(attackingMoves.map(m => m.fromTerritoryId));
      if (distinctSources.size > 1) combat.flankingBonus = 1;

      this.runPreCombatPhases(combat, territoryId);

      this.activeCombat = combat;
      const atkFaction = this.state.factionRegistry.get(combat.attackingFactionId);
      const defFaction = this.state.factionRegistry.get(combat.defendingFactionId);
      this.playCombatAnimation(atkFaction?.name ?? 'Attacker', defFaction?.name ?? 'Defender')
        .then(() => this.showCombatModal(combat));
    } else {
      for (const move of attackingMoves) {
        const fromTerritory = this.state.territories.get(move.fromTerritoryId);
        if (fromTerritory) {
          fromTerritory.addUnits(move.unitTypeId, move.count);
        }
      }
      this.startNextCombat();
    }
  }

  // ==================== BATTLE PREVIEW ====================

  /** Log pre-combat phases in the battle modal and battle log. */
  private runPreCombatPhases(combat: CombatState, _territoryId: string): void {
    const atkFaction = this.state.factionRegistry.get(combat.attackingFactionId);
    const preCombat = this.combatResolver.runPreCombatPhases(combat);
    const logEl = document.getElementById('combat-log');
    let logHtml = logEl?.innerHTML ?? '';

    const appendLog = (line: string) => {
      logHtml += line;
      if (logEl) logEl.innerHTML = logHtml;
    };

    if (preCombat.shoreBombardment && preCombat.shoreBombardment.rolls.length > 0) {
      if (preCombat.shoreBombardment.hits > 0 && atkFaction) {
        battleLog.logCombat(
          this.state.turnNumber,
          atkFaction.name,
          atkFaction.color,
          `🚢 Shore bombardment: ${preCombat.shoreBombardment.hits} hit(s) on the garrison before the assault`,
        );
      }
      appendLog(`<div class="round-header">🚢 Shore Bombardment</div>`);
      appendLog(`<div class="preview-combat-note compact">Defenders cannot fire back during shore bombardment.</div>`);
      for (const roll of preCombat.shoreBombardment.rolls) {
        const icon = UNIT_ICONS[roll.unitTypeId] || '⬜';
        const cls = roll.isCritical ? 'critical' : (roll.isHit ? 'hit' : 'miss');
        const hitText = roll.isCritical ? '💥💥 CRITICAL!' : (roll.isHit ? '💥 HIT!' : 'miss');
        appendLog(`<div class="${cls}">${icon} ${roll.unitName}: <span class="dice">${roll.roll}</span> vs ${roll.targetValue} → ${hitText}</div>`);
      }
      appendLog(`<div><strong>Bombardment total: ${preCombat.shoreBombardment.hits} hit(s)</strong></div>`);
    }

    if (preCombat.coastalArtillery && preCombat.coastalArtillery.rolls.length > 0) {
      if (preCombat.coastalArtillery.hits > 0 && atkFaction) {
        battleLog.logCombat(
          this.state.turnNumber,
          atkFaction.name,
          atkFaction.color,
          `💥 Coastal artillery: ${preCombat.coastalArtillery.hits} hit(s) on the fleet before the engagement`,
        );
      }
      appendLog(`<div class="round-header">💥 Coastal Artillery Barrage</div>`);
      appendLog(`<div class="preview-combat-note compact">Ships cannot return fire during the opening barrage.</div>`);
      for (const roll of preCombat.coastalArtillery.rolls) {
        const icon = UNIT_ICONS[roll.unitTypeId] || '⬜';
        const cls = roll.isCritical ? 'critical' : (roll.isHit ? 'hit' : 'miss');
        const hitText = roll.isCritical ? '💥💥 CRITICAL!' : (roll.isHit ? '💥 HIT!' : 'miss');
        appendLog(`<div class="${cls}">${icon} ${roll.unitName}: <span class="dice">${roll.roll}</span> vs ${roll.targetValue} → ${hitText}</div>`);
      }
      appendLog(`<div><strong>Artillery barrage total: ${preCombat.coastalArtillery.hits} hit(s)</strong></div>`);
    }

    if (preCombat.submarineStrike && preCombat.submarineStrike.hits > 0 && atkFaction) {
      battleLog.logCombat(
        this.state.turnNumber,
        atkFaction.name,
        atkFaction.color,
        `🐟 Submarine strike: ${preCombat.submarineStrike.hits} hit(s) before defenders respond`,
      );
    }

    if (preCombat.airIntercept && preCombat.airIntercept.hits > 0 && atkFaction) {
      battleLog.logCombat(
        this.state.turnNumber,
        atkFaction.name,
        atkFaction.color,
        `✈️ Air intercept: ${preCombat.airIntercept.hits} hit(s) on attacking air units`,
      );
    }
  }

  showBattlePreview(fromId: string, toId: string): void {
    this.pendingAttackFrom = fromId;
    this.pendingAttackTarget = toId;

    const fromTerritory = this.state.territories.get(fromId);
    const toTerritory = this.state.territories.get(toId);
    if (!fromTerritory || !toTerritory) return;
    const thisRef = this;
    const sourceTerritory = fromTerritory;
    const targetTerritory = toTerritory;

    // Open combined modal in preview phase
    const modal = document.getElementById('combat-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('combat-preview-open');
      modal.classList.remove('combat-battle-open');
      document.getElementById('combat-phase-battle')?.classList.add('hidden');
      document.getElementById('combat-phase-preview')?.classList.remove('hidden');
      const title = document.getElementById('combat-modal-title');
      if (title) title.textContent = '⚔️ Battle Preview';
    }

    const territoryEl = document.getElementById('preview-territory');
    let territoryLabel = `Attack on ${toTerritory.name}`;
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      territoryLabel += ' · +1 defense bonus';
    }
    if (territoryEl) territoryEl.textContent = territoryLabel;

    const selectedUnitType = this.callbacks.getSelectedUnitType?.() ?? null;
    const hqMoveCount = this.callbacks.getSelectedMoveCount?.() ?? null;
    const attackerUnitsEl = document.getElementById('preview-attacker-units');
    let attackerHtml = '';
    const readyAttackers: PreviewAttackerEntry[] = [];
    for (const pu of fromTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (!unitType || unitType.attack <= 0) continue;
      if (selectedUnitType && pu.unitTypeId !== selectedUnitType) continue;
      const readyCount = fromTerritory.getAvailableUnitCount(pu.unitTypeId);
      if (readyCount <= 0) continue;
      const defaultCount = selectedUnitType && pu.unitTypeId === selectedUnitType && hqMoveCount
        ? Math.min(hqMoveCount, readyCount)
        : readyCount;
      readyAttackers.push({ unitTypeId: pu.unitTypeId, unitType, count: defaultCount });
      const icon = UNIT_ICONS[pu.unitTypeId] || '⬜';
      const actedCount = pu.count - readyCount;
      const actedText = actedCount > 0 ? ` <small class="preview-muted">(${actedCount} acted)</small>` : '';
      attackerHtml += `
          <div class="unit-select-row compact">
            <span class="unit-select-label">${icon} ${unitType.name}${actedText}<em>Atk ${unitType.attack}</em></span>
            <div class="unit-stepper compact">
              <button type="button" class="stepper-dec" data-uid="${pu.unitTypeId}">−</button>
              <input type="number" class="unit-count-input" data-unit-type-id="${pu.unitTypeId}"
                value="${defaultCount}" min="0" max="${readyCount}">
              <button type="button" class="stepper-inc" data-uid="${pu.unitTypeId}" data-max="${readyCount}">+</button>
            </div>
          </div>`;
    }
    const defendingFactionId = toTerritory.owner ?? '';
    const defenderPreview = defendingFactionId
      ? buildStrategicDefenderPreview(this.state, toTerritory.id, defendingFactionId)
      : [];
    const previewTotals = computePreviewCombatTotals(
      this.state,
      fromTerritory,
      toTerritory,
      readyAttackers,
      defenderPreview,
      this.state.getCurrentFaction()?.id ?? '',
    );
    if (previewTotals.artilleryBoost > 0) {
      attackerHtml += `<div class="preview-combat-note compact">🎯 Artillery +${previewTotals.artilleryBoost} atk</div>`;
    }
    if (previewTotals.combinedArmsBonus > 0) {
      attackerHtml += `<div class="preview-combat-note compact">⚔️ Combined arms +${previewTotals.combinedArmsBonus} atk</div>`;
    }
    if (attackerUnitsEl) {
      attackerUnitsEl.innerHTML = attackerHtml || '<em>No units</em>';
      // Wire stepper buttons
      attackerUnitsEl.querySelectorAll<HTMLButtonElement>('.stepper-dec').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = attackerUnitsEl.querySelector<HTMLInputElement>(`input[data-unit-type-id="${btn.dataset.uid}"]`);
          if (input) input.value = String(Math.max(0, Number(input.value) - 1));
          updatePreviewFromInputs();
        });
      });
      attackerUnitsEl.querySelectorAll<HTMLButtonElement>('.stepper-inc').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = attackerUnitsEl.querySelector<HTMLInputElement>(`input[data-unit-type-id="${btn.dataset.uid}"]`);
          if (input) input.value = String(Math.min(Number(btn.dataset.max ?? 99), Number(input.value) + 1));
          updatePreviewFromInputs();
        });
      });
      attackerUnitsEl.querySelectorAll<HTMLInputElement>('.unit-count-input').forEach(input => {
        input.addEventListener('input', updatePreviewFromInputs);
        input.addEventListener('change', updatePreviewFromInputs);
      });
    }

    const defenderUnitsEl = document.getElementById('preview-defender-units');
    let defenderHtml = '';
    for (const entry of defenderPreview) {
      const icon = UNIT_ICONS[entry.unitType.id] || '⬜';
      const offshoreLabel = entry.offshore
        ? ` <small class="preview-muted">(offshore${entry.seaZoneName ? `: ${entry.seaZoneName}` : ''})</small>`
        : '';
      defenderHtml += `<div class="preview-defender-row"><span>${icon} ${entry.count}× ${entry.unitType.name}${offshoreLabel}</span><em>Def ${entry.unitType.defense}</em></div>`;
    }
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      defenderHtml += `<div class="preview-combat-note compact warn">🏰 +1 def round 1</div>`;
    }
    if (defenderUnitsEl) defenderUnitsEl.innerHTML = defenderHtml || '<em>Undefended!</em>';

    const previewStats = this.calculateBattlePreviewStats(
      readyAttackers.map(a => ({ unitTypeId: a.unitTypeId, count: a.count })),
      defenderPreview.map(entry => ({ unitTypeId: entry.unitType.id, count: entry.count })),
      previewTotals,
    );
    const attackPowerEl = document.getElementById('preview-attacker-power');
    if (attackPowerEl) {
      const muted = previewTotals.engageableAttackPower < previewTotals.rawAttackPower
        ? ` <small class="preview-muted">(${previewTotals.rawAttackPower} raw)</small>`
        : '';
      attackPowerEl.innerHTML = `Atk ${previewStats.attackPower}${muted} · ~${previewStats.expectedAttackerHits.toFixed(1)} hits`;
    }

    const defensePowerEl = document.getElementById('preview-defender-power');
    if (defensePowerEl) {
      const bonusText = previewStats.effectiveDefense > previewStats.defensePower
        ? ` (${previewStats.effectiveDefense} eff.)` : '';
      const muted = previewTotals.engageableDefensePower < previewTotals.rawDefensePower
        ? ` <small class="preview-muted">(${previewTotals.rawDefensePower} raw)</small>`
        : '';
      defensePowerEl.innerHTML = `Def ${previewStats.defensePower}${bonusText}${muted} · ~${previewStats.expectedDefenderHits.toFixed(1)} hits`;
    }

    const domainNote = this.buildDomainCombatNote(
      readyAttackers.map(a => ({ unitType: a.unitType, count: a.count })),
      defenderPreview.map(d => ({ unitType: d.unitType, count: d.count })),
    );

    if (domainNote) {
      defenderHtml += domainNote;
      if (defenderUnitsEl) defenderUnitsEl.innerHTML = defenderHtml;
    }

    const oddsEl = document.getElementById('odds-display');
    if (oddsEl) {
      oddsEl.textContent = `~${Math.round(previewStats.odds * 100)}%`;
      oddsEl.className = `preview-odds-pct ${previewStats.riskClass}`;
    }

    const summaryEl = document.getElementById('preview-risk-summary');
    const consequenceSummaryEl = this.getPreviewConsequenceEl();
    const swingFactorsEl = this.getPreviewSwingFactorsEl();
    this.renderPreviewOutcome(fromId, toId, previewStats, summaryEl, consequenceSummaryEl, swingFactorsEl);
    this.updateBattlePreviewActions(previewStats, toTerritory, defenderPreview.reduce((sum, entry) => sum + entry.count, 0));
    this.attachPreviewKeyboard();

    function updatePreviewFromInputs(): void {
      if (!attackerUnitsEl) return;
      const selectedAttackers: PreviewAttackerEntry[] = [];

      for (const pu of sourceTerritory.units) {
        const unitType = thisRef.state.unitRegistry.get(pu.unitTypeId);
        if (!unitType || unitType.attack <= 0) continue;
        if (selectedUnitType && pu.unitTypeId !== selectedUnitType) continue;
        const readyCount = sourceTerritory.getAvailableUnitCount(pu.unitTypeId);
        const input = attackerUnitsEl.querySelector<HTMLInputElement>(`input[data-unit-type-id="${pu.unitTypeId}"]`);
        const count = input
          ? Math.max(0, Math.min(readyCount, Math.floor(Number(input.value) || 0)))
          : readyCount;
        if (input && Number(input.value) !== count) input.value = String(count);
        if (count <= 0) continue;
        selectedAttackers.push({ unitTypeId: pu.unitTypeId, unitType, count });
      }

      const nextTotals = computePreviewCombatTotals(
        thisRef.state,
        sourceTerritory,
        targetTerritory,
        selectedAttackers,
        defenderPreview,
        thisRef.state.getCurrentFaction()?.id ?? '',
      );
      const nextStats = thisRef.calculateBattlePreviewStats(
        selectedAttackers.map(a => ({ unitTypeId: a.unitTypeId, count: a.count })),
        defenderPreview.map(entry => ({ unitTypeId: entry.unitType.id, count: entry.count })),
        nextTotals,
      );
      if (attackPowerEl) {
        const muted = nextTotals.engageableAttackPower < nextTotals.rawAttackPower
          ? ` <small class="preview-muted">(${nextTotals.rawAttackPower} raw)</small>`
          : '';
        attackPowerEl.innerHTML = `Atk ${nextStats.attackPower}${muted} · ~${nextStats.expectedAttackerHits.toFixed(1)} hits`;
      }
      if (defensePowerEl) {
        const bonusText = nextStats.effectiveDefense > nextStats.defensePower
          ? ` (${nextStats.effectiveDefense} eff.)` : '';
        const muted = nextTotals.engageableDefensePower < nextTotals.rawDefensePower
          ? ` <small class="preview-muted">(${nextTotals.rawDefensePower} raw)</small>`
          : '';
        defensePowerEl.innerHTML = `Def ${nextStats.defensePower}${bonusText}${muted} · ~${nextStats.expectedDefenderHits.toFixed(1)} hits`;
      }
      if (oddsEl) {
        oddsEl.textContent = `~${Math.round(nextStats.odds * 100)}%`;
        oddsEl.className = `preview-odds-pct ${nextStats.riskClass}`;
      }
      thisRef.renderPreviewOutcome(fromId, toId, nextStats, summaryEl, consequenceSummaryEl, swingFactorsEl);
      const defenderCount = defenderPreview.reduce((sum, entry) => sum + entry.count, 0);
      thisRef.updateBattlePreviewActions(nextStats, targetTerritory, defenderCount);
    }
  }

  private buildDomainCombatNote(
    attackers: Array<{ unitType: import('../data/Unit').UnitType; count: number }>,
    defenders: Array<{ unitType: import('../data/Unit').UnitType; count: number }>,
  ): string {
    if (attackers.length === 0 || defenders.length === 0) return '';

    const infantryOnly = attackers.every(
      atk => atk.unitType.domain === 'land' && !canLandUnitStrikeNaval(atk.unitType),
    );
    const hasNavalDefenders = defenders.some(def => def.unitType.domain === 'sea');
    const hasLandAttackersVsLand = attackers.some(atk => atk.unitType.domain === 'land')
      && defenders.some(def => def.unitType.domain === 'land');
    const hasNavalAttackersVsLand = attackers.some(atk => atk.unitType.domain === 'sea')
      && defenders.some(def => def.unitType.domain === 'land');

    const notes: string[] = [];
    if (infantryOnly && hasNavalDefenders && !hasLandAttackersVsLand) {
      notes.push('Infantry can return fire on ships at reduced strength (-1 attack). Artillery is much more effective.');
    }
    if (hasNavalAttackersVsLand) {
      notes.push('Fleet opens with shore bombardment, then both sides fight using cross-domain rules (infantry cannot hit ships).');
    }
    if (attackers.some(atk => canLandUnitStrikeNaval(atk.unitType)) && hasNavalDefenders) {
      notes.push('Coastal artillery can fire on ships; the fleet cannot shoot back during the opening barrage.');
    }

    if (notes.length === 0) return '';
    return `<div class="preview-combat-note compact warn">${notes.join(' ')}</div>`;
  }

  /** Whether tactical mode is worth highlighting for this preview. */
  isTacticalRecommended(
    stats: BattlePreviewStats,
    toTerritory: { isCapital?: boolean; hasFactory?: boolean },
  ): boolean {
    if (stats.defenderUnitCount === 0) return false;
    if (toTerritory.isCapital || toTerritory.hasFactory) return true;
    if (stats.odds >= 0.35 && stats.odds <= 0.65) return true;
    if (stats.riskClass === 'bad' && stats.attackerUnitCount >= 2) return true;
    return false;
  }

  private updateBattlePreviewActions(
    stats: BattlePreviewStats,
    toTerritory: { isCapital?: boolean; hasFactory?: boolean; name?: string },
    defenderCount: number,
  ): void {
    const tacticalEnabled = settings.getSetting('tacticalBattles') ?? true;
    const showTactical = tacticalEnabled && defenderCount > 0;
    const tacticalBtn = document.getElementById('btn-play-tactical') as HTMLButtonElement | null;
    const recommended = showTactical && this.isTacticalRecommended(stats, toTerritory);

    if (tacticalBtn) {
      tacticalBtn.disabled = !showTactical;
      tacticalBtn.classList.toggle('hidden', !showTactical);
      tacticalBtn.classList.toggle('recommended', recommended);
      tacticalBtn.title = showTactical ? 'Command units on a tactical map (T)' : '';
    }

    let hintEl = document.getElementById('preview-tactical-hint');
    if (!hintEl) {
      hintEl = document.createElement('p');
      hintEl.id = 'preview-tactical-hint';
      hintEl.className = 'preview-tactical-hint';
      document.querySelector('.combat-preview-actions')?.prepend(hintEl);
    }
    if (!showTactical) {
      hintEl.classList.add('hidden');
      hintEl.textContent = '';
      return;
    }
    hintEl.classList.remove('hidden');
    hintEl.textContent = recommended
      ? 'Contested battle — Play Tactical (T) for finer control and fewer losses.'
      : 'Optional: Play Tactical (T) to command units on a mini-map.';

    if (recommended && !localStorage.getItem('tactical-coach-seen')) {
      localStorage.setItem('tactical-coach-seen', '1');
      this.callbacks.showToast(
        'Tip: Press T or Play Tactical to command units on a grid — clean wins save casualties and boost morale.',
        'info',
      );
    }
  }

  private attachPreviewKeyboard(): void {
    this.detachPreviewKeyboard();
    this.previewKeyHandler = (event: KeyboardEvent) => {
      const modal = document.getElementById('combat-modal');
      if (!modal || modal.classList.contains('hidden') || !modal.classList.contains('combat-preview-open')) return;
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 't' || event.key === 'T') {
        const tacticalBtn = document.getElementById('btn-play-tactical') as HTMLButtonElement | null;
        if (!tacticalBtn || tacticalBtn.disabled || tacticalBtn.classList.contains('hidden')) return;
        event.preventDefault();
        this.confirmTacticalAttackFromPreview();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        this.confirmAttackFromPreview(true);
      }
    };
    document.addEventListener('keydown', this.previewKeyHandler, true);
  }

  private detachPreviewKeyboard(): void {
    if (!this.previewKeyHandler) return;
    document.removeEventListener('keydown', this.previewKeyHandler, true);
    this.previewKeyHandler = null;
  }

  private getPreviewConsequenceEl(): HTMLElement {
    let el = document.getElementById('preview-consequence-summary');
    if (!el) {
      el = document.createElement('div');
      el.id = 'preview-consequence-summary';
      document.getElementById('preview-odds')?.appendChild(el);
    }
    return el;
  }

  private getPreviewSwingFactorsEl(): HTMLElement {
    let el = document.getElementById('preview-swing-factors');
    if (!el) {
      el = document.createElement('div');
      el.id = 'preview-swing-factors';
      document.getElementById('preview-odds')?.appendChild(el);
    }
    return el;
  }

  private renderPreviewOutcome(
    fromId: string,
    toId: string,
    stats: BattlePreviewStats,
    summaryEl: HTMLElement | null,
    consequenceEl: HTMLElement,
    swingFactorsEl: HTMLElement,
  ): void {
    if (summaryEl) {
      summaryEl.className = `preview-risk-summary ${stats.riskClass} compact`;
      summaryEl.innerHTML = `<strong>${stats.riskLabel}</strong><span>${stats.riskDetail}</span>`;
    }
    consequenceEl.className = `preview-consequence-summary ${stats.riskClass} compact`;
    consequenceEl.textContent = this.buildBattleConsequenceSummary(fromId, toId, stats);
    swingFactorsEl.className = 'preview-swing-factors compact';
    swingFactorsEl.innerHTML = stats.swingFactors.length > 0
      ? stats.swingFactors.map(factor => `<span>${factor}</span>`).join('')
      : '';
  }

  private buildBattleConsequenceSummary(fromId: string, toId: string, stats: BattlePreviewStats): string {
    const from = this.state.territories.get(fromId);
    const target = this.state.territories.get(toId);
    if (!from || !target) return '';

    const targetValue = target.production + (target.isCapital ? 10 : 0) + (target.hasFactory ? 6 : 0);
    const likelyAttackerLosses = Math.min(stats.attackerUnitCount, Math.max(0, Math.round(stats.expectedDefenderHits)));
    const likelyDefenderLosses = Math.min(stats.defenderUnitCount, Math.max(0, Math.round(stats.expectedAttackerHits)));
    const sourceUnitsBefore = from.getTotalUnitCount();
    const sourceUnitsAfterCommit = Math.max(0, sourceUnitsBefore - stats.attackerUnitCount);
    const enemyCounterSources = target.adjacentTo
      .map(id => this.state.territories.get(id))
      .filter(t => t?.owner && t.owner !== this.state.currentFactionId && t.getTotalUnitCount() > 0)
      .length;
    const sourceEnemyPressure = from.adjacentTo
      .map(id => this.state.territories.get(id))
      .filter(t => t?.owner && t.owner !== this.state.currentFactionId && t.getTotalUnitCount() > 0)
      .reduce((sum, t) => sum + (t?.getTotalUnitCount() ?? 0), 0);

    const stakes: string[] = [];
    if (target.isCapital) stakes.push('capital swing');
    if (target.hasFactory) stakes.push('factory control');
    if (target.production > 0) stakes.push(`+${target.production} IPC income`);
    if (enemyCounterSources > 0) stakes.push(`${enemyCounterSources} counterattack lane${enemyCounterSources === 1 ? '' : 's'}`);

    const commitment = sourceEnemyPressure > 0 && sourceUnitsAfterCommit <= 1
      ? `Thin border: ${sourceUnitsAfterCommit} left in ${from.name}.`
      : `${sourceUnitsAfterCommit} remain in ${from.name}.`;

    const tempo = stats.odds >= 0.65
      ? 'Hold next turn for momentum.'
      : stats.odds < 0.5
        ? 'Failed attack risks the border.'
        : 'Could trade either way.';

    const stake = stakes.join(', ') || `+${targetValue} value`;
    return `Lose ~${likelyAttackerLosses}, kill ~${likelyDefenderLosses} · ${stake} · ${tempo} ${commitment}`;
  }

  calculateBattlePreviewStats(
    attackerUnits: { unitTypeId: string; count: number }[],
    defenderUnits: { unitTypeId: string; count: number }[],
    totals: import('../engine/combatPreviewOdds').PreviewCombatTotals,
  ): BattlePreviewStats {
    const attackerUnitCount = attackerUnits.reduce((sum, unit) => sum + unit.count, 0);
    const defenderUnitCount = defenderUnits.reduce((sum, unit) => sum + unit.count, 0);
    const attackPower = totals.effectiveAttackPower;
    const defensePower = totals.engageableDefensePower > 0
      ? totals.engageableDefensePower
      : totals.rawDefensePower;
    const effectiveDefense = totals.effectiveDefensePower;
    const diceSides = this.state.rules.diceSides ?? 6;

    const odds = estimateVictoryChance(
      attackPower,
      effectiveDefense,
      attackerUnitCount,
      defenderUnitCount,
      totals.expectedPreCombatDefenderHits,
      totals.expectedPreCombatAttackerHits,
      diceSides,
    );
    const expectedAttackerHits = attackPower / diceSides + totals.expectedPreCombatDefenderHits;
    const expectedDefenderHits = effectiveDefense / diceSides + totals.expectedPreCombatAttackerHits;

    let riskLabel = 'Balanced fight';
    let riskClass: BattlePreviewStats['riskClass'] = 'even';
    let riskDetail = 'Expect a contested battle. Reinforcements or flanking can make this safer.';

    if (defenderUnitCount === 0) {
      riskLabel = 'Unopposed capture';
      riskClass = 'good';
      riskDetail = 'No defenders are present. This should resolve as an immediate capture.';
    } else if (odds >= 0.85) {
      riskLabel = 'Overwhelming attack';
      riskClass = 'good';
      riskDetail = 'Your force has a large power advantage and should win reliably.';
    } else if (odds >= 0.65) {
      riskLabel = 'Favorable attack';
      riskClass = 'good';
      riskDetail = 'You have the edge, though losses are still possible.';
    } else if (odds < 0.35) {
      riskLabel = 'High-risk attack';
      riskClass = 'bad';
      riskDetail = 'Defenders are favored. Add units or choose another target.';
    } else if (odds < 0.5) {
      riskLabel = 'Risky attack';
      riskClass = 'bad';
      riskDetail = 'You are attacking at a disadvantage and should expect casualties.';
    }

    if (expectedDefenderHits > expectedAttackerHits + 0.75 && defenderUnitCount > 0) {
      riskDetail += ' The first round is likely to hurt.';
      if (riskClass === 'even') riskClass = 'bad';
    }

    const likelyAttackerLosses = Math.min(attackerUnitCount, Math.max(0, Math.round(expectedDefenderHits)));
    const likelyDefenderLosses = Math.min(defenderUnitCount, Math.max(0, Math.round(expectedAttackerHits)));
    const commitmentAdvice = riskClass === 'good'
      ? `Commit if the follow-up hold is covered. First round: lose ~${likelyAttackerLosses}, destroy ~${likelyDefenderLosses}.`
      : riskClass === 'bad'
        ? `Avoid unless the target is decisive or reinforced. First round: lose ~${likelyAttackerLosses}, destroy ~${likelyDefenderLosses}.`
        : `Caution: this can trade either way. First round: lose ~${likelyAttackerLosses}, destroy ~${likelyDefenderLosses}.`;

    const swingFactors: string[] = [...totals.modifierSwingFactors];
    if (defenderUnitCount === 0) swingFactors.push('No defenders');
    if (effectiveDefense > defensePower && !swingFactors.some(f => f.startsWith('Terrain/fort'))) {
      swingFactors.push(`Defense bonus +${effectiveDefense - defensePower}`);
    }
    if (expectedAttackerHits >= defenderUnitCount && defenderUnitCount > 0) swingFactors.push('Possible one-round clear');
    if (expectedDefenderHits >= attackerUnitCount && attackerUnitCount > 0) swingFactors.push('Attack force could be wiped');
    if (attackPower >= effectiveDefense * 2 && defenderUnitCount > 0) swingFactors.push('Power advantage');
    if (attackPower < effectiveDefense && defenderUnitCount > 0) swingFactors.push('Power disadvantage');

    return {
      attackPower,
      defensePower,
      effectiveDefense,
      attackerUnitCount,
      defenderUnitCount,
      odds,
      expectedAttackerHits,
      expectedDefenderHits,
      riskLabel,
      riskClass,
      riskDetail,
      commitmentAdvice,
      swingFactors,
    };
  }

  /** @deprecated Use estimateVictoryChance — kept for tests that pass raw power pairs. */
  calculateBattleOdds(attackPower: number, defensePower: number): number {
    return estimateVictoryChance(attackPower, defensePower, 1, defensePower > 0 ? 1 : 0, 0, 0);
  }

  confirmAttackFromPreview(autoResolve = false, tactical = false): void {
    if (!this.pendingAttackFrom || !this.pendingAttackTarget) return;

    const fromTerritory = this.state.territories.get(this.pendingAttackFrom);
    const toTerritory = this.state.territories.get(this.pendingAttackTarget);
    const faction = this.state.getCurrentFaction();

    if (!fromTerritory || !toTerritory || !faction) {
      this.closeBattlePreview();
      return;
    }

    // Read unit counts from the inline steppers in the preview panel
    const attackerUnitsEl = document.getElementById('preview-attacker-units');
    const attackingUnits: { unitTypeId: string; count: number; veteranCount?: number }[] = [];
    for (const pu of fromTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType && unitType.attack > 0) {
        if (this.callbacks.getSelectedUnitType?.() && pu.unitTypeId !== this.callbacks.getSelectedUnitType?.()) continue;
        const availableCount = fromTerritory.getAvailableUnitCount(pu.unitTypeId);
        if (availableCount <= 0) continue;
        const input = attackerUnitsEl?.querySelector<HTMLInputElement>(`input[data-unit-type-id="${pu.unitTypeId}"]`);
        const count = input
          ? Math.max(0, Math.min(availableCount, Math.floor(Number(input.value) || 0)))
          : availableCount;
        if (count > 0) {
          attackingUnits.push({ unitTypeId: pu.unitTypeId, count, veteranCount: pu.veteranCount ?? 0 });
        }
      }
    }

    if (attackingUnits.length === 0) {
      this.closeBattlePreview();
      this.callbacks.showToast('No units can attack!', 'info');
      return;
    }

    const defendingFactionId = toTerritory.owner;
    const hasDefenders = defendingFactionId
      ? countTerritoryDefendersIncludingOffshore(this.state, toTerritory.id, defendingFactionId) > 0
      : false;

    if (!hasDefenders) {
      this.closeBattlePreview();
      const movementValidator = new MovementValidator(this.state);
      const stayInPlace = attackingUnits.every(au => {
        const ut = this.state.unitRegistry.get(au.unitTypeId);
        return ut && movementValidator.isRangedStrike(fromTerritory, toTerritory, ut);
      });
      if (stayInPlace) {
        for (const au of attackingUnits) {
          fromTerritory.markUnitsActed(au.unitTypeId, au.count);
        }
        this.callbacks.showToast(`Barrage on ${toTerritory.name} complete.`, 'success');
      } else {
        for (const au of attackingUnits) {
          fromTerritory.removeUnits(au.unitTypeId, au.count);
        }
        toTerritory.owner = faction.id;
        toTerritory.units = [];
        for (const au of attackingUnits) {
          toTerritory.addUnits(au.unitTypeId, au.count);
          toTerritory.markUnitsActed(au.unitTypeId, au.count);
        }
        this.callbacks.showToast(`Captured ${toTerritory.name}!`, 'success');
        soundManager.play('capture');
        battleLog.logCapture(this.state.turnNumber, faction.name, faction.color, toTerritory.name);
      }
      this.renderer.render();
      this.callbacks.renderMinimap();
      this.callbacks.afterUnitAction?.(fromTerritory.id, toTerritory.id);
      return;
    }

    const movementValidator = new MovementValidator(this.state);
    const stayInPlace = attackingUnits.every(au => {
      const ut = this.state.unitRegistry.get(au.unitTypeId);
      return ut && movementValidator.isRangedStrike(fromTerritory, toTerritory, ut);
    });

    const combat = this.combatResolver.initiateCombat(
      toTerritory.id,
      faction.id,
      attackingUnits,
      fromTerritory.id,
      { stayInPlace },
    );

    if (!combat) {
      this.closeBattlePreview();
      this.callbacks.showToast('Cannot initiate combat!', 'info');
      return;
    }

    this.runPreCombatPhases(combat, toTerritory.id);

    if (tactical) {
      this.lastCombatWasTactical = true;
      this.detachPreviewKeyboard();
      this.activeCombat = combat;
      this.closeBattlePreview();
      const attackerFaction = this.state.factionRegistry.get(combat.attackingFactionId);
      battleLog.logCombat(this.state.turnNumber, attackerFaction?.name ?? faction.name, attackerFaction?.color ?? faction.color, `Tactical battle at ${toTerritory.name}`);
      this.tacticalBattleUI.show(
        combat,
        toTerritory.name,
        toTerritory.type,
        (completedCombat, meta) => {
          this.activeCombat = completedCombat;
          this.pendingTacticalMeta = meta ?? null;
          this.finishCurrentCombat();
        },
        () => {
          this.lastCombatWasTactical = false;
          this.activeCombat = combat;
          this.onAutoResolve();
          this.onCloseCombat();
        },
      );
      return;
    }

    this.showCombatModal(combat);
    soundManager.play('combat_start');
    battleLog.logCombat(this.state.turnNumber, faction.name, faction.color, `Attacking ${toTerritory.name}`);

    if (autoResolve) {
      this.onAutoResolve();
      this.onCloseCombat();
      return;
    }

    this.renderer.render();
    this.callbacks.updateSelectionInfo();
  }

  confirmTacticalAttackFromPreview(): void {
    if (!(settings.getSetting('tacticalBattles') ?? true)) return;
    this.confirmAttackFromPreview(false, true);
  }

  closeBattlePreview(): void {
    this.detachPreviewKeyboard();
    const modal = document.getElementById('combat-modal');
    if (modal) modal.classList.add('hidden');
    this.pendingAttackFrom = null;
    this.pendingAttackTarget = null;
  }

  // ==================== STRATEGIC BOMBING ====================

  /** Split bombers evenly across factory targets (remainder to first targets). */
  static allocateBombersAcrossTargets(totalBombers: number, targetCount: number): number[] {
    if (targetCount <= 0) return [];
    const base = Math.floor(totalBombers / targetCount);
    const remainder = totalBombers % targetCount;
    return Array.from({ length: targetCount }, (_, i) => base + (i < remainder ? 1 : 0));
  }

  private countAvailableBombers(factionId: string): number {
    let total = 0;
    for (const t of this.state.territories.values()) {
      if (t.owner !== factionId) continue;
      for (const u of t.units) {
        const type = this.state.unitRegistry.get(u.unitTypeId);
        if (type?.canStrategicBomb || type?.id.includes('bomber') || type?.id.includes('strategic')) {
          total += u.count;
        }
      }
    }
    return total;
  }

  private countAntiAirInTerritory(territoryId: string): number {
    const territory = this.state.territories.get(territoryId);
    if (!territory) return 0;
    return territory.units.reduce((sum, u) => {
      const id = this.state.unitRegistry.get(u.unitTypeId)?.id ?? '';
      return id.includes('aa') || id.includes('anti_air') ? sum + u.count : sum;
    }, 0);
  }

  /** Bomb every eligible enemy factory in one action — no target selection needed. */
  executeStrategicBombing(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const totalBombers = this.countAvailableBombers(faction.id);
    if (totalBombers === 0) {
      this.callbacks.showToast('No bombers available for strategic bombing.', 'info');
      return;
    }

    const targets = Array.from(this.state.territories.values()).filter(t =>
      t.owner && faction.isEnemyOf(t.owner) && t.hasFactory && !t.isFactoryDisabled(this.state.turnNumber)
    );

    if (targets.length === 0) {
      this.callbacks.showToast('No enemy factories available to bomb.', 'info');
      return;
    }

    const allocations = CombatUI.allocateBombersAcrossTargets(totalBombers, targets.length);
    let totalDamage = 0;
    let totalLosses = 0;
    let factoriesHit = 0;

    for (let i = 0; i < targets.length; i++) {
      const bombers = allocations[i];
      if (bombers <= 0) continue;

      const target = targets[i];
      const aaCount = this.countAntiAirInTerritory(target.id);
      const result = this.combatResolver.resolveStrategicBombing(target.id, faction.id, bombers, aaCount);

      totalDamage += result.totalDamage;
      totalLosses += result.bomberLosses;
      if (result.totalDamage > 0) factoriesHit++;

      battleLog.logCombat(
        this.state.turnNumber,
        faction.name,
        faction.color,
        `💣 Strategic bombing of ${target.name}: ${result.totalDamage} damage, ${result.bomberLosses} bombers lost.`
      );
    }

    const summary = factoriesHit > 0
      ? `💣 Bombed ${factoriesHit} factor${factoriesHit === 1 ? 'y' : 'ies'} for ${totalDamage} total damage (${totalLosses} bomber${totalLosses === 1 ? '' : 's'} lost).`
      : `💣 Bombing run complete — ${totalLosses} bomber${totalLosses === 1 ? '' : 's'} lost, no factory damage.`;

    this.callbacks.showToast(summary, totalDamage > 0 ? 'success' : 'info');
    this.renderer.render();
    this.callbacks.updateActionButtons();
  }

  /** @deprecated Use executeStrategicBombing — kept for legacy callers. */
  showStrategicBombingModal(): void {
    this.executeStrategicBombing();
  }
}
