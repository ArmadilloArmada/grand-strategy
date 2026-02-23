/**
 * HUD - Heads-up display controller
 * Handles all UI updates and interactions
 */

import { GameState } from '../engine/GameState';
import { TurnManager } from '../engine/TurnManager';
import { MovementValidator, ValidMove } from '../engine/MovementValidator';
import { ProductionManager } from '../engine/ProductionManager';
import { MobilizationSystem, MobilizationOption } from '../engine/MobilizationSystem';
import { CombatResolver, CombatState } from '../engine/CombatResolver';
import { MapRenderer } from '../renderer/MapRenderer';
import { soundManager } from '../audio/SoundManager';
import { battleLog } from './BattleLog';
import { visualEffects } from './VisualEffects';
import { achievementManager, Achievement } from '../engine/AchievementManager';
import { GameConfig, defaultConfig, checkVictory, TurnStyle, TURN_STYLE_INFO, UnitEra, UNIT_ERA_INFO, VictoryType } from '../engine/GameConfig';
import { getPhaseDisplayName as getPhaseDisplayNameFromStyle } from '../engine/TurnStyleManager';
import { TechnologyManager, TECHNOLOGIES } from '../engine/TechnologyManager';
import { statisticsManager } from '../engine/StatisticsManager';
import { turnLog } from '../engine/TurnLog';
import { recordGameEnd, getPersistentStats } from '../engine/PersistentStats';
import { getMapList } from '../data/mapRegistry';
import { settings } from './Settings';

// Unit icons for display
const UNIT_ICONS: Record<string, string> = {
  infantry: '🚶',
  mech_infantry: '🏃',
  tank: '🛡️',
  artillery: '💥',
  anti_air: '🎯',
  fighter: '✈️',
  bomber: '🛩️',
  battleship: '🚢',
  carrier: '🛳️',
  cruiser: '⛵',
  destroyer: '🚤',
  submarine: '🐋',
  transport: '📦',
};

export class HUD {
  private movementValidator: MovementValidator;
  private productionManager: ProductionManager;
  private mobilizationSystem: MobilizationSystem;
  private combatResolver: CombatResolver;
  private technologyManager: TechnologyManager;
  
  // Current UI state
  private selectedUnitType: string | null = null;
  private validMoves: ValidMove[] = [];
  private activeCombat: CombatState | null = null;
  private pendingCombats: string[] = []; // Queue of territory IDs with pending combat
  private tutorialStep: number = 0;
  private tutorialShown: boolean = false;
  
  // Undo system
  private moveHistory: { type: 'move' | 'queue'; data: any }[] = [];
  private phaseSnapshots: string[] = []; // JSON snapshots for phase-level undo
  
  // Mini-map
  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  
  // Pending attack for preview
  private pendingAttackTarget: string | null = null;
  private pendingAttackFrom: string | null = null;
  
  // Faction panel collapsed state
  private factionPanelCollapsed: boolean = false;

  // Minimap threat overlay mode
  private minimapThreatMode: boolean = false;
  
  // Game configuration
  public gameConfig: GameConfig = { ...defaultConfig };
  
  // Hot seat mode
  private showingHotSeatBanner: boolean = false;

  // Phase recap: counts for current phase (battles, territories captured)
  private battlesThisPhase: number = 0;
  private territoriesCapturedThisPhase: number = 0;

  // Map overlay: off | range (movement/attack from selected) | threat (enemies that can reach selected)
  private overlayMode: 'off' | 'range' | 'threat' = 'off';
  
  // Event announcement dismiss timer
  private eventDismissTimer: ReturnType<typeof setTimeout> | null = null;
  // Pending diplomacy proposal for the toast
  private pendingProposal: { fromId: string; toId: string; duration: number } | null = null;

  // First-time tips system
  private shownTips: Set<string> = new Set(JSON.parse(localStorage.getItem('shownTips') || '[]'));

  // Event emitter for main game (gameStarted, autoSave, gameOver)
  public events: { on: (name: string, cb: (data?: unknown) => void) => void; emit: (name: string, data?: unknown) => void } = (() => {
    const map = new Map<string, ((data?: unknown) => void)[]>();
    return {
      on(name: string, cb: (data?: unknown) => void) {
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(cb);
      },
      emit(name: string, data?: unknown) {
        map.get(name)?.forEach((cb) => cb(data));
      },
    };
  })();

  constructor(
    private state: GameState,
    private turnManager: TurnManager,
    private renderer: MapRenderer
  ) {
    this.movementValidator = new MovementValidator(state);
    this.productionManager = new ProductionManager(state);
    this.mobilizationSystem = new MobilizationSystem(state);
    this.combatResolver = new CombatResolver(state);
    this.technologyManager = new TechnologyManager(state);

    this.setupEventListeners();
    this.subscribeToGameEvents();
    
    // Check if tutorial has been seen
    this.tutorialShown = localStorage.getItem('tutorial-seen') === 'true';
    
    // Initialize statistics for all factions
    for (const faction of state.factionRegistry.getAll()) {
      statisticsManager.initFaction(faction.id);
      this.technologyManager.initFaction(faction.id);
    }
    
    // Setup achievement unlock callback
    achievementManager.onUnlock((achievement) => this.showAchievementPopup(achievement));
  }
  
  /**
   * Show achievement popup when unlocked
   */
  private showAchievementPopup(achievement: Achievement): void {
    const popup = document.createElement('div');
    popup.className = 'achievement-popup';
    popup.innerHTML = `
      <div class="achievement-icon">${achievement.icon}</div>
      <h3>Achievement Unlocked!</h3>
      <p><strong>${achievement.name}</strong></p>
      <p>${achievement.description}</p>
    `;
    document.body.appendChild(popup);
    
    // Play sound
    soundManager.play('victory');
    
    // Visual celebration
    visualEffects.confetti(window.innerWidth / 2, window.innerHeight * 0.3, 40);
    
    // Remove after animation
    setTimeout(() => popup.remove(), 4000);
  }

  /**
   * Setup DOM event listeners
   */
  private setupEventListeners(): void {
    // Action buttons
    document.getElementById('btn-move')?.addEventListener('click', () => this.onMoveClick());
    document.getElementById('btn-attack')?.addEventListener('click', () => this.onAttackClick());
    document.getElementById('btn-build')?.addEventListener('click', () => this.onBuildClick());
    document.getElementById('btn-end-phase')?.addEventListener('click', () => this.onEndPhaseClick());

    // Help button
    document.getElementById('help-button')?.addEventListener('click', () => this.showTutorial());

    // Tutorial navigation
    document.getElementById('btn-tutorial-next')?.addEventListener('click', () => this.nextTutorialStep());
    document.getElementById('btn-tutorial-prev')?.addEventListener('click', () => this.prevTutorialStep());
    document.getElementById('btn-skip-tutorial')?.addEventListener('click', () => this.closeTutorial());

    // Combat modal buttons
    document.getElementById('btn-roll-combat')?.addEventListener('click', () => this.onRollCombat());
    document.getElementById('btn-auto-resolve')?.addEventListener('click', () => this.onAutoResolve());
    document.getElementById('btn-retreat')?.addEventListener('click', () => this.onRetreat());
    document.getElementById('btn-close-combat')?.addEventListener('click', () => this.onCloseCombat());

    // Build modal buttons (mobilization system - no confirm/queue buttons)
    document.getElementById('btn-cancel-build')?.addEventListener('click', () => this.closeBuildModal());

    // Deployment modal buttons
    document.getElementById('btn-confirm-deploy')?.addEventListener('click', () => this.onConfirmDeploy());
    document.getElementById('btn-auto-deploy')?.addEventListener('click', () => this.onAutoDeploy());
    document.getElementById('btn-skip-deploy')?.addEventListener('click', () => this.closeDeploymentModal());
    document.getElementById('btn-clear-deploy')?.addEventListener('click', () => this.onClearDeploy());

    // Technology modal
    document.getElementById('btn-research')?.addEventListener('click', () => this.showTechModal());
    document.getElementById('btn-close-tech')?.addEventListener('click', () => this.closeTechModal());

    // Diplomacy modal
    document.getElementById('btn-diplomacy')?.addEventListener('click', () => this.showDiplomacyModal());
    document.getElementById('btn-close-diplomacy')?.addEventListener('click', () => {
      document.getElementById('diplomacy-modal')?.classList.add('hidden');
    });

    // Expose proposeDiplomaticPact for inline onclick in diplomacy modal
    (window as any).__hudInstance = this;

    // Fog of war toggle
    document.getElementById('btn-fog-toggle')?.addEventListener('click', () => this.toggleFogOfWar());

    // Statistics modal
    document.getElementById('btn-stats')?.addEventListener('click', () => this.showStatsModal());
    document.getElementById('btn-close-stats')?.addEventListener('click', () => this.closeStatsModal());
    document.getElementById('btn-export-turn-log')?.addEventListener('click', () => {
      const text = turnLog.exportText();
      if (text) {
        navigator.clipboard.writeText(text).then(() => this.showToast('Turn log copied to clipboard', 'success'));
      }
    });

    // Undo button
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undoLastAction());

    // Zoom controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.renderer.zoom(1.2));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.renderer.zoom(0.8));
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.renderer.fitToScreen());
    document.getElementById('btn-overlay')?.addEventListener('click', () => this.cycleOverlay());

    // Faction panel toggle
    document.getElementById('faction-panel-header')?.addEventListener('click', () => this.toggleFactionPanel());
    document.getElementById('btn-toggle-factions')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFactionPanel();
    });

    // Battle preview buttons
    document.getElementById('btn-confirm-attack')?.addEventListener('click', () => this.confirmAttackFromPreview());
    document.getElementById('btn-cancel-attack')?.addEventListener('click', () => this.closeBattlePreview());

    // Mini-map setup
    this.setupMinimap();

    // Territory hover tooltip
    this.setupTerritoryTooltip();

    // New game modal handlers
    document.getElementById('game-mode')?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value;
      const hotseatOptions = document.getElementById('hotseat-options');
      const vsAiOptions = document.getElementById('vs-ai-options');
      if (hotseatOptions) hotseatOptions.classList.toggle('hidden', mode !== 'hotseat');
      if (vsAiOptions) vsAiOptions.classList.toggle('hidden', mode !== 'vs-ai');
    });

    // Turn style description updater
    document.getElementById('turn-style')?.addEventListener('change', (e) => {
      const style = (e.target as HTMLSelectElement).value as TurnStyle;
      const descEl = document.getElementById('turn-style-description');
      if (descEl && TURN_STYLE_INFO[style]) {
        descEl.textContent = TURN_STYLE_INFO[style].description;
      }
    });

    // Unit era description update
    document.getElementById('unit-era')?.addEventListener('change', (e) => {
      const era = (e.target as HTMLSelectElement).value as UnitEra;
      const descEl = document.getElementById('unit-era-description');
      if (descEl && UNIT_ERA_INFO[era]) {
        descEl.textContent = UNIT_ERA_INFO[era].description;
      }
    });

    // Victory type: show/hide custom fields
    const updateVictoryRows = () => {
      const v = (document.getElementById('victory-type') as HTMLSelectElement)?.value || 'capitals';
      document.getElementById('victory-capitals-row')?.classList.toggle('hidden', v !== 'capitals');
      document.getElementById('victory-domination-row')?.classList.toggle('hidden', v !== 'domination');
      document.getElementById('victory-economic-row')?.classList.toggle('hidden', v !== 'economic');
    };
    document.getElementById('victory-type')?.addEventListener('change', updateVictoryRows);

    document.getElementById('btn-start-game')?.addEventListener('click', () => this.onStartNewGame());
    document.getElementById('btn-cancel-new-game')?.addEventListener('click', () => this.hideNewGameModal());
  }

  /**
   * Setup territory hover tooltip
   */
  private setupTerritoryTooltip(): void {
    this.renderer.setTerritoryHoverCallback((territoryId, clientX, clientY) => {
      const el = document.getElementById('territory-tooltip');
      const content = document.getElementById('territory-tooltip-content');
      if (!el || !content) return;
      if (!territoryId) {
        el.classList.add('hidden');
        return;
      }
      const territory = this.state.territories.get(territoryId);
      if (!territory) {
        el.classList.add('hidden');
        return;
      }
      
      const owner = territory.owner ? this.state.factionRegistry.get(territory.owner)?.name : 'Neutral';
      const unitCount = territory.getTotalUnitCount();
      const badges: string[] = [];
      if (territory.isCapital) badges.push('⭐ Capital');
      if (territory.hasFactory) badges.push('🏭 Factory');
      
      // Check if we're in build phase and this is our territory
      const phase = this.state.currentPhase;
      const faction = this.state.getCurrentFaction();
      const isBuildPhase = ['purchase', 'production', 'build'].includes(phase);
      const isOwnTerritory = faction && territory.owner === faction.id && territory.type !== 'sea';
      
      let mobilizationInfo = '';
      if (isBuildPhase && isOwnTerritory && faction?.controlledBy === 'human') {
        const option = this.mobilizationSystem.getTerritoryMobilization(territory);
        const wasMobilized = this.mobilizationSystem.wasMobilized(territoryId);
        
        if (wasMobilized) {
          mobilizationInfo = `<div style="margin-top: 0.5rem; padding: 0.4rem; background: rgba(26,122,92,0.1); border-radius: 4px; color: #1a7a5c;">
            ✓ Mobilized this turn
          </div>`;
        } else {
          const unitsStr = option.units.map(u => {
            const icon = UNIT_ICONS[u.unitTypeId] || '⬜';
            return `${icon}×${u.count}`;
          }).join(' ');
          
          const canAfford = option.canMobilize;
          const bgColor = canAfford ? 'rgba(184,134,11,0.12)' : 'rgba(0,0,0,0.06)';
          const textColor = canAfford ? '#6b4f10' : '#888';
          
          mobilizationInfo = `<div style="margin-top: 0.5rem; padding: 0.4rem; background: ${bgColor}; border-radius: 4px;">
            <div style="color: ${textColor}; font-weight: bold;">
              ${canAfford ? '🖱️ Click to Mobilize' : '❌ ' + option.reason}
            </div>
            <div style="font-size: 0.85rem; margin-top: 0.25rem;">
              Cost: <strong style="color: #8b6914;">${option.cost} IPCs</strong><br>
              Spawns: ${unitsStr}
            </div>
          </div>`;
        }
      }
      
      // Build per-type unit breakdown
      const unitBreakdown = territory.units.length > 0
        ? territory.units.map(u => {
            const icon = UNIT_ICONS[u.unitTypeId] || '⬜';
            const name = this.state.unitRegistry.get(u.unitTypeId)?.name ?? u.unitTypeId;
            return `<span style="white-space:nowrap">${icon} ${u.count}× ${name}</span>`;
          }).join('&nbsp;&nbsp;')
        : 'None';

      content.innerHTML = `
        <strong>${territory.name}</strong><br>
        Owner: ${owner}<br>
        IPC value: ${territory.production}<br>
        Units (${unitCount}): ${unitBreakdown}
        ${badges.length ? '<br>' + badges.join(' • ') : ''}
        ${mobilizationInfo}
      `;
      el.style.left = `${clientX + 15}px`;
      el.style.top = `${clientY + 15}px`;
      el.classList.remove('hidden');
    });
  }

  /**
   * Subscribe to game state events
   */
  private subscribeToGameEvents(): void {
    this.state.on('turn_start', () => {
      this.updateTurnInfo();
      // Reset mobilization tracking for new turn
      this.mobilizationSystem.resetForNewTurn();
    });
    this.state.on('phase_start', () => this.onPhaseStart());
    this.state.on('phase_end', (e: { type: string; data: unknown; timestamp: number }) => this.onPhaseEnd(e));
    this.state.on('territory_selected', (e) => this.onTerritorySelected(e.data as { territoryId: string | null; previousTerritoryId?: string | null }));
    this.state.on('victory', (e) => this.showVictoryScreen(e.data as { winner: string }));
    this.state.on('ai_thinking', (e) => {
      const data = e.data as { message?: string; action?: string; territory?: string };
      if (data.message) {
        this.updateAIActivityBanner(data.message);
      }
    });
    this.state.on('combat_end', (e) => this.onCombatEnd(e));
    this.state.on('game_event', (e) => {
      const d = e.data as { event: { name: string; description: string; type: string }; factionId: string };
      this.showEventAnnouncement(d.event, d.factionId);
    });
    this.state.on('diplomacy_proposal', (e) => {
      const d = e.data as { fromId: string; toId: string; duration: number };
      this.showDiplomacyProposalToast(d.fromId, d.toId, d.duration);
    });

    this.state.on('units_produced', (e) => {
      const data = e.data as { factionId: string; placedCount: number };
      statisticsManager.trackUnitProduced(data.factionId, data.placedCount);
      const producingFaction = this.state.factionRegistry.get(data.factionId);
      if (producingFaction?.controlledBy === 'human') {
        achievementManager.updateProgress('produce_units', data.placedCount);
      }
    });

    this.state.on('income_collected', (e) => {
      const data = e.data as { factionId: string; amount: number };
      statisticsManager.trackIncome(data.factionId, data.amount);
      this.showIncomeNotification(data);
    });
  }

  /**
   * Handle combat end - visual effects and achievements
   */
  private onCombatEnd(e: { type: string; data: unknown }): void {
    const data = e.data as { 
      combat?: { 
        winner: string; 
        territoryId: string;
        attackingFactionId: string;
        defendingFactionId: string;
        rounds: Array<{ attackerCriticals: number; defenderCriticals: number }>;
        attackers: Array<{ count: number; casualties: number }>;
        defenders: Array<{ count: number; casualties: number }>;
      }; 
      retreated?: boolean 
    };
    this.battlesThisPhase++;

    const combat = data.combat;
    if (!combat) return;

    const territory = this.state.territories.get(combat.territoryId);
    const faction = this.state.getCurrentFaction();
    const humanFactions = this.state.factionRegistry.getAll().filter(f => f.controlledBy === 'human');
    const humanIds = new Set(humanFactions.map(f => f.id));
    const isPlayerAttacker = humanIds.has(combat.attackingFactionId);
    const isPlayerDefender = humanIds.has(combat.defendingFactionId);

    // AI turn visualization: notify player of AI battles involving their territories
    if (faction?.controlledBy === 'ai') {
      const attackerFaction = this.state.factionRegistry.get(combat.attackingFactionId);
      const tName = territory?.name ?? combat.territoryId;
      const outcomeStr = combat.winner === 'attacker' ? 'captured' : 'repelled';
      if (isPlayerDefender) {
        this.showToast(`⚠️ ${attackerFaction?.name ?? 'AI'} attacked ${tName} — ${outcomeStr}!`, 'info');
        this.renderer.centerOnTerritory(combat.territoryId);
        this.flashTerritory(combat.territoryId, combat.winner === 'attacker' ? '#ef4444' : '#22c55e');
      } else if (!isPlayerAttacker) {
        // AI vs AI — subtle notification
        this.showToast(`🤖 ${attackerFaction?.name ?? 'AI'} ${outcomeStr} ${tName}`, 'info');
      }
    }
    
    // Get screen position for effects (center of screen as fallback)
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Calculate casualties for achievements
    const attackerLosses = combat.attackers.reduce((sum, u) => sum + u.casualties, 0);
    const defenderLosses = combat.defenders.reduce((sum, u) => sum + u.casualties, 0);

    // Track casualties in StatisticsManager for all factions
    statisticsManager.trackUnitKilled(combat.attackingFactionId, defenderLosses);
    statisticsManager.trackUnitLost(combat.attackingFactionId, attackerLosses);
    statisticsManager.trackUnitKilled(combat.defendingFactionId, attackerLosses);
    statisticsManager.trackUnitLost(combat.defendingFactionId, defenderLosses);

    if (combat.winner === 'attacker' && !data.retreated) {
      this.territoriesCapturedThisPhase++;
      statisticsManager.trackBattleWon(combat.attackingFactionId);
      statisticsManager.trackBattleLost(combat.defendingFactionId);
      statisticsManager.trackTerritoryCaptured(combat.attackingFactionId);
      statisticsManager.trackTerritoryLost(combat.defendingFactionId);

      // Visual effects for capture
      const isCapital = territory?.isCapital;
      const attackerFaction = this.state.factionRegistry.get(combat.attackingFactionId);

      if (isPlayerAttacker) {
        // Player captured territory!
        const captureColor = isCapital ? '#ffd700' : (attackerFaction?.color || '#22c55e');
        if (isCapital) {
          visualEffects.capitalCapture(centerX, centerY, captureColor);
        } else {
          visualEffects.captureEffect(centerX, centerY, captureColor);
        }
        this.flashTerritory(combat.territoryId, captureColor);
        achievementManager.updateProgress('capture_territories', 1);
        achievementManager.updateProgress('destroy_units', defenderLosses);
        this.showBattleResultCard(combat, attackerLosses, defenderLosses, 'victory');
      } else if (isPlayerDefender) {
        // Player lost territory
        visualEffects.explosion(centerX, centerY, 1.2);
        this.flashTerritory(combat.territoryId, '#ef4444');
        this.showBattleResultCard(combat, attackerLosses, defenderLosses, 'defeat');
      }
    } else if (combat.winner === 'defender') {
      statisticsManager.trackBattleWon(combat.defendingFactionId);
      statisticsManager.trackBattleLost(combat.attackingFactionId);

      if (isPlayerDefender) {
        // Player successfully defended!
        visualEffects.confetti(centerX, centerY, 30);
        achievementManager.updateProgress('destroy_units', attackerLosses);
        this.showBattleResultCard(combat, attackerLosses, defenderLosses, 'held');
      } else if (isPlayerAttacker) {
        // Player's attack was repelled
        visualEffects.explosion(centerX, centerY, 0.8);
        this.showBattleResultCard(combat, attackerLosses, defenderLosses, 'repelled');
      }
    }
  }

  /**
   * Show a brief battle result breakdown card
   */
  private showBattleResultCard(
    combat: { territoryId: string; attackingFactionId: string; defendingFactionId: string; rounds: Array<{ attackerCriticals: number; defenderCriticals: number }>; attackers: Array<{ count: number; casualties: number }>; defenders: Array<{ count: number; casualties: number }> },
    attackerLosses: number,
    defenderLosses: number,
    outcome: 'victory' | 'defeat' | 'held' | 'repelled'
  ): void {
    document.getElementById('battle-result-card')?.remove();
    const territory = this.state.territories.get(combat.territoryId);
    const tName = territory?.name ?? combat.territoryId;

    const icons: Record<string, string> = { victory: '🏆', defeat: '💀', held: '🛡️', repelled: '↩️' };
    const labels: Record<string, string> = {
      victory: 'Territory Captured',
      defeat: 'Territory Lost',
      held: 'Defence Held',
      repelled: 'Attack Repelled',
    };
    const colors: Record<string, string> = { victory: '#22c55e', defeat: '#ef4444', held: '#60a5fa', repelled: '#f97316' };

    const card = document.createElement('div');
    card.id = 'battle-result-card';
    card.className = 'battle-result-card';
    card.style.setProperty('--result-color', colors[outcome]);
    card.innerHTML = `
      <div class="brc-header">
        <span class="brc-icon">${icons[outcome]}</span>
        <div>
          <div class="brc-title">${labels[outcome]}</div>
          <div class="brc-territory">${tName}</div>
        </div>
      </div>
      <div class="brc-body">
        <div class="brc-side">
          <div class="brc-side-label">Attacker</div>
          <div class="brc-losses" title="Losses">💀 ${attackerLosses} lost</div>
        </div>
        <div class="brc-vs">VS</div>
        <div class="brc-side">
          <div class="brc-side-label">Defender</div>
          <div class="brc-losses" title="Losses">💀 ${defenderLosses} lost</div>
        </div>
      </div>
      <div class="brc-rounds">${combat.rounds.length} round${combat.rounds.length !== 1 ? 's' : ''} · click to dismiss</div>`;
    card.addEventListener('click', () => card.remove());
    document.body.appendChild(card);
    setTimeout(() => card?.remove(), 6000);
  }

  private onPhaseEnd(e: { type: string; data: unknown; timestamp: number }): void {
    const data = e.data as { phase: string; factionId: string };
    const phaseName = getPhaseDisplayNameFromStyle(data.phase, this.gameConfig.turnStyle);
    const faction = this.state.getCurrentFaction();
    let summary = `${phaseName} complete`;
    if (this.battlesThisPhase > 0 || this.territoriesCapturedThisPhase > 0) {
      const parts: string[] = [];
      if (this.battlesThisPhase > 0) parts.push(`${this.battlesThisPhase} battle${this.battlesThisPhase !== 1 ? 's' : ''}`);
      if (this.territoriesCapturedThisPhase > 0) parts.push(`${this.territoriesCapturedThisPhase} territor${this.territoriesCapturedThisPhase !== 1 ? 'ies' : 'y'} captured`);
      summary += ` · ${parts.join(', ')}`;
    }
    turnLog.log(this.state.turnNumber, data.phase, data.factionId, summary);
    if (faction?.controlledBy === 'human') {
      soundManager.play('phase_end');
      // Show rich recap if anything happened; otherwise just toast
      if (this.battlesThisPhase > 0 || this.territoriesCapturedThisPhase > 0) {
        this.showPhaseRecap(phaseName);
      } else {
        this.showToast(summary, 'info');
      }
    }
  }

  /**
   * Toggle the keyboard shortcut cheat-sheet overlay
   */
  toggleShortcutSheet(): void {
    const existing = document.getElementById('shortcut-sheet');
    if (existing) { existing.remove(); return; }

    const shortcuts = [
      ['↵ / Space', 'End phase / End turn'],
      ['B', 'Open build / mobilize menu'],
      ['A', 'Resolve combat (combat phase)'],
      ['H', 'Open tutorial / help'],
      ['F', 'Fit map to screen'],
      ['C', 'Center on your capital'],
      ['O', 'Cycle map overlay (range / threat)'],
      ['Tab', 'Select next owned territory'],
      ['Shift+Tab', 'Select previous territory'],
      ['Ctrl+S', 'Quick save'],
      ['Ctrl+L', 'Quick load'],
      ['Esc', 'Deselect / close modal / game menu'],
      ['?', 'Show this cheat-sheet'],
    ];

    const sheet = document.createElement('div');
    sheet.id = 'shortcut-sheet';
    sheet.className = 'shortcut-sheet';
    sheet.innerHTML = `
      <div class="ss-header">
        <span>⌨️ Keyboard Shortcuts</span>
        <button class="ss-close" title="Close">✕</button>
      </div>
      <div class="ss-grid">
        ${shortcuts.map(([key, desc]) =>
          `<kbd class="ss-key">${key}</kbd><span class="ss-desc">${desc}</span>`
        ).join('')}
      </div>`;
    sheet.querySelector('.ss-close')?.addEventListener('click', () => sheet.remove());
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.remove(); });
    document.body.appendChild(sheet);
  }

  /**
   * Briefly flash a colored overlay over the map canvas to draw attention to an event
   */
  private flashTerritory(_territoryId: string, color: string): void {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:8000;border:3px solid ${color};border-radius:4px;animation:territoryFlash 0.9s ease-out forwards;`;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 950);
  }

  /**
   * Show a brief, auto-dismissing phase recap card
   */
  private showPhaseRecap(phaseName: string): void {
    document.getElementById('phase-recap-card')?.remove();

    const faction = this.state.getCurrentFaction();
    const factionStats = faction ? statisticsManager.getFactionStats(faction.id) : null;

    const rows: string[] = [];
    if (this.battlesThisPhase > 0)
      rows.push(`<div class="recap-row"><span>⚔️ Battles fought</span><span class="recap-val">${this.battlesThisPhase}</span></div>`);
    if (this.territoriesCapturedThisPhase > 0)
      rows.push(`<div class="recap-row"><span>🏴 Territories captured</span><span class="recap-val">${this.territoriesCapturedThisPhase}</span></div>`);
    if (factionStats && factionStats.unitsLost > 0)
      rows.push(`<div class="recap-row"><span>💀 Units lost this game</span><span class="recap-val">${factionStats.unitsLost}</span></div>`);

    const card = document.createElement('div');
    card.id = 'phase-recap-card';
    card.className = 'phase-recap-card';
    card.innerHTML = `
      <div class="recap-header">${phaseName} · Complete</div>
      ${rows.join('')}
      <div class="recap-dismiss">Click to dismiss</div>`;
    card.addEventListener('click', () => card.remove());
    document.body.appendChild(card);
    setTimeout(() => card?.remove(), 5000);
  }

  /**
   * Handle phase start - save snapshot for undo, reset phase recap counters
   */
  private onPhaseStart(): void {
    this.battlesThisPhase = 0;
    this.territoriesCapturedThisPhase = 0;
    // Save snapshot for phase-level undo (only for human turns)
    const faction = this.state.getCurrentFaction();
    if (faction?.controlledBy === 'human') {
      const snapshot = this.state.saveToJSON();
      this.phaseSnapshots.push(snapshot);
      // Keep only last 5 snapshots to save memory
      if (this.phaseSnapshots.length > 5) {
        this.phaseSnapshots.shift();
      }
    }
    this.updatePhaseInfo();
    this.updateUndoButton();
    
    // Update mobilization highlights for build phase
    const phase = this.state.currentPhase;
    const isBuildPhase = ['purchase', 'production', 'build'].includes(phase);
    if (isBuildPhase && faction?.controlledBy === 'human') {
      this.updateMobilizationHighlights();
    } else {
      this.renderer.clearMobilizationTargets();
    }
    
    // Check if phase should be auto-skipped (nothing to do)
    if (faction?.controlledBy === 'human') {
      this.checkAutoSkipPhase(phase, faction);
    }
  }
  
  /**
   * Check if the current phase should be auto-skipped (nothing to do)
   */
  private checkAutoSkipPhase(phase: string, faction: ReturnType<typeof this.state.getCurrentFaction>): void {
    if (!faction) return;
    
    let shouldSkip = false;
    let skipReason = '';
    
    // Check different phases
    if (['combat', 'resolve'].includes(phase)) {
      // Auto-skip combat phase if no battles pending
      if (this.state.pendingMoves.length === 0) {
        shouldSkip = true;
        skipReason = 'No battles to resolve';
      }
    } else if (phase === 'noncombat_move') {
      // Auto-skip if no units can move
      const hasMovableUnits = Array.from(this.state.territories.values()).some(t => {
        if (t.owner !== faction.id) return false;
        return t.units.some(pu => t.getAvailableUnitCount(pu.unitTypeId) > 0);
      });
      if (!hasMovableUnits) {
        shouldSkip = true;
        skipReason = 'No units available to move';
      }
    }
    
    if (shouldSkip) {
      // Show brief notification and auto-advance
      this.showToast(`⏭️ ${skipReason} - Skipping phase`, 'info');
      setTimeout(() => {
        this.turnManager.advancePhase();
      }, 800);
    }
  }

  /**
   * Update mobilization highlights on the map
   */
  private updateMobilizationHighlights(): void {
    const options = this.mobilizationSystem.getMobilizationOptions();
    const canMobilize: string[] = [];
    const alreadyMobilized: string[] = [];
    
    for (const option of options) {
      if (this.mobilizationSystem.wasMobilized(option.territory.id)) {
        alreadyMobilized.push(option.territory.id);
      } else if (option.canMobilize) {
        canMobilize.push(option.territory.id);
      }
    }
    
    this.renderer.setMobilizationTargets(canMobilize, alreadyMobilized);
  }

  /**
   * Handle territory selection - THIS IS KEY FOR MOVEMENT AND MOBILIZATION
   */
  private onTerritorySelected(data: { territoryId: string | null; previousTerritoryId?: string | null }): void {
    const { territoryId, previousTerritoryId } = data;
    this.updateSelectionInfo();

    if (!territoryId) return;

    const phase = this.state.currentPhase;
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const territory = this.state.territories.get(territoryId);
    if (!territory) return;

    // Handle placement mode (placing purchased units)
    if (this.isPlacementMode) {
      this.handlePlacementClick(territoryId);
      return;
    }

    // Handle Build phase - click on your territory to mobilize directly (no modal needed!)
    const isBuildPhase = ['purchase', 'production', 'build'].includes(phase);
    if (isBuildPhase && territory.owner === faction.id && faction.controlledBy === 'human' && territory.type !== 'sea') {
      this.handleMapMobilization(territoryId);
      return;
    }

    // Check if clicking on a valid move target
    // Handle all movement-capable phases across different turn styles
    const isMovementPhase = ['combat_move', 'noncombat_move', 'move', 'orders', 'action'].includes(phase);
    
    if (isMovementPhase) {
      // PREVENT double-click on same territory
      if (previousTerritoryId === territoryId) {
        // Clicking same territory again - just refresh selection, don't move
        this.updateValidMoves();
        return;
      }
      
      // If we had a previous selection with valid moves, check if clicked territory is a valid target
      if (this.validMoves.length > 0 && previousTerritoryId) {
        const validMove = this.validMoves.find(m => m.territoryId === territoryId);
        
        if (validMove) {
          if (validMove.isAttack) {
            // ATTACK - Show battle preview, then immediate combat
            this.showBattlePreview(previousTerritoryId, territoryId);
          } else {
            // Regular move - execute immediately
            this.executePlayerMove(previousTerritoryId, territoryId, false);
          }
          return;
        }
      }
    }

    // Update valid moves for newly selected territory
    this.updateValidMoves();
  }

  /**
   * Handle click during placement mode (legacy - redirects to deployment modal)
   */
  private handlePlacementClick(_territoryId: string): void {
    // Legacy placement mode is replaced by Strategic Reserve + Deployment modal
    // This just exits placement mode and shows the new modal
    this.isPlacementMode = false;
    this.unitsToPlace = [];
    this.showDeploymentModal();
  }

  /**
   * Highlight owned territories during placement (stub for compatibility)
   * @internal Used by legacy placement system
   */
  public highlightOwnedTerritories(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;
    
    const ownedIds: string[] = [];
    for (const [id, territory] of this.state.territories) {
      if (territory.owner === faction.id) {
        ownedIds.push(id);
      }
    }
    
    this.renderer.setValidMoveTargets(ownedIds, []);
  }

  /**
   * Execute a player's unit movement - SIMPLIFIED
   * Units can only move/attack once per turn
   */
  private executePlayerMove(fromId: string, toId: string, _isAttack: boolean): void {
    // Prevent moving to same territory
    if (fromId === toId) {
      console.log('Cannot move to same territory');
      return;
    }

    const fromTerritory = this.state.territories.get(fromId);
    const toTerritory = this.state.territories.get(toId);
    const faction = this.state.getCurrentFaction();

    if (!fromTerritory || !toTerritory || !faction) {
      console.log('Invalid territories or faction');
      return;
    }
    if (fromTerritory.owner !== faction.id) {
      console.log('You do not own the source territory');
      return;
    }

    // Collect only units that CAN move (haven't acted yet this turn)
    const unitsToMove: { unitTypeId: string; count: number }[] = [];
    
    for (const pu of fromTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (!unitType) continue;
      if (!unitType.canEnter(toTerritory.type)) continue;
      
      // Only count units that haven't moved this turn
      const availableCount = fromTerritory.getAvailableUnitCount(pu.unitTypeId);
      if (availableCount <= 0) continue;
      
      unitsToMove.push({ unitTypeId: pu.unitTypeId, count: availableCount });
    }

    if (unitsToMove.length === 0) {
      this.showToast('No available units can move there! (Units can only act once per turn)', 'info');
      return;
    }

    // Capture neutral/unowned territory when moving in
    const wasNeutral = !toTerritory.owner;
    if (!toTerritory.owner) {
      toTerritory.owner = faction.id;
    }

    // SIMPLE: Move units from source to destination
    let totalMoved = 0;
    for (const unit of unitsToMove) {
      console.log(`Moving ${unit.count} ${unit.unitTypeId} from ${fromId} to ${toId}`);
      fromTerritory.removeUnits(unit.unitTypeId, unit.count);
      toTerritory.addUnits(unit.unitTypeId, unit.count);

      // Mark units as having acted (in the destination territory)
      toTerritory.markUnitsActed(unit.unitTypeId, unit.count);

      totalMoved += unit.count;
    }

    // Show feedback
    if (wasNeutral) {
      this.showToast(`Captured ${toTerritory.name} with ${totalMoved} units!`, 'success');
      soundManager.play('capture');
    } else {
      this.showToast(`Moved ${totalMoved} units to ${toTerritory.name}`, 'success');
      soundManager.play('move');
    }

    // Track for undo
    this.moveHistory.push({
      type: 'move',
      data: { from: fromId, to: toId, units: unitsToMove }
    });

    // Update display
    this.renderer.render();
    this.renderMinimap();
    this.renderer.clearValidMoveTargets();
    this.validMoves = [];
    this.state.selectedTerritoryId = null;
    this.updateSelectionInfo();
    this.updateActionButtons();
    this.updateUndoButton();
  }

  /**
   * Initialize the HUD (call after game loads)
   */
  init(): void {
    this.closeTutorial();
  }

  /**
   * Show tutorial modal
   */
  showTutorial(): void {
    if (this.tutorialShown) {
      // User has seen tutorial before; still show on ? click
    }
    this.tutorialStep = 0;
    this.updateTutorialDisplay();
    const modal = document.getElementById('tutorial-modal');
    if (modal) modal.classList.remove('hidden');
  }

  /**
   * Close tutorial modal
   */
  closeTutorial(): void {
    const modal = document.getElementById('tutorial-modal');
    if (modal) modal.classList.add('hidden');
    localStorage.setItem('tutorial-seen', 'true');
    this.tutorialShown = true;
  }

  /**
   * Go to next tutorial step
   */
  private nextTutorialStep(): void {
    const steps = document.querySelectorAll('.tutorial-step');
    if (this.tutorialStep < steps.length - 1) {
      this.tutorialStep++;
      this.updateTutorialDisplay();
    } else {
      this.closeTutorial();
      this.showToast('Good luck, Commander! 🎖️', 'success');
    }
  }

  /**
   * Go to previous tutorial step
   */
  private prevTutorialStep(): void {
    if (this.tutorialStep > 0) {
      this.tutorialStep--;
      this.updateTutorialDisplay();
    }
  }

  /**
   * Update tutorial display
   */
  private updateTutorialDisplay(): void {
    const steps = document.querySelectorAll('.tutorial-step');
    const dots = document.querySelectorAll('.tutorial-dot');
    const prevBtn = document.getElementById('btn-tutorial-prev') as HTMLButtonElement;
    const nextBtn = document.getElementById('btn-tutorial-next') as HTMLButtonElement;

    steps.forEach((step, i) => {
      step.classList.toggle('active', i === this.tutorialStep);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === this.tutorialStep);
    });

    if (prevBtn) prevBtn.disabled = this.tutorialStep === 0;
    if (nextBtn) {
      nextBtn.textContent = this.tutorialStep === steps.length - 1 ? 'Start Playing! 🎮' : 'Next →';
    }
  }

  /**
   * Show toast notification
   */
  showToast(message: string, type: 'info' | 'success' = 'info'): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
  
  /**
   * Update AI activity banner
   */
  private updateAIActivityBanner(message: string): void {
    let banner = document.getElementById('ai-activity-banner');
    
    if (!banner) {
      // Create the banner if it doesn't exist
      banner = document.createElement('div');
      banner.id = 'ai-activity-banner';
      banner.className = 'ai-activity-banner';
      document.body.appendChild(banner);
    }
    
    const faction = this.state.getCurrentFaction();
    const factionColor = faction?.color || '#888';
    
    banner.innerHTML = `
      <div class="ai-activity-content">
        <span class="ai-activity-icon" style="color: ${factionColor};">🤖</span>
        <span class="ai-activity-text">${message}</span>
        <span class="ai-activity-spinner"></span>
      </div>
    `;
    
    banner.classList.add('visible');
    
    // Auto-hide after a delay
    setTimeout(() => {
      banner?.classList.remove('visible');
    }, 1500);
  }
  
  /**
   * Hide AI activity banner
   */
  hideAIActivityBanner(): void {
    const banner = document.getElementById('ai-activity-banner');
    if (banner) banner.classList.remove('visible');
  }
  
  /**
   * Show a first-time tip (only once per tip ID)
   */
  showFirstTimeTip(tipId: string, message: string): void {
    if (this.shownTips.has(tipId)) return;
    
    this.shownTips.add(tipId);
    localStorage.setItem('shownTips', JSON.stringify([...this.shownTips]));
    
    // Show tip with distinct styling
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast tip';
    toast.innerHTML = `<span style="color:#fbbf24;margin-right:0.5rem;">💡 Tip:</span>${message}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, 5000); // Tips stay longer
  }

  /**
   * Update turn info display
   */
  updateTurnInfo(): void {
    const faction = this.state.getCurrentFaction();
    const turnEl = document.getElementById('turn-number');
    const factionEl = document.getElementById('current-faction');
    const ipcEl = document.getElementById('ipc-display');
    const indicatorEl = document.getElementById('turn-indicator');

    if (turnEl) turnEl.textContent = `Round ${this.state.turnNumber}`;
    if (factionEl && faction) {
      factionEl.textContent = faction.name;
      factionEl.style.color = faction.colorLight || faction.color;
    }
    if (ipcEl && faction) {
      const income = this.state.getTerritoriesOwnedBy(faction.id)
        .filter(t => t.isLand())
        .reduce((sum, t) => sum + (t.production ?? 0), 0);
      ipcEl.innerHTML = `<span class="ipc-treasury">${faction.ipcs}</span>\u00a0IPCs<span class="ipc-rate"> +${income}/turn</span>`;
    }

    // Update turn indicator - shows if it's your turn or AI is playing
    if (indicatorEl && faction) {
      if (faction.controlledBy === 'human') {
        indicatorEl.textContent = '🎮 YOUR TURN';
        // Re-trigger CSS animation via reflow
        indicatorEl.classList.remove('turn-announce');
        void indicatorEl.offsetWidth;
        indicatorEl.className = 'your-turn turn-announce';
        this.showYourTurnBanner(faction.name, faction.colorLight ?? faction.color);
      } else {
        indicatorEl.textContent = '🤖 AI PLAYING';
        indicatorEl.className = 'ai-turn';
      }
    }

    this.updateActionButtons();
    this.updateTurnOrder();
    this.updateFactionPanel();
    this.updateVictoryProgress();
    this.renderMinimap();
    this.moveHistory = []; // Clear undo history on new turn
    this.phaseSnapshots = []; // Clear phase snapshots on new turn
    this.updateUndoButton();

    // Show turn notification
    if (faction) {
      if (faction.controlledBy === 'human') {
        this.showToast(`🎮 YOUR TURN: ${faction.name}`, 'success');
        soundManager.play('turn_start');
        
        // First-time tips
        if (this.state.turnNumber === 1) {
          this.showFirstTimeTip('turn_start', 'Click territories to select them, then use the action bar at the bottom');
        }
      }
      // AI turn notifications handled by main.ts
      
      console.log(`Round ${this.state.turnNumber}: ${faction.name} (${faction.controlledBy})`);
    }
  }
  
  /**
   * Show a sweeping full-screen "YOUR TURN" banner that auto-dismisses
   */
  private showYourTurnBanner(factionName: string, color: string): void {
    document.getElementById('your-turn-banner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'your-turn-banner';
    banner.className = 'your-turn-banner';
    banner.innerHTML = `
      <div class="ytb-inner" style="border-color:${color};">
        <span class="ytb-label">YOUR TURN</span>
        <span class="ytb-faction" style="color:${color};">${factionName}</span>
      </div>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 2200);
  }

  /**
   * Update victory progress display
   */
  private updateVictoryProgress(): void {
    const container = document.getElementById('victory-progress');
    const barsEl = document.getElementById('victory-bars');
    const conditionEl = document.getElementById('victory-condition-text');
    
    if (!container || !barsEl) return;
    
    const rules = this.state.rules;
    const factions = this.state.factionRegistry.getAll().filter(f => !f.isDefeated);
    
    // Determine victory condition text
    let conditionText = '';
    let maxProgress = 1;
    
    switch (rules.victoryType) {
      case 'capital':
        conditionText = `Capture ${rules.victoryCapitalsRequired} enemy capitals`;
        maxProgress = rules.victoryCapitalsRequired;
        break;
      case 'economic':
        conditionText = `Reach ${rules.victoryIPCThreshold} IPCs`;
        maxProgress = rules.victoryIPCThreshold;
        break;
      case 'territorial':
        conditionText = `Control ${rules.victoryTerritoryCount} territories`;
        maxProgress = rules.victoryTerritoryCount;
        break;
      default:
        conditionText = 'Defeat all enemies';
    }
    
    if (conditionEl) conditionEl.textContent = conditionText;
    
    // Compute progress per faction
    const progressData: { faction: typeof factions[0]; progress: number; displayValue: string }[] = [];
    for (const faction of factions) {
      let progress = 0;
      let displayValue = '';

      switch (rules.victoryType) {
        case 'capital': {
          let capitalsControlled = 0;
          for (const other of this.state.factionRegistry.getAll()) {
            if (faction.isEnemyOf(other.id)) {
              const capitalTerritory = this.state.territories.get(other.capital);
              if (capitalTerritory?.owner === faction.id) capitalsControlled++;
            }
          }
          progress = capitalsControlled / maxProgress;
          displayValue = `${capitalsControlled}/${maxProgress}`;
          break;
        }
        case 'economic':
          progress = Math.min(faction.ipcs / maxProgress, 1);
          displayValue = `${faction.ipcs}`;
          break;
        case 'territorial': {
          const territories = this.state.getTerritoriesOwnedBy(faction.id);
          progress = Math.min(territories.length / maxProgress, 1);
          displayValue = `${territories.length}`;
          break;
        }
      }
      progressData.push({ faction, progress, displayValue });
    }

    // Sort: leader first
    progressData.sort((a, b) => b.progress - a.progress);
    const leaderProgress = progressData[0]?.progress ?? 0;

    // Danger state: any faction is ≥ 75% to victory
    const isDanger = leaderProgress >= 0.75;
    container.classList.toggle('victory-danger', isDanger);

    let html = '';
    for (let i = 0; i < progressData.length; i++) {
      const { faction, progress, displayValue } = progressData[i];
      const percentage = Math.round(progress * 100);
      const isLeader = i === 0 && factions.length > 1;
      const leaderBadge = isLeader ? `<span class="vp-leader-badge">👑 LEADING</span>` : '';

      html += `
        <div class="victory-bar ${isDanger && isLeader ? 'vp-danger-leader' : ''}">
          <div class="vp-label-row">
            <span class="victory-bar-label" style="color:${faction.colorLight || faction.color}">${faction.name}</span>
            ${leaderBadge}
            <span class="victory-bar-value">${displayValue} <span class="vp-pct">${percentage}%</span></span>
          </div>
          <div class="victory-bar-track">
            <div class="victory-bar-fill" style="width:${percentage}%;background:${faction.color};"></div>
          </div>
        </div>
      `;
    }

    barsEl.innerHTML = html;
    container.classList.remove('hidden');
  }

  /**
   * Update phase info display
   */
  updatePhaseInfo(): void {
    const phaseEl = document.getElementById('current-phase');
    const phase = this.state.currentPhase;
    
    if (phaseEl) {
      phaseEl.textContent = this.turnManager.getPhaseDisplayName();
    }
    
    console.log(`Phase: ${phase}`);
    
    // Update phase progress indicator
    this.updatePhaseProgress(phase);
    
    this.updateActionButtons();
    this.renderer.clearValidMoveTargets();
    this.validMoves = [];
    this.selectedUnitType = null;
    void this.selectedUnitType; // used when building unit selection

    // Update IPC display
    const faction = this.state.getCurrentFaction();
    const ipcEl = document.getElementById('ipc-display');
    if (ipcEl && faction) {
      ipcEl.textContent = `${faction.ipcs} IPCs`;
    }

    // Show phase-specific tips based on turn style
    const tips: Record<string, string> = {
      'purchase': '💰 Click Build to buy units',
      'build': '🏭 Click Build to buy & place units',
      'combat_move': '⚔️ Click your territory → click enemy to attack!',
      'move': '⚔️ Click your territory → click to move or attack!',
      'combat': '🎲 Resolving queued battles...',
      'noncombat_move': '🚶 Move units (no attacking this phase)',
      'production': '🏭 Placing your purchased units...',
      'collect_income': '💵 Collecting income...',
      'end': '💵 Collecting income...',
      'orders': '📋 Click territory → click destination',
      'resolve': '🎲 Resolving all actions...',
      'action': '♟️ Make one move or attack',
    };
    
    if (tips[phase]) {
      this.showToast(tips[phase], 'info');
    }
  }

  /**
   * Update phase progress indicator in UI
   */
  private updatePhaseProgress(currentPhase: string): void {
    const phaseOrder = ['purchase', 'combat_move', 'combat', 'noncombat_move', 'production', 'collect_income'];
    const phaseSteps = document.querySelectorAll('.phase-step');
    const connectors = document.querySelectorAll('.phase-connector');
    
    let currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex === -1) {
      // Map alternative phase names
      const phaseMap: Record<string, string> = {
        'build': 'purchase',
        'move': 'combat_move',
        'orders': 'combat_move',
        'resolve': 'combat',
        'action': 'combat_move',
        'end': 'collect_income',
      };
      currentIndex = phaseOrder.indexOf(phaseMap[currentPhase] || 'purchase');
    }
    
    phaseSteps.forEach((step, index) => {
      step.classList.remove('active', 'completed');
      if (index < currentIndex) {
        step.classList.add('completed');
      } else if (index === currentIndex) {
        step.classList.add('active');
      }
    });
    
    connectors.forEach((connector, index) => {
      connector.classList.remove('completed');
      if (index < currentIndex) {
        connector.classList.add('completed');
      }
    });
  }

  /**
   * Cycle selected territory (Tab = next, Shift+Tab = previous)
   */
  cycleSelectedTerritory(direction: number): void {
    const ids = Array.from(this.state.territories.keys()).sort();
    if (ids.length === 0) return;
    const current = this.state.selectedTerritoryId;
    let idx = current ? ids.indexOf(current) : -1;
    idx = (idx + direction + ids.length) % ids.length;
    this.state.selectTerritory(ids[idx]);
    this.updateSelectionInfo();
    this.updateValidMoves();
    this.renderer.render();
  }

  /**
   * Update selection info panel
   */
  updateSelectionInfo(): void {
    const territory = this.state.getSelectedTerritory();
    const nameEl = document.getElementById('territory-name');
    const detailsEl = document.getElementById('territory-details');

    if (!territory) {
      if (nameEl) nameEl.textContent = 'Select a Territory';
      if (detailsEl) {
        detailsEl.innerHTML = `
          <p style="text-align: center; color: #666; font-style: italic;">
            Click on any territory to view details and available units.
          </p>
        `;
      }
      this.updateActionButtons();
      return;
    }

    if (nameEl) nameEl.textContent = territory.name;

    // Build details HTML with board game styling
    let html = '';
    
    // Owner with faction color
    const owner = territory.owner 
      ? this.state.factionRegistry.get(territory.owner)
      : null;
    const ownerName = owner?.name ?? 'Neutral';
    const ownerColor = owner?.color ?? '#666';
    
    html += `<div class="stat-row">
      <span>Owner:</span>
      <span style="color: ${ownerColor}; font-weight: 600;">${ownerName}</span>
    </div>`;
    
    // Production (for land territories)
    if (territory.isLand()) {
      html += `<div class="stat-row">
        <span>Production:</span>
        <span><strong>${territory.production}</strong> IPCs/turn</span>
      </div>`;
    }
    
    // Factory indicator
    if (territory.hasFactory) {
      html += `<div class="stat-row">
        <span>🏭 Industrial Center</span>
        <span style="color: #059669;">Active</span>
      </div>`;
    }
    
    // Capital indicator
    if (territory.isCapital) {
      html += `<div class="stat-row">
        <span>⭐ Capital City</span>
        <span style="color: #d4a84b;">Strategic</span>
      </div>`;
    }

    // Units with icons - show available/total for owned territories
    const isOwnedTerritory = territory.owner === this.state.currentFactionId;
    const phase = this.state.currentPhase;
    const isMovementPhase = ['combat_move', 'noncombat_move', 'move', 'orders', 'action'].includes(phase);
    
    if (territory.units.length > 0) {
      // Show unit summary for owned territories
      if (isOwnedTerritory && isMovementPhase) {
        const totalUnits = territory.getTotalUnitCount();
        const availableUnits = territory.units.reduce((sum, pu) => sum + territory.getAvailableUnitCount(pu.unitTypeId), 0);
        const actedUnits = totalUnits - availableUnits;
        
        if (actedUnits > 0) {
          html += `<div class="unit-status-summary" style="display:flex; gap:0.75rem; margin-bottom:0.5rem; padding:0.4rem; background:rgba(0,0,0,0.2); border-radius:6px; font-size:0.85rem;">
            <span style="color:#22c55e;">✓ ${availableUnits} ready</span>
            <span style="color:#666;">⏸ ${actedUnits} acted</span>
          </div>`;
        }
      }
      
      html += `<div class="unit-list">`;
      for (const pu of territory.units) {
        const unitType = this.state.unitRegistry.get(pu.unitTypeId);
        if (unitType) {
          const icon = UNIT_ICONS[pu.unitTypeId] || '⬜';
          const moveIcon = unitType.movement === 1 ? '🚶' : unitType.movement >= 3 ? '✈️' : '🚗';
          const availableCount = territory.getAvailableUnitCount(pu.unitTypeId);
          const movedCount = (pu.movedCount || 0);
          
          // Show available/total for owned territories during movement phases
          let countDisplay = `×${pu.count}`;
          let statusBadge = '';
          let rowStyle = '';
          
          if (isOwnedTerritory && isMovementPhase) {
            if (movedCount > 0 && availableCount > 0) {
              countDisplay = `${availableCount}/${pu.count}`;
              statusBadge = `<span style="font-size:0.65rem; color:#22c55e; margin-left:0.25rem;">✓${availableCount}</span>`;
            } else if (availableCount === 0) {
              countDisplay = `×${pu.count}`;
              statusBadge = `<span style="font-size:0.65rem; color:#666; margin-left:0.25rem;">⏸</span>`;
              rowStyle = 'opacity: 0.5;';
            }
          }
          
          html += `<div class="unit-item" style="${rowStyle}">
            <span>${icon} ${unitType.name}${statusBadge}</span>
            <span class="unit-count" title="${availableCount} available, ${movedCount} already acted">${countDisplay}</span>
            <span class="unit-stats" style="font-size:0.7rem;color:#666" title="Attack/Defense/Movement">${unitType.attack}/${unitType.defense}/${moveIcon}${unitType.movement}</span>
          </div>`;
        }
      }
      html += `</div>`;

      // Combat strength summary
      let totalAtk = 0, totalDef = 0;
      for (const pu of territory.units) {
        const ut = this.state.unitRegistry.get(pu.unitTypeId);
        if (ut) { totalAtk += ut.attack * pu.count; totalDef += ut.defense * pu.count; }
      }
      html += `<div class="combat-strength-bar">
        <span class="cs-label">Strength</span>
        <span class="cs-atk">⚔️ ${totalAtk}</span>
        <span class="cs-sep">·</span>
        <span class="cs-def">🛡️ ${totalDef}</span>
      </div>`;

      // Attack range preview (enemies reachable from this territory)
      if (isOwnedTerritory && isMovementPhase && this.validMoves.length > 0) {
        const enemyIds = new Set(this.validMoves.filter(m => m.isAttack).map(m => m.territoryId));
        if (enemyIds.size > 0) {
          html += `<div class="attack-range-preview">
            🎯 <strong>${enemyIds.size}</strong> enem${enemyIds.size === 1 ? 'y' : 'ies'} in attack range
          </div>`;
        }
      }
    } else if (territory.isLand()) {
      html += `<p style="text-align: center; color: #888; font-style: italic; margin-top: 1rem;">
        No units stationed
      </p>`;
    }

    // Show pending attacks from this territory
    const pendingFromHere = this.state.pendingMoves.filter(m => m.fromTerritoryId === territory.id);
    if (pendingFromHere.length > 0) {
      html += `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 2px solid #c94444;">
        <strong style="color: #c53030;">⚔️ Queued Attacks:</strong>`;
      for (const move of pendingFromHere) {
        const targetName = this.state.territories.get(move.toTerritoryId)?.name ?? move.toTerritoryId;
        html += `<div style="font-size: 0.9rem;">${move.count}× ${move.unitTypeId} → ${targetName}</div>`;
      }
      html += `</div>`;
    }

    if (detailsEl) detailsEl.innerHTML = html;

    this.updateActionButtons();
  }

  /**
   * Update action button states and context helper
   */
  private updateActionButtons(): void {
    const phase = this.state.currentPhase;
    const territory = this.state.getSelectedTerritory();
    const faction = this.state.getCurrentFaction();
    const turnStyle = this.gameConfig.turnStyle;
    const isHumanTurn = faction?.controlledBy === 'human';

    const moveBtn = document.getElementById('btn-move') as HTMLButtonElement;
    const attackBtn = document.getElementById('btn-attack') as HTMLButtonElement;
    const buildBtn = document.getElementById('btn-build') as HTMLButtonElement;
    const endBtn = document.getElementById('btn-end-phase') as HTMLButtonElement;

    // Determine which phases allow which actions based on turn style
    const phaseStr = phase as string;
    const isMovementPhase = ['combat_move', 'noncombat_move', 'move', 'orders', 'action'].includes(phaseStr);
    const isBuildPhase = ['purchase', 'build', 'production'].includes(phaseStr);
    const isCombatPhase = ['combat', 'attack', 'resolve'].includes(phaseStr);
    const isEndPhase = ['collect_income', 'end'].includes(phaseStr);

    // Move button - enabled during movement phases with owned territory selected that has available units
    if (moveBtn) {
      // Check for units that haven't acted yet this turn
      const hasAvailableUnits = territory && territory.owner === faction?.id && 
        territory.units.some(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0);
      const canMove = isMovementPhase && isHumanTurn && hasAvailableUnits;
      moveBtn.disabled = !canMove;
      
      if (canMove) {
        moveBtn.textContent = '🚶 Move Units';
      } else {
        moveBtn.textContent = '🚶 Move';
      }
    }

    // Attack button - now just shows info since combat is immediate
    if (attackBtn) {
      if (isMovementPhase && isHumanTurn) {
        attackBtn.textContent = '⚔️ Attack';
        attackBtn.disabled = true; // Info only - attacks via map clicks
        attackBtn.title = 'Select your territory, then click an enemy territory to attack';
      } else if (isCombatPhase) {
        attackBtn.textContent = '⚔️ Resolve Combat';
        attackBtn.disabled = this.state.pendingMoves.length === 0 || !isHumanTurn;
      } else {
        attackBtn.textContent = '⚔️ Attack';
        attackBtn.disabled = true;
      }
    }

    // Build/Mobilize button - enabled during purchase/build/production phase
    if (buildBtn) {
      buildBtn.textContent = '⚔️ Mobilize';
      
      // Check if we have any territories to mobilize
      const mobilizeOptions = this.mobilizationSystem.getMobilizationOptions();
      const canMobilize = mobilizeOptions.some(o => o.canMobilize);
      
      const canBuild = isBuildPhase && isHumanTurn;
      buildBtn.disabled = !canBuild;
      
      // Update button tooltip with reason
      if (!canBuild) {
        if (!isHumanTurn) {
          buildBtn.title = 'Wait for your turn';
        } else if (!isBuildPhase) {
          buildBtn.title = `Only available in ${turnStyle === 'quick' ? 'Build' : 'Purchase/Production'} phase`;
        }
      } else if (!canMobilize) {
        buildBtn.title = 'Not enough IPCs or all territories already mobilized';
      } else {
        buildBtn.title = 'Mobilize forces at your territories (B)';
      }
    }
    
    // End Phase button — show next phase name and keyboard hint
    if (endBtn) {
      if (isEndPhase) {
        endBtn.innerHTML = '✓ End Turn <kbd class="kbd-hint">↵</kbd>';
      } else {
        const nextLabel = this.getNextPhaseLabel(phaseStr);
        endBtn.innerHTML = `➡️ ${nextLabel} <kbd class="kbd-hint">↵</kbd>`;
      }
    }

    // Shortcut badge on Build button
    if (buildBtn) {
      const label = buildBtn.innerHTML;
      if (!label.includes('kbd')) {
        buildBtn.innerHTML = buildBtn.innerHTML + ' <kbd class="kbd-hint">B</kbd>';
      }
    }

    // Update context helper with current action guidance
    this.updateContextHelper(phase, faction, territory, isHumanTurn, isBuildPhase, isMovementPhase, isCombatPhase, isEndPhase);
  }

  /**
   * Get the next phase display label for the End Phase button
   */
  private getNextPhaseLabel(currentPhase: string): string {
    const sequences: Record<string, string[]> = {
      quick: ['build', 'move', 'attack', 'end'],
      classic: ['purchase', 'combat_move', 'combat', 'noncombat_move', 'production', 'collect_income'],
      simple: ['move', 'attack', 'build', 'collect_income'],
      civilization: ['orders', 'resolve'],
      chess: ['action'],
    };
    const shortNames: Record<string, string> = {
      purchase: 'Mobilize', combat_move: 'Combat Move', combat: 'Combat',
      noncombat_move: 'Non-Combat Move', production: 'Mobilize', collect_income: 'Collect Income',
      build: 'Mobilize', move: 'Move', attack: 'Attack', end: 'End Turn',
      orders: 'Orders', resolve: 'Resolve', action: 'Action',
    };
    const style = this.gameConfig.turnStyle as string;
    const seq = sequences[style] ?? sequences['quick'];
    const idx = seq.indexOf(currentPhase);
    const nextPhase = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : null;
    return nextPhase ? (shortNames[nextPhase] ?? nextPhase) : 'Next';
  }
  
  /**
   * Update the context helper banner with current action guidance
   */
  private updateContextHelper(
    phase: string, 
    faction: ReturnType<typeof this.state.getCurrentFaction>,
    territory: ReturnType<typeof this.state.getSelectedTerritory>,
    isHumanTurn: boolean,
    isBuildPhase: boolean,
    isMovementPhase: boolean,
    isCombatPhase: boolean,
    isEndPhase: boolean
  ): void {
    const helper = document.getElementById('context-helper');
    const text = document.getElementById('context-helper-text');
    if (!helper || !text) return;
    
    helper.className = 'context-helper';
    
    if (!isHumanTurn) {
      text.textContent = `⏳ ${faction?.name || 'AI'} is taking their turn...`;
      helper.classList.add('hint');
      return;
    }
    
    if (isBuildPhase) {
      const mobilizeOptions = this.mobilizationSystem.getMobilizationOptions();
      const canMobilize = mobilizeOptions.filter(o => o.canMobilize).length;
      const alreadyMobilized = this.mobilizationSystem.getMobilizationCount();
      
      if (canMobilize > 0) {
        text.textContent = `🖱️ Click your territories to mobilize forces (${canMobilize} available, ${faction?.ipcs || 0} IPCs)`;
        this.showFirstTimeTip('mobilize', 'Click highlighted territories to spawn defenders! Factories produce more units.');
      } else if (alreadyMobilized > 0) {
        text.textContent = `✓ Mobilized ${alreadyMobilized} territories. Click "Next Phase" to continue.`;
        helper.classList.add('success');
      } else {
        text.textContent = `💰 Not enough IPCs to mobilize. Click "Next Phase" to continue.`;
        helper.classList.add('warning');
      }
    } else if (isMovementPhase) {
      if (territory && territory.owner === faction?.id) {
        const availableUnits = territory.units.reduce((sum, pu) => sum + territory.getAvailableUnitCount(pu.unitTypeId), 0);
        if (availableUnits > 0) {
          text.textContent = `🚶 Click an adjacent territory to move ${availableUnits} unit${availableUnits !== 1 ? 's' : ''}, or click enemy to attack`;
          this.showFirstTimeTip('movement', 'Units can move once per turn. Click adjacent territories to move/attack.');
        } else {
          text.textContent = `⏸️ All units in ${territory.name} have acted. Select another territory.`;
          helper.classList.add('hint');
        }
      } else {
        text.textContent = `🖱️ Select one of your territories to move or attack`;
      }
    } else if (isCombatPhase) {
      if (this.state.pendingMoves.length > 0) {
        text.textContent = `⚔️ ${this.state.pendingMoves.length} battle${this.state.pendingMoves.length !== 1 ? 's' : ''} to resolve. Click "Resolve Combat".`;
        this.showFirstTimeTip('combat', 'Battles are resolved by dice rolls. Higher attack/defense = better odds!');
      } else {
        text.textContent = `✓ All battles resolved! Click "Next Phase" to continue.`;
        helper.classList.add('success');
      }
    } else if (isEndPhase) {
      const income = this.state.calculateIncome(faction?.id || '');
      text.textContent = `💰 Collecting ${income} IPCs. Click "End Turn" to finish.`;
      helper.classList.add('success');
      this.showFirstTimeTip('income', 'You earn IPCs each turn from the territories you control.');
    } else {
      text.textContent = `📋 ${phase} phase - Click "Next Phase" when ready.`;
    }
  }

  /**
   * Update valid move highlights
   */
  private updateValidMoves(): void {
    const territory = this.state.getSelectedTerritory();
    const faction = this.state.getCurrentFaction();
    const phase = this.state.currentPhase;

    if (!territory || territory.owner !== faction?.id) {
      this.renderer.clearValidMoveTargets();
      this.validMoves = [];
      return;
    }

    // Check if current phase allows movement
    const movementPhases = ['combat_move', 'noncombat_move', 'move', 'orders', 'action'];
    if (!movementPhases.includes(phase)) {
      this.renderer.clearValidMoveTargets();
      this.validMoves = [];
      return;
    }

    // Get valid moves for all unit types in territory
    const allMoves: ValidMove[] = [];
    // Determine if attacks are allowed based on phase and turn style
    const isCombatMove = ['combat_move', 'move', 'orders', 'action'].includes(phase);

    for (const pu of territory.units) {
      const moves = this.movementValidator.getValidMoves(
        pu.unitTypeId,
        territory.id,
        isCombatMove
      );
      allMoves.push(...moves);
    }

    // Deduplicate by territory
    const moveTargets: string[] = [];
    const attackTargets: string[] = [];
    const seen = new Set<string>();

    for (const move of allMoves) {
      if (seen.has(move.territoryId)) continue;
      seen.add(move.territoryId);
      
      if (move.isAttack) {
        attackTargets.push(move.territoryId);
      } else {
        moveTargets.push(move.territoryId);
      }
    }

    this.validMoves = allMoves;
    this.renderer.setValidMoveTargets(moveTargets, attackTargets);
    this.applyOverlay();
  }

  private getThreatTerritoryIds(): Set<string> {
    const sel = this.state.selectedTerritoryId;
    const faction = this.state.getCurrentFaction();
    if (!sel || !faction) return new Set();
    const territory = this.state.territories.get(sel);
    if (!territory) return new Set();
    const threat = new Set<string>();
    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (!adj || !adj.owner || !faction.isEnemyOf(adj.owner)) continue;
      if (adj.getTotalUnitCount() > 0) threat.add(adjId);
    }
    return threat;
  }

  private applyOverlay(): void {
    if (this.overlayMode === 'off') {
      this.renderer.setOverlayMode('off');
    } else if (this.overlayMode === 'range') {
      this.renderer.setOverlayMode('range');
    } else {
      this.renderer.setOverlayMode('threat', this.getThreatTerritoryIds());
    }
  }

  cycleOverlay(): void {
    if (this.overlayMode === 'off') this.overlayMode = 'range';
    else if (this.overlayMode === 'range') this.overlayMode = 'threat';
    else this.overlayMode = 'off';
    this.applyOverlay();
    this.renderer.render();
    const labels = { off: 'Overlays off', range: 'Movement/attack range', threat: 'Threat (enemy reach)' };
    this.showToast(labels[this.overlayMode], 'info');
  }

  /**
   * Handle move button click
   */
  private onMoveClick(): void {
    this.showToast('Click a highlighted territory to move units there', 'info');
  }

  /**
   * Handle attack button click - START COMBAT RESOLUTION
   */
  private onAttackClick(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    // Find all unique combat territories
    this.pendingCombats = [];
    const combatTerritories = new Set<string>();
    
    for (const move of this.state.pendingMoves) {
      const target = this.state.territories.get(move.toTerritoryId);
      if (target) {
        // Enemy territory = combat
        if (target.owner && faction.isEnemyOf(target.owner)) {
          combatTerritories.add(move.toTerritoryId);
        } else if (!target.owner) {
          // Neutral territory - just take it
          combatTerritories.add(move.toTerritoryId);
        }
      }
    }

    this.pendingCombats = Array.from(combatTerritories);
    
    if (this.pendingCombats.length === 0) {
      this.showToast('No attacks queued', 'info');
      return;
    }

    // Start first combat
    this.startNextCombat();
  }

  /**
   * Start the next combat in the queue
   */
  private startNextCombat(): void {
    if (this.pendingCombats.length === 0) {
      // All combats resolved - clear pending moves and continue
      this.state.pendingMoves = [];
      this.updateActionButtons();
      this.showToast('All battles resolved!', 'success');
      return;
    }

    const territoryId = this.pendingCombats.shift()!;
    const territory = this.state.territories.get(territoryId);
    if (!territory) {
      this.startNextCombat();
      return;
    }

    // Gather attacking units for this territory
    const attackingMoves = this.state.pendingMoves.filter(m => m.toTerritoryId === territoryId);
    
    if (attackingMoves.length === 0) {
      this.startNextCombat();
      return;
    }

    // Collect veteranCount BEFORE removing units (removeUnits deletes the entry at 0)
    const attackingUnits = attackingMoves.map(m => {
      const src = this.state.territories.get(m.fromTerritoryId);
      const pu = src?.units.find(u => u.unitTypeId === m.unitTypeId);
      return { unitTypeId: m.unitTypeId, count: m.count, veteranCount: pu?.veteranCount ?? 0 };
    });

    // IMPORTANT: Remove units from source territories NOW
    for (const move of attackingMoves) {
      const fromTerritory = this.state.territories.get(move.fromTerritoryId);
      if (fromTerritory) {
        fromTerritory.removeUnits(move.unitTypeId, move.count);
      }
    }

    // Check if territory is undefended or neutral
    if (!territory.owner || territory.getTotalUnitCount() === 0) {
      // No combat needed - just take the territory
      const currentFaction = this.state.getCurrentFaction();
      if (currentFaction) {
        territory.owner = currentFaction.id;
        
        // Place attacking units in territory
        for (const unit of attackingUnits) {
          territory.addUnits(unit.unitTypeId, unit.count);
        }
        
        this.showToast(`Captured ${territory.name}!`, 'success');
        soundManager.play('capture');
        
        // Log capture
        battleLog.logCapture(this.state.turnNumber, currentFaction.name, currentFaction.color, territory.name);
      }
      
      // Remove these moves from pending
      this.state.pendingMoves = this.state.pendingMoves.filter(m => m.toTerritoryId !== territoryId);
      
      this.renderer.render();
      this.startNextCombat();
      return;
    }

    // Initiate actual combat
    const combat = this.combatResolver.initiateCombat(
      territoryId,
      this.state.currentFactionId,
      attackingUnits
    );

    if (combat) {
      this.activeCombat = combat;
      this.showCombatModal(combat);
    } else {
      // Combat couldn't be initiated - restore units
      for (const move of attackingMoves) {
        const fromTerritory = this.state.territories.get(move.fromTerritoryId);
        if (fromTerritory) {
          fromTerritory.addUnits(move.unitTypeId, move.count);
        }
      }
      this.startNextCombat();
    }
  }

  /**
   * Handle build button click
   */
  private onBuildClick(): void {
    this.showBuildModal();
  }

  /**
   * Handle end phase button click
   */
  private onEndPhaseClick(): void {
    const phase = this.state.currentPhase as string;

    // Execute pending moves at end of movement phases
    if (phase === 'noncombat_move' || phase === 'move') {
      this.movementValidator.executeAllPendingMoves();
    }

    // Handle production/build phase - new mobilization system
    // Units are now mobilized directly at territories, no reserve/deploy flow needed

    // Clear pending moves when ending combat/attack/resolve phase
    if (phase === 'combat' || phase === 'attack' || phase === 'resolve') {
      this.state.pendingMoves = [];
    }

    // For quick mode 'end' phase, collect income
    if (phase === 'end') {
      const faction = this.state.getCurrentFaction();
      if (faction) {
        const income = this.state.calculateIncome(faction.id);
        faction.addIPCs(income);
        this.showToast(`+${income} IPCs collected!`, 'success');
        soundManager.play('income');
      }
    }

    // Production preview before leaving build phase
    const isBuildPhase = ['purchase', 'build', 'production'].includes(phase);
    if (isBuildPhase) {
      this.showProductionPreview();
    }

    this.turnManager.advancePhase();
    this.renderer.render();
    this.renderMinimap();
  }

  /**
   * Flash a brief production summary toast before leaving the build phase
   */
  private showProductionPreview(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const ownedTerritories = this.state.getTerritoriesOwnedBy(faction.id);
    const totalUnits = ownedTerritories.reduce((s, t) => s + t.getTotalUnitCount(), 0);
    const income = this.state.calculateIncome(faction.id);

    this.showToast(`🏭 Build phase done · ${totalUnits} units deployed · ${faction.ipcs} IPCs · +${income}/turn next round`, 'success');
  }

  /**
   * Show combat modal
   */
  private showCombatModal(combat: CombatState): void {
    this.activeCombat = combat;
    const modal = document.getElementById('combat-modal');
    if (modal) modal.classList.remove('hidden');
    
    soundManager.play('combat_start');

    // Show territory name
    const territoryEl = document.getElementById('combat-territory');
    const territory = this.state.territories.get(combat.territoryId);
    if (territoryEl && territory) {
      territoryEl.textContent = `Battle for ${territory.name}`;
    }

    // Clear combat log
    const logEl = document.getElementById('combat-log');
    if (logEl) logEl.innerHTML = '<em>Combat begins! Click Roll Dice to attack...</em>';

    this.updateCombatDisplay();
  }

  /**
   * Update combat modal display
   */
  private updateCombatDisplay(): void {
    if (!this.activeCombat) return;

    const attackerEl = document.getElementById('attacker-units');
    const defenderEl = document.getElementById('defender-units');
    const oddsEl = document.getElementById('odds-text');

    // Calculate and display odds
    if (oddsEl && !this.activeCombat.isComplete) {
      const attackPower = this.activeCombat.attackers.reduce((sum, cu) => {
        const active = cu.count - cu.casualties;
        return sum + (active * cu.unitType.attack);
      }, 0);
      const defensePower = this.activeCombat.defenders.reduce((sum, cu) => {
        const active = cu.count - cu.casualties;
        return sum + (active * cu.unitType.defense);
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

    // Update buttons
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

  /**
   * Handle roll combat button
   */
  private onRollCombat(): void {
    if (!this.activeCombat || this.activeCombat.isComplete) return;

    const rollBtn = document.getElementById('btn-roll-combat') as HTMLButtonElement | null;
    if (rollBtn) rollBtn.disabled = true;

    // Show dice row with spinning placeholders
    const diceRow = document.getElementById('combat-dice-row');
    const atkGroup = document.getElementById('attacker-dice');
    const defGroup = document.getElementById('defender-dice');
    const MAX_DICE = 8;

    if (diceRow && atkGroup && defGroup && this.activeCombat) {
      const atkCount = Math.min(this.activeCombat.attackers.reduce((s, a) => s + a.count - a.casualties, 0), MAX_DICE);
      const defCount = Math.min(this.activeCombat.defenders.reduce((s, d) => s + d.count - d.casualties, 0), MAX_DICE);

      const makePips = (count: number): string =>
        Array.from({ length: count }, () => `<span class="dice-pip rolling">?</span>`).join('');

      atkGroup.innerHTML = makePips(atkCount);
      defGroup.innerHTML = makePips(defCount);
      diceRow.classList.remove('hidden');
    }

    soundManager.play('dice_roll');

    // After animation window, resolve and reveal results
    setTimeout(() => {
      if (!this.activeCombat) return;
      const result = this.combatResolver.resolveCombatRound(this.activeCombat);

      // Reveal dice pip results
      if (atkGroup && defGroup) {
        const renderPips = (
          group: HTMLElement,
          rolls: typeof result.attackerRolls,
          totalActive: number
        ) => {
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

      // Sounds
      if (result.attackerHits > 0 || result.defenderHits > 0) {
        soundManager.play('hit');
      } else {
        soundManager.play('miss');
      }

      // Update combat log
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

      // Combat over — show result banner
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

      // Re-enable button after a brief settle delay
      setTimeout(() => {
        if (rollBtn) rollBtn.disabled = !!this.activeCombat?.isComplete;
      }, 150);
    }, 650);
  }

  /**
   * Handle auto-resolve button - roll all rounds until combat ends
   */
  private onAutoResolve(): void {
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

  /**
   * Handle retreat button
   */
  private onRetreat(): void {
    if (!this.activeCombat) return;

    const combatTerritory = this.state.territories.get(this.activeCombat.territoryId);
    if (!combatTerritory) return;

    for (const adjId of combatTerritory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (adj?.owner === this.activeCombat.attackingFactionId) {
        this.combatResolver.processRetreat(this.activeCombat, adjId);
        this.showToast('Forces retreated!', 'info');
        this.finishCurrentCombat();
        return;
      }
    }

    this.showToast('No valid retreat route!', 'info');
  }

  /**
   * Handle close combat button - finalize and move to next combat
   */
  private onCloseCombat(): void {
    if (!this.activeCombat || !this.activeCombat.isComplete) return;
    this.finishCurrentCombat();
  }

  /**
   * Finish current combat and proceed
   */
  private finishCurrentCombat(): void {
    if (this.activeCombat) {
      const combat = this.activeCombat;
      const sourceTerritory = combat.sourceTerritory ? this.state.territories.get(combat.sourceTerritory) : null;
      const targetTerritory = this.state.territories.get(combat.territoryId);

      // Remove attacking units from source territory BEFORE finalize
      if (sourceTerritory) {
        for (const cu of combat.attackers) {
          sourceTerritory.removeUnits(cu.unitType.id, cu.count);
        }
      }

      // Finalize the combat (updates territory ownership and surviving units)
      this.combatResolver.finalizeCombat(combat);

      // Log result
      if (combat.winner === 'attacker') {
        this.showToast(`Victory! Captured ${targetTerritory?.name}!`, 'success');
        soundManager.play('capture');
      } else if (combat.winner === 'defender') {
        this.showToast(`Attack failed. ${targetTerritory?.name} holds!`, 'info');
      } else {
        this.showToast('Both sides destroyed!', 'info');
      }
      
      // Remove processed moves
      this.state.pendingMoves = this.state.pendingMoves.filter(
        m => m.toTerritoryId !== combat.territoryId
      );
    }

    this.closeCombatModal();
    this.renderer.render();
    this.renderMinimap();
    this.updateFactionPanel();
    
    // Start next combat if any
    this.startNextCombat();
  }

  /**
   * Close combat modal
   */
  private closeCombatModal(): void {
    const modal = document.getElementById('combat-modal');
    if (modal) modal.classList.add('hidden');
    this.activeCombat = null;
  }

  // Unit placement mode (legacy - kept for compatibility)
  public isPlacementMode: boolean = false;
  public unitsToPlace: { unitTypeId: string; count: number }[] = [];

  /**
   * Show build modal (Mobilization System)
   */
  private showBuildModal(): void {
    const modal = document.getElementById('build-modal');
    if (modal) modal.classList.remove('hidden');
    this.updateMobilizationOptions();
  }

  /**
   * Update mobilization options in build modal
   */
  private updateMobilizationOptions(): void {
    const ipcRemainingEl = document.getElementById('ipc-remaining');
    const mobilizedCountEl = document.getElementById('mobilized-count');
    const spentIPCsEl = document.getElementById('spent-ipcs');
    
    const faction = this.state.getCurrentFaction();
    if (!faction) return;
    
    // Update status display
    if (ipcRemainingEl) ipcRemainingEl.textContent = String(faction.ipcs);
    if (mobilizedCountEl) mobilizedCountEl.textContent = String(this.mobilizationSystem.getMobilizationCount());
    if (spentIPCsEl) spentIPCsEl.textContent = String(this.mobilizationSystem.getMobilizationSpending());
    
    // Get mobilization options grouped by type
    const options = this.mobilizationSystem.getMobilizationOptions();
    const factories = options.filter(o => o.type === 'factory');
    const capital = options.filter(o => o.type === 'capital');
    const coastal = options.filter(o => o.type === 'coastal');
    const land = options.filter(o => o.type === 'land');
    
    // Render each group
    this.renderMobilizationGroup('mobilize-factories', '🏭 Factories', factories, 'factory');
    this.renderMobilizationGroup('mobilize-capital', '⭐ Capital', capital, 'capital');
    this.renderMobilizationGroup('mobilize-coastal', '🌊 Coastal', coastal, 'coastal');
    this.renderMobilizationGroup('mobilize-land', '🏠 Land', land, 'land');
  }
  
  /**
   * Render a group of mobilization options
   */
  private renderMobilizationGroup(containerId: string, title: string, options: MobilizationOption[], typeClass: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (options.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    let html = `<div class="mobilize-group-title ${typeClass}">${title}</div>`;
    html += '<div class="mobilize-grid">';
    
    for (const option of options) {
      const wasMobilized = this.mobilizationSystem.wasMobilized(option.territory.id);
      const disabled = !option.canMobilize || wasMobilized;
      
      // Format units that will spawn
      const unitsStr = option.units.map(u => {
        const icon = UNIT_ICONS[u.unitTypeId] || '⬜';
        return `${icon}×${u.count}`;
      }).join(' ');
      
      const cardClasses = ['mobilize-card'];
      if (disabled && !wasMobilized) cardClasses.push('disabled');
      if (wasMobilized) cardClasses.push('mobilized');
      
      html += `
        <div class="${cardClasses.join(' ')}" 
             data-territory="${option.territory.id}"
             title="${option.reason || ''}">
          <div class="mobilize-card-header">
            <span class="mobilize-card-name">${option.territory.name}</span>
            <span class="mobilize-card-cost">${option.cost} IPCs</span>
          </div>
          <div class="mobilize-card-units">
            ${wasMobilized ? '✓ Mobilized' : `Spawns: ${unitsStr}`}
          </div>
          ${option.reason && !wasMobilized ? `<div class="mobilize-card-error">${option.reason}</div>` : ''}
        </div>
      `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // Add click handlers
    container.querySelectorAll('.mobilize-card:not(.disabled):not(.mobilized)').forEach(el => {
      el.addEventListener('click', () => {
        const territoryId = el.getAttribute('data-territory');
        if (territoryId) this.onMobilizeTerritory(territoryId);
      });
    });
  }
  
  /**
   * Handle mobilizing a territory (from modal)
   */
  private onMobilizeTerritory(territoryId: string): void {
    const result = this.mobilizationSystem.mobilize(territoryId);
    
    if (result.success) {
      const territory = this.state.territories.get(territoryId);
      const unitsDesc = result.unitsSpawned?.map(u => {
        const unit = this.state.unitRegistry.get(u.unitTypeId);
        return `${u.count}× ${unit?.name || u.unitTypeId}`;
      }).join(', ') || 'units';
      
      this.showToast(`Mobilized ${territory?.name}: ${unitsDesc}`, 'success');
      soundManager.play('build');
      
      // Log mobilization
      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color, 
          `Mobilized ${territory?.name}: ${unitsDesc}`);
      }
      
      // Update IPC display
      const ipcEl = document.getElementById('ipc-display');
      if (ipcEl && faction) {
        ipcEl.textContent = `${faction.ipcs} IPCs`;
      }
      
      // Refresh the modal
      this.updateMobilizationOptions();
      
      // Update map highlights
      this.updateMobilizationHighlights();
      
      // Re-render map to show new units
      this.renderer.render();
    } else {
      this.showToast(result.reason || 'Cannot mobilize', 'info');
    }
  }

  /**
   * Handle map click mobilization (direct click on territory during Build phase)
   */
  private handleMapMobilization(territoryId: string): void {
    const option = this.mobilizationSystem.getTerritoryMobilization(
      this.state.territories.get(territoryId)!
    );
    
    if (!option.canMobilize) {
      // Show why we can't mobilize
      if (this.mobilizationSystem.wasMobilized(territoryId)) {
        this.showToast('Already mobilized this turn', 'info');
      } else {
        this.showToast(option.reason || 'Cannot mobilize', 'info');
      }
      return;
    }
    
    // Execute mobilization
    const result = this.mobilizationSystem.mobilize(territoryId);
    
    if (result.success) {
      const territory = this.state.territories.get(territoryId);
      const unitsDesc = result.unitsSpawned?.map(u => {
        const icon = UNIT_ICONS[u.unitTypeId] || '⬜';
        const unit = this.state.unitRegistry.get(u.unitTypeId);
        return `${icon}${u.count}× ${unit?.name || u.unitTypeId}`;
      }).join(', ') || 'units';
      
      this.showToast(`⚔️ ${territory?.name}: ${unitsDesc}`, 'success');
      soundManager.play('build');
      
      // Log mobilization
      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color, 
          `Mobilized ${territory?.name}`);
        
        // Update IPC display
        const ipcEl = document.getElementById('ipc-display');
        if (ipcEl) {
          ipcEl.textContent = `${faction.ipcs} IPCs`;
        }
      }
      
      // Update selection info to show the new units
      this.updateSelectionInfo();
      
      // Update mobilization highlights to reflect the change
      this.updateMobilizationHighlights();
      
      // Re-render map to show new units and mobilized state
      this.renderer.render();
    }
  }

  /**
   * Close build modal
   */
  private closeBuildModal(): void {
    const modal = document.getElementById('build-modal');
    if (modal) modal.classList.add('hidden');
  }

  // ==================== DEPLOYMENT PHASE (Strategic Reserve System) ====================

  // Track selected deployment zone
  private selectedDeployZone: string | null = null;
  
  /**
   * Show deployment modal during production phase
   */
  showDeploymentModal(): void {
    const modal = document.getElementById('deployment-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.selectedDeployZone = null;
      this.updateDeploymentOptions();
    }
  }

  /**
   * Close deployment modal
   */
  private closeDeploymentModal(): void {
    const modal = document.getElementById('deployment-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Update deployment modal UI
   */
  private updateDeploymentOptions(): void {
    const zonesListEl = document.getElementById('deployment-zones-list');
    const zoneInfoEl = document.getElementById('deploy-zone-info');
    const unitControlsEl = document.getElementById('deploy-unit-controls');
    const reserveSummaryEl = document.getElementById('reserve-summary');
    const pendingCountEl = document.getElementById('pending-deploy-count');
    const pendingListEl = document.getElementById('pending-deployments-list');
    const pendingItemsEl = document.getElementById('pending-deploy-items');

    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const reserves = this.productionManager.getCurrentReserves();
    const zones = this.productionManager.getDeploymentZones();
    const pendingDeployments = this.productionManager.getReserveSystem().getPendingDeployments();
    
    // Update reserve summary
    if (reserveSummaryEl) {
      if (reserves.length === 0) {
        reserveSummaryEl.textContent = 'No units';
      } else {
        const summary = reserves.map(r => {
          const icon = UNIT_ICONS[r.unitTypeId] || '⬜';
          return `${icon}${r.count}`;
        }).join(' ');
        reserveSummaryEl.innerHTML = summary;
      }
    }

    // Update pending count
    const totalPending = pendingDeployments.reduce((sum: number, p: any) => sum + p.count, 0);
    if (pendingCountEl) {
      pendingCountEl.textContent = `${totalPending} units`;
    }
    
    // Update pending list
    if (pendingListEl && pendingItemsEl) {
      if (pendingDeployments.length > 0) {
        pendingListEl.style.display = 'block';
        let html = '';
        for (const p of pendingDeployments) {
          const icon = UNIT_ICONS[p.unitTypeId] || '⬜';
          const territory = this.state.territories.get(p.territoryId);
          html += `<span style="display: inline-block; margin: 0.15rem; padding: 0.25rem 0.5rem; background: rgba(34,197,94,0.2); border-radius: 4px; font-size: 0.8rem;">
            ${icon}${p.count} → ${territory?.name || p.territoryId}
          </span>`;
        }
        pendingItemsEl.innerHTML = html;
      } else {
        pendingListEl.style.display = 'none';
      }
    }

    // Update deployment zones list
    const zoneIcons: Record<string, string> = { factory: '🏭', capital: '👑', frontline: '⚔️', rear: '🏠' };
    const zoneColors: Record<string, string> = { factory: '#1a7a5c', capital: '#8b6914', frontline: '#c53030', rear: '#4a5568' };
    
    if (zonesListEl) {
      let html = '';
      for (const zone of zones) {
        const icon = zoneIcons[zone.type];
        const color = zoneColors[zone.type];
        const isFull = zone.remainingCapacity === 0;
        const isSelected = this.selectedDeployZone === zone.territory.id;
        
        html += `
          <div class="deployment-zone ${isFull ? 'full' : ''} ${isSelected ? 'selected' : ''}" 
               data-territory="${zone.territory.id}"
               style="padding: 0.5rem 0.75rem; background: ${isSelected ? 'rgba(184,134,11,0.12)' : 'rgba(0,0,0,0.05)'};
                      border-radius: 8px; border: 2px solid ${isSelected ? '#8b6914' : (isFull ? '#bbb' : color)};
                      cursor: ${isFull ? 'not-allowed' : 'pointer'}; opacity: ${isFull ? '0.5' : '1'};
                      transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; font-size: 0.9rem;">${icon} ${zone.territory.name}</span>
              <span style="font-size: 0.75rem; color: ${zone.remainingCapacity > 0 ? '#1a7a5c' : '#c53030'};">
                ${zone.remainingCapacity}/${zone.maxCapacity}
              </span>
            </div>
          </div>
        `;
      }
      zonesListEl.innerHTML = html;
      
      // Add click handlers for zone selection
      zonesListEl.querySelectorAll('.deployment-zone:not(.full)').forEach(el => {
        el.addEventListener('click', () => {
          const territoryId = el.getAttribute('data-territory');
          if (territoryId) {
            this.selectedDeployZone = territoryId;
            soundManager.play('click');
            this.updateDeploymentOptions();
          }
        });
      });
    }

    // Update zone info and unit controls
    if (zoneInfoEl && unitControlsEl) {
      if (!this.selectedDeployZone) {
        zoneInfoEl.innerHTML = '<p style="color: #666; font-size: 0.85rem; text-align: center;">← Select a zone first</p>';
        unitControlsEl.innerHTML = '';
      } else {
        const selectedZone = zones.find(z => z.territory.id === this.selectedDeployZone);
        if (selectedZone) {
          const icon = zoneIcons[selectedZone.type];
          const color = zoneColors[selectedZone.type];
          zoneInfoEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600;">${icon} ${selectedZone.territory.name}</span>
              <span style="font-size: 0.85rem; color: ${color};">${selectedZone.type.toUpperCase()}</span>
            </div>
            <div style="font-size: 0.85rem; color: #888; margin-top: 0.25rem;">
              Remaining Capacity: <span style="color: ${selectedZone.remainingCapacity > 0 ? '#22c55e' : '#ef4444'}; font-weight: bold;">
                ${selectedZone.remainingCapacity}
              </span>
            </div>
          `;
          
          // Build unit controls with +/- buttons
          let controlsHtml = '';
          for (const reserve of reserves) {
            const unit = this.state.unitRegistry.get(reserve.unitTypeId);
            const icon = UNIT_ICONS[reserve.unitTypeId] || '⬜';
            const domain = unit?.domain || 'land';
            
            // Check if unit can be deployed to this territory type
            const canDeploy = (domain === 'sea' && selectedZone.territory.type === 'sea') ||
                              (domain !== 'sea' && selectedZone.territory.type !== 'sea') ||
                              (domain === 'air'); // Air units can go anywhere
            
            if (!canDeploy) continue;
            
            // Count how many of this unit are already queued for this zone
            const queuedHere = pendingDeployments
              .filter((p: any) => p.unitTypeId === reserve.unitTypeId && p.territoryId === this.selectedDeployZone)
              .reduce((sum: number, p: any) => sum + p.count, 0);
            
            controlsHtml += `
              <div class="deploy-unit-row" data-unit="${reserve.unitTypeId}"
                   style="display: flex; align-items: center; justify-content: space-between; 
                          padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.04); border-radius: 8px;
                          border: 1px solid rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="font-size: 1.3rem;">${icon}</span>
                  <div>
                    <div style="font-weight: 600; font-size: 0.9rem;">${unit?.name || reserve.unitTypeId}</div>
                    <div style="font-size: 0.75rem; color: #888;">Available: ${reserve.count}</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                  <button class="deploy-minus" data-unit="${reserve.unitTypeId}" 
                          style="width: 32px; height: 32px; font-size: 1.2rem; border-radius: 6px;
                                 background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4);
                                 color: #c53030; cursor: pointer; ${queuedHere === 0 ? 'opacity: 0.3; cursor: not-allowed;' : ''}"
                          ${queuedHere === 0 ? 'disabled' : ''}>−</button>
                  <span style="min-width: 40px; text-align: center; font-weight: bold; font-size: 1.1rem;">
                    ${queuedHere}
                  </span>
                  <button class="deploy-plus" data-unit="${reserve.unitTypeId}"
                          style="width: 32px; height: 32px; font-size: 1.2rem; border-radius: 6px;
                                 background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.4);
                                 color: #1a7a5c; cursor: pointer; ${reserve.count === 0 || selectedZone.remainingCapacity === 0 ? 'opacity: 0.3; cursor: not-allowed;' : ''}"
                          ${reserve.count === 0 || selectedZone.remainingCapacity === 0 ? 'disabled' : ''}>+</button>
                </div>
              </div>
            `;
          }
          
          if (controlsHtml === '') {
            unitControlsEl.innerHTML = '<p style="color: #666; font-size: 0.85rem; text-align: center; padding: 1rem;">No compatible units in reserve</p>';
          } else {
            unitControlsEl.innerHTML = controlsHtml;
            
            // Add click handlers for +/- buttons
            unitControlsEl.querySelectorAll('.deploy-plus:not([disabled])').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitTypeId = btn.getAttribute('data-unit');
                if (unitTypeId && this.selectedDeployZone) {
                  const result = this.productionManager.queueDeployment(unitTypeId, this.selectedDeployZone, 1);
                  if (result.success) {
                    soundManager.play('click');
                    this.updateDeploymentOptions();
                  } else {
                    this.showToast(result.reason || 'Cannot deploy', 'info');
                  }
                }
              });
            });
            
            unitControlsEl.querySelectorAll('.deploy-minus:not([disabled])').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitTypeId = btn.getAttribute('data-unit');
                if (unitTypeId && this.selectedDeployZone) {
                  this.productionManager.removeDeployment(unitTypeId, this.selectedDeployZone, 1);
                  soundManager.play('click');
                  this.updateDeploymentOptions();
                }
              });
            });
          }
        }
      }
    }
  }
  

  /**
   * Clear all pending deployments
   */
  private onClearDeploy(): void {
    const reserveSystem = this.productionManager.getReserveSystem();
    if (reserveSystem.getPendingDeployments().length > 0) {
      reserveSystem.clearPendingDeployments();
      this.showToast('Cleared all pending deployments', 'info');
      soundManager.play('click');
      this.updateDeploymentOptions();
    }
  }
  
  /**
   * Confirm deployments
   */
  private onConfirmDeploy(): void {
    const result = this.productionManager.executeDeployments();
    
    if (result.deployed > 0) {
      this.showToast(`Deployed ${result.deployed} units to ${result.territories.length} territories!`, 'success');
      soundManager.play('build');
      
      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color, 
          `Deployed ${result.deployed} units from reserve`);
      }
      
      this.renderer.render();
    } else {
      this.showToast('No deployments pending', 'info');
    }
    
    this.closeDeploymentModal();
  }

  /**
   * Auto-deploy all reserves
   */
  private onAutoDeploy(): void {
    const result = this.productionManager.autoDeployReserves();
    
    if (result.deployed > 0) {
      this.showToast(`Auto-deployed ${result.deployed} units!`, 'success');
      soundManager.play('build');
      
      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color, 
          `Auto-deployed ${result.deployed} units to ${result.territories.length} zones`);
      }
      
      this.renderer.render();
      this.updateDeploymentOptions();
    } else {
      this.showToast('No units to deploy', 'info');
    }
  }

  /**
   * Show income notification
   */
  private showIncomeNotification(data: { amount: number }): void {
    this.showToast(`+${data.amount} IPCs collected!`, 'success');
    soundManager.play('income');
    this.updateTurnInfo();
    
    // Visual effect for income
    const faction = this.state.getCurrentFaction();
    if (faction?.controlledBy === 'human') {
      visualEffects.incomeEffect(window.innerWidth / 2, window.innerHeight / 2, data.amount);
      achievementManager.updateProgress('earn_ipcs', data.amount);
    }
    
    // Log to battle log
    if (faction) {
      battleLog.logIncome(this.state.turnNumber, faction.name, faction.color, data.amount);
      this.trackIncome(faction.id, data.amount);
    }
  }

  /**
   * Show victory screen with game statistics
   */
  private showVictoryScreen(data: { winner: string }): void {
    const faction = this.state.factionRegistry.get(data.winner);
    const currentFaction = this.state.getCurrentFaction();
    const isPlayerVictory = currentFaction?.controlledBy === 'human' && currentFaction.id === data.winner;

    // Persist stats (games played, win rate, avg length)
    const factionIds = this.state.factionRegistry.getAll().map(f => f.id);
    if (factionIds.length > 0) {
      const durationMin = Math.max(0, (Date.now() - this.gameConfig.startTime) / 60000);
      recordGameEnd(factionIds, data.winner, durationMin);
    }

    // Fire achievement checks for the human player
    const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
    if (humanFaction) {
      const playerTerritories = this.state.getTerritoriesOwnedBy(humanFaction.id).length;
      const maxEnemyTerritories = Math.max(
        ...this.state.factionRegistry.getAll()
          .filter(f => f.id !== humanFaction.id)
          .map(f => this.state.getTerritoriesOwnedBy(f.id).length),
        0
      );
      const playerStats = statisticsManager.getFactionStats(humanFaction.id);
      achievementManager.checkGameEnd(isPlayerVictory, {
        faction: humanFaction.id,
        mapId: this.gameConfig.mapId,
        turns: this.state.turnNumber,
        unitsLost: playerStats?.unitsLost ?? 0,
        territoriesOwned: playerTerritories,
        enemyTerritoriesOwned: maxEnemyTerritories,
      });
    }
    
    // Play appropriate sound
    if (isPlayerVictory) {
      soundManager.play('victory');
    } else {
      soundManager.play('defeat');
    }

    // Calculate game statistics
    const stats = this.calculateGameStats();
    
    // Build per-faction leaderboard
    const allFactions = this.state.factionRegistry.getAll();
    const factionRows = allFactions
      .map(f => {
        const territories = this.state.getTerritoriesOwnedBy(f.id).length;
        const fStats = statisticsManager.getFactionStats(f.id);
        const isWinner = f.id === data.winner;
        return { f, territories, fStats, isWinner };
      })
      .sort((a, b) => b.territories - a.territories)
      .map((entry, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const highlight = entry.isWinner ? `background: rgba(0,0,0,0.06); border-radius: 6px;` : '';
        return `<tr style="${highlight}">
          <td style="padding: 0.4rem 0.5rem;">${medal}</td>
          <td style="padding: 0.4rem 0.5rem; font-weight: 600; color: ${entry.f.color};">${entry.f.name}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.territories}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.fStats?.unitsKilled ?? 0}</td>
          <td style="padding: 0.4rem 0.5rem; text-align: center;">${entry.fStats?.unitsLost ?? 0}</td>
        </tr>`;
      }).join('');

    const durationMin = Math.round(Math.max(0, (Date.now() - this.gameConfig.startTime) / 60000));
    const durationStr = durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : `${durationMin}m`;

    // Create victory modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'victory-modal';
    modal.innerHTML = `
      <div class="modal-content" style="text-align: center; max-width: 580px;">
        <h2>${isPlayerVictory ? '🏆 VICTORY!' : '💀 DEFEAT'}</h2>
        <div style="font-size: 3.5rem; margin: 0.5rem 0;">${isPlayerVictory ? '👑' : '⚰️'}</div>
        <p style="font-size: 1.4rem; font-family: 'Cinzel', serif; color: ${faction?.color ?? '#333'}; margin: 0.25rem 0;">
          <strong>${faction?.name ?? data.winner}</strong>
        </p>
        <p style="font-size: 1rem; color: var(--text-muted); margin-bottom: 1.25rem;">
          ${isPlayerVictory ? 'has conquered the world!' : 'has defeated you!'}
          &nbsp;·&nbsp; Turn ${stats.turns} &nbsp;·&nbsp; ${durationStr}
        </p>

        <div style="background: rgba(0,0,0,0.05); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; text-align: left;">
          <h3 style="text-align: center; margin: 0 0 0.75rem; font-size: 0.95rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Final Standings</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
            <thead>
              <tr style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; border-bottom: 1px solid rgba(0,0,0,0.1);">
                <th style="padding: 0.25rem 0.5rem; text-align: left;"></th>
                <th style="padding: 0.25rem 0.5rem; text-align: left;">Faction</th>
                <th style="padding: 0.25rem 0.5rem;">Territories</th>
                <th style="padding: 0.25rem 0.5rem;">Kills</th>
                <th style="padding: 0.25rem 0.5rem;">Losses</th>
              </tr>
            </thead>
            <tbody>${factionRows}</tbody>
          </table>
        </div>

        <div style="background: rgba(0,0,0,0.05); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; text-align: left;">
          <h3 style="text-align: center; margin: 0 0 0.75rem; font-size: 0.95rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Your Performance</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; font-size: 0.9rem;">
            <div>⚔️ Battles Fought</div><div style="text-align: right;"><strong>${stats.battlesFought}</strong></div>
            <div>💰 Total IPCs Earned</div><div style="text-align: right;"><strong>${stats.totalIncome}</strong></div>
            <div>🏭 Units Produced</div><div style="text-align: right;"><strong>${stats.unitsProduced}</strong></div>
            <div>💀 Enemies Destroyed</div><div style="text-align: right;"><strong>${stats.enemiesDestroyed}</strong></div>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button class="primary" id="btn-victory-play-again">🔄 Play Again</button>
          <button id="btn-victory-review">📊 Review Map</button>
          <button id="btn-victory-main-menu">🏠 Main Menu</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-victory-play-again')?.addEventListener('click', () => location.reload());
    document.getElementById('btn-victory-review')?.addEventListener('click', () => modal.remove());
    document.getElementById('btn-victory-main-menu')?.addEventListener('click', () => {
      modal.remove();
      this.events.emit('showMainMenu');
    });

    // Confetti burst for player victory
    if (isPlayerVictory) {
      this.runConfetti(5000);
    }
  }

  /**
   * Run a confetti particle animation over the screen for `durationMs` milliseconds
   */
  private runConfetti(durationMs: number): void {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10000;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;

    const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#ff9f43', '#a29bfe'];
    const particles: { x: number; y: number; vx: number; vy: number; color: string; size: number; angle: number; spin: number }[] = [];
    for (let i = 0; i < 180; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -10 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.2,
      });
    }

    const end = Date.now() + durationMs;
    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.angle += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    };
    requestAnimationFrame(frame);
  }

  // ==================== NEW UI FEATURES ====================

  /**
   * Setup mini-map
   */
  private setupMinimap(): void {
    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!this.minimapCanvas) return;

    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.minimapCanvas.width = 200;
    this.minimapCanvas.height = 120;

    // Click to navigate
    this.minimapCanvas.addEventListener('click', (e) => {
      const rect = this.minimapCanvas!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      this.renderer.navigateToPercent(x, y);
    });

    // In-HUD volume slider
    const zoomControls = document.getElementById('zoom-controls');
    if (zoomControls) {
      const volWrapper = document.createElement('div');
      volWrapper.className = 'hud-volume-ctrl';
      volWrapper.title = 'Master volume';
      volWrapper.innerHTML = `<span class="hud-vol-icon">🔊</span><input type="range" id="hud-volume-slider" min="0" max="100" step="5" value="${settings.getSetting('masterVolume')}" class="hud-vol-slider">`;
      zoomControls.appendChild(volWrapper);

      const slider = volWrapper.querySelector('#hud-volume-slider') as HTMLInputElement;
      slider?.addEventListener('input', () => {
        const vol = Number(slider.value);
        settings.update({ masterVolume: vol });
        soundManager.updateMusicVolume();
        const icon = volWrapper.querySelector('.hud-vol-icon') as HTMLElement;
        if (icon) icon.textContent = vol === 0 ? '🔇' : vol < 50 ? '🔉' : '🔊';
      });
    }

    // Threat overlay toggle button
    const minimapContainer = document.getElementById('minimap-container');
    if (minimapContainer) {
      const threatBtn = document.createElement('button');
      threatBtn.id = 'btn-minimap-threat';
      threatBtn.className = 'minimap-threat-btn';
      threatBtn.title = 'Toggle threat overlay (shows your territories under threat)';
      threatBtn.textContent = '🔴';
      threatBtn.addEventListener('click', () => {
        this.minimapThreatMode = !this.minimapThreatMode;
        threatBtn.classList.toggle('active', this.minimapThreatMode);
        this.renderMinimap();
      });
      minimapContainer.appendChild(threatBtn);
    }

    // Initial render
    this.renderMinimap();
  }

  /**
   * Render mini-map
   */
  renderMinimap(): void {
    if (!this.minimapCtx || !this.minimapCanvas) return;

    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    // Clear
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, w, h);

    // Calculate bounds of all territories
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const territory of this.state.territories.values()) {
      for (const [px, py] of territory.polygon) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    }

    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;
    const scaleX = w / mapWidth;
    const scaleY = h / mapHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    const offsetX = (w - mapWidth * scale) / 2;
    const offsetY = (h - mapHeight * scale) / 2;

    // Get selected and combat territories for highlighting
    const selectedId = this.state.selectedTerritoryId;
    const combatId = this.activeCombat?.territoryId;
    const pendingAttackTargets = this.state.pendingMoves.map(m => m.toTerritoryId);

    // Draw territories
    for (const territory of this.state.territories.values()) {
      ctx.beginPath();
      const poly = territory.polygon;
      if (poly.length < 3) continue;

      ctx.moveTo((poly[0][0] - minX) * scale + offsetX, (poly[0][1] - minY) * scale + offsetY);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo((poly[i][0] - minX) * scale + offsetX, (poly[i][1] - minY) * scale + offsetY);
      }
      ctx.closePath();

      // Color by owner (or threat level in threat mode)
      if (territory.isSea()) {
        ctx.fillStyle = '#1a3a5c';
      } else if (!territory.owner) {
        ctx.fillStyle = '#5c5c5c';
      } else if (this.minimapThreatMode) {
        const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
        if (humanFaction) {
          if (territory.owner === humanFaction.id) {
            const isThreatened = territory.adjacentTo.some(adjId => {
              const adj = this.state.territories.get(adjId);
              return adj?.owner && humanFaction.isEnemyOf(adj.owner) && adj.getTotalUnitCount() > 0;
            });
            ctx.fillStyle = isThreatened ? '#ef4444' : '#22c55e';
          } else if (humanFaction.isEnemyOf(territory.owner)) {
            ctx.fillStyle = '#f97316';
          } else {
            ctx.fillStyle = '#94a3b8';
          }
        } else {
          const ownerFaction = this.state.factionRegistry.get(territory.owner);
          ctx.fillStyle = ownerFaction?.color ?? '#5c5c5c';
        }
      } else {
        const ownerFaction = this.state.factionRegistry.get(territory.owner);
        ctx.fillStyle = ownerFaction?.color ?? '#5c5c5c';
      }
      ctx.fill();
      
      // Highlight selected territory
      if (territory.id === selectedId) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } 
      // Highlight combat territory
      else if (territory.id === combatId) {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      // Highlight pending attack targets
      else if (pendingAttackTargets.includes(territory.id)) {
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      else {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
    
    // Draw capital markers
    for (const territory of this.state.territories.values()) {
      if (territory.isCapital) {
        const centerX = (territory.center[0] - minX) * scale + offsetX;
        const centerY = (territory.center[1] - minY) * scale + offsetY;
        ctx.fillStyle = '#ffd700';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', centerX, centerY);
      }
    }
  }

  /**
   * Update turn order display
   */
  updateTurnOrder(): void {
    const container = document.getElementById('turn-order');
    if (!container) return;

    const factions = this.state.factionRegistry.getInTurnOrder();
    const currentId = this.state.currentFactionId;
    const currentIdx = factions.findIndex(f => f.id === currentId);

    let html = '';
    factions.forEach((faction, idx) => {
      const isCurrent = faction.id === currentId;
      const isNext = idx === (currentIdx + 1) % factions.length;
      const statusClass = isCurrent ? 'current' : (isNext ? 'next' : '');
      
      html += `
        <div class="turn-order-item ${statusClass}" title="${faction.name}">
          <div class="turn-order-dot" style="background: ${faction.color};"></div>
          <span>${faction.name.split(' ')[0]}</span>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  /**
   * Update faction panel
   */
  updateFactionPanel(): void {
    const container = document.getElementById('faction-panel-content');
    if (!container) return;

    const factions = this.state.factionRegistry.getInTurnOrder();
    const currentId = this.state.currentFactionId;

    // Pre-compute max values for relative bar widths
    const allTerr = factions.map(f => this.state.getTerritoriesOwnedBy(f.id).length);
    const allUnits = factions.map(f => this.state.getTerritoriesOwnedBy(f.id).reduce((s, t) => s + t.getTotalUnitCount(), 0));
    const maxTerr = Math.max(...allTerr, 1);
    const maxUnits = Math.max(...allUnits, 1);

    let html = '';
    for (let i = 0; i < factions.length; i++) {
      const faction = factions[i];
      const territories = this.state.getTerritoriesOwnedBy(faction.id);
      const totalUnits = allUnits[i];
      const isCurrent = faction.id === currentId;
      const isDefeated = faction.isDefeated;

      const terrPct = Math.round((territories.length / maxTerr) * 100);
      const unitsPct = Math.round((totalUnits / maxUnits) * 100);
      const color = faction.color;

      html += `
        <div class="faction-row ${isCurrent ? 'current' : ''} ${isDefeated ? 'defeated' : ''}">
          <div class="faction-color" style="background: ${color};"></div>
          <div class="faction-info">
            <div class="faction-name">${faction.name}</div>
            <div class="faction-bars">
              <div class="fb-row" title="${territories.length} territories">
                <span class="fb-icon">🗺️</span>
                <div class="fb-track"><div class="fb-fill" style="width:${terrPct}%;background:${color};"></div></div>
                <span class="fb-val">${territories.length}</span>
              </div>
              <div class="fb-row" title="${totalUnits} units">
                <span class="fb-icon">⚔️</span>
                <div class="fb-track"><div class="fb-fill" style="width:${unitsPct}%;background:${color};"></div></div>
                <span class="fb-val">${totalUnits}</span>
              </div>
              <div class="fb-row fb-ipc" title="${faction.ipcs} IPCs">
                <span class="fb-icon">💰</span>
                <span class="fb-val">${faction.ipcs}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  /**
   * Toggle faction panel
   */
  private toggleFactionPanel(): void {
    const panel = document.getElementById('faction-panel');
    if (panel) {
      this.factionPanelCollapsed = !this.factionPanelCollapsed;
      panel.classList.toggle('collapsed', this.factionPanelCollapsed);
    }
  }

  /**
   * Show battle preview
   */
  private showBattlePreview(fromId: string, toId: string): void {
    this.pendingAttackFrom = fromId;
    this.pendingAttackTarget = toId;

    const fromTerritory = this.state.territories.get(fromId);
    const toTerritory = this.state.territories.get(toId);
    if (!fromTerritory || !toTerritory) return;

    const modal = document.getElementById('battle-preview-modal');
    if (modal) modal.classList.remove('hidden');

    // Territory name with bonuses
    const territoryEl = document.getElementById('preview-territory');
    let territoryLabel = `Attack on ${toTerritory.name}`;
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      territoryLabel += ' ⚠️ +1 Defense Bonus';
    }
    if (territoryEl) territoryEl.textContent = territoryLabel;

    // Count artillery for boost indicator
    let artilleryCount = 0;
    let infantryCount = 0;
    for (const pu of fromTerritory.units) {
      if (pu.unitTypeId === 'artillery') artilleryCount += pu.count;
      if (pu.unitTypeId === 'infantry') infantryCount += pu.count;
    }

    // Attacker units
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
    // Add artillery boost info
    const boostedInfantry = Math.min(artilleryCount, infantryCount);
    if (boostedInfantry > 0) {
      attackerHtml += `<div style="color:#059669;margin-top:0.5rem"><small>🎯 Artillery boosts ${boostedInfantry} infantry (+${boostedInfantry} attack)</small></div>`;
      attackPower += boostedInfantry;
    }
    if (attackerUnitsEl) attackerUnitsEl.innerHTML = attackerHtml || '<em>No units</em>';
    
    const attackPowerEl = document.getElementById('preview-attacker-power');
    if (attackPowerEl) attackPowerEl.textContent = `Attack Power: ${attackPower}`;

    // Defender units
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
    // Add terrain bonus info
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      defenderHtml += `<div style="color:#dc2626;margin-top:0.5rem"><small>🏰 Terrain bonus: +1 defense first round</small></div>`;
    }
    if (defenderUnitsEl) defenderUnitsEl.innerHTML = defenderHtml || '<em>Undefended!</em>';
    
    const defensePowerEl = document.getElementById('preview-defender-power');
    if (defensePowerEl) defensePowerEl.textContent = `Defense Power: ${defensePower}`;

    // Calculate odds (account for terrain bonus approximately)
    let effectiveDefense = defensePower;
    if (toTerritory.isCapital || toTerritory.hasFactory) {
      const defenderUnitCount = toTerritory.units.reduce((sum, u) => sum + u.count, 0);
      effectiveDefense += defenderUnitCount; // +1 per defender for terrain
    }
    const odds = this.calculateBattleOdds(attackPower, effectiveDefense);
    const oddsEl = document.getElementById('odds-display');
    if (oddsEl) {
      oddsEl.textContent = `~${Math.round(odds * 100)}%`;
      oddsEl.className = odds >= 0.65 ? 'good' : odds >= 0.4 ? 'even' : 'bad';
    }
  }

  /**
   * Calculate rough battle odds
   */
  private calculateBattleOdds(attackPower: number, defensePower: number): number {
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

  /**
   * Confirm attack from preview - START COMBAT IMMEDIATELY
   */
  private confirmAttackFromPreview(): void {
    if (!this.pendingAttackFrom || !this.pendingAttackTarget) return;

    const fromTerritory = this.state.territories.get(this.pendingAttackFrom);
    const toTerritory = this.state.territories.get(this.pendingAttackTarget);
    const faction = this.state.getCurrentFaction();

    if (!fromTerritory || !toTerritory || !faction) {
      this.closeBattlePreview();
      return;
    }

    this.closeBattlePreview();

    // Get attacking units (units with attack > 0)
    const attackingUnits: { unitTypeId: string; count: number; veteranCount?: number }[] = [];
    for (const pu of fromTerritory.units) {
      const unitType = this.state.unitRegistry.get(pu.unitTypeId);
      if (unitType && unitType.attack > 0) {
        attackingUnits.push({ unitTypeId: pu.unitTypeId, count: pu.count, veteranCount: pu.veteranCount ?? 0 });
      }
    }

    if (attackingUnits.length === 0) {
      this.showToast('No units can attack!', 'info');
      return;
    }

    // Get defending units
    const defendingUnits: { unitTypeId: string; count: number }[] = [];
    for (const pu of toTerritory.units) {
      defendingUnits.push({ unitTypeId: pu.unitTypeId, count: pu.count });
    }

    // Undefended/neutral territory - capture immediately
    if (defendingUnits.length === 0) {
      // Move attackers
      for (const au of attackingUnits) {
        fromTerritory.removeUnits(au.unitTypeId, au.count);
        toTerritory.addUnits(au.unitTypeId, au.count);
      }
      toTerritory.owner = faction.id;
      this.showToast(`Captured ${toTerritory.name}!`, 'success');
      soundManager.play('capture');
      battleLog.logCapture(this.state.turnNumber, faction.name, faction.color, toTerritory.name);
      this.renderer.render();
      this.renderMinimap();
      return;
    }

    // Enemy territory with defenders - START COMBAT
    console.log('Starting combat:', { attackingUnits, defendingUnits });
    
    // Create combat state using the resolver
    const combat = this.combatResolver.initiateCombat(
      toTerritory.id,
      faction.id,
      attackingUnits
    );

    if (!combat) {
      this.showToast('Cannot initiate combat!', 'info');
      return;
    }

    // Store source territory for moving units after combat
    combat.sourceTerritory = this.pendingAttackFrom;

    // Show combat modal
    this.showCombatModal(combat);
    soundManager.play('combat_start');
    battleLog.logCombat(this.state.turnNumber, faction.name, faction.color, `Attacking ${toTerritory.name}`);

    this.renderer.render();
    this.updateSelectionInfo();
  }

  /**
   * Close battle preview
   */
  private closeBattlePreview(): void {
    const modal = document.getElementById('battle-preview-modal');
    if (modal) modal.classList.add('hidden');
    this.pendingAttackFrom = null;
    this.pendingAttackTarget = null;
  }

  /**
   * Undo last action
   */
  private undoLastAction(): void {
    // First try to undo individual moves
    if (this.moveHistory.length > 0) {
      const lastAction = this.moveHistory.pop()!;
      
      if (lastAction.type === 'queue') {
        // Remove from pending moves
        const idx = this.state.pendingMoves.findIndex(
          m => m.fromTerritoryId === lastAction.data.from && 
               m.toTerritoryId === lastAction.data.to
        );
        if (idx !== -1) {
          this.state.pendingMoves.splice(idx, 1);
        }
        this.showToast('Attack cancelled', 'info');
      } else if (lastAction.type === 'move') {
        // Reverse the move
        const from = this.state.territories.get(lastAction.data.to);
        const to = this.state.territories.get(lastAction.data.from);
        if (from && to) {
          for (const unit of lastAction.data.units) {
            // Remove movedCount from destination (they haven't acted after all)
            const destUnit = from.units.find(u => u.unitTypeId === unit.unitTypeId);
            if (destUnit && destUnit.movedCount) {
              destUnit.movedCount = Math.max(0, destUnit.movedCount - unit.count);
            }
            
            from.removeUnits(unit.unitTypeId, unit.count);
            to.addUnits(unit.unitTypeId, unit.count);
          }
        }
        this.showToast('Move undone', 'info');
      }

      this.updateActionButtons();
      this.renderer.render();
      soundManager.play('click');
      this.updateUndoButton();
      return;
    }

    // No individual moves to undo - try phase-level undo
    this.undoPhase();
  }

  /**
   * Undo to the start of the current phase
   */
  private undoPhase(): void {
    if (this.phaseSnapshots.length < 2) {
      this.showToast('Nothing to undo', 'info');
      return;
    }

    // Pop current phase snapshot
    this.phaseSnapshots.pop();
    // Get previous phase snapshot
    const previousSnapshot = this.phaseSnapshots[this.phaseSnapshots.length - 1];
    
    if (!previousSnapshot) {
      this.showToast('Nothing to undo', 'info');
      return;
    }

    // Restore the snapshot
    this.state.loadFromJSON(previousSnapshot);
    
    // Clear move history
    this.moveHistory = [];
    
    // Update all UI
    this.renderer.render();
    this.renderMinimap();
    this.updateTurnInfo();
    this.updatePhaseInfo();
    this.updateFactionPanel();
    this.updateActionButtons();
    
    this.showToast('Phase undone!', 'success');
    soundManager.play('click');
  }

  /**
   * Update undo button state
   */
  private updateUndoButton(): void {
    const btn = document.getElementById('btn-undo') as HTMLButtonElement;
    if (btn) {
      const canUndo = this.moveHistory.length > 0 || this.phaseSnapshots.length >= 2;
      btn.disabled = !canUndo;
      
      // Update button text based on what will be undone
      if (this.moveHistory.length > 0) {
        btn.textContent = '↩️ Undo Move';
        btn.title = 'Undo last move';
      } else if (this.phaseSnapshots.length >= 2) {
        btn.textContent = '↩️ Undo Phase';
        btn.title = 'Revert to start of phase';
      } else {
        btn.textContent = '↩️ Back';
        btn.title = 'Nothing to undo';
      }
    }
  }

  /**
   * Show unit tooltip
   */
  showUnitTooltip(unitTypeId: string, x: number, y: number): void {
    const unitType = this.state.unitRegistry.get(unitTypeId);
    if (!unitType) return;

    const tooltip = document.getElementById('unit-tooltip');
    const content = document.getElementById('tooltip-content');
    if (!tooltip || !content) return;

    const icon = UNIT_ICONS[unitTypeId] || '⬜';
    
    content.innerHTML = `
      <div class="tooltip-title">${icon} ${unitType.name}</div>
      <div class="tooltip-stat"><span>Attack:</span><span>${unitType.attack}</span></div>
      <div class="tooltip-stat"><span>Defense:</span><span>${unitType.defense}</span></div>
      <div class="tooltip-stat"><span>Movement:</span><span>${unitType.movement}</span></div>
      <div class="tooltip-stat"><span>Cost:</span><span>${unitType.cost} IPCs</span></div>
      <div class="tooltip-stat"><span>Domain:</span><span>${unitType.domain}</span></div>
      ${unitType.hitPoints > 1 ? `<div class="tooltip-stat"><span>Hit Points:</span><span>${unitType.hitPoints}</span></div>` : ''}
      ${unitType.canBlitz ? '<div style="color: #8b6914; margin-top: 0.5rem;">⚡ Can Blitz</div>' : ''}
      ${unitType.canBombard ? '<div style="color: #2563a8; margin-top: 0.25rem;">💥 Bombardment</div>' : ''}
      ${(unitType as any).canStrategicBomb ? '<div style="color: #dc2626; margin-top: 0.25rem;">🏭 Strategic Bombing</div>' : ''}
      ${(unitType as any).requiredTransport ? '<div style="color: #6366f1; margin-top: 0.25rem;">⚓ Needs Transport</div>' : ''}
    `;

    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
    tooltip.classList.remove('hidden');
  }

  /**
   * Hide unit tooltip
   */
  hideUnitTooltip(): void {
    const tooltip = document.getElementById('unit-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
  }

  // ==================== EVENT ANNOUNCEMENTS ====================

  private showEventAnnouncement(event: { name: string; description: string; type: string }, factionId: string): void {
    const ann = document.getElementById('event-announcement');
    if (!ann) return;

    const faction = this.state.factionRegistry.get(factionId);
    // Only show announcements for human-controlled factions or if it's notable
    const isHumanFaction = faction?.controlledBy === 'human';
    if (!isHumanFaction && faction) return;

    const typeIcons: Record<string, string> = {
      economic: '💰', military: '⚔️', political: '🏛️',
      intelligence: '🕵️', disaster: '🌪️', opportunity: '✨', choice: '🎭',
    };
    const icon = typeIcons[event.type] || '📜';

    const iconEl = document.getElementById('event-ann-icon');
    const titleEl = document.getElementById('event-ann-title');
    const descEl = document.getElementById('event-ann-desc');
    const factionEl = document.getElementById('event-ann-faction');

    if (iconEl) iconEl.textContent = icon;
    if (titleEl) titleEl.textContent = event.name;
    if (descEl) descEl.textContent = event.description;
    if (factionEl) factionEl.textContent = faction ? `— ${faction.name}` : '';

    ann.classList.remove('hidden');

    if (this.eventDismissTimer !== null) clearTimeout(this.eventDismissTimer);
    this.eventDismissTimer = setTimeout(() => {
      ann.classList.add('hidden');
      this.eventDismissTimer = null;
    }, 4000);
  }

  // ==================== DIPLOMACY UI ====================

  private showDiplomacyProposalToast(fromId: string, toId: string, duration: number): void {
    const currentFaction = this.state.getCurrentFaction();
    if (currentFaction?.id !== toId) return; // only show to the target faction

    const fromFaction = this.state.factionRegistry.get(fromId);
    if (!fromFaction) return;

    const toast = document.getElementById('diplomacy-proposal-toast');
    const textEl = document.getElementById('dp-toast-text');
    if (!toast || !textEl) return;

    textEl.textContent = `${fromFaction.name} proposes a ${duration}-turn non-aggression pact. Neither side can attack the other.`;
    toast.classList.remove('hidden');
    this.pendingProposal = { fromId, toId, duration };

    const acceptBtn = document.getElementById('btn-accept-pact');
    const declineBtn = document.getElementById('btn-decline-pact');

    const cleanup = () => {
      toast.classList.add('hidden');
      this.pendingProposal = null;
    };

    if (acceptBtn) {
      acceptBtn.onclick = () => {
        if (this.pendingProposal) {
          this.state.diplomacyManager.accept(
            this.pendingProposal.fromId,
            this.pendingProposal.toId,
            this.pendingProposal.duration,
            this.state.turnNumber
          );
          this.showToast(`Peace pact with ${fromFaction.name} accepted (${duration} turns)`, 'success');
        }
        cleanup();
      };
    }
    if (declineBtn) {
      declineBtn.onclick = () => {
        if (this.pendingProposal) {
          this.state.diplomacyManager.decline(this.pendingProposal.fromId, this.pendingProposal.toId);
          this.showToast(`Pact with ${fromFaction.name} declined`, 'info');
        }
        cleanup();
      };
    }
  }

  showDiplomacyModal(): void {
    const modal = document.getElementById('diplomacy-modal');
    if (modal) modal.classList.remove('hidden');
    this.updateDiplomacyModal();
  }

  private updateDiplomacyModal(): void {
    const container = document.getElementById('diplomacy-relations');
    if (!container) return;

    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) return;

    const factions = this.state.factionRegistry.getAll().filter(f => f.id !== currentFaction.id);
    if (factions.length === 0) {
      container.innerHTML = '<p style="color:#888;">No other factions.</p>';
      return;
    }

    container.innerHTML = factions.map(f => {
      const rel = this.state.diplomacyManager.getRelation(currentFaction.id, f.id);
      const pactInfo = this.state.diplomacyManager.getPactInfo(currentFaction.id, f.id);
      const relLabel = rel === 'pact'
        ? `<span style="color:#22c55e;">🤝 Non-Aggression Pact${pactInfo ? ` (${pactInfo.turnsLeft} turns left)` : ''}</span>`
        : `<span style="color:#ef4444;">⚔️ At War</span>`;

      const canPropose = rel !== 'pact' && currentFaction.controlledBy === 'human';
      const proposeBtn = canPropose
        ? `<button onclick="window.__hudInstance.proposeDiplomaticPact('${f.id}')"
             style="padding:0.3rem 0.75rem;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;">
             Propose Pact (3 turns)
           </button>`
        : '';

      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:rgba(255,255,255,0.05);border-radius:8px;">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <div style="width:14px;height:14px;border-radius:50%;background:${f.color};"></div>
            <span style="font-weight:600;">${f.name}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem;">
            ${relLabel}
            ${proposeBtn}
          </div>
        </div>`;
    }).join('');
  }

  proposeDiplomaticPact(toFactionId: string): void {
    const currentFaction = this.state.getCurrentFaction();
    if (!currentFaction) return;
    this.state.diplomacyManager.propose(currentFaction.id, toFactionId, 3, this.state.turnNumber);
    this.showToast('Peace proposal sent!', 'success');
    this.updateDiplomacyModal();
  }

  // ==================== TECHNOLOGY ====================

  /**
   * Show technology research modal
   */
  private showTechModal(): void {
    const modal = document.getElementById('tech-modal');
    if (modal) modal.classList.remove('hidden');
    this.updateTechModal('all');
    this.setupTechCategoryButtons();
  }

  /**
   * Close technology modal
   */
  private closeTechModal(): void {
    const modal = document.getElementById('tech-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Setup tech category filter buttons
   */
  private setupTechCategoryButtons(): void {
    document.querySelectorAll('.tech-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tech-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.getAttribute('data-cat') || 'all';
        this.updateTechModal(cat);
      });
    });
  }

  /**
   * Update technology modal content
   */
  private updateTechModal(category: string): void {
    const techListEl = document.getElementById('tech-list');
    const researchedListEl = document.getElementById('researched-list');
    const faction = this.state.getCurrentFaction();
    
    if (!techListEl || !faction) return;

    const available = this.technologyManager.getAvailableTech(faction.id);
    const researched = this.technologyManager.getResearchedTech(faction.id);

    // Filter by category
    const filtered = category === 'all' 
      ? available 
      : available.filter(t => t.category === category);

    let html = '';
    for (const tech of filtered) {
      const canAfford = faction.ipcs >= tech.cost;
      const hasPrereqs = !tech.prerequisites || tech.prerequisites.every(
        p => this.technologyManager.hasTech(faction.id, p)
      );
      const locked = !hasPrereqs;
      
      html += `
        <div class="tech-card ${locked ? 'locked' : ''}" data-tech="${tech.id}" 
             title="${locked ? 'Requires: ' + (tech.prerequisites?.join(', ') || '') : ''}">
          <div class="tech-icon">${tech.icon}</div>
          <div class="tech-name">${tech.name}</div>
          <div class="tech-cost">${canAfford ? '' : '⚠️'} ${tech.cost} IPCs</div>
          <div class="tech-desc">${tech.description}</div>
        </div>
      `;
    }

    if (filtered.length === 0) {
      html = '<p style="text-align: center; color: #888; grid-column: 1/-1;">No technologies available in this category</p>';
    }

    techListEl.innerHTML = html;

    // Add click handlers
    techListEl.querySelectorAll('.tech-card:not(.locked)').forEach(el => {
      el.addEventListener('click', () => {
        const techId = el.getAttribute('data-tech');
        if (techId) this.researchTech(techId);
      });
    });

    // Update researched list
    if (researchedListEl) {
      if (researched.length === 0) {
        researchedListEl.innerHTML = '<span style="color: #888;">No technologies researched yet</span>';
      } else {
        researchedListEl.innerHTML = researched.map(t => 
          `<span class="researched-badge">${t.icon} ${t.name}</span>`
        ).join('');
      }
    }
  }

  /**
   * Research a technology
   */
  private researchTech(techId: string): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const tech = TECHNOLOGIES.find(t => t.id === techId);
    if (!tech) return;

    if (faction.ipcs < tech.cost) {
      this.showToast(`Not enough IPCs! Need ${tech.cost}`, 'info');
      return;
    }

    const success = this.technologyManager.startResearch(faction.id, techId);
    if (success) {
      this.showToast(`Researched ${tech.name}!`, 'success');
      soundManager.play('build');
      statisticsManager.trackTechResearched(faction.id);
      statisticsManager.trackSpending(faction.id, tech.cost);
      this.updateTechModal('all');
      this.updateTurnInfo();
    }
  }

  // ==================== STATISTICS ====================

  /**
   * Show statistics modal
   */
  private showStatsModal(): void {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.remove('hidden');
    this.updateStatsModal();
  }

  /**
   * Close statistics modal
   */
  private closeStatsModal(): void {
    const modal = document.getElementById('stats-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Update statistics modal content
   */
  private updateStatsModal(): void {
    const allStats = statisticsManager.getAllStats();
    const faction = this.state.getCurrentFaction();
    
    // Overview stats
    const turnsEl = document.getElementById('stat-turns');
    const battlesEl = document.getElementById('stat-battles');
    const durationEl = document.getElementById('stat-duration');
    const veteransEl = document.getElementById('stat-veterans');

    if (turnsEl) turnsEl.textContent = String(allStats.totalTurns);
    if (battlesEl) battlesEl.textContent = String(allStats.totalBattles);
    if (durationEl) durationEl.textContent = `${statisticsManager.getGameDuration()}m`;
    
    // Count all veterans
    let totalVeterans = 0;
    for (const [, stats] of allStats.factionStats) {
      totalVeterans += stats.veteranUnits + stats.eliteUnits;
    }
    if (veteransEl) veteransEl.textContent = String(totalVeterans);

    // Leaderboard
    const leaderboardEl = document.getElementById('stats-leaderboard');
    if (leaderboardEl) {
      const leaderboard = statisticsManager.getLeaderboard();
      const rankIcons = ['🥇', '🥈', '🥉', '4️⃣'];
      
      leaderboardEl.innerHTML = leaderboard.map((entry, i) => {
        const factionData = this.state.factionRegistry.get(entry.factionId);
        return `
          <div class="leaderboard-row ${i === 0 ? 'first' : ''}">
            <div class="leaderboard-rank">${rankIcons[i] || (i + 1)}</div>
            <div class="leaderboard-name" style="color: ${factionData?.color || '#fff'}">
              ${factionData?.name || entry.factionId}
            </div>
            <div class="leaderboard-score">${entry.score} pts</div>
          </div>
        `;
      }).join('');
    }

    // Player stats
    const playerStatsEl = document.getElementById('stats-player');
    if (playerStatsEl && faction) {
      const stats = statisticsManager.getFactionStats(faction.id);
      if (stats) {
        playerStatsEl.innerHTML = `
          <div class="player-stat">
            <span class="player-stat-label">Units Produced</span>
            <span class="player-stat-value">${stats.unitsProduced}</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Units Lost</span>
            <span class="player-stat-value">${stats.unitsLost}</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Units Killed</span>
            <span class="player-stat-value">${stats.unitsKilled}</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Territories Captured</span>
            <span class="player-stat-value">${stats.territoriesCaptured}</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Battles Won</span>
            <span class="player-stat-value">${stats.battlesWon}</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Battles Lost</span>
            <span class="player-stat-value">${stats.battlesLost}</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Total Income</span>
            <span class="player-stat-value">${stats.totalIncomeEarned} IPCs</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Total Spent</span>
            <span class="player-stat-value">${stats.totalIPCsSpent} IPCs</span>
          </div>
          <div class="player-stat">
            <span class="player-stat-label">Tech Researched</span>
            <span class="player-stat-value">${stats.techResearched}</span>
          </div>
        `;
      }
    }

    // Persistent (all-time) stats
    const persistentEl = document.getElementById('stats-persistent');
    if (persistentEl) {
      const data = getPersistentStats();
      let html = '';
      if (data.totalGames === 0) {
        html = '<p style="color: #888;">No games recorded yet.</p>';
      } else {
        const avgLen = data.totalGames > 0 ? (data.totalDurationMinutes ?? 0) / data.totalGames : 0;
        html += `<div class="stat-card" style="grid-column: 1 / -1;"><strong>Total games:</strong> ${data.totalGames} &nbsp;|&nbsp; <strong>Avg length:</strong> ${avgLen.toFixed(1)}m</div>`;
        for (const [fid, f] of Object.entries(data.byFaction)) {
          const factionData = this.state.factionRegistry.get(fid);
          const winRate = f.gamesPlayed > 0 ? ((f.wins / f.gamesPlayed) * 100).toFixed(0) : '0';
          html += `<div class="stat-card" style="border-left: 3px solid ${factionData?.color ?? '#666'}">
            <strong>${factionData?.name ?? fid}</strong><br>
            Played: ${f.gamesPlayed} &nbsp; Wins: ${f.wins} &nbsp; Win rate: ${winRate}%
          </div>`;
        }
      }
      persistentEl.innerHTML = html;
    }

    // Turn log
    const turnLogEl = document.getElementById('stats-turn-log') as HTMLTextAreaElement;
    if (turnLogEl) {
      turnLogEl.value = turnLog.exportText() || '(No log entries yet)';
    }
  }

  // ==================== NEW GAME & CONFIG ====================

  /**
   * Show new game modal (populate map dropdown from registry)
   */
  showNewGameModal(): void {
    const modal = document.getElementById('new-game-modal');
    const mapSelect = document.getElementById('map-select') as HTMLSelectElement;
    if (mapSelect) {
      const list = getMapList();
      mapSelect.innerHTML = list.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
    }
    if (modal) modal.classList.remove('hidden');
  }

  /**
   * Hide new game modal
   */
  hideNewGameModal(): void {
    const modal = document.getElementById('new-game-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Start new game with current configuration
   */
  private onStartNewGame(): void {
    // Read config from form
    const mapId = (document.getElementById('map-select') as HTMLSelectElement)?.value || 'world';
    const unitEra = (document.getElementById('unit-era') as HTMLSelectElement)?.value as UnitEra || 'wwii';
    const presetHold10 = (document.getElementById('preset-hold10') as HTMLInputElement)?.checked ?? false;
    const mode = (document.getElementById('game-mode') as HTMLSelectElement)?.value || 'vs-ai';
    const turnStyle = (document.getElementById('turn-style') as HTMLSelectElement)?.value || 'classic';
    const victoryType = (document.getElementById('victory-type') as HTMLSelectElement)?.value || 'capitals';
    const capitalsToWin = parseInt((document.getElementById('victory-capitals') as HTMLInputElement)?.value || '3') || 3;
    const territoriesPercent = parseInt((document.getElementById('victory-domination') as HTMLInputElement)?.value || '75') || 75;
    const economicTarget = parseInt((document.getElementById('victory-economic') as HTMLInputElement)?.value || '500') || 500;
    let turnLimit = parseInt((document.getElementById('turn-limit') as HTMLSelectElement)?.value || '50');
    if (presetHold10) turnLimit = 10;
    if (mapId === 'tutorial') turnLimit = Math.min(turnLimit, 15);
    const fogOfWar = (document.getElementById('fog-of-war') as HTMLInputElement)?.checked ?? true;
    const autoSave = (document.getElementById('auto-save') as HTMLInputElement)?.checked ?? true;

    // Get human factions for hot seat
    const humanFactions: string[] = [];
    if (mode === 'hotseat') {
      const select = document.getElementById('human-factions') as HTMLSelectElement;
      if (select) {
        for (const option of Array.from(select.selectedOptions)) {
          humanFactions.push(option.value);
        }
      }
    } else {
      const playerFactionSelect = document.getElementById('player-faction') as HTMLSelectElement;
      const playerFaction = playerFactionSelect?.value || 'atlantic_alliance';
      if (playerFaction === 'random') {
        const playable = this.state.factionRegistry.getPlayable().map(f => f.id);
        humanFactions.push(playable[Math.floor(Math.random() * playable.length)] || 'atlantic_alliance');
      } else {
        humanFactions.push(playerFaction);
      }
    }

    // Update game config
    this.gameConfig = {
      ...defaultConfig,
      mapId,
      unitEra,
      mode: mode as 'vs-ai' | 'hotseat',
      humanFactions,
      turnStyle: turnStyle as TurnStyle,
      victoryType: victoryType as VictoryType,
      capitalsToWin,
      territoriesPercent,
      economicTarget,
      turnLimit,
      fogOfWar,
      autoSave,
      startTime: Date.now(),
    };

    console.log('=== NEW GAME CONFIG ===');
    console.log('Turn Style:', turnStyle);
    console.log('Unit Era:', unitEra);
    console.log('Victory Type:', victoryType);
    console.log('Fog of War:', fogOfWar);
    console.log('Mode:', mode);
    console.log('========================');

    // Update faction controllers for hot seat
    for (const faction of this.state.factionRegistry.getAll()) {
      faction.controlledBy = humanFactions.includes(faction.id) ? 'human' : 'ai';
    }

    this.hideNewGameModal();
    
    // Clear battle log and turn log
    battleLog.clear();
    turnLog.clear();
    battleLog.add(
      1, 
      'Start', 
      'Game', 
      '#fbbf24', 
      'general', 
      `New game started! Victory: ${victoryType}`
    );

    // Emit game started event
    this.events.emit('gameStarted', { config: this.gameConfig });
    
    this.showToast('Game started!', 'success');
  }

  // ==================== HOT SEAT ====================

  /**
   * Show hot seat turn banner
   */
  showHotSeatBanner(factionName: string, factionColor: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.gameConfig.mode !== 'hotseat') {
        resolve();
        return;
      }

      const wasAlreadyShowing = this.showingHotSeatBanner;
      this.showingHotSeatBanner = true;
      void wasAlreadyShowing;

      const banner = document.createElement('div');
      banner.id = 'hotseat-banner';
      banner.innerHTML = `
        <h2 style="color: ${factionColor};">${factionName}'s Turn</h2>
        <div class="faction-color-block" style="background: ${factionColor};"></div>
        <p>Pass the device to the next player</p>
        <button class="primary" id="btn-hotseat-ready" style="font-size: 1.2rem; padding: 1rem 2rem;">
          I'm Ready!
        </button>
      `;
      document.body.appendChild(banner);

      document.getElementById('btn-hotseat-ready')?.addEventListener('click', () => {
        banner.remove();
        this.showingHotSeatBanner = false;
        resolve();
      });
    });
  }

  /**
   * Show spectator mode continue prompt (between AI turns)
   */
  showSpectatorContinue(factionName: string, factionColor: string): Promise<void> {
    return new Promise((resolve) => {
      const banner = document.createElement('div');
      banner.id = 'hotseat-banner';
      banner.innerHTML = `
        <h2 style="color: ${factionColor};">${factionName} finished</h2>
        <div class="faction-color-block" style="background: ${factionColor};"></div>
        <p>Review their moves on the map</p>
        <button class="primary" id="btn-spectator-continue" style="font-size: 1.2rem; padding: 1rem 2rem;">
          ▶️ Continue
        </button>
      `;
      document.body.appendChild(banner);

      document.getElementById('btn-spectator-continue')?.addEventListener('click', () => {
        banner.remove();
        resolve();
      });
    });
  }

  // ==================== AUTO-SAVE ====================

  /**
   * Trigger auto-save if enabled
   */
  triggerAutoSave(): void {
    if (!this.gameConfig.autoSave) return;
    
    // This will be called by the game when phases change
    this.events.emit('autoSave', {});
  }

  // ==================== FOG OF WAR ====================

  /**
   * Toggle fog of war on/off mid-game
   */
  toggleFogOfWar(): void {
    this.gameConfig.fogOfWar = !this.gameConfig.fogOfWar;
    const btn = document.getElementById('btn-fog-toggle');
    if (btn) {
      btn.textContent = this.gameConfig.fogOfWar ? '🌫️ Fog' : '👁️ Fog';
      btn.title = this.gameConfig.fogOfWar ? 'Fog of war ON — click to disable' : 'Fog of war OFF — click to enable';
      btn.style.opacity = this.gameConfig.fogOfWar ? '1' : '0.5';
    }
    this.renderer.render();
    this.showToast(this.gameConfig.fogOfWar ? 'Fog of war enabled' : 'Fog of war disabled', 'info');
  }

  /**
   * Check if a territory is visible to the current faction
   */
  isTerritoryVisible(territoryId: string): boolean {
    // Fog of war disabled - everything visible
    if (!this.gameConfig.fogOfWar) return true;

    const faction = this.state.getCurrentFaction();
    if (!faction) {
      console.warn('isTerritoryVisible: No current faction!');
      return true; // Show everything if no faction
    }

    // Only apply fog of war for human players
    if (faction.controlledBy !== 'human') {
      return true; // AI can see everything (for rendering)
    }

    const territory = this.state.territories.get(territoryId);
    if (!territory) {
      console.warn(`isTerritoryVisible: Territory ${territoryId} not found!`);
      return true; // Show if territory missing
    }

    // Own territories are always visible
    if (territory.owner === faction.id) return true;

    // Adjacent territories are visible
    for (const adjId of territory.adjacentTo) {
      const adj = this.state.territories.get(adjId);
      if (adj && adj.owner === faction.id) return true;
    }

    return false;
  }

  /**
   * Get visible territories for current faction
   */
  getVisibleTerritories(): Set<string> {
    const visible = new Set<string>();
    
    if (!this.gameConfig.fogOfWar) {
      // All territories visible
      for (const id of this.state.territories.keys()) {
        visible.add(id);
      }
      return visible;
    }

    const faction = this.state.getCurrentFaction();
    if (!faction) return visible;

    // Add owned territories and their neighbors
    for (const [id, territory] of this.state.territories) {
      if (territory.owner === faction.id) {
        visible.add(id);
        for (const adjId of territory.adjacentTo) {
          visible.add(adjId);
        }
      }
    }

    return visible;
  }

  // ==================== BATTLE LOG INTEGRATION ====================

  /**
   * Log a game event to the battle log
   */
  logEvent(type: 'combat' | 'move' | 'build' | 'income' | 'capture', message: string): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    switch (type) {
      case 'combat':
        battleLog.logCombat(this.state.turnNumber, faction.name, faction.color, message);
        break;
      case 'move':
        battleLog.logMove(this.state.turnNumber, faction.name, faction.color, message);
        break;
      case 'build':
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color, message);
        break;
      case 'income':
        battleLog.logIncome(this.state.turnNumber, faction.name, faction.color, parseInt(message) || 0);
        break;
      case 'capture':
        battleLog.logCapture(this.state.turnNumber, faction.name, faction.color, message);
        break;
    }
  }

  // ==================== VICTORY CHECK ====================

  /**
   * Check for victory conditions
   */
  checkVictoryConditions(): void {
    const result = checkVictory(this.gameConfig, {
      factionRegistry: this.state.factionRegistry,
      territories: this.state.territories,
      turnNumber: this.state.turnNumber,
    });

    if (result.winner) {
      this.events.emit('gameOver', { 
        winner: result.winner, 
        reason: result.reason 
      });
      this.showVictoryScreen({ winner: result.winner });
    }
  }

  /**
   * Track IPC earned for economic victory
   */
  trackIncome(factionId: string, amount: number): void {
    const current = this.gameConfig.totalIPCsEarned.get(factionId) || 0;
    this.gameConfig.totalIPCsEarned.set(factionId, current + amount);
  }

  /**
   * Calculate game statistics
   */
  private calculateGameStats(): {
    turns: number;
    territoriesControlled: number;
    battlesFought: number;
    totalIncome: number;
    unitsProduced: number;
    enemiesDestroyed: number;
  } {
    const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
    const territories = humanFaction ? this.state.getTerritoriesOwnedBy(humanFaction.id) : [];
    const fStats = humanFaction ? statisticsManager.getFactionStats(humanFaction.id) : undefined;

    return {
      turns: this.state.turnNumber,
      territoriesControlled: territories.length,
      battlesFought: (fStats?.battlesWon ?? 0) + (fStats?.battlesLost ?? 0),
      totalIncome: fStats?.totalIncomeEarned ?? 0,
      unitsProduced: fStats?.unitsProduced ?? 0,
      enemiesDestroyed: fStats?.unitsKilled ?? 0,
    };
  }
}
