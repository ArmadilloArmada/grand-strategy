/**
 * CombatUI - Combat modal, battle preview, and attack resolution UI
 */

import { GameState } from '../engine/GameState';
import { CombatResolver, CombatState } from '../engine/CombatResolver';
import { MapRenderer } from '../renderer/MapRenderer';
import { soundManager } from '../audio/SoundManager';
import { battleLog } from './BattleLog';
import { UNIT_ICONS } from './hudConstants';
import { generateBattleNarrative } from '../engine/BattleNarrator';
import { settings } from './Settings';

export interface CombatCallbacks {
  showToast(msg: string, type: 'success' | 'info' | 'error'): void;
  renderMinimap(): void;
  updateFactionPanel(): void;
  updateSelectionInfo(): void;
  updateActionButtons(): void;
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

    for (const adjId of combatTerritory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (adj?.owner === this.activeCombat.attackingFactionId) {
        this.combatResolver.processRetreat(this.activeCombat, adjId);
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
    if (this.activeCombat) {
      const combat = this.activeCombat;
      const sourceTerritory = combat.sourceTerritory ? this.state.territories.get(combat.sourceTerritory) : null;
      const targetTerritory = this.state.territories.get(combat.territoryId);

      if (sourceTerritory) {
        for (const cu of combat.attackers) {
          sourceTerritory.removeUnits(cu.unitType.id, cu.count);
        }
      }

      this.combatResolver.finalizeCombat(combat);

      const attackerLosses: Record<string, number> = {};
      for (const cu of combat.attackers) {
        if (cu.casualties > 0) attackerLosses[cu.unitType.id] = (attackerLosses[cu.unitType.id] ?? 0) + cu.casualties;
      }
      const defenderLosses: Record<string, number> = {};
      for (const cu of combat.defenders) {
        if (cu.casualties > 0) defenderLosses[cu.unitType.id] = (defenderLosses[cu.unitType.id] ?? 0) + cu.casualties;
      }

      if (combat.winner === 'attacker') {
        this.callbacks.showToast(`Victory! Captured ${targetTerritory?.name}!`, 'success');
        soundManager.play('capture');
      } else if (combat.winner === 'defender') {
        this.callbacks.showToast(`Attack failed. ${targetTerritory?.name} holds!`, 'info');
      } else {
        this.callbacks.showToast('Both sides destroyed!', 'info');
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
    this.startNextCombat();
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

    if (!territory.owner || territory.getTotalUnitCount() === 0) {
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

    const combat = this.combatResolver.initiateCombat(
      territoryId,
      this.state.currentFactionId,
      attackingUnits
    );

    if (combat) {
      // Flanking: attackers from more than one source territory get +1 attack
      const distinctSources = new Set(attackingMoves.map(m => m.fromTerritoryId));
      if (distinctSources.size > 1) combat.flankingBonus = 1;

      // Air superiority: defending fighters intercept attacking air units pre-combat
      const interceptResult = this.combatResolver.performFighterIntercept(combat);
      if (interceptResult.hits > 0) {
        const faction = this.state.getCurrentFaction();
        if (faction) {
          battleLog.logCombat(
            this.state.turnNumber, faction.name, faction.color,
            `✈️ Air intercept: ${interceptResult.hits} hit(s) on attacking air units`
          );
        }
      }

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

  showBattlePreview(fromId: string, toId: string): void {
    this.pendingAttackFrom = fromId;
    this.pendingAttackTarget = toId;

    const fromTerritory = this.state.territories.get(fromId);
    const toTerritory = this.state.territories.get(toId);
    if (!fromTerritory || !toTerritory) return;

    // Open combined modal in preview phase
    const modal = document.getElementById('combat-modal');
    if (modal) {
      modal.classList.remove('hidden');
      document.getElementById('combat-phase-battle')?.classList.add('hidden');
      document.getElementById('combat-phase-preview')?.classList.remove('hidden');
      const title = document.getElementById('combat-modal-title');
      if (title) title.textContent = '⚔️ Battle Preview';
    }

    const territoryEl = document.getElementById('preview-territory');
    let territoryLabel = `Attack on ${toTerritory.name}`;
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      territoryLabel += ' ⚠️ +1 Defense Bonus';
    }
    if (territoryEl) territoryEl.textContent = territoryLabel;

    let artilleryCount = 0;
    let infantryCount = 0;
    const attackerUnitsEl = document.getElementById('preview-attacker-units');
    let attackPower = 0;
    let attackerHtml = '';
    const readyAttackers: { unitTypeId: string; count: number }[] = [];
    for (const pu of fromTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType && unitType.attack > 0) {
        const readyCount = fromTerritory.getAvailableUnitCount(pu.unitTypeId);
        if (readyCount <= 0) continue;
        readyAttackers.push({ unitTypeId: pu.unitTypeId, count: readyCount });
        if (pu.unitTypeId === 'artillery') artilleryCount += readyCount;
        if (pu.unitTypeId === 'infantry') infantryCount += readyCount;
        const icon = UNIT_ICONS[pu.unitTypeId] || '⬜';
        const actedCount = pu.count - readyCount;
        const actedText = actedCount > 0 ? ` <small class="preview-muted">(${actedCount} acted)</small>` : '';
        attackerHtml += `
          <div class="unit-select-row">
            <span>${icon} ${unitType.name}${actedText} <small style="color:#666">(Atk:${unitType.attack})</small></span>
            <div class="unit-stepper">
              <button type="button" class="stepper-dec" data-uid="${pu.unitTypeId}">−</button>
              <input type="number" class="unit-count-input" data-unit-type-id="${pu.unitTypeId}"
                value="${readyCount}" min="0" max="${readyCount}" style="width:3rem;text-align:center;">
              <button type="button" class="stepper-inc" data-uid="${pu.unitTypeId}" data-max="${readyCount}">+</button>
            </div>
          </div>`;
        attackPower += readyCount * unitType.attack;
      }
    }
    const boostedInfantry = Math.min(artilleryCount, infantryCount);
    if (boostedInfantry > 0) {
      attackerHtml += `<div style="color:#059669;margin-top:0.5rem"><small>🎯 Artillery boosts ${boostedInfantry} infantry (+${boostedInfantry} attack)</small></div>`;
      attackPower += boostedInfantry;
    }
    if (attackerUnitsEl) {
      attackerUnitsEl.innerHTML = attackerHtml || '<em>No units</em>';
      // Wire stepper buttons
      attackerUnitsEl.querySelectorAll<HTMLButtonElement>('.stepper-dec').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = attackerUnitsEl.querySelector<HTMLInputElement>(`input[data-unit-type-id="${btn.dataset.uid}"]`);
          if (input) input.value = String(Math.max(0, Number(input.value) - 1));
        });
      });
      attackerUnitsEl.querySelectorAll<HTMLButtonElement>('.stepper-inc').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = attackerUnitsEl.querySelector<HTMLInputElement>(`input[data-unit-type-id="${btn.dataset.uid}"]`);
          if (input) input.value = String(Math.min(Number(btn.dataset.max ?? 99), Number(input.value) + 1));
        });
      });
    }

    const defenderUnitsEl = document.getElementById('preview-defender-units');
    let defensePower = 0;
    let defenderHtml = '';
    for (const pu of toTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType) {
        const icon = UNIT_ICONS[pu.unitTypeId] || '⬜';
        defenderHtml += `<div>${icon} ${pu.count}× ${unitType.name} <small style="color:#666">(Def:${unitType.defense})</small></div>`;
        defensePower += pu.count * unitType.defense;
      }
    }
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      defenderHtml += `<div style="color:#dc2626;margin-top:0.5rem"><small>🏰 Terrain bonus: +1 defense first round</small></div>`;
    }
    if (defenderUnitsEl) defenderUnitsEl.innerHTML = defenderHtml || '<em>Undefended!</em>';

    let effectiveDefense = defensePower;
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      const defenderUnitCount = toTerritory.units.reduce((sum, u) => sum + u.count, 0);
      effectiveDefense += defenderUnitCount;
    }

    const previewStats = this.calculateBattlePreviewStats(readyAttackers, toTerritory.units, attackPower, defensePower, effectiveDefense);
    const attackPowerEl = document.getElementById('preview-attacker-power');
    if (attackPowerEl) {
      attackPowerEl.innerHTML = `Attack Power: ${previewStats.attackPower}<br><small>Expected hits: ${previewStats.expectedAttackerHits.toFixed(1)}</small>`;
    }

    const defensePowerEl = document.getElementById('preview-defender-power');
    if (defensePowerEl) {
      const bonusText = previewStats.effectiveDefense > previewStats.defensePower
        ? ` <small>(effective ${previewStats.effectiveDefense})</small>` : '';
      defensePowerEl.innerHTML = `Defense Power: ${previewStats.defensePower}${bonusText}<br><small>Expected hits: ${previewStats.expectedDefenderHits.toFixed(1)}</small>`;
    }

    const oddsEl = document.getElementById('odds-display');
    if (oddsEl) {
      oddsEl.textContent = `~${Math.round(previewStats.odds * 100)}%`;
      oddsEl.className = previewStats.riskClass;
    }

    const summaryEl = document.getElementById('preview-risk-summary');
    if (summaryEl) {
      summaryEl.className = `preview-risk-summary ${previewStats.riskClass}`;
      summaryEl.innerHTML = `
        <strong>${previewStats.riskLabel}</strong>
        <span>${previewStats.riskDetail}</span>
        <small>${previewStats.commitmentAdvice}</small>
      `;
    }

    let consequenceEl = document.getElementById('preview-consequence-summary');
    if (!consequenceEl) {
      consequenceEl = document.createElement('div');
      consequenceEl.id = 'preview-consequence-summary';
      summaryEl?.after(consequenceEl);
    }
    consequenceEl.className = `preview-consequence-summary ${previewStats.riskClass}`;
    consequenceEl.innerHTML = this.buildBattleConsequenceSummary(fromId, toId, previewStats);

    let factorsEl = document.getElementById('preview-swing-factors');
    if (!factorsEl) {
      factorsEl = document.createElement('div');
      factorsEl.id = 'preview-swing-factors';
      consequenceEl.after(factorsEl);
    }
    factorsEl.className = 'preview-swing-factors';
    factorsEl.innerHTML = previewStats.swingFactors.length > 0
      ? previewStats.swingFactors.map(factor => `<span>${factor}</span>`).join('')
      : '<span>No special modifiers spotted.</span>';
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
      ? `Warning: this commits most of ${from.name} while ${sourceEnemyPressure} enemy unit${sourceEnemyPressure === 1 ? '' : 's'} can pressure it.`
      : `Commitment: ${sourceUnitsAfterCommit} unit${sourceUnitsAfterCommit === 1 ? '' : 's'} remain in ${from.name}.`;

    const tempo = stats.odds >= 0.65
      ? 'Likely creates momentum if you can hold it next turn.'
      : stats.odds < 0.5
        ? 'A failed attack may leave your border thin.'
        : 'Expect a trade unless reinforced.';

    return `
      <strong>Strategic consequence</strong>
      <span>Stake: ${stakes.join(', ') || `+${targetValue} strategic value`}.</span>
      <span>Likely first round: lose ~${likelyAttackerLosses}, destroy ~${likelyDefenderLosses}. ${tempo}</span>
      <span>${commitment}</span>
    `;
  }

  calculateBattlePreviewStats(
    attackerUnits: { unitTypeId: string; count: number }[],
    defenderUnits: { unitTypeId: string; count: number }[],
    attackPower: number,
    defensePower: number,
    effectiveDefense: number
  ): BattlePreviewStats {
    const attackerUnitCount = attackerUnits.reduce((sum, unit) => sum + unit.count, 0);
    const defenderUnitCount = defenderUnits.reduce((sum, unit) => sum + unit.count, 0);
    const odds = this.calculateBattleOdds(attackPower, effectiveDefense);
    const expectedAttackerHits = attackPower / 6;
    const expectedDefenderHits = effectiveDefense / 6;

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

    const swingFactors: string[] = [];
    if (defenderUnitCount === 0) swingFactors.push('No defenders');
    if (effectiveDefense > defensePower) swingFactors.push(`Defense bonus +${effectiveDefense - defensePower}`);
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

  calculateBattleOdds(attackPower: number, defensePower: number): number {
    if (defensePower === 0) return 0.95;
    const ratio = attackPower / defensePower;
    if (ratio >= 3) return 0.95;
    if (ratio >= 2) return 0.85;
    if (ratio >= 1.5) return 0.70;
    if (ratio >= 1) return 0.50;
    if (ratio >= 0.75) return 0.35;
    if (ratio >= 0.5) return 0.20;
    return 0.10;
  }

  confirmAttackFromPreview(): void {
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

    const defendingUnits: { unitTypeId: string; count: number }[] = [];
    for (const pu of toTerritory.units) {
      defendingUnits.push({ unitTypeId: pu.unitTypeId, count: pu.count });
    }

    if (defendingUnits.length === 0) {
      this.closeBattlePreview();
      for (const au of attackingUnits) {
        fromTerritory.removeUnits(au.unitTypeId, au.count);
      }
      toTerritory.owner = faction.id;
      toTerritory.units = [];
      for (const au of attackingUnits) {
        toTerritory.addUnits(au.unitTypeId, au.count);
      }
      this.callbacks.showToast(`Captured ${toTerritory.name}!`, 'success');
      soundManager.play('capture');
      battleLog.logCapture(this.state.turnNumber, faction.name, faction.color, toTerritory.name);
      this.renderer.render();
      this.callbacks.renderMinimap();
      return;
    }

    const combat = this.combatResolver.initiateCombat(
      toTerritory.id,
      faction.id,
      attackingUnits
    );

    if (!combat) {
      this.closeBattlePreview();
      this.callbacks.showToast('Cannot initiate combat!', 'info');
      return;
    }

    combat.sourceTerritory = fromTerritory.id;
    this.showCombatModal(combat);
    soundManager.play('combat_start');
    battleLog.logCombat(this.state.turnNumber, faction.name, faction.color, `Attacking ${toTerritory.name}`);

    this.renderer.render();
    this.callbacks.updateSelectionInfo();
  }

  closeBattlePreview(): void {
    const modal = document.getElementById('combat-modal');
    if (modal) modal.classList.add('hidden');
    this.pendingAttackFrom = null;
    this.pendingAttackTarget = null;
  }

  // ==================== STRATEGIC BOMBING ====================

  /** Show the strategic bombing dialog if the current faction has bombers. */
  showStrategicBombingModal(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    // Count bombers in all owned territories
    let totalBombers = 0;
    for (const t of this.state.territories.values()) {
      if (t.owner !== faction.id) continue;
      for (const u of t.units) {
        const type = this.state.unitRegistry.get(u.unitTypeId);
        if (type?.id.includes('bomber') || type?.id.includes('strategic')) {
          totalBombers += u.count;
        }
      }
    }

    if (totalBombers === 0) {
      this.callbacks.showToast('No bombers available for strategic bombing.', 'info');
      return;
    }

    // Build target list: enemy territories with factories
    const targets = Array.from(this.state.territories.values()).filter(t =>
      t.owner && faction.isEnemyOf(t.owner) && t.hasFactory && !t.isFactoryDisabled(this.state.turnNumber)
    );

    if (targets.length === 0) {
      this.callbacks.showToast('No enemy factories available to bomb.', 'info');
      return;
    }

    const modal = document.getElementById('strategic-bombing-modal');
    const select = document.getElementById('sb-target-select') as HTMLSelectElement | null;
    const infoEl = document.getElementById('sb-bomber-info');
    const resultEl = document.getElementById('sb-result');

    if (!modal || !select) return;

    select.innerHTML = targets.map(t =>
      `<option value="${t.id}">${t.name} (${this.state.factionRegistry.get(t.owner ?? '')?.name ?? 'Unknown'})</option>`
    ).join('');

    if (infoEl) infoEl.textContent = `You have ${totalBombers} bomber(s) available. Each rolls 1d6 damage. AA guns intercept on a roll of 1.`;
    if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

    modal.classList.remove('hidden');

    const launchBtn = document.getElementById('btn-sb-launch');
    const cancelBtn = document.getElementById('btn-sb-cancel');

    const handleLaunch = () => {
      const targetId = select.value;
      const targetTerritory = this.state.territories.get(targetId);
      if (!targetTerritory) return;

      // Count AA guns in target territory
      const aaCount = targetTerritory.units
        .filter(u => this.state.unitRegistry.get(u.unitTypeId)?.id.includes('aa') ||
                     this.state.unitRegistry.get(u.unitTypeId)?.id.includes('anti_air'))
        .reduce((s, u) => s + u.count, 0);

      const result = this.combatResolver.resolveStrategicBombing(targetId, faction.id, totalBombers, aaCount);

      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = result.totalDamage > 0
          ? `<strong style="color:#ef4444;">💥 Factory hit!</strong><br>
             Bombers: ${totalBombers - result.bomberLosses}/${totalBombers} survived.<br>
             Damage rolls: [${result.damageRolls.join(', ')}] = <strong>${result.totalDamage}</strong> damage.<br>
             Factory disabled for ${Math.max(1, Math.floor(result.totalDamage / 3))} turn(s).`
          : `<strong style="color:#888;">Mission failed — all bombers intercepted (${result.bomberLosses} lost).</strong>`;
      }

      launchBtn?.removeEventListener('click', handleLaunch);
      launchBtn!.textContent = 'Done';
      launchBtn!.onclick = () => { modal.classList.add('hidden'); launchBtn!.textContent = '🚀 Launch Mission'; launchBtn!.onclick = null; };

      battleLog.logCombat(
        this.state.turnNumber,
        faction.name,
        faction.color,
        `💣 Strategic bombing of ${targetTerritory.name}: ${result.totalDamage} damage, ${result.bomberLosses} bombers lost.`
      );

      this.renderer.render();
    };

    launchBtn?.removeEventListener('click', handleLaunch);
    launchBtn?.addEventListener('click', handleLaunch);
    cancelBtn!.onclick = () => modal.classList.add('hidden');
  }
}
