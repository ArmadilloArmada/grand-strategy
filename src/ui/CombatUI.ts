/**
 * CombatUI - Combat modal, battle preview, and attack resolution UI
 */

import { GameState } from '../engine/GameState';
import { CombatResolver, CombatState } from '../engine/CombatResolver';
import { MapRenderer } from '../renderer/MapRenderer';
import { soundManager } from '../audio/SoundManager';
import { battleLog } from './BattleLog';
import { UNIT_ICONS } from './hudConstants';
import { GameAction } from '../network/NetworkManager';

export interface CombatCallbacks {
  showToast(msg: string, type: 'success' | 'info' | 'error'): void;
  sendAction(action: GameAction): void;
  renderMinimap(): void;
  updateFactionPanel(): void;
  updateSelectionInfo(): void;
  updateActionButtons(): void;
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
    const modal = document.getElementById('combat-modal');
    if (modal) modal.classList.remove('hidden');

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
      const makePips = (count: number) => Array.from({ length: count }, () => `<span class="dice-pip rolling">?</span>`).join('');
      atkGroup.innerHTML = makePips(atkCount);
      defGroup.innerHTML = makePips(defCount);
      diceRow.classList.remove('hidden');
    }

    soundManager.play('dice_roll');

    setTimeout(() => {
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
      }

      if (result.attackerHits > 0 || result.defenderHits > 0) {
        soundManager.play('hit');
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
      this.callbacks.sendAction({
        type: 'combat_result',
        fromId: combat.sourceTerritory ?? '',
        toId: combat.territoryId,
        attackerLosses,
        defenderLosses,
        captured: combat.winner === 'attacker',
        newOwner: targetTerritory?.owner ?? null,
      });

      if (combat.winner === 'attacker') {
        this.callbacks.showToast(`Victory! Captured ${targetTerritory?.name}!`, 'success');
        soundManager.play('capture');
      } else if (combat.winner === 'defender') {
        this.callbacks.showToast(`Attack failed. ${targetTerritory?.name} holds!`, 'info');
      } else {
        this.callbacks.showToast('Both sides destroyed!', 'info');
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
      this.activeCombat = combat;
      this.showCombatModal(combat);
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

    const modal = document.getElementById('battle-preview-modal');
    if (modal) modal.classList.remove('hidden');

    const territoryEl = document.getElementById('preview-territory');
    let territoryLabel = `Attack on ${toTerritory.name}`;
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      territoryLabel += ' ⚠️ +1 Defense Bonus';
    }
    if (territoryEl) territoryEl.textContent = territoryLabel;

    let artilleryCount = 0;
    let infantryCount = 0;
    for (const pu of fromTerritory.units) {
      if (pu.unitTypeId === 'artillery') artilleryCount += pu.count;
      if (pu.unitTypeId === 'infantry') infantryCount += pu.count;
    }

    const attackerUnitsEl = document.getElementById('preview-attacker-units');
    let attackPower = 0;
    let attackerHtml = '';
    for (const pu of fromTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType && unitType.attack > 0) {
        const icon = UNIT_ICONS[pu.unitTypeId] || '⬜';
        attackerHtml += `<div>${icon} ${pu.count}× ${unitType.name} <small style="color:#666">(Atk:${unitType.attack} Move:${unitType.movement})</small></div>`;
        attackPower += pu.count * unitType.attack;
      }
    }
    const boostedInfantry = Math.min(artilleryCount, infantryCount);
    if (boostedInfantry > 0) {
      attackerHtml += `<div style="color:#059669;margin-top:0.5rem"><small>🎯 Artillery boosts ${boostedInfantry} infantry (+${boostedInfantry} attack)</small></div>`;
      attackPower += boostedInfantry;
    }
    if (attackerUnitsEl) attackerUnitsEl.innerHTML = attackerHtml || '<em>No units</em>';

    const attackPowerEl = document.getElementById('preview-attacker-power');
    if (attackPowerEl) attackPowerEl.textContent = `Attack Power: ${attackPower}`;

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

    const defensePowerEl = document.getElementById('preview-defender-power');
    if (defensePowerEl) defensePowerEl.textContent = `Defense Power: ${defensePower}`;

    let effectiveDefense = defensePower;
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      const defenderUnitCount = toTerritory.units.reduce((sum, u) => sum + u.count, 0);
      effectiveDefense += defenderUnitCount;
    }
    const odds = this.calculateBattleOdds(attackPower, effectiveDefense);
    const oddsEl = document.getElementById('odds-display');
    if (oddsEl) {
      oddsEl.textContent = `~${Math.round(odds * 100)}%`;
      oddsEl.className = odds >= 0.65 ? 'good' : odds >= 0.4 ? 'even' : 'bad';
    }
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

    this.closeBattlePreview();

    const attackingUnits: { unitTypeId: string; count: number; veteranCount?: number }[] = [];
    for (const pu of fromTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType && unitType.attack > 0) {
        attackingUnits.push({ unitTypeId: pu.unitTypeId, count: pu.count, veteranCount: pu.veteranCount ?? 0 });
      }
    }

    if (attackingUnits.length === 0) {
      this.callbacks.showToast('No units can attack!', 'info');
      return;
    }

    const defendingUnits: { unitTypeId: string; count: number }[] = [];
    for (const pu of toTerritory.units) {
      defendingUnits.push({ unitTypeId: pu.unitTypeId, count: pu.count });
    }

    if (defendingUnits.length === 0) {
      for (const au of attackingUnits) {
        fromTerritory.removeUnits(au.unitTypeId, au.count);
        toTerritory.addUnits(au.unitTypeId, au.count);
      }
      toTerritory.owner = faction.id;
      this.callbacks.showToast(`Captured ${toTerritory.name}!`, 'success');
      soundManager.play('capture');
      battleLog.logCapture(this.state.turnNumber, faction.name, faction.color, toTerritory.name);
      this.renderer.render();
      this.callbacks.renderMinimap();
      return;
    }

    const savedFrom = this.pendingAttackFrom;
    const combat = this.combatResolver.initiateCombat(
      toTerritory.id,
      faction.id,
      attackingUnits
    );

    if (!combat) {
      this.callbacks.showToast('Cannot initiate combat!', 'info');
      return;
    }

    combat.sourceTerritory = savedFrom;
    this.showCombatModal(combat);
    soundManager.play('combat_start');
    battleLog.logCombat(this.state.turnNumber, faction.name, faction.color, `Attacking ${toTerritory.name}`);

    this.renderer.render();
    this.callbacks.updateSelectionInfo();
  }

  closeBattlePreview(): void {
    const modal = document.getElementById('battle-preview-modal');
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
