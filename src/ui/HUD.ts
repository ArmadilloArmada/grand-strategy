/**
 * HUD - Heads-up display controller
 * Handles all UI updates and interactions
 */

import { GameState } from '../engine/GameState';
import { TurnManager } from '../engine/TurnManager';
import { MovementValidator, ValidMove } from '../engine/MovementValidator';
import { ProductionManager } from '../engine/ProductionManager';
import { MobilizationSystem } from '../engine/MobilizationSystem';
import { CombatResolver } from '../engine/CombatResolver';
import { MapRenderer } from '../renderer/MapRenderer';
import { soundManager } from '../audio/SoundManager';
import { battleLog } from './BattleLog';
import { visualEffects } from './VisualEffects';
import { achievementManager, Achievement } from '../engine/AchievementManager';
import { GameConfig, defaultConfig, checkVictory, TurnStyle, TURN_STYLE_INFO, UnitEra, UNIT_ERA_INFO, VictoryType } from '../engine/GameConfig';
import { settings } from './Settings';
import { getPhaseDisplayName as getPhaseDisplayNameFromStyle } from '../engine/TurnStyleManager';
import { TechnologyManager } from '../engine/TechnologyManager';
import { statisticsManager } from '../engine/StatisticsManager';
import { turnLog } from '../engine/TurnLog';
import { getMapEntry, getMapList } from '../data/mapRegistry';
import type { FactionData } from '../data/Faction';
import type { MapData } from '../loaders/MapLoader';
import { ESPIONAGE_OPS } from '../engine/EspionageSystem';
import { UNIT_ICONS } from './hudConstants';
import { CombatUI } from './CombatUI';
import { ProductionUI } from './ProductionUI';
import { MinimapController } from './MinimapController';
import { VictoryScreen } from './VictoryScreen';
import { TechUI } from './TechUI';
import { StatsUI } from './StatsUI';
import { DiplomacyUI } from './DiplomacyUI';
import { TutorialController } from './TutorialController';
import { UndoController } from './UndoController';
import { OverlayController } from './OverlayController';
import { TensionSystem } from '../engine/TensionSystem';
import { ObjectiveSystem, Objective } from '../engine/ObjectiveSystem';
import { FactionAbilityManager, factionAbilityManager, FACTION_ABILITIES, applyFactionAbility } from '../engine/FactionAbilities';
import { getAITaunt } from '../engine/AITaunts';
import { SupplySystem } from '../engine/SupplySystem';
import { getLevel, xpToNextLevel, ALL_TRAITS } from '../engine/CommanderProgression';
import { calculateTerritoryThreat, TerritoryThreat } from '../engine/ThreatAnalyzer';
import { getMaxCapturableCapitals, normalizeCapitalsToWin } from '../engine/SetupValidation';
import { dragManager } from './DragManager';
import { toastManager } from './ToastManager';
import { aiActivityFeed } from './AIActivityFeed';
import { FirstWarRoom } from './FirstWarRoom';
import { StrategicAdvisor } from './StrategicAdvisor';
import { PhaseGuidance } from './PhaseGuidance';
import { TurnRecapPanel, TurnRecapStats } from './TurnRecapPanel';
import { AbilityPanel } from './AbilityPanel';
import { showFirstRunTutorialOffer } from './hud/OnboardingPrompt';
import { resolveTerritorySelectionMove, splitMoveAndAttackTargets } from './hud/MovementSelection';
import { isAttackMovePhase, isBuildPhase, isCombatPhase, isMovementPhase } from './hud/PhaseHelpers';

export class HUD {
  private movementValidator: MovementValidator;
  private productionManager: ProductionManager;
  private mobilizationSystem: MobilizationSystem;
  private combatResolver: CombatResolver;
  public technologyManager: TechnologyManager;

  // UI modules
  private combatUI!: CombatUI;
  private productionUI!: ProductionUI;
  private minimapController!: MinimapController;
  private victoryScreen!: VictoryScreen;
  private techUI!: TechUI;
  private statsUI!: StatsUI;
  private diplomacyUI!: DiplomacyUI;
  private firstWarRoom!: FirstWarRoom;
  private strategicAdvisor!: StrategicAdvisor;
  private phaseGuidance!: PhaseGuidance;
  private turnRecapPanel!: TurnRecapPanel;
  private abilityPanel!: AbilityPanel;

  // Current UI state
  private selectedUnitType: string | null = null;
  private validMoves: ValidMove[] = [];

  // Extracted sub-controllers
  private tutorialController!: TutorialController;
  private undoController!: UndoController;
  private overlayController!: OverlayController;

  // Faction panel collapsed state
  private factionPanelCollapsed: boolean = false;

  // Dynamic feature systems
  public tensionSystem!: TensionSystem;
  public objectiveSystem!: ObjectiveSystem;
  private supplySystem!: SupplySystem;
  private abilityManager: FactionAbilityManager = factionAbilityManager;
  private pendingAbilityTarget: boolean = false;

  // Injected by main.ts so HUD can control AI turn speed
  private aiSpeedCallback: ((multiplier: number) => void) | null = null;

  // Optional timed-turn display
  private turnTimerInterval: ReturnType<typeof setInterval> | null = null;
  private turnTimerSeconds: number = 0;

  // Suppress the "YOUR TURN" banner on the very first game load
  public isFirstTurnLoad: boolean = true;

  setAISpeedCallback(cb: (multiplier: number) => void): void {
    this.aiSpeedCallback = cb;
  }


  // Game configuration
  public gameConfig: GameConfig = { ...defaultConfig };

  // Phase recap: counts for current phase (battles, territories captured)
  private battlesThisPhase: number = 0;
  private territoriesCapturedThisPhase: number = 0;
  private turnRecap: TurnRecapStats | null = null;

  // Event announcement dismiss timer
  private eventDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private victoryHandled = false;

  // IPC flash tracking
  private prevIPCs: number = -1;

  // Commander move mode
  private commanderMoveSource: string | null = null;

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
    state.systems.reserveSystem = this.productionManager.getReserveSystem();
    this.mobilizationSystem = new MobilizationSystem(state);
    this.combatResolver = new CombatResolver(state);
    this.technologyManager = new TechnologyManager(state);
    this.phaseGuidance = new PhaseGuidance(state, this.movementValidator, this.mobilizationSystem);
    this.turnRecapPanel = new TurnRecapPanel();
    this.abilityPanel = new AbilityPanel();

    const combatCallbacks = {
      showToast: (msg: string, type: 'success' | 'info' | 'error') => this.showToast(msg, type),
      renderMinimap: () => this.renderMinimap(),
      updateFactionPanel: () => this.updateFactionPanel(),
      updateSelectionInfo: () => this.updateSelectionInfo(),
      updateActionButtons: () => this.updateActionButtons(),
    };
    this.combatUI = new CombatUI(state, renderer, this.combatResolver, combatCallbacks);

    const productionCallbacks = {
      showToast: (msg: string, type: 'success' | 'info' | 'error') => this.showToast(msg, type),
      updateMobilizationHighlights: () => this.updateMobilizationHighlights(),
      updateSelectionInfo: () => this.updateSelectionInfo(),
      onMobilized: (territoryId: string, cost: number, units: { unitTypeId: string; count: number }[]) => {
        this.undoController.recordMove({ type: 'mobilize', data: { territoryId, cost, units } });
        this.undoController.updateButtons();
      },
    };
    this.productionUI = new ProductionUI(state, renderer, this.productionManager, this.mobilizationSystem, productionCallbacks);

    this.minimapController = new MinimapController(
      state, renderer,
      () => this.combatUI.getActiveCombat()
    );

    this.victoryScreen = new VictoryScreen(
      state,
      () => this.gameConfig,
      { showMainMenu: () => this.events.emit('showMainMenu') }
    );

    this.techUI = new TechUI(state, this.technologyManager, {
      showToast: (msg: string, type: 'success' | 'info' | 'error') => this.showToast(msg, type),
      updateTurnInfo: () => this.updateTurnInfo(),
    });

    this.statsUI = new StatsUI(state);

    this.diplomacyUI = new DiplomacyUI(state, {
      showToast: (msg: string, type: 'success' | 'info' | 'error') => this.showToast(msg, type),
    });

    // Initialize sub-controllers
    this.tutorialController = new TutorialController({
      showToast: (msg, type) => this.showToast(msg, type),
    });
    this.undoController = new UndoController(state, renderer, {
      showToast: (msg, type) => this.showToast(msg, type),
      renderMinimap: () => this.renderMinimap(),
      updateTurnInfo: () => this.updateTurnInfo(),
      updatePhaseInfo: () => this.updatePhaseInfo(),
      updateFactionPanel: () => this.updateFactionPanel(),
      updateActionButtons: () => this.updateActionButtons(),
      undoMobilize: (territoryId, cost, units) => {
        const faction = this.state.getCurrentFaction();
        if (faction) faction.ipcs += cost;
        const territory = this.state.territories.get(territoryId);
        if (territory) {
          for (const u of units) territory.removeUnits(u.unitTypeId, u.count);
        }
        this.mobilizationSystem.undoMobilize(territoryId);
        this.updateMobilizationHighlights();
        this.productionUI.updateMobilizationOptions();
        const ipcEl = document.getElementById('ipc-display');
        if (ipcEl && faction) ipcEl.textContent = `${faction.ipcs} IPCs`;
      },
    });
    this.overlayController = new OverlayController(state, renderer, {
      showToast: (msg, type) => this.showToast(msg, type),
    });
    this.firstWarRoom = new FirstWarRoom({
      focusTerritory: (territoryId) => this.runAdvisorAction('focus-territory', territoryId),
      showObjectives: () => {
        this.updateObjectivesPanel();
        document.getElementById('objectives-panel')?.classList.remove('hidden');
      },
      showThreatOverlay: () => this.overlayController.setMode('threat'),
    });
    this.strategicAdvisor = new StrategicAdvisor((action, territoryId) => {
      this.runAdvisorAction(action, territoryId);
    });

    renderer.setContextMenuCallback((territoryId, clientX, clientY) =>
      this.showTerritoryContextMenu(territoryId, clientX, clientY)
    );

    // Initialize statistics for all factions
    for (const faction of state.factionRegistry.getAll()) {
      statisticsManager.initFaction(faction.id);
      this.technologyManager.initFaction(faction.id);
    }

    // Setup achievement unlock callback
    achievementManager.onUnlock((achievement) => this.showAchievementPopup(achievement));

    // Initialize dynamic feature systems
    this.tensionSystem = new TensionSystem(state);
    this.objectiveSystem = new ObjectiveSystem(state);
    this.supplySystem = new SupplySystem(state);

    this.setupEventListeners();
    this.subscribeToGameEvents();
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
    this.enhanceCommandBar();
    this.setupWarRoomLayout();
    this.setupHQLayout();
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
    document.getElementById('btn-roll-combat')?.addEventListener('click', () => this.combatUI.onRollCombat());
    document.getElementById('btn-auto-resolve')?.addEventListener('click', () => this.combatUI.onAutoResolve());
    document.getElementById('btn-retreat')?.addEventListener('click', () => this.combatUI.onRetreat());
    document.getElementById('btn-close-combat')?.addEventListener('click', () => this.combatUI.onCloseCombat());

    // Strategic bombing button
    document.getElementById('btn-strategic-bomb')?.addEventListener('click', () => this.combatUI.showStrategicBombingModal());

    // Fortify button
    document.getElementById('btn-fortify')?.addEventListener('click', () => this.onFortifyClick());

    // Build modal buttons (mobilization system - no confirm/queue buttons)
    document.getElementById('btn-cancel-build')?.addEventListener('click', () => this.productionUI.closeBuildModal());

    // Factory Hub buttons
    document.getElementById('fh-btn-optimize')?.addEventListener('click', () => this.productionUI.optimizeFactoryHubOrders());
    document.getElementById('fh-btn-close')?.addEventListener('click', () => this.productionUI.closeFactoryHub());
    document.getElementById('fh-btn-clear')?.addEventListener('click', () => {
      this.productionManager.clearQueue();
      this.productionUI.renderFactoryHub();
    });
    document.getElementById('fh-btn-confirm')?.addEventListener('click', () => this.productionUI.confirmFactoryHubOrders());

    // Deployment modal buttons
    document.getElementById('btn-confirm-deploy')?.addEventListener('click', () => this.productionUI.onConfirmDeploy());
    document.getElementById('btn-auto-deploy')?.addEventListener('click', () => this.productionUI.onAutoDeploy());
    document.getElementById('btn-skip-deploy')?.addEventListener('click', () => this.productionUI.closeDeploymentModal());
    document.getElementById('btn-clear-deploy')?.addEventListener('click', () => this.productionUI.onClearDeploy());

    // Technology modal
    document.getElementById('btn-research')?.addEventListener('click', () => this.techUI.show());
    document.getElementById('btn-close-tech')?.addEventListener('click', () => this.techUI.close());

    // Diplomacy modal
    document.getElementById('btn-diplomacy')?.addEventListener('click', () => this.diplomacyUI.showModal());
    document.getElementById('btn-close-diplomacy')?.addEventListener('click', () => {
      document.getElementById('diplomacy-modal')?.classList.add('hidden');
    });

    // Expose proposeDiplomaticPact for inline onclick in diplomacy modal
    (window as any).__hudInstance = this;

    // Fog of war toggle
    document.getElementById('btn-fog-toggle')?.addEventListener('click', () => this.toggleFogOfWar());

    // Espionage
    document.getElementById('btn-espionage')?.addEventListener('click', () => this.showEspionageModal());
    document.getElementById('btn-close-espionage')?.addEventListener('click', () => {
      document.getElementById('espionage-modal')?.classList.add('hidden');
    });

    // Nuclear
    document.getElementById('btn-nuclear')?.addEventListener('click', () => this.showNuclearModal());
    document.getElementById('btn-close-nuclear')?.addEventListener('click', () => {
      document.getElementById('nuclear-modal')?.classList.add('hidden');
    });

    // Alliance betrayal announcement listener
    this.state.on('alliance_betrayed', (e: any) => {
      const d = e.data as { betrayerName: string; betrayedName: string };
      soundManager.play('hit');
      this.showToast(`BETRAYAL! ${d.betrayerName} has stabbed ${d.betrayedName} in the back!`, 'info');
      battleLog.logCombat(
        this.state.turnNumber,
        d.betrayerName,
        '#ff0000',
        `BETRAYAL: ${d.betrayerName} ended their alliance with ${d.betrayedName}. War declared!`
      );
    });

    // Diplomacy event sounds
    this.state.on('diplomacy_proposal', () => soundManager.play('click'));
    this.state.on('diplomacy_accepted', () => soundManager.play('income'));
    this.state.on('diplomacy_declined', () => soundManager.play('miss'));

    // Espionage result sounds
    this.state.on('espionage_result', (e: any) => {
      const d = e.data as { success: boolean; exposed: boolean };
      soundManager.play(d.exposed ? 'hit' : d.success ? 'click' : 'miss');
    });

    // Nuclear strike announcement listener
    this.state.on('nuclear_strike', (e: any) => {
      const d = e.data as { factionId: string; targetTerritoryName: string; unitsDestroyed: number };
      soundManager.play('nuclear');
      visualEffects.nuclearFlash();
      visualEffects.shockwave(window.innerWidth / 2, window.innerHeight / 2);
      setTimeout(() => {
        const launcherFaction = this.state.factionRegistry.get(d.factionId);
        const container = document.getElementById('toast-container');
        if (container) {
          const toast = document.createElement('div');
          toast.className = 'toast error';
          toast.style.cssText = 'font-size:1.15rem;font-weight:bold;border:2px solid #ef4444;padding:1rem 1.5rem;';
          toast.innerHTML = `NUCLEAR STRIKE!<br><span style="font-size:0.9rem;font-weight:normal;">${launcherFaction?.name ?? 'Unknown'} annihilated ${d.targetTerritoryName} - ${d.unitsDestroyed} units destroyed!</span>`;
          container.appendChild(toast);
          setTimeout(() => toast.remove(), 6000);
        }
      }, 800);
    });

    // Statistics modal
    document.getElementById('btn-stats')?.addEventListener('click', () => this.statsUI.show());
    document.getElementById('btn-close-stats')?.addEventListener('click', () => this.statsUI.close());
    document.getElementById('btn-export-turn-log')?.addEventListener('click', () => {
      const text = turnLog.exportText();
      if (text) {
        navigator.clipboard.writeText(text).then(() => this.showToast('Turn log copied to clipboard', 'success'));
      }
    });

    // Undo/Redo buttons
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undoLastAction());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.undoController.redo());

    // Zoom controls
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.renderer.zoom(1.2));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.renderer.zoom(0.8));
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => {
      this.fitMapToCommandLayout();
      this.showToast('Map view reset', 'info');
    });
    document.getElementById('btn-ui-reset')?.addEventListener('click', () => this.resetUIToCommandLayout());
    document.getElementById('btn-overlay')?.addEventListener('click', () => this.cycleOverlay());
    this.updateMapReadabilityLegend();

    // Faction panel toggle
    document.getElementById('faction-panel-header')?.addEventListener('click', () => this.toggleFactionPanel());
    document.getElementById('btn-toggle-factions')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFactionPanel();
    });

    // Battle preview buttons
    document.getElementById('btn-confirm-attack')?.addEventListener('click', () => this.combatUI.confirmAttackFromPreview());
    document.getElementById('btn-cancel-attack')?.addEventListener('click', () => this.combatUI.closeBattlePreview());

    // Mini-map setup
    this.minimapController.setup();

    // Territory hover tooltip
    this.setupTerritoryTooltip();

    // New game modal handlers
    document.getElementById('game-mode')?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value;
      const hotseatOptions = document.getElementById('hotseat-options');
      const vsAiOptions = document.getElementById('vs-ai-options');
      if (hotseatOptions) hotseatOptions.classList.toggle('hidden', mode !== 'hotseat');
      if (vsAiOptions) vsAiOptions.classList.toggle('hidden', mode !== 'vs-ai');
      this.updateSetupSummary();
    });

    // Turn style description updater
    document.getElementById('turn-style')?.addEventListener('change', (e) => {
      const style = (e.target as HTMLSelectElement).value as TurnStyle;
      const descEl = document.getElementById('turn-style-description');
      if (descEl && TURN_STYLE_INFO[style]) {
        descEl.textContent = TURN_STYLE_INFO[style].description;
      }
      this.updateSetupSummary();
    });

    // Unit era description update
    document.getElementById('unit-era')?.addEventListener('change', (e) => {
      const era = (e.target as HTMLSelectElement).value as UnitEra;
      const descEl = document.getElementById('unit-era-description');
      if (descEl && UNIT_ERA_INFO[era]) {
        descEl.textContent = UNIT_ERA_INFO[era].description;
      }
      this.updateSetupSummary();
    });

    // Victory type: show/hide custom fields
    const updateVictoryRows = () => {
      const v = (document.getElementById('victory-type') as HTMLSelectElement)?.value || 'capitals';
      document.getElementById('victory-capitals-row')?.classList.toggle('hidden', v !== 'capitals');
      document.getElementById('victory-domination-row')?.classList.toggle('hidden', v !== 'domination');
      document.getElementById('victory-economic-row')?.classList.toggle('hidden', v !== 'economic');
    };
    document.getElementById('victory-type')?.addEventListener('change', () => {
      updateVictoryRows();
      this.updateSetupSummary();
    });

    document.getElementById('map-select')?.addEventListener('change', () => {
      this.refreshSetupFactionOptions();
      this.syncSetupHelpers();
    });

    const factionSelect = document.getElementById('player-faction') as HTMLSelectElement | null;
    if (factionSelect) {
      const updateFactionCard = () => {
        this.updateFactionInfoCard(factionSelect.value);
        this.updateSetupSummary();
      };
      factionSelect.addEventListener('change', updateFactionCard);
      updateFactionCard();
    }

    for (const id of [
      'map-select',
      'preset-hold10',
      'human-factions',
      'victory-capitals',
      'victory-domination',
      'victory-economic',
      'turn-limit',
      'fog-of-war',
      'auto-save',
    ]) {
      document.getElementById(id)?.addEventListener('change', () => this.updateSetupSummary());
      document.getElementById(id)?.addEventListener('input', () => this.updateSetupSummary());
    }

    document.getElementById('btn-start-game')?.addEventListener('click', () => this.onStartNewGame());
    document.getElementById('btn-cancel-new-game')?.addEventListener('click', () => this.hideNewGameModal());

    document.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Battle log territory focus: center map and pulse the territory
    document.addEventListener('battlelog:focus-territory', (e) => {
      const tid = (e as CustomEvent<{ territoryId: string }>).detail.territoryId;
      if (!tid) return;
      this.renderer.centerOnTerritory(tid);
      const faction = this.state.factionRegistry.get(
        this.state.territories.get(tid)?.owner ?? ''
      );
      this.renderer.startCaptureAnimation(tid, faction?.color ?? '#fbbf24');
    });

    // Universal modal UX: backdrop click closes + inject sticky × button into every modal
    document.querySelectorAll<HTMLElement>('.modal').forEach(modal => {
      // Skip modals that are non-dismissable (e.g. combat modal while active)
      const isCombat = modal.id === 'combat-modal';

      // Backdrop click: clicking the overlay (not the content) closes the modal
      modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        const closeBtn = modal.querySelector<HTMLElement>('[id^="btn-close"]');
        closeBtn?.click();
      });

      // Inject a sticky × close button only when the existing close button is a
      // labelled button at the bottom (text "Close"), not already a top-corner ×.
      if (!isCombat) {
        const content = modal.querySelector<HTMLElement>('.modal-content');
        const existingClose = modal.querySelector<HTMLElement>('[id^="btn-close"]');
        const alreadyHasXBtn = existingClose && existingClose.textContent?.trim() === '×';
        if (content && !content.querySelector('.modal-x-close') && !alreadyHasXBtn) {
          const xBtn = document.createElement('button');
          xBtn.className = 'modal-x-close';
          xBtn.textContent = '×';
          xBtn.setAttribute('aria-label', 'Close');
          xBtn.addEventListener('click', () => {
            existingClose?.click();
          });
          content.insertBefore(xBtn, content.firstChild);
        }
      }
    });
  }

  private enhanceCommandBar(): void {
    // The ops-console layout already has ACTIONS / COMMAND zone labels.
    // No further DOM surgery needed — just mark as done.
    const bar = document.getElementById('action-buttons');
    if (bar) bar.dataset.enhanced = 'true';
  }

  private setupWarRoomLayout(): void {
    if (document.getElementById('war-room-panel')) return;

    const panel = document.createElement('aside');
    panel.id = 'war-room-panel';
    panel.innerHTML = `
      <div id="war-room-header">
        <span>War Room</span>
        <button id="btn-toggle-war-room" title="Collapse War Room">-</button>
      </div>
      <div id="war-room-content"></div>
    `;
    document.body.appendChild(panel);

    const content = panel.querySelector('#war-room-content');
    const advisor = document.getElementById('strategic-advisor-panel') ?? document.createElement('section');
    advisor.id = 'strategic-advisor-panel';
    advisor.classList.add('war-room-section', 'hidden');
    content?.appendChild(advisor);

    const objectives = document.getElementById('objectives-panel');
    if (objectives) {
      objectives.removeAttribute('style');
      objectives.classList.add('war-room-section');
      Array.from(objectives.children).forEach(child => {
        if ((child as HTMLElement).id !== 'objectives-list' && !child.classList.contains('war-room-section-title')) {
          child.remove();
        }
      });
      const title = objectives.querySelector('.war-room-section-title');
      if (!title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'war-room-section-title';
        titleEl.textContent = 'Objectives';
        objectives.prepend(titleEl);
      }
      const list = document.getElementById('objectives-list');
      list?.removeAttribute('style');
      list?.classList.add('war-room-list');
      content?.appendChild(objectives);
    }

    // Victory progress now lives in the ops-console center zone — leave it there.

    const factions = document.getElementById('faction-panel');
    if (factions) {
      factions.classList.add('war-room-section');
      content?.appendChild(factions);
    }

    panel.querySelector('#btn-toggle-war-room')?.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  }

  private setupHQLayout(): void {
    // Skip only on very narrow viewports; keep HQ Hub enabled on most laptop widths.
    if (window.innerWidth <= 700) return;
    if (document.getElementById('hq-panel')) return;

    const panel = document.createElement('aside');
    panel.id = 'hq-panel';
    panel.innerHTML = `
      <div id="hq-header">
        <span>HQ</span>
        <button id="btn-toggle-hq" title="Collapse HQ panel">−</button>
      </div>
      <div id="hq-content"></div>
    `;
    document.body.appendChild(panel);

    const content = panel.querySelector('#hq-content') as HTMLElement;

    // MINIMAP — top of HQ panel, giving a tactical overview at all times
    const minimap = document.getElementById('minimap-container');
    if (minimap) {
      content.appendChild(minimap);
    }

    // RECAP SLOT — turn/phase recap cards render here instead of floating over screen
    const recapSlot = document.createElement('div');
    recapSlot.id = 'hq-recap-slot';
    content.appendChild(recapSlot);

    // TERRITORY section — move #selection-info into HQ
    const selection = document.getElementById('selection-info');
    if (selection) {
      selection.removeAttribute('style');
      selection.classList.add('war-room-section');
      if (!selection.querySelector('.war-room-section-title')) {
        const t = document.createElement('div');
        t.className = 'war-room-section-title';
        t.textContent = 'Territory';
        selection.prepend(t);
      }
      content.appendChild(selection);
    }

    // ABILITY section — wrap supply indicator + faction ability
    const abilityWrap = document.createElement('div');
    abilityWrap.id = 'hq-ability-section';
    abilityWrap.className = 'war-room-section';
    const abilityTitle = document.createElement('div');
    abilityTitle.className = 'war-room-section-title';
    abilityTitle.textContent = 'Ability';
    abilityWrap.appendChild(abilityTitle);
    const supply = document.getElementById('supply-indicator');
    if (supply) { supply.removeAttribute('style'); abilityWrap.appendChild(supply); }
    const ability = document.getElementById('faction-ability-container');
    if (ability) { ability.removeAttribute('style'); abilityWrap.appendChild(ability); }
    content.appendChild(abilityWrap);

    // BATTLE LOG section — move #battle-log-panel into HQ, expanded by default
    const blog = document.getElementById('battle-log-panel');
    if (blog) {
      blog.removeAttribute('style');
      content.appendChild(blog);
    }
    battleLog.setCollapsed(false);

    panel.querySelector('#btn-toggle-hq')?.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      soundManager.play('click');
    });
  }

  fitMapToCommandLayout(): void {
    this.renderer.fitToScreen(this.getCommandLayoutInsets());
  }

  resetUIToCommandLayout(): void {
    battleLog.setCollapsed(true);
    document.getElementById('war-room-panel')?.classList.remove('collapsed');
    document.getElementById('hq-panel')?.classList.remove('collapsed');
    dragManager.resetLayoutInPlace();
    requestAnimationFrame(() => {
      this.updateMapReadabilityLegend();
      this.fitMapToCommandLayout();
    });
    this.showToast('UI layout reset', 'success');
  }

  private getCommandLayoutInsets(): { top: number; right: number; bottom: number; left: number } {
    const hqPanel = document.getElementById('hq-panel');
    const warRoom = document.getElementById('war-room-panel');
    const actions = document.getElementById('action-buttons');
    const fhTray = document.getElementById('factory-hub-tray');

    const hqRect = hqPanel?.classList.contains('collapsed') ? null : hqPanel?.getBoundingClientRect();
    const warRoomRect = warRoom?.classList.contains('collapsed') ? null : warRoom?.getBoundingClientRect();
    const actionsRect = actions?.classList.contains('hidden') ? null : actions?.getBoundingClientRect();
    const fhOpen = fhTray && !fhTray.classList.contains('hidden');

    // Action bar is now at the TOP of the screen, so bottom inset comes from
    // the factory hub tray (when open) or a small fixed clearance.
    const bottomInset = fhOpen ? 150 : 64;

    return {
      left:   hqRect      ? Math.ceil(hqRect.right + 24)                       : 48,
      right:  warRoomRect ? Math.ceil(window.innerWidth - warRoomRect.left + 24): 48,
      top:    actionsRect ? Math.ceil(actionsRect.bottom + 18)                  : 110,
      bottom: bottomInset,
    };
  }

  /**
   * Global keyboard shortcut handler — supplements the main.ts handler.
   * Handles shortcuts that need direct access to HUD sub-controllers.
   */
  private handleKeyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = e.key;
    const ctrl = e.ctrlKey || e.metaKey;

    // Undo / Redo
    if (ctrl && (key === 'z' || key === 'Z')) { e.preventDefault(); this.undoLastAction(); return; }
    if (ctrl && (key === 'y' || key === 'Y')) { e.preventDefault(); this.undoController.redo(); return; }

    const modalOpen = !!document.querySelector('.modal:not(.hidden)');
    if (modalOpen) {
      // Escape closes the frontmost modal
      if (key === 'Escape') {
        const openModal = document.querySelector('.modal:not(.hidden)');
        const closeBtn = openModal?.querySelector<HTMLElement>('[id^="btn-close"]');
        closeBtn?.click();
      }
      return;
    }

    const faction = this.state.getCurrentFaction();
    const isHumanTurn = faction?.controlledBy === 'human';

    switch (key) {
      case 'F': if (e.shiftKey) { e.preventDefault(); this.resetUIToCommandLayout(); } break;
      case 'm': case 'M': if (isHumanTurn) this.onMoveClick(); break;
      case 'a': case 'A': if (isHumanTurn) this.onAttackShortcut(); break;
      case 'r': case 'R': if (isHumanTurn) this.techUI.show(); break;
      case 'd': case 'D': if (isHumanTurn) this.diplomacyUI.showModal(); break;
      case 's': case 'S': if (isHumanTurn) this.showAISpeedMenu(); break;
      case '+': case '=': this.renderer.zoom(1.2); break;
      case '-': this.renderer.zoom(0.8); break;
    }
  }

  /**
   * Setup territory hover tooltip
   */
  private setupTerritoryTooltip(): void {
    // Hide all tooltips whenever any modal opens (class mutation: hidden removed)
    const modalObserver = new MutationObserver(() => {
      if (document.querySelector('.modal:not(.hidden)')) {
        document.getElementById('territory-tooltip')?.classList.add('hidden');
        document.getElementById('unit-tooltip')?.classList.add('hidden');
      }
    });
    document.querySelectorAll('.modal').forEach(m => {
      modalObserver.observe(m, { attributes: true, attributeFilter: ['class'] });
    });

    this.renderer.setTerritoryHoverCallback((territoryId, clientX, clientY) => {
      const el = document.getElementById('territory-tooltip');
      const content = document.getElementById('territory-tooltip-content');
      if (!el || !content) return;
      // Suppress while any modal is open or the AI is taking its turn
      if (document.querySelector('.modal:not(.hidden)') || this.state.getCurrentFaction()?.controlledBy === 'ai') {
        el.classList.add('hidden');
        return;
      }
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
      
      // Respect fog of war — hide enemy unit details in hidden territories
      let threatInfo = '';
      if (isOwnTerritory && faction) {
        const threat = calculateTerritoryThreat(this.state, territory, faction);
        if (threat.threatLevel > 0) {
          const status = threat.defenseGap > 0 ? 'Under-defended front' : 'Covered front';
          const bgColor = threat.defenseGap > 0 ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.12)';
          const textColor = threat.defenseGap > 0 ? '#b91c1c' : '#92400e';
          threatInfo = `<div style="margin-top: 0.5rem; padding: 0.4rem; background: ${bgColor}; border-radius: 4px; color: ${textColor};">
            <strong>${status}</strong><br>
            Enemy pressure: ${Math.round(threat.threatLevel)} | Defense: ${Math.round(threat.defenseStrength)}
          </div>`;
        }
      }

      const isVisible = this.isTerritoryVisible(territoryId);
      const showUnits = isVisible || territory.owner === faction?.id;

      const unitBreakdown = showUnits
        ? (territory.units.length > 0
            ? territory.units.map(u => {
                const icon = UNIT_ICONS[u.unitTypeId] || '⬜';
                const name = this.state.unitRegistry.get(u.unitTypeId)?.name ?? u.unitTypeId;
                return `<span style="white-space:nowrap">${icon} ${u.count}× ${name}</span>`;
              }).join('&nbsp;&nbsp;')
            : 'None')
        : '<span style="color:#888">🌫️ Hidden by fog of war</span>';

      const tooltipCommander = showUnits
        ? territory.units.find((u: any) => u.commander)?.commander
        : null;
      const commanderLine = tooltipCommander
        ? `<br>⭐ Led by <strong>${tooltipCommander.name}</strong> (+${tooltipCommander.attackBonus} ATK / +${tooltipCommander.defenseBonus} DEF)`
        : '';

      const ownerHistory = this.state.ownershipHistory.get(territory.id) ?? [];
      const historyLine = ownerHistory.length > 0
        ? `<div style="margin-top:0.35rem;font-size:0.75rem;color:#9ca3af;">
            📜 Previously: ${[...ownerHistory].reverse().slice(0, 3).map(h => {
              const f = this.state.factionRegistry.get(h.factionId);
              return `<span style="color:${f?.color ?? '#aaa'}">${f?.name ?? h.factionId}</span> (T${h.turnNumber})`;
            }).join(' ← ')}
           </div>`
        : '';

      content.innerHTML = `
        <strong>${territory.name}</strong><br>
        Owner: ${owner}<br>
        IPC value: ${territory.production}<br>
        Units (${showUnits ? unitCount : '?'}): ${unitBreakdown}
        ${badges.length ? '<br>' + badges.join(' • ') : ''}
        ${commanderLine}
        ${historyLine}
        ${threatInfo}
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
    this.state.on('turn_start', (e) => {
      this.updateTurnInfo();
      this.mobilizationSystem.resetForNewTurn();
      // Tick dynamic features for human factions
      const evData = e.data as { factionId?: string } | undefined;
      const fid = evData?.factionId ?? this.state.currentFactionId;
      this.resetTurnRecap(fid);
      const f = this.state.factionRegistry.get(fid);
      if (f?.controlledBy === 'human') {
        this.hideAIActivityBanner();
        this.tickDynamicFeatures(fid);
      }
    });
    this.state.on('phase_start', () => this.onPhaseStart());
    this.state.on('phase_end', (e: { type: string; data: unknown; timestamp: number }) => this.onPhaseEnd(e));
    this.state.on('territory_selected', (e) => this.onTerritorySelected(e.data as { territoryId: string | null; previousTerritoryId?: string | null }));
    this.state.on('victory', (e) => this.handleVictory(e.data as { winner?: string; factionId?: string }));
    this.state.on('ai_thinking', (e) => {
      const data = e.data as { message?: string; action?: string; territory?: string; territoryId?: string };
      if (data.message) {
        this.updateAIActivityBanner(data.message);
        if (data.action) this.addAIActivity(data.message, data.action);
      }
      if (data.territoryId) {
        this.renderer.setAIPulseTerritory(data.territoryId);
      }
    });
    this.state.on('combat_end', (e) => this.onCombatEnd(e));
    this.state.on('combat_round', (e) => this.onCombatRound(e.data as { combat: { territoryId: string; attackingFactionId: string; defendingFactionId: string }; result: { attackerHits: number; defenderHits: number; attackerCriticals: number } }));
    this.state.on('game_event', (e) => {
      const d = e.data as { event: { name: string; description: string; type: string }; factionId: string };
      if (d?.event) this.showEventAnnouncement(d.event, d.factionId);
    });

    this.state.on('game_event', (e) => {
      const d = e.data as { type?: string; message?: string; factionColor?: string; factionName?: string };
      if (d?.type === 'victory_warning' && d.message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.style.cssText = `border-left: 4px solid ${d.factionColor ?? '#ef4444'};font-weight:bold;`;
        toast.innerHTML = `⚠️ ${d.message}`;
        container.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 6000);
      }
      if (d?.type === 'surrender' && d.message) {
        this.showToast(`🏳️ ${d.message}`, 'error');
      }
    });
    this.state.on('diplomacy_proposal', (e) => {
      const d = e.data as { fromId: string; toId: string; type: import('../engine/DiplomacyManager').ProposalType; duration: number; terms?: { ipcPerTurn?: number } };
      this.diplomacyUI.showProposalToast(d.fromId, d.toId, d.type, d.duration, d.terms);
    });

    this.state.on('units_produced', (e) => {
      const data = e.data as { factionId: string; placedCount: number };
      statisticsManager.trackUnitProduced(data.factionId, data.placedCount);
      const producingFaction = this.state.factionRegistry.get(data.factionId);
      if (producingFaction?.controlledBy === 'human') {
        achievementManager.updateProgress('produce_units', data.placedCount);
      }
    });

    this.state.on('territory_mobilized', (e) => {
      const data = e.data as { territoryId: string; units: Array<{ unitTypeId: string; count: number }>; cost: number };
      const faction = this.state.getCurrentFaction();
      if (!faction) return;
      const recap = this.ensureTurnRecap(faction.id);
      recap.mobilizations++;
      recap.unitsMobilized += data.units.reduce((sum, unit) => sum + unit.count, 0);
    });

    this.state.on('income_collected', (e) => {
      const data = e.data as { factionId: string; amount: number };
      statisticsManager.trackIncome(data.factionId, data.amount);
      this.ensureTurnRecap(data.factionId).income += data.amount;
      this.showIncomeNotification(data);

      if (data.amount > 0) {
        const incomeFaction = this.state.factionRegistry.get(data.factionId);
        if (incomeFaction?.controlledBy === 'human') {
          achievementManager.updateProgress('earn_ipcs', data.amount);
          if (settings.getSetting('midGameObjectives')) {
            this.objectiveSystem.recordEvent(data.factionId, 'earn_income', { income: data.amount });
          }
        }
      }

      if (data.amount > 0) {
        const faction = this.state.factionRegistry.get(data.factionId);
        const capital = faction ? this.state.territories.get(faction.capital) : null;
        if (capital) {
          const screen = this.renderer.worldToScreen(capital.center[0], capital.center[1]);
          visualEffects.floatText(screen.x, screen.y, `+${data.amount} IPC`, faction!.color, 18);
        }
      }
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

    if (faction?.controlledBy === 'ai') {
      const attackerFaction = this.state.factionRegistry.get(combat.attackingFactionId);
      const tName = territory?.name ?? combat.territoryId;
      const outcome = combat.winner === 'attacker' && !data.retreated ? 'captured' : 'was held at';
      this.addAIActivity(
        `${attackerFaction?.name ?? 'AI'} ${outcome} ${tName} (${attackerLosses}-${defenderLosses} losses)`,
        combat.winner === 'attacker' && !data.retreated ? 'capture' : 'battle'
      );
      this.renderer.setAIPulseTerritory(combat.territoryId);
    }

    const recapFactionId = faction?.id ?? this.state.currentFactionId;
    const recap = this.ensureTurnRecap(recapFactionId);
    if (combat.attackingFactionId === recapFactionId || combat.defendingFactionId === recapFactionId) {
      recap.battles++;
      recap.unitsLost += combat.attackingFactionId === recapFactionId ? attackerLosses : defenderLosses;
      recap.enemyUnitsDestroyed += combat.attackingFactionId === recapFactionId ? defenderLosses : attackerLosses;
    }

    // Track casualties in StatisticsManager for all factions
    statisticsManager.trackUnitKilled(combat.attackingFactionId, defenderLosses);
    statisticsManager.trackUnitLost(combat.attackingFactionId, attackerLosses);
    statisticsManager.trackUnitKilled(combat.defendingFactionId, attackerLosses);
    statisticsManager.trackUnitLost(combat.defendingFactionId, defenderLosses);

    if (combat.winner === 'attacker' && !data.retreated) {
      this.territoriesCapturedThisPhase++;
      if (combat.attackingFactionId === recapFactionId) recap.captures++;
      statisticsManager.trackBattleWon(combat.attackingFactionId);
      statisticsManager.trackBattleLost(combat.defendingFactionId);
      statisticsManager.trackTerritoryCaptured(combat.attackingFactionId);
      statisticsManager.trackTerritoryLost(combat.defendingFactionId);

      // Visual effects for capture
      const isCapital = territory?.isCapital;
      const attackerFaction = this.state.factionRegistry.get(combat.attackingFactionId);

      // Color-bleed animation on the captured territory for all captures (player + AI)
      this.renderer.startCaptureAnimation(combat.territoryId, attackerFaction?.color ?? '#22c55e');

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

    // Rich combat narration in battle log
    this.addCombatNarration(combat, attackerLosses, defenderLosses, territory?.name ?? combat.territoryId, territory?.isCapital ?? false);

    // War tension
    if (settings.getSetting('warTension')) {
      const totalCasualties = attackerLosses + defenderLosses;
      this.tensionSystem.recordBattle(totalCasualties);
      if (combat.winner === 'attacker' && !data.retreated) {
        this.tensionSystem.recordCapture(territory?.isCapital ?? false);
      }
      this.updateTensionBar();
    }

    // Objective tracking (destroy units)
    if (settings.getSetting('midGameObjectives')) {
      if (isPlayerAttacker && defenderLosses > 0) {
        this.objectiveSystem.recordEvent(combat.attackingFactionId, 'destroy_units', { count: defenderLosses });
      }
      if (isPlayerAttacker && combat.winner === 'attacker') {
        this.objectiveSystem.recordEvent(combat.attackingFactionId, 'capture_territory', { territoryId: combat.territoryId });
      }
      this.updateObjectivesPanel();
    }

    // AI taunts
    if (settings.getSetting('aiTaunts') && faction?.controlledBy === 'ai') {
      if (isPlayerDefender) {
        const taunt = getAITaunt(combat.attackingFactionId, 'attack');
        setTimeout(() => this.showToast(`💬 ${taunt}`, 'info'), 1200);
      } else if (isPlayerAttacker && combat.winner === 'defender') {
        const taunt = getAITaunt(combat.defendingFactionId, 'defend_win');
        setTimeout(() => this.showToast(`💬 ${taunt}`, 'info'), 1200);
      }
    }
  }

  /**
   * Generate dramatic combat narration and log it.
   */
  private addCombatNarration(
    combat: { territoryId: string; winner: string; attackingFactionId: string; defendingFactionId: string; rounds: any[]; attackers: any[]; defenders: any[] },
    attackerLosses: number,
    defenderLosses: number,
    territoryName: string,
    isCapital: boolean
  ): void {
    const attackerFaction = this.state.factionRegistry.get(combat.attackingFactionId);
    const defenderFaction = this.state.factionRegistry.get(combat.defendingFactionId);
    if (!attackerFaction || !defenderFaction) return;

    const rounds = combat.rounds.length;
    const criticals = combat.rounds.reduce((sum: number, r: any) => sum + (r.attackerCriticals || 0) + (r.defenderCriticals || 0), 0);

    // Find commander in territory for flavor
    const territory = this.state.territories.get(combat.territoryId);
    const commanderUnit = territory?.units.find((u: any) => u.commander);
    const commanderName = commanderUnit?.commander?.name;

    let narration = '';

    if (combat.winner === 'attacker') {
      if (isCapital) {
        narration = `☠️ CAPITAL FALLS! ${attackerFaction.name} storms the heart of ${defenderFaction.name} at ${territoryName}!`;
      } else if (attackerLosses === 0) {
        narration = `⚡ Flawless assault! ${attackerFaction.name} sweeps through ${territoryName} without a single loss.`;
      } else if (attackerLosses > defenderLosses * 2) {
        narration = `💀 Pyrrhic victory — ${attackerFaction.name} takes ${territoryName} but suffers grievous losses (${attackerLosses} units).`;
      } else {
        const phrases = [
          `${attackerFaction.name} breaks the line at ${territoryName} after ${rounds} brutal round${rounds > 1 ? 's' : ''}!`,
          `The assault on ${territoryName} succeeds — ${defenderFaction.name} retreats in disarray.`,
          `${attackerFaction.name} captures ${territoryName}! ${defenderLosses} defenders annihilated.`,
        ];
        narration = phrases[Math.floor(Math.random() * phrases.length)];
      }
      if (commanderName) narration += ` General ${commanderName} leads the defense heroically.`;
    } else {
      if (defenderLosses === 0) {
        narration = `🛡️ Perfect defense! ${defenderFaction.name} repels ${attackerFaction.name} at ${territoryName} without a casualty!`;
      } else if (rounds >= 4) {
        narration = `🦁 Heroic last stand! ${defenderFaction.name} holds ${territoryName} after ${rounds} desperate rounds of fighting!`;
      } else {
        const phrases = [
          `${defenderFaction.name} holds ${territoryName}! ${attackerFaction.name} repelled with ${attackerLosses} losses.`,
          `The walls of ${territoryName} hold — ${attackerFaction.name}'s assault crumbles.`,
          `${attackerFaction.name} retreats from ${territoryName}. The defense stands firm.`,
        ];
        narration = phrases[Math.floor(Math.random() * phrases.length)];
      }
      if (commanderName) narration += ` General ${commanderName} rallies the troops!`;
    }

    if (criticals > 0) narration += ` ${criticals} critical hit${criticals > 1 ? 's' : ''} recorded.`;

    battleLog.logCombat(
      this.state.turnNumber,
      attackerFaction.name,
      attackerFaction.color,
      narration,
      combat.territoryId
    );
  }

  /** Floating damage numbers over the territory on each combat round. */
  private onCombatRound(data: { combat: { territoryId: string; attackingFactionId: string; defendingFactionId: string }; result: { attackerHits: number; defenderHits: number; attackerCriticals: number } }): void {
    const { combat, result } = data;
    const territory = this.state.territories.get(combat.territoryId);
    if (!territory) return;

    const screen = this.renderer.worldToScreen(territory.center[0], territory.center[1]);
    const jitter = () => (Math.random() - 0.5) * 50;

    if (result.attackerHits > 0) {
      const color = this.state.factionRegistry.get(combat.attackingFactionId)?.color ?? '#ff4444';
      const size = result.attackerCriticals > 0 ? 28 : 20;
      const label = result.attackerCriticals > 0 ? `💥 -${result.attackerHits}` : `-${result.attackerHits}`;
      visualEffects.floatText(screen.x + jitter(), screen.y - 20 + jitter(), label, color, size);
    }
    if (result.defenderHits > 0) {
      const color = this.state.factionRegistry.get(combat.defendingFactionId)?.color ?? '#4488ff';
      visualEffects.floatText(screen.x + jitter(), screen.y + 20 + jitter(), `-${result.defenderHits}`, color, 20);
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

    // Position near the territory if it's on screen, else fall back to right-center
    const terr = this.state.territories.get(combat.territoryId);
    if (terr) {
      const [wx, wy] = terr.center;
      const sc = this.renderer.worldToScreen(wx, wy);
      const margin = 12;
      const cardW = 240;
      let left = sc.x + margin;
      let top = sc.y - 80;
      // Clamp to viewport
      left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - 200));
      card.style.position = 'fixed';
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
      card.style.right = 'auto';
      card.style.transform = 'none';
    }

    setTimeout(() => card?.remove(), 6000);
  }

  private onPhaseEnd(e: { type: string; data: unknown; timestamp: number }): void {
    const data = e.data as { phase: string; factionId: string };
    const phaseName = getPhaseDisplayNameFromStyle(data.phase, this.gameConfig.turnStyle);
    const faction = this.state.getCurrentFaction();
    const isTurnClosingPhase = ['collect_income', 'end'].includes(data.phase);
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
      if (isTurnClosingPhase) {
        this.showTurnRecap();
        return;
      }
      if (this.battlesThisPhase > 0 || this.territoriesCapturedThisPhase > 0) {
        this.showPhaseRecap(phaseName);
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
      ['M', 'Move mode'],
      ['A', 'Attack from selected territory (auto-fires if one target)'],
      ['R', 'Open research / tech tree'],
      ['D', 'Open diplomacy panel'],
      ['S', 'AI turn speed menu'],
      ['H', 'Open tutorial / help'],
      ['F', 'Fit map to screen'],
      ['C', 'Center on your capital'],
      ['O', 'Cycle map overlay (range / threat)'],
      ['Tab', 'Select next owned territory'],
      ['Shift+Tab', 'Select previous territory'],
      ['+  /  -', 'Zoom in / zoom out'],
      ['Ctrl+S', 'Quick save'],
      ['Ctrl+L', 'Quick load'],
      ['Ctrl+Z', 'Undo last action'],
      ['Ctrl+Y', 'Redo'],
      ['Esc', 'Deselect / close modal / game menu'],
      ['F11', 'Toggle fullscreen'],
      ['Ctrl+,', 'Open settings'],
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

  private showPhaseRecap(phaseName: string): void {
    const faction = this.state.getCurrentFaction();
    const factionStats = faction ? statisticsManager.getFactionStats(faction.id) : null;
    this.turnRecapPanel.showPhase({
      phaseName,
      battles: this.battlesThisPhase,
      captures: this.territoriesCapturedThisPhase,
      unitsLostThisGame: factionStats?.unitsLost ?? 0,
    });
  }

  private resetTurnRecap(factionId: string): void {
    this.turnRecap = {
      factionId,
      battles: 0,
      captures: 0,
      mobilizations: 0,
      unitsMobilized: 0,
      income: 0,
      unitsLost: 0,
      enemyUnitsDestroyed: 0,
    };
  }

  private ensureTurnRecap(factionId: string): TurnRecapStats {
    if (!this.turnRecap || this.turnRecap.factionId !== factionId) {
      this.resetTurnRecap(factionId);
    }
    return this.turnRecap!;
  }

  private showTurnRecap(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const recap = this.ensureTurnRecap(faction.id);
    const topThreat = this.getTopThreats(faction.id)[0];
    const nextObjective = this.objectiveSystem.getActive(faction.id)[0];

    this.turnRecapPanel.showTurn({
      faction,
      turnNumber: this.state.turnNumber,
      recap,
      nextDangerName: topThreat
        ? this.state.territories.get(topThreat.territoryId)?.name ?? topThreat.territoryId
        : undefined,
      nextObjectiveTitle: nextObjective?.title,
    });
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
      this.undoController.pushPhaseSnapshot(this.state.saveToJSON());
    }
    this.updatePhaseInfo();
    this.undoController.updateButton();
    
    // Update mobilization highlights for build phase
    const phase = this.state.currentPhase;
    const isBuildPhase = ['purchase', 'production', 'build'].includes(phase);
    if (isBuildPhase && faction?.controlledBy === 'human') {
      this.updateMobilizationHighlights();
      // Auto-open the deployment / mobilization modal so the player is
      // immediately prompted to make strategic placement choices.
      const reserves = this.productionManager.getCurrentReserves();
      const hasReserves = reserves && reserves.length > 0;
      if (hasReserves) {
        // Has purchased units waiting in reserve — open deploy orders modal
        this.showDeploymentModal();
      } else {
        // Open factory hub so player can plan their purchases
        this.productionUI.showFactoryHub();
      }
    } else {
      this.renderer.clearMobilizationTargets();
    }
    
    // Check if phase should be auto-skipped (nothing to do)
    if (faction?.controlledBy === 'human') {
      this.checkAutoSkipPhase(phase, faction);
      // One-time hint about the Enter shortcut to end phases
      this.showFirstTimeTip('enter-shortcut', 'Press <b>Enter</b> or <b>Space</b> to end the current phase without clicking the button.');
      const firstTurnTip = this.phaseGuidance.getFirstTurnTip(this.state.turnNumber, phase);
      if (firstTurnTip) this.showFirstTimeTip(firstTurnTip.tipId, firstTurnTip.message);
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
    this.updateMapReadabilityLegend();
  }

  /**
   * Handle territory selection - THIS IS KEY FOR MOVEMENT AND MOBILIZATION
   */
  private onTerritorySelected(data: { territoryId: string | null; previousTerritoryId?: string | null }): void {
    const { territoryId, previousTerritoryId } = data;
    this.updateSelectionInfo();
    // Start the animation loop so the selection glow animates
    this.renderer.startContinuousRender();

    if (!territoryId) return;

    const phase = this.state.currentPhase;
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const territory = this.state.territories.get(territoryId);
    if (!territory) return;

    // Handle commander move mode
    if (this.commanderMoveSource !== null) {
      if (territoryId === this.commanderMoveSource) {
        this.commanderMoveSource = null;
        this.showToast('Commander move cancelled.', 'info');
      } else {
        this.executeCommanderMove(this.commanderMoveSource, territoryId);
      }
      return;
    }

    // Handle placement mode (placing purchased units)
    if (this.isPlacementMode) {
      this.handlePlacementClick(territoryId);
      return;
    }

    // Check if clicking on a valid move target
    // Handle all movement-capable phases across different turn styles
    const movementPhase = isMovementPhase(phase);
    
    const moveResolution = resolveTerritorySelectionMove({
      phaseIsMovement: movementPhase,
      territoryId,
      previousTerritoryId,
      validMoves: this.validMoves,
    });
    if (moveResolution.kind === 'refresh') {
      this.updateValidMoves();
      return;
    }
    if (moveResolution.kind === 'previewAttack') {
      this.combatUI.showBattlePreview(moveResolution.fromId, moveResolution.toId);
      return;
    }
    if (moveResolution.kind === 'executeMove') {
      this.executePlayerMove(moveResolution.fromId, moveResolution.toId, false);
      return;
    }

    // Update valid moves for newly selected territory
    this.updateValidMoves();
    this.updateStrategicAdvisor();
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

  /** Enter commander move mode — next territory click moves the commander there. */
  startCommanderMove(fromTerritoryId: string): void {
    this.commanderMoveSource = fromTerritoryId;
    const territory = this.state.territories.get(fromTerritoryId);
    const commanderName = territory?.units.find((u: any) => u.commander)?.commander?.name ?? 'Commander';
    this.showToast(`Select a friendly territory to move ${commanderName} to. Click same territory to cancel.`, 'info');
  }

  /** Move the commander from one territory to another friendly territory. */
  private executeCommanderMove(fromId: string, toId: string): void {
    this.commanderMoveSource = null;
    const faction = this.state.getCurrentFaction();
    const from = this.state.territories.get(fromId);
    const to = this.state.territories.get(toId);

    if (!from || !to || !faction) return;
    if (to.owner !== faction.id) {
      this.showToast('Commanders can only move to friendly territory.', 'error');
      return;
    }
    if (!from.adjacentTo.includes(toId) && from.id !== toId) {
      this.showToast('Commander must move to an adjacent territory.', 'error');
      return;
    }

    const unitWithCommander = from.units.find((u: any) => u.commander);
    if (!unitWithCommander) {
      this.showToast('No commander found in source territory.', 'error');
      return;
    }

    const commander = (unitWithCommander as any).commander;
    delete (unitWithCommander as any).commander;

    // Attach to first land unit in destination, or first unit if no land units
    const destUnit = to.units.find(u => {
      const ut = this.state.unitRegistry.get(u.unitTypeId);
      return ut?.domain === 'land';
    }) ?? to.units[0];

    if (destUnit) {
      (destUnit as any).commander = commander;
      this.showToast(`${commander.name} moved to ${to.name}.`, 'success');
    } else {
      // No units in destination — commander stays at source
      (unitWithCommander as any).commander = commander;
      this.showToast('Destination has no units. Commander stays until units are present.', 'info');
    }

    this.updateSelectionInfo();
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
      return;
    }

    const fromTerritory = this.state.territories.get(fromId);
    const toTerritory = this.state.territories.get(toId);
    const faction = this.state.getCurrentFaction();

    if (!fromTerritory || !toTerritory || !faction) {
      return;
    }
    if (fromTerritory.owner !== faction.id) {
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
      const movedDomain = this.state.unitRegistry.get(unitsToMove[0]?.unitTypeId)?.domain ?? 'land';
      soundManager.play(movedDomain === 'sea' ? 'naval_horn' : movedDomain === 'air' ? 'aircraft' : 'move');
    }

    // Track for undo
    this.undoController.recordMove({
      type: 'move',
      data: { from: fromId, to: toId, units: unitsToMove },
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

  /** Show tutorial modal */
  showTutorial(): void { this.tutorialController.show(); }

  /** Close tutorial modal */
  closeTutorial(): void { this.tutorialController.close(); }

  private nextTutorialStep(): void { this.tutorialController.next(); }
  private prevTutorialStep(): void { this.tutorialController.prev(); }

  /**
   * Show toast notification
   */
  showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    if (type === 'error') {
      toastManager.show(message, type);
    } else {
      battleLog.notify(this.state.turnNumber, message);
    }
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

  private addAIActivity(message: string, action?: string): void {
    const faction = this.state.getCurrentFaction();
    aiActivityFeed.setTurn(this.state.turnNumber);
    aiActivityFeed.add(faction?.name ?? 'AI', faction?.color ?? '#94a3b8', message, action);
  }

  hideAIActivityBanner(): void {
    aiActivityFeed.hideBanner();
  }

  /** Show a compact popup to set AI turn speed (Slow / Normal / Fast). */
  showAISpeedMenu(): void {
    document.getElementById('ai-speed-menu')?.remove();

    const speeds: { label: string; key: 'slow' | 'normal' | 'fast'; multiplier: number }[] = [
      { label: '🐢 Slow',   key: 'slow',   multiplier: 2.0  },
      { label: '⚡ Normal', key: 'normal', multiplier: 1.0  },
      { label: '🚀 Fast',   key: 'fast',   multiplier: 0.25 },
    ];
    const current = settings.getSetting('gameSpeed');

    const menu = document.createElement('div');
    menu.id = 'ai-speed-menu';
    menu.style.cssText = `
      position:fixed;bottom:4rem;right:1rem;
      background:#1e293b;border:1px solid #475569;border-radius:8px;
      box-shadow:0 4px 16px rgba(0,0,0,0.5);z-index:9000;
      padding:8px;font-size:0.85rem;display:flex;flex-direction:column;gap:4px;
    `;
    menu.innerHTML = `<div style="color:#94a3b8;padding:2px 6px;font-size:0.75rem;">AI Turn Speed</div>`;

    for (const speed of speeds) {
      const btn = document.createElement('button');
      btn.textContent = speed.label;
      const isActive = speed.key === current;
      btn.style.cssText = `
        padding:6px 14px;border-radius:4px;border:none;cursor:pointer;text-align:left;
        background:${isActive ? '#334155' : 'none'};
        color:${isActive ? '#f8fafc' : '#cbd5e1'};
        font-weight:${isActive ? 'bold' : 'normal'};
      `;
      btn.addEventListener('click', () => {
        settings.update({ gameSpeed: speed.key });
        this.aiSpeedCallback?.(speed.multiplier);
        menu.remove();
        this.showToast(`AI speed: ${speed.label}`, 'info');
      });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);
    const dismiss = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('mousedown', dismiss); }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
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

  /** Sync the HQ panel header label and faction-color accent bar. */
  private updateHQHeader(): void {
    const panel = document.getElementById('hq-panel');
    if (!panel) return;
    const faction = this.state.getCurrentFaction();
    const color = faction?.colorLight ?? faction?.color ?? '';
    panel.style.setProperty('--hq-faction-color', color);

    const headerSpan = panel.querySelector<HTMLElement>('#hq-header > span');
    if (headerSpan && faction) {
      headerSpan.textContent = `HQ · ${faction.name}`;
    }

    // Refresh the faction summary if no territory is currently selected
    if (!this.state.getSelectedTerritory()) {
      const detailsEl = document.getElementById('territory-details');
      if (detailsEl) detailsEl.innerHTML = this.buildFactionSummaryHtml();
    }
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

    // Drive the ribbon's left-edge colour accent from the current faction colour
    const accentEl = document.getElementById('ribbon-faction-accent');
    if (accentEl && faction) accentEl.style.background = faction.color;

    if (factionEl && faction) {
      factionEl.textContent = faction.name;
      factionEl.style.color = faction.colorLight || faction.color;
    }
    if (ipcEl && faction) {
      const baseIncome = this.state.calculateIncome(faction.id);
      const moraleMultiplier = this.state.systems.moraleSystem?.getIncomeModifier?.(faction.id) ?? 1;
      const income = Math.floor(baseIncome * moraleMultiplier);
      const moraleWarning = moraleMultiplier < 1
        ? `<span style="color:#f97316;font-size:0.7rem;margin-left:0.2rem;" title="War weariness reducing income">\u26a0</span>`
        : '';
      ipcEl.innerHTML = `<span class="ipc-treasury">${faction.ipcs}</span>\u00a0IPCs<span class="ipc-rate"> +${income}/turn${moraleWarning}</span>`;

      // Flash the treasury number when IPCs change
      if (this.prevIPCs !== -1 && faction.ipcs !== this.prevIPCs) {
        const treasEl = ipcEl.querySelector('.ipc-treasury') as HTMLElement | null;
        if (treasEl) {
          const cls = faction.ipcs > this.prevIPCs ? 'flash-gain' : 'flash-spend';
          treasEl.classList.remove('flash-gain', 'flash-spend');
          void treasEl.offsetWidth;
          treasEl.classList.add(cls);
          setTimeout(() => treasEl.classList.remove(cls), 600);
        }
      }
      this.prevIPCs = faction.ipcs;

      // Build breakdown tooltip
      const bd = this.state.calculateIncomeBreakdown(faction.id);
      const bdLines: string[] = [];
      if (bd.territorial) bdLines.push(`Territories: +${bd.territorial}`);
      if (bd.capital) bdLines.push(`Capital bonus: +${bd.capital}`);
      if (bd.factory) bdLines.push(`Factory bonus: +${bd.factory}`);
      if (bd.resource) bdLines.push(`Resources: +${bd.resource}`);
      if (bd.trade) bdLines.push(`Trade deals: +${bd.trade}`);
      if (bd.factionMultiplier) bdLines.push(`Faction bonus: +${bd.factionMultiplier}`);
      if (bd.techMultiplier) bdLines.push(`Tech bonus: +${bd.techMultiplier}`);
      if (bd.blockadeLoss) bdLines.push(`Blockaded: -${bd.blockadeLoss}`);
      if (bd.scorchedLoss) bdLines.push(`Scorched: -${bd.scorchedLoss}`);
      if (moraleMultiplier < 1) bdLines.push(`Weariness: \u00d7${moraleMultiplier.toFixed(2)}`);
      ipcEl.title = bdLines.join(' \u00b7 ') + ` = ${income}/turn`;
    }

    // Weather badge
    const weatherBadge = document.getElementById('weather-badge');
    if (weatherBadge) {
      const ws = this.state.systems.weatherSystem;
      if (ws && ws.currentEvent.condition !== 'clear') {
        const mods = ws.getWeatherModifiers('plains');
        const parts: string[] = [ws.currentEvent.name];
        if (mods.landAttackMod < 0) parts.push(`atk ${mods.landAttackMod}`);
        if (mods.movementPenalty > 0) parts.push(`mv -${mods.movementPenalty}`);
        if (mods.airGrounded) parts.push('air grounded');
        if (mods.supplyDisrupted) parts.push('supply disrupted');
        const conditionIcon: Record<string, string> = {
          rain: '🌧', fog: '🌫', storm: '⛈', blizzard: '❄️', heat_wave: '🌡', mud: '🟫',
        };
        const icon = conditionIcon[ws.currentEvent.condition] ?? '🌤';
        const remaining = Math.max(1, ws.currentEvent.expiresAtTurn - this.state.turnNumber + 1);
        weatherBadge.textContent = `${icon} ${parts.join(' · ')} (${remaining}t)`;
        weatherBadge.classList.remove('hidden');
        weatherBadge.title = ws.currentEvent.description;
      } else {
        weatherBadge.classList.add('hidden');
      }
    }

    // Update turn indicator - shows if it's your turn or AI is playing
    if (indicatorEl && faction) {
      if (faction.controlledBy === 'human') {
        indicatorEl.textContent = '🎮 YOUR TURN';
        // Re-trigger CSS animation via reflow
        indicatorEl.classList.remove('turn-announce');
        void indicatorEl.offsetWidth;
        indicatorEl.className = 'your-turn turn-announce';
      } else {
        indicatorEl.textContent = '🤖 AI PLAYING';
        indicatorEl.className = 'ai-turn';
      }
    }

    this.updateActionButtons();
    this.updateTurnOrder();
    this.updateFactionPanel();
    this.updateVictoryProgress();
    this.updateStrategicAdvisor();
    this.renderMinimap();
    this.undoController.clearMoveHistory();
    this.undoController.clearPhaseSnapshots();
    this.undoController.updateButton();
    this.updateHQHeader();

    // Show turn notification
    if (faction) {
      if (faction.controlledBy === 'human') {
        soundManager.play('turn_start');

        this.stopTurnTimer();

        // First-time tips
        if (this.state.turnNumber === 1) {
          this.showFirstTimeTip('turn_start', 'Click territories to select them, then use the action bar at the bottom');
          this.showFirstWarRoom(faction.id);
        }
      } else {
        this.stopTurnTimer();
      }
    }
  }
  
  /**
   * Start a countdown turn timer shown in the HUD for timed local turns.
   * @param seconds Total seconds for the turn.
   */
  startTurnTimer(seconds: number = 300): void {
    this.stopTurnTimer();
    this.turnTimerSeconds = seconds;

    let el = document.getElementById('turn-timer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'turn-timer';
      el.style.cssText = `
        position:fixed;top:0.5rem;right:0.5rem;
        background:rgba(15,23,42,0.85);border:1px solid #334155;
        border-radius:6px;padding:4px 10px;font-size:0.85rem;
        color:#e2e8f0;z-index:5000;font-variant-numeric:tabular-nums;
        display:flex;align-items:center;gap:6px;
      `;
      document.body.appendChild(el);
    }

    const tick = () => {
      if (this.turnTimerSeconds <= 0) { this.stopTurnTimer(); return; }
      const m = Math.floor(this.turnTimerSeconds / 60);
      const s = this.turnTimerSeconds % 60;
      const timeStr = `${m}:${String(s).padStart(2, '0')}`;
      const urgent = this.turnTimerSeconds <= 60;
      el!.style.borderColor = urgent ? '#ef4444' : '#334155';
      el!.style.color = urgent ? '#fca5a5' : '#e2e8f0';
      el!.innerHTML = `${urgent ? '⏰' : '⏱️'} ${timeStr}`;
      this.turnTimerSeconds--;
    };
    tick();
    this.turnTimerInterval = setInterval(tick, 1000);
  }

  stopTurnTimer(): void {
    if (this.turnTimerInterval !== null) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
    document.getElementById('turn-timer')?.remove();
  }

  /**
   * Show a sweeping full-screen "YOUR TURN" banner that auto-dismisses
   */
  showYourTurnBanner(factionName: string, color: string): void {
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
      const isHuman = faction.controlledBy === 'human';
      const isThreat = !isHuman && percentage >= 75;
      const leaderBadge = isLeader ? `<span class="vp-leader-badge">👑</span>` : '';
      const threatBadge = isThreat ? `<span style="color:#ef4444;font-size:0.65rem;font-weight:700;">⚠ THREAT</span>` : '';
      const playerMark = isHuman ? `<span style="color:#60a5fa;font-size:0.6rem;">YOU</span>` : '';
      // Color-coded bar: green if leading, red if threat, faction color otherwise
      const barColor = isLeader && isHuman ? '#22c55e' : isThreat ? '#ef4444' : faction.color;
      const glowStyle = percentage >= 75 ? `box-shadow:0 0 6px ${barColor}88;` : '';

      html += `
        <div class="victory-bar ${isDanger && isLeader ? 'vp-danger-leader' : ''}">
          <div class="vp-label-row">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${faction.color};margin-right:4px;flex-shrink:0;"></span>
            <span class="victory-bar-label" style="color:${faction.colorLight || faction.color};flex:1;">${faction.name}</span>
            ${playerMark}${leaderBadge}${threatBadge}
            <span class="victory-bar-value">${displayValue}<span class="vp-pct"> ${percentage}%</span></span>
          </div>
          <div class="victory-bar-track">
            <div class="victory-bar-fill" style="width:${percentage}%;background:${barColor};${glowStyle}transition:width 0.6s;"></div>
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

    return;
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
      const wasActive = step.classList.contains('active');
      step.classList.remove('active', 'completed', 'active-pop');
      if (index < currentIndex) {
        step.classList.add('completed');
      } else if (index === currentIndex) {
        step.classList.add('active');
        if (!wasActive) {
          void (step as HTMLElement).offsetWidth;
          step.classList.add('active-pop');
        }
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

  /** Faction overview shown inside HQ when no territory is selected. */
  private buildFactionSummaryHtml(): string {
    const faction = this.state.getCurrentFaction();
    if (!faction) {
      return `<p style="color:#6b7280;font-style:italic;font-size:0.78rem;text-align:center;padding:0.5rem 0;">Click any territory to inspect it.</p>`;
    }

    // Owned territory count and income
    const ownedTerritories = Array.from(this.state.territories.values())
      .filter(t => t.owner === faction.id);
    const income = this.state.calculateIncome(faction.id);

    // Total unit strength
    let totalUnits = 0;
    for (const t of ownedTerritories) totalUnits += t.getTotalUnitCount();

    // Capital status
    const capital = ownedTerritories.find(t => t.isCapital);
    let capitalHtml = '';
    if (capital) {
      const capitalUnits = capital.getTotalUnitCount();
      // Check if enemy units are adjacent to our capital
      const adjacentEnemies = capital.adjacentTo.some(adjId => {
        const adj = this.state.territories.get(adjId);
        return adj && adj.owner && faction.isEnemyOf(adj.owner) && adj.getTotalUnitCount() > 0;
      });
      const statusClass = adjacentEnemies ? 'at-risk' : 'safe';
      const statusText = adjacentEnemies ? '⚠ Under threat' : '✓ Secured';
      capitalHtml = `<div class="hq-capital-row ${statusClass}">
        <span>⭐ ${this.escapeHtml(capital.name)}</span>
        <span style="margin-left:auto;font-size:0.7rem;">${statusText} · ${capitalUnits} unit${capitalUnits !== 1 ? 's' : ''}</span>
      </div>`;
    }

    // Threat count (enemy-adjacent territories we own)
    const threatenedCount = ownedTerritories.filter(t =>
      t.adjacentTo.some(adjId => {
        const adj = this.state.territories.get(adjId);
        return adj && adj.owner && faction.isEnemyOf(adj.owner) && adj.getTotalUnitCount() > 0;
      })
    ).length;

    const incomeClass = income >= 20 ? 'positive' : income >= 8 ? 'warning' : 'danger';
    const unitsClass  = totalUnits >= 10 ? 'positive' : totalUnits >= 4 ? 'warning' : 'danger';

    return `<div class="hq-faction-summary">
      <div class="hq-faction-banner">
        <div class="hq-faction-dot" style="background:${this.escapeHtml(faction.color)};box-shadow:0 0 5px ${this.escapeHtml(faction.color)}44;"></div>
        <span class="hq-faction-name" style="color:${this.escapeHtml(faction.colorLight ?? faction.color)};">${this.escapeHtml(faction.name)}</span>
      </div>
      <div class="hq-stat-grid">
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Territories</span>
          <span class="hq-stat-value">${ownedTerritories.length}</span>
        </div>
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Income</span>
          <span class="hq-stat-value ${incomeClass}">+${income}</span>
        </div>
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Units</span>
          <span class="hq-stat-value ${unitsClass}">${totalUnits}</span>
        </div>
        <div class="hq-stat-cell">
          <span class="hq-stat-label">Threatened</span>
          <span class="hq-stat-value ${threatenedCount > 0 ? 'danger' : 'positive'}">${threatenedCount}</span>
        </div>
      </div>
      ${capitalHtml}
    </div>`;
  }

  /**
   * Update selection info panel
   */
  private getNavalStatusHtml(territory: import('../data/Territory').Territory): string {
    const faction = this.state.getCurrentFaction();
    if (!faction) return '';

    if (territory.type === 'coastal' && territory.owner === faction.id) {
      const adjacentSeas = territory.adjacentTo
        .map(id => this.state.territories.get(id))
        .filter((t): t is import('../data/Territory').Territory => !!t && t.type === 'sea');
      if (adjacentSeas.length === 0) return '';

      const blockaded = this.supplySystem.isNavalBlockaded(territory.id, faction.id);
      const openSeas = adjacentSeas.filter(sea =>
        sea.owner === null ||
        sea.owner === faction.id ||
        sea.getTotalUnitCount() === 0 ||
        !sea.owner ||
        !faction.isEnemyOf(sea.owner)
      ).length;
      return `<div class="naval-status ${blockaded ? 'danger' : 'open'}">
        <strong>${blockaded ? 'Naval blockade' : 'Sea access open'}</strong>
        <span>${openSeas}/${adjacentSeas.length} adjacent sea zone${adjacentSeas.length === 1 ? '' : 's'} open</span>
      </div>`;
    }

    if (territory.type === 'sea') {
      const transports = territory.units.reduce((sum, unit) => {
        const unitType = this.state.unitRegistry.get(unit.unitTypeId);
        return sum + (unitType?.transportCapacity ?? 0) * unit.count;
      }, 0);
      const adjacentCoasts = territory.adjacentTo
        .map(id => this.state.territories.get(id))
        .filter(t => t?.isLand())
        .slice(0, 3)
        .map(t => t?.name ?? '')
        .filter(Boolean);
      const owner = territory.owner ? this.state.factionRegistry.get(territory.owner) : null;
      return `<div class="naval-status sea">
        <strong>${owner ? `${this.escapeHtml(owner.name)} sea control` : 'Neutral sea zone'}</strong>
        <span>${transports > 0 ? `${transports} transport capacity` : 'No transport capacity'}${adjacentCoasts.length ? ` · Coasts: ${this.escapeHtml(adjacentCoasts.join(', '))}` : ''}</span>
      </div>`;
    }

    return '';
  }

  updateSelectionInfo(): void {
    const territory = this.state.getSelectedTerritory();
    const nameEl = document.getElementById('territory-name');
    const detailsEl = document.getElementById('territory-details');

    if (!territory) {
      if (nameEl) nameEl.textContent = 'No Territory Selected';
      if (detailsEl) {
        detailsEl.innerHTML = this.buildFactionSummaryHtml();
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

    html += this.getNavalStatusHtml(territory);

    // Fortification level
    if (territory.isLand()) {
      const fortLevel = territory.fortificationLevel ?? 0;
      const fortNames = ['None', 'Earthworks', 'Bunker Complex'];
      const fortColors = ['#555', '#a0763e', '#4a90d9'];
      const fortIcons = ['', '⛏️', '🏰'];
      if (fortLevel > 0) {
        html += `<div class="stat-row">
          <span>${fortIcons[fortLevel]} Fortification:</span>
          <span style="color: ${fortColors[fortLevel]}; font-weight: 600;">${fortNames[fortLevel]} (+${fortLevel} def)</span>
        </div>`;
      }
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

          const isBattered = (pu as any).batteredUntilTurn && (pu as any).batteredUntilTurn > this.state.turnNumber;
          const batteredBadge = isBattered
            ? `<span style="font-size:0.6rem;color:#f97316;margin-left:0.3rem;font-weight:600;" title="Battered: -1 attack this turn">⚠ battered</span>`
            : '';

          html += `<div class="unit-item" style="${rowStyle}">
            <span>${icon} ${unitType.name}${statusBadge}${batteredBadge}</span>
            <span class="unit-count" title="${availableCount} available, ${movedCount} already acted">${countDisplay}</span>
            <span class="unit-stats" style="font-size:0.7rem;color:#666" title="Attack/Defense/Movement">${unitType.attack}/${unitType.defense}/${moveIcon}${unitType.movement}</span>
          </div>`;
        }
      }
      html += `</div>`;

      // Commander card — show if any unit in this territory has a named general
      const commanderUnit = territory.units.find((u: any) => u.commander);
      if (commanderUnit?.commander) {
        const cmd = commanderUnit.commander;
        const atkSign = cmd.attackBonus > 0 ? '+' : '';
        const defSign = cmd.defenseBonus > 0 ? '+' : '';
        const canMoveCmd = isOwnedTerritory && !['combat', 'combat_move'].includes(this.state.currentPhase);
        const lvl = getLevel(cmd);
        const xpNext = xpToNextLevel(cmd);
        const xpCurrent = cmd.xp ?? 0;
        const xpPrev = [0, 10, 30, 60, 100][lvl - 1] ?? 0;
        const xpRange = xpNext !== null ? (xpNext + xpCurrent) - xpPrev : 1;
        const xpFill = xpNext !== null ? Math.round(((xpCurrent - xpPrev) / xpRange) * 100) : 100;
        const levelStars = '★'.repeat(lvl) + '☆'.repeat(5 - lvl);
        const traits = (cmd.traits ?? []) as Array<{ id: string; name: string }>;
        const traitNames = traits.map((t: { id: string; name: string }) => ALL_TRAITS[t.id as keyof typeof ALL_TRAITS]?.name ?? t.name).join(', ');
        const xpBar = `<div style="height:3px;background:#333;border-radius:2px;margin-top:4px;">
          <div style="width:${xpFill}%;height:100%;background:#c89030;border-radius:2px;"></div></div>`;
        const xpLabel = xpNext !== null
          ? `<span style="font-size:0.65rem;color:#888;">Lv${lvl} · ${xpCurrent - xpPrev}/${xpRange} XP to Lv${lvl + 1}</span>`
          : `<span style="font-size:0.65rem;color:#c89030;">★ Legendary</span>`;
        html += `<div class="commander-card" style="flex-direction:column;gap:2px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.95rem;">⭐</span>
            <strong style="flex:1;">${cmd.name}</strong>
            <span style="font-size:0.7rem;color:#c89030;">${levelStars}</span>
            ${canMoveCmd ? `<button class="btn-sm" style="font-size:0.7rem;padding:2px 6px" onclick="window.__hudInstance?.startCommanderMove('${territory.id}')">Move</button>` : ''}
          </div>
          <div style="font-size:0.72rem;color:#aaa;">${atkSign}${cmd.attackBonus} ATK · ${defSign}${cmd.defenseBonus} DEF${traitNames ? ' · ' + traitNames : ''}</div>
          ${xpBar}
          ${xpLabel}
        </div>`;
      }

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
        const enemyIds = Array.from(new Set(this.validMoves.filter(m => m.isAttack).map(m => m.territoryId)));
        const moveIds = Array.from(new Set(this.validMoves.filter(m => !m.isAttack).map(m => m.territoryId)));
        if (enemyIds.length > 0) {
          html += `<div class="attack-range-preview">
            🎯 <strong>${enemyIds.length}</strong> enem${enemyIds.length === 1 ? 'y' : 'ies'} in attack range
          </div>`;
        }
        const previewTargets = [
          ...enemyIds.slice(0, 3).map(id => ({ id, type: 'attack' })),
          ...moveIds.slice(0, Math.max(0, 3 - Math.min(enemyIds.length, 3))).map(id => ({ id, type: 'move' })),
        ];
        if (previewTargets.length > 0) {
          html += `<div class="target-preview-list">
            ${previewTargets.map(target => {
              const t = this.state.territories.get(target.id);
              const viaTransport = this.validMoves.some(move => move.territoryId === target.id && move.viaTransport);
              const label = target.type === 'attack' ? 'Attack' : viaTransport ? 'Transport' : 'Move';
              const className = viaTransport ? 'transport' : target.type;
              return `<button class="${className}" onclick="window.__hudInstance?.focusTerritory('${target.id}')">${label}: ${this.escapeHtml(t?.name ?? target.id)}</button>`;
            }).join('')}
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

    if (detailsEl) {
      detailsEl.classList.remove('content-refresh');
      void detailsEl.offsetWidth;
      detailsEl.innerHTML = html;
      detailsEl.classList.add('content-refresh');
    }

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
    const movementPhase = isMovementPhase(phaseStr);
    const buildPhase = isBuildPhase(phaseStr);
    const combatPhase = isCombatPhase(phaseStr);
    const isEndPhase = ['collect_income', 'end'].includes(phaseStr);
    const hasAttackTargets = movementPhase && this.validMoves.some(m => m.isAttack);

    // Move button - enabled during movement phases with owned territory selected that has available units
    if (moveBtn) {
      // Check for units that haven't acted yet this turn
      const hasAvailableUnits = territory && territory.owner === faction?.id && 
        territory.units.some(pu => territory.getAvailableUnitCount(pu.unitTypeId) > 0);
      const canMove = movementPhase && isHumanTurn && hasAvailableUnits;
      moveBtn.disabled = !canMove;
      
      if (canMove) {
        moveBtn.innerHTML = '🚶 Move Units <kbd class="kbd-hint">M</kbd>';
        moveBtn.title = 'Click a highlighted friendly/empty territory to move units';
      } else {
        moveBtn.innerHTML = '🚶 Move <kbd class="kbd-hint">M</kbd>';
        moveBtn.title = movementPhase
          ? 'Select one of your territories with ready units'
          : 'Only available in movement phases';
      }
    }

    // Attack button - opens battle preview when selected territory has attack targets
    if (attackBtn) {
      if (movementPhase && isHumanTurn) {
        attackBtn.innerHTML = hasAttackTargets
          ? '⚔️ Attack Target <kbd class="kbd-hint">A</kbd>'
          : '⚔️ Attack <kbd class="kbd-hint">A</kbd>';
        attackBtn.disabled = !hasAttackTargets;
        attackBtn.title = hasAttackTargets
          ? 'Open battle preview for available attack target'
          : 'Select your territory, then click an enemy territory to attack';
      } else if (combatPhase) {
        attackBtn.textContent = '⚔️ Resolve Combat';
        attackBtn.disabled = this.state.pendingMoves.length === 0 || !isHumanTurn;
        attackBtn.title = this.state.pendingMoves.length > 0
          ? 'Resolve queued battles'
          : 'No battles waiting';
      } else {
        attackBtn.innerHTML = '⚔️ Attack <kbd class="kbd-hint">A</kbd>';
        attackBtn.disabled = true;
        attackBtn.title = 'Only available in movement/combat phases';
      }
    }

    // Phase-active class: highlight buttons relevant to the current phase
    const allActionBtns = [moveBtn, attackBtn, buildBtn];
    for (const b of allActionBtns) b?.classList.remove('phase-active');
    if (movementPhase) {
      moveBtn?.classList.add('phase-active');
      if (hasAttackTargets) attackBtn?.classList.add('phase-active');
    }
    if (buildPhase) buildBtn?.classList.add('phase-active');
    if (combatPhase) attackBtn?.classList.add('phase-active');

    // Build/Mobilize button - enabled during purchase/build/production phase
    if (buildBtn) {
      buildBtn.textContent = '🏭 Mobilize';
      
      // Check if we have any territories to mobilize
      const mobilizeOptions = this.mobilizationSystem.getMobilizationOptions();
      const canMobilize = mobilizeOptions.some(o => o.canMobilize);
      
      const canBuild = buildPhase && isHumanTurn;
      buildBtn.disabled = !canBuild;
      
      // Update button tooltip with reason
      if (!canBuild) {
        if (!isHumanTurn) {
          buildBtn.title = 'Wait for your turn';
        } else if (!buildPhase) {
          buildBtn.title = `Only available in ${turnStyle === 'quick' ? 'Build' : 'Purchase/Production'} phase`;
        }
      } else if (!canMobilize) {
        buildBtn.title = 'Not enough IPCs or all territories already mobilized';
      } else {
        buildBtn.title = 'Mobilize forces at your territories (B)';
      }
    }
    
    // Strategic bombing button — visible only in combat/movement phases when bombers exist
    const bombBtn = document.getElementById('btn-strategic-bomb') as HTMLButtonElement | null;
    if (bombBtn) {
      const hasBombers = (() => {
        if (!faction) return false;
        for (const t of this.state.territories.values()) {
          if (t.owner !== faction.id) continue;
          for (const u of t.units) {
            const type = this.state.unitRegistry.get(u.unitTypeId);
            if (type?.id.includes('bomber') || type?.id.includes('strategic')) return true;
          }
        }
        return false;
      })();
      const showBomb = (combatPhase || movementPhase) && isHumanTurn && hasBombers;
      bombBtn.classList.toggle('hidden', !showBomb);
      bombBtn.disabled = !showBomb;
    }

    // Fortify button — visible during purchase phase when own land territory is selected
    const fortifyBtn = document.getElementById('btn-fortify') as HTMLButtonElement | null;
    if (fortifyBtn) {
      const fort = this.state.systems.fortificationSystem;
      const canFortify = buildPhase && isHumanTurn && fort !== undefined &&
        territory != null && territory.isLand() && territory.owner === faction?.id &&
        (territory.fortificationLevel ?? 0) < 2 && fort.canBuild(territory.id, faction?.id ?? '');
      const showFortify = buildPhase && isHumanTurn && fort !== undefined;
      fortifyBtn.classList.toggle('hidden', !showFortify);
      fortifyBtn.disabled = !canFortify;
      if (showFortify && territory?.owner === faction?.id && fort) {
        const cost = fort.getUpgradeCost(territory?.id ?? '');
        fortifyBtn.title = cost !== null
          ? `Build fortification for ${cost} IPCs (+${(territory?.fortificationLevel ?? 0) + 1} defense bonus)`
          : 'Territory is fully fortified';
      }
    }

    // Nuclear button — visible once nuclear_program is researched; disabled until readiness = 100%
    const nuclearBtn = document.getElementById('btn-nuclear') as HTMLButtonElement | null;
    if (nuclearBtn && faction) {
      const nuclearSystem = this.state.systems.nuclearSystem;
      const hasTech = this.state.systems.technologyManager?.hasTech?.(faction.id, 'nuclear_program') ?? false;
      const readiness = Math.round(faction.nuclearReadiness ?? 0);
      const showNuclear = isHumanTurn && (hasTech || readiness > 0);
      nuclearBtn.classList.toggle('hidden', !showNuclear);
      const canLaunch = nuclearSystem?.canLaunch?.(faction.id) ?? false;
      nuclearBtn.disabled = !canLaunch;
      nuclearBtn.title = canLaunch
        ? '☢️ Ready to launch! Click to select target.'
        : `☢️ Nuclear readiness: ${readiness}% (need 100%)`;
      if (canLaunch) {
        nuclearBtn.innerHTML = '☢️ Launch Nuke';
      } else {
        const barFill = `<span style="display:inline-block;width:${readiness}%;height:3px;background:#ef4444;border-radius:2px;vertical-align:middle;"></span><span style="display:inline-block;width:${100 - readiness}%;height:3px;background:#444;border-radius:2px;vertical-align:middle;"></span>`;
        nuclearBtn.innerHTML = `☢️ ${readiness}%<br><span style="display:inline-flex;width:100%;gap:1px;">${barFill}</span>`;
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
      // Pulse the End Phase button when player appears idle — nothing is in progress
      const noPendingMoves = this.state.pendingMoves.length === 0;
      const noActiveCombat = !this.combatUI.getActiveCombat();
      const noSelection    = !this.state.selectedTerritoryId;
      const shouldPulse    = isHumanTurn && noPendingMoves && noActiveCombat && noSelection;
      endBtn.classList.toggle('btn-end-phase-pulse', shouldPulse);
    }

    // Shortcut badge on Build button
    if (buildBtn) {
      const label = buildBtn.innerHTML;
      if (!label.includes('kbd')) {
        buildBtn.innerHTML = buildBtn.innerHTML + ' <kbd class="kbd-hint">B</kbd>';
      }
    }

    // Update context helper with current action guidance
    const contextTip = this.phaseGuidance.updateContextHelper({
      phase,
      faction,
      territory,
      isHumanTurn,
      isBuildPhase: buildPhase,
      isMovementPhase: movementPhase,
      isCombatPhase: combatPhase,
      isEndPhase,
    });
    if (contextTip) this.showFirstTimeTip(contextTip.tipId, contextTip.message);
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
   * Update valid move highlights
   */
  private updateValidMoves(): void {
    const territory = this.state.getSelectedTerritory();
    const faction = this.state.getCurrentFaction();
    const phase = this.state.currentPhase;

    if (!territory || territory.owner !== faction?.id) {
      this.renderer.clearValidMoveTargets();
      this.validMoves = [];
      this.updateMapReadabilityLegend();
      return;
    }

    // Check if current phase allows movement
    if (!isMovementPhase(phase)) {
      this.renderer.clearValidMoveTargets();
      this.validMoves = [];
      this.updateMapReadabilityLegend();
      return;
    }

    // Get valid moves for all unit types in territory
    const allMoves: ValidMove[] = [];
    // Determine if attacks are allowed based on phase and turn style
    const isCombatMove = isAttackMovePhase(phase);

    for (const pu of territory.units) {
      const moves = this.movementValidator.getValidMoves(
        pu.unitTypeId,
        territory.id,
        isCombatMove
      );
      allMoves.push(...moves);
    }

    const { moveTargets, attackTargets } = splitMoveAndAttackTargets(allMoves);

    this.validMoves = allMoves;
    this.renderer.setValidMoveTargets(moveTargets, attackTargets);
    this.applyOverlay();
    this.updateActionButtons();
    this.updateMapReadabilityLegend();
  }

  private applyOverlay(): void { this.overlayController.apply(); }
  cycleOverlay(): void {
    this.overlayController.cycle();
    this.updateMapReadabilityLegend();
  }

  focusTerritory(territoryId: string): void {
    if (!this.state.territories.has(territoryId)) return;
    this.renderer.centerOnTerritory(territoryId);
    this.state.selectTerritory(territoryId);
  }

  private updateMapReadabilityLegend(): void {
    const targetParent = document.getElementById('war-room-content') ?? document.getElementById('app');
    let legend = document.getElementById('map-readability-legend');
    if (!legend) {
      legend = document.createElement('div');
      legend.id = 'map-readability-legend';
    }
    if (targetParent && legend.parentElement !== targetParent) {
      targetParent.appendChild(legend);
    }
    legend.classList.add('war-room-section', 'overlay-legend-section');

    const mode = this.overlayController?.getMode() ?? 'off';
    const moveCount = this.validMoves.filter(m => !m.isAttack).length;
    const attackCount = this.validMoves.filter(m => m.isAttack).length;
    const mobilizeCount = this.mobilizationSystem.getMobilizationOptions().filter(o => o.canMobilize).length;
    const selected = this.state.getSelectedTerritory();
    const selectedText = selected ? selected.name : 'No territory selected';
    const modeLabels: Record<string, string> = {
      off: 'Overlay Off',
      range: 'Range',
      threat: 'Threats',
      economic: 'Economy',
    };

    legend.innerHTML = `
      <div class="map-legend-title">${this.escapeHtml(modeLabels[mode])}</div>
      <div class="map-legend-row"><span class="legend-swatch selected"></span><span>${this.escapeHtml(selectedText)}</span></div>
      <div class="map-legend-row"><span class="legend-swatch move"></span><span>${moveCount} move</span></div>
      <div class="map-legend-row"><span class="legend-swatch attack"></span><span>${attackCount} attack</span></div>
      <div class="map-legend-row"><span class="legend-swatch build"></span><span>${mobilizeCount} mobilize</span></div>
    `;
    legend.classList.toggle('quiet', mode === 'off' && moveCount === 0 && attackCount === 0 && mobilizeCount === 0);
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
    if (isAttackMovePhase(this.state.currentPhase)) {
      this.onAttackShortcut();
      return;
    }
    this.combatUI.onAttackClick();
  }

  /**
   * Keyboard shortcut A — attack from the currently selected territory.
   * If exactly one valid attack target exists, opens the battle preview immediately.
   * Otherwise highlights all targets and lets the player click one.
   */
  private onAttackShortcut(): void {
    const phase = this.state.currentPhase;
    const movementPhase = isAttackMovePhase(phase);
    if (!movementPhase) {
      this.showToast('Attack only available in combat/move phases', 'info');
      return;
    }

    const fromId = this.state.selectedTerritoryId;
    if (!fromId) {
      this.showToast('Select your territory first, then press A to attack', 'info');
      return;
    }

    const attackTargets = this.validMoves.filter(m => m.isAttack);
    if (attackTargets.length === 0) {
      this.showToast('No valid attack targets from here', 'info');
      return;
    }

    if (attackTargets.length === 1) {
      this.combatUI.showBattlePreview(fromId, attackTargets[0].territoryId);
    } else {
      this.showToast(`${attackTargets.length} targets available — click one to attack`, 'info');
    }
  }

  /**
   * Handle build button click
   */
  private onBuildClick(): void {
    this.productionUI.showFactoryHub();
  }

  private onFortifyClick(): void {
    const fort = this.state.systems.fortificationSystem;
    const faction = this.state.getCurrentFaction();
    const territory = this.state.getSelectedTerritory();
    if (!fort || !faction || !territory) return;

    const cost = fort.getUpgradeCost(territory.id);
    if (cost === null) {
      this.showToast('This territory already has maximum fortification.', 'info');
      return;
    }

    if (faction.ipcs < cost) {
      this.showToast(`Not enough IPCs. Fortification costs ${cost} IPCs.`, 'error');
      return;
    }

    const level = territory.fortificationLevel ?? 0;
    const nextNames = ['Earthworks', 'Bunker Complex'];
    const built = fort.build(territory.id, faction.id);
    if (built) {
      this.showToast(`${territory.name} fortified to ${nextNames[level]}! (-${cost} IPCs)`, 'success');
      this.updateSelectionInfo();
      this.updateFactionPanel();
      this.renderer.render();
    }
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

    this.stopTurnTimer();
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

  // ==================== COMBAT (delegated to CombatUI) ====================
  // ==================== PRODUCTION / DEPLOYMENT (delegated to ProductionUI) ====================

  // Unit placement mode (legacy - kept for compatibility)
  public isPlacementMode: boolean = false;
  public unitsToPlace: { unitTypeId: string; count: number }[] = [];

  /**
   * Show deployment modal during production phase
   */
  showDeploymentModal(): void {
    this.productionUI.showDeploymentModal();
  }

  /**
   * Show income notification
   */
  private showIncomeNotification(data: { amount: number }): void {
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

  // ==================== VICTORY (delegated to VictoryScreen) ====================

  resetVictoryState(): void {
    this.victoryHandled = false;
    this.victoryScreen.reset();
  }

  private handleVictory(data: { winner?: string; factionId?: string }): void {
    const winner = data.winner ?? data.factionId;
    if (!winner || this.victoryHandled) return;
    this.victoryHandled = true;
    this.events.emit('gameOver', { winner });
    this.victoryScreen.show({ winner });
  }

  // ==================== MINIMAP (delegated to MinimapController) ====================

  /**
   * Render mini-map — delegates to MinimapController
   */
  renderMinimap(): void {
    this.minimapController.render();
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
      const displayName = isCurrent ? faction.name : faction.name.split(' ')[0];
      const dotStyle = isCurrent
        ? `background:${faction.color};box-shadow:0 0 0 2px ${faction.color},0 0 8px ${faction.color}88;`
        : `background:${faction.color};`;

      html += `
        <div class="turn-order-item ${statusClass}" title="${faction.name}">
          <div class="turn-order-dot" style="${dotStyle}"></div>
          <span>${displayName}</span>
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
      const income = this.state.calculateIncome(faction.id);

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
              <div class="fb-row fb-ipc" title="${faction.ipcs} IPCs (${income > 0 ? '+' : ''}${income}/turn)">
                <span class="fb-icon">💰</span>
                <span class="fb-val">${faction.ipcs} <span style="color:#4ade80;font-size:0.72em;opacity:0.85;">+${income}</span></span>
              </div>
              ${faction.warWeariness > 0 ? (() => {
                const ww = faction.warWeariness;
                const wwColor = ww < 33 ? '#22c55e' : ww < 66 ? '#fbbf24' : '#ef4444';
                return `<div class="fb-row" title="War Weariness: ${ww}%">
                  <span class="fb-icon">😰</span>
                  <div class="fb-track"><div class="fb-fill" style="width:${ww}%;background:${wwColor};"></div></div>
                  <span class="fb-val" style="color:${wwColor}">${ww}%</span>
                </div>`;
              })() : ''}
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

  // ==================== BATTLE PREVIEW (delegated to CombatUI) ====================

  private undoLastAction(): void { this.undoController.undo(); }
  private updateUndoButton(): void { this.undoController.updateButton(); }

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

    // Tech bonuses for current faction
    const faction = this.state.getCurrentFaction();
    const techEffect = faction && this.state.systems.technologyManager
      ? this.state.systems.technologyManager.getTechEffect(faction.id)
      : null;
    const techAtkBonus = techEffect?.attackBonus ?? 0;
    const techDefBonus = techEffect?.defenseBonus ?? 0;
    const atkDisplay = techAtkBonus
      ? `${unitType.attack} <span style="color:#22c55e;font-size:0.8em;">(+${techAtkBonus} tech)</span>`
      : String(unitType.attack);
    const defDisplay = techDefBonus
      ? `${unitType.defense} <span style="color:#22c55e;font-size:0.8em;">(+${techDefBonus} tech)</span>`
      : String(unitType.defense);

    // Morale combat modifier
    const morale = faction ? (faction.morale ?? (100 - (faction.warWeariness ?? 0))) : 100;
    const moraleMod = morale >= 80 ? +1 : morale >= 50 ? 0 : morale >= 35 ? -1 : morale >= 20 ? -2 : -3;
    const moraleColor = moraleMod > 0 ? '#22c55e' : moraleMod < 0 ? '#ef4444' : '#aaa';
    const moraleStr = moraleMod > 0 ? `+${moraleMod}` : String(moraleMod);

    content.innerHTML = `
      <div class="tooltip-title">${icon} ${unitType.name}</div>
      <div class="tooltip-stat"><span>Attack:</span><span>${atkDisplay}</span></div>
      <div class="tooltip-stat"><span>Defense:</span><span>${defDisplay}</span></div>
      <div class="tooltip-stat"><span>Movement:</span><span>${unitType.movement}</span></div>
      <div class="tooltip-stat"><span>Cost:</span><span>${unitType.cost} IPCs</span></div>
      <div class="tooltip-stat"><span>Domain:</span><span>${unitType.domain}</span></div>
      ${unitType.hitPoints > 1 ? `<div class="tooltip-stat"><span>Hit Points:</span><span>${unitType.hitPoints}</span></div>` : ''}
      ${moraleMod !== 0 ? `<div class="tooltip-stat"><span>Morale mod:</span><span style="color:${moraleColor}">${moraleStr} all rolls</span></div>` : ''}
      ${unitType.canBlitz ? '<div style="color: #8b6914; margin-top: 0.5rem;">⚡ Can Blitz</div>' : ''}
      ${unitType.canBombard ? '<div style="color: #2563a8; margin-top: 0.25rem;">💥 Bombardment</div>' : ''}
      ${unitType.canStrategicBomb ? '<div style="color: #dc2626; margin-top: 0.25rem;">🏭 Strategic Bombing</div>' : ''}
      ${unitType.requiredTransport ? '<div style="color: #6366f1; margin-top: 0.25rem;">⚓ Needs Transport</div>' : ''}
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

  // ==================== DIPLOMACY UI (delegated to DiplomacyUI) ====================

  showDiplomacyModal(): void {
    this.diplomacyUI.showModal();
  }

  proposeDiplomaticPact(toFactionId: string): void {
    this.diplomacyUI.proposePact(toFactionId);
  }

  proposeDiplomacy(toFactionId: string, type: import('../engine/DiplomacyManager').ProposalType, duration: number): void {
    this.diplomacyUI.proposeDiplomacy(toFactionId, type, duration);
  }

  betrayAlliance(toFactionId: string): void {
    this.diplomacyUI.betrayAllianceWith(toFactionId);
  }

  // ==================== TECHNOLOGY (delegated to TechUI) ====================

  // ==================== STATISTICS (delegated to StatsUI) ====================

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
      mapSelect.value = this.gameConfig.mapId && list.some(m => m.id === this.gameConfig.mapId)
        ? this.gameConfig.mapId
        : 'grid';
    }
    this.refreshSetupFactionOptions();
    this.syncSetupHelpers();
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
    const capitalsToWin = normalizeCapitalsToWin(
      parseInt((document.getElementById('victory-capitals') as HTMLInputElement)?.value || '3') || 3,
      this.getSetupFactionsForMap(mapId)
    );
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
      if (humanFactions.length === 0) {
        this.showToast('Choose at least one human faction for Hot Seat', 'info');
        this.updateSetupSummary();
        return;
      }
    } else {
      const playerFactionSelect = document.getElementById('player-faction') as HTMLSelectElement;
      const playerFaction = playerFactionSelect?.value || 'atlantic_alliance';
      if (playerFaction === 'random') {
        const playable = this.getSetupFactionsForMap(mapId).filter(f => f.isPlayable).map(f => f.id);
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

    // Update faction controllers for hot seat
    for (const faction of this.state.factionRegistry.getAll()) {
      faction.controlledBy = humanFactions.includes(faction.id) ? 'human' : 'ai';
    }

    this.hideNewGameModal();
    this.prevIPCs = -1; // Reset flash tracking for new game

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

    // Initialize FOW button visual state to match config
    const fogBtn = document.getElementById('btn-fog-toggle');
    if (fogBtn) {
      const on = this.gameConfig.fogOfWar;
      fogBtn.style.opacity = on ? '1' : '0.45';
      fogBtn.style.borderColor = on ? 'rgba(99, 179, 237, 0.7)' : '';
      fogBtn.style.boxShadow = on ? '0 0 8px rgba(99, 179, 237, 0.35)' : '';
      fogBtn.title = on ? 'Fog of war ON — scouts reveal adjacent tiles. Click to disable.' : 'Fog of war OFF — click to enable';
    }

    this.showToast('Game started!', 'success');
    this.maybeOfferTutorial();
  }

  private getSetupFactionsForMap(mapId: string): FactionData[] {
    const entry = getMapEntry(mapId);
    if (entry?.factions?.length) return entry.factions;
    return this.state.factionRegistry.getAll().map(f => f.serialize());
  }

  private getSelectedSetupMap(): { id: string; name: string; data?: MapData; factions: FactionData[] } {
    const mapSelect = document.getElementById('map-select') as HTMLSelectElement | null;
    const id = mapSelect?.value ?? this.gameConfig.mapId ?? 'grid';
    const entry = getMapEntry(id);
    return {
      id,
      name: entry?.name ?? mapSelect?.selectedOptions[0]?.textContent?.trim() ?? 'Selected map',
      data: entry?.data,
      factions: this.getSetupFactionsForMap(id),
    };
  }

  private getFactionOptionLabel(faction: FactionData): string {
    return `${faction.name}${faction.playstyle ? ` - ${faction.playstyle}` : ''}`;
  }

  private refreshSetupFactionOptions(): void {
    const { factions } = this.getSelectedSetupMap();
    const playable = factions.filter(f => f.isPlayable).sort((a, b) => a.turnOrder - b.turnOrder);
    const playerSelect = document.getElementById('player-faction') as HTMLSelectElement | null;
    const hotseatSelect = document.getElementById('human-factions') as HTMLSelectElement | null;
    const previousPlayer = playerSelect?.value;
    const previousHotseat = new Set(Array.from(hotseatSelect?.selectedOptions ?? []).map(o => o.value));

    if (playerSelect) {
      playerSelect.innerHTML = [
        ...playable.map(f => `<option value="${this.escapeHtml(f.id)}">${this.escapeHtml(this.getFactionOptionLabel(f))}</option>`),
        '<option value="random">Random playable faction</option>',
      ].join('');
      playerSelect.value = previousPlayer && (previousPlayer === 'random' || playable.some(f => f.id === previousPlayer))
        ? previousPlayer
        : playable[0]?.id ?? 'random';
    }

    if (hotseatSelect) {
      hotseatSelect.innerHTML = playable
        .map((f, index) => `<option value="${this.escapeHtml(f.id)}"${previousHotseat.has(f.id) || (previousHotseat.size === 0 && index === 0) ? ' selected' : ''}>${this.escapeHtml(this.getFactionOptionLabel(f))}</option>`)
        .join('');
    }
  }

  private updateMapInfoCard(): void {
    const card = document.getElementById('map-info-card');
    if (!card) return;

    const { name, data, factions } = this.getSelectedSetupMap();
    if (!data) {
      card.classList.add('hidden');
      return;
    }

    const land = data.territories.filter(t => t.type !== 'sea').length;
    const sea = data.territories.filter(t => t.type === 'sea').length;
    const coastal = data.territories.filter(t => t.type === 'coastal').length;
    const factories = data.territories.filter(t => t.hasFactory).length;
    const startingUnits = (data.startingUnits ?? []).reduce((sum, s) => sum + s.units.reduce((inner, u) => inner + u.count, 0), 0);
    const playable = factions.filter(f => f.isPlayable).sort((a, b) => a.turnOrder - b.turnOrder);
    const navalTag = sea > 0 || coastal > 0 ? 'Naval routes' : 'Land focused';
    const sizeTag = data.territories.length >= 80 ? 'Large map' : data.territories.length >= 40 ? 'Medium map' : 'Small map';

    card.classList.remove('hidden');
    card.innerHTML = `
      <div class="map-info-title">${this.escapeHtml(name)}</div>
      <div class="map-info-tags">
        <span>${this.escapeHtml(sizeTag)}</span>
        <span>${this.escapeHtml(navalTag)}</span>
        <span>${playable.length} factions</span>
      </div>
      <div class="map-info-stats">
        <span>${land} land</span>
        <span>${sea} sea</span>
        <span>${factories} factories</span>
        <span>${startingUnits} units</span>
      </div>
      <div class="map-info-factions">
        ${playable.map(f => `<span style="--faction-color:${this.escapeHtml(f.color)}">${this.escapeHtml(f.name)}</span>`).join('')}
      </div>
    `;
  }

  private updateFactionInfoCard(factionId: string): void {
    const card = document.getElementById('faction-info-card');
    if (!card) return;

    const faction = this.getSelectedSetupMap().factions.find(f => f.id === factionId);
    if (!faction || factionId === 'random') {
      card.style.display = 'none';
      return;
    }

    const uniqueUnit = this.state.unitRegistry.getAll().find(u => u.factionId === factionId);

    const bonusList: string[] = [];
    const b = faction.bonuses ?? {};
    if (b.ipcPerFactory)           bonusList.push(`+${b.ipcPerFactory} IPC per factory`);
    if (b.incomeMultiplierBonus)   bonusList.push(`+${Math.round(b.incomeMultiplierBonus * 100)}% income`);
    if (b.infantryDefenseBonus)    bonusList.push(`Infantry defend at +${b.infantryDefenseBonus}`);
    if (b.navalAttackBonus)        bonusList.push(`Naval attack +${b.navalAttackBonus}`);
    if (b.movementBonus)           bonusList.push(`+${b.movementBonus} movement (land)`);
    if (b.unitCostDiscount)        bonusList.push(`Mobilization costs ${b.unitCostDiscount} IPC less per unit`);
    if (b.counterIntelBonus)       bonusList.push(`Enemy spy success –${Math.round(b.counterIntelBonus * 100)}%`);
    if (b.researchSpeedBonus)      bonusList.push(`Research speed +${Math.round(b.researchSpeedBonus * 100)}%`);

    card.style.display = 'block';
    card.style.borderLeftColor = faction.color;
    card.style.background = `${faction.color}14`;
    card.innerHTML = `
      <div style="font-weight:bold;color:${faction.color};margin-bottom:0.3rem;">
        ${faction.name} — <span style="font-weight:normal;color:#94a3b8;">${faction.playstyle ?? ''}</span>
      </div>
      <div style="color:#cbd5e1;margin-bottom:0.4rem;">${faction.description ?? ''}</div>
      ${bonusList.length ? `<div style="color:#94a3b8;font-size:0.8rem;">
        ${bonusList.map(b => `▸ ${b}`).join(' &nbsp;·&nbsp; ')}
      </div>` : ''}
      ${uniqueUnit ? `<div style="margin-top:0.4rem;color:${faction.color};font-size:0.8rem;">
        ★ Unique unit: <strong>${uniqueUnit.name}</strong>
        (A${uniqueUnit.attack} D${uniqueUnit.defense} M${uniqueUnit.movement}, ${uniqueUnit.cost} IPC)
        ${uniqueUnit.canBlitz ? ' · can blitz' : ''}
        ${!uniqueUnit.requiredTransport && uniqueUnit.domain === 'land' ? ' · no transport needed' : ''}
      </div>` : ''}
    `;
  }

  private syncSetupHelpers(): void {
    const mode = (document.getElementById('game-mode') as HTMLSelectElement | null)?.value ?? 'vs-ai';
    document.getElementById('hotseat-options')?.classList.toggle('hidden', mode !== 'hotseat');
    document.getElementById('vs-ai-options')?.classList.toggle('hidden', mode !== 'vs-ai');
    this.updateMapInfoCard();

    const turnStyle = ((document.getElementById('turn-style') as HTMLSelectElement | null)?.value ?? 'quick') as TurnStyle;
    const turnDesc = document.getElementById('turn-style-description');
    if (turnDesc && TURN_STYLE_INFO[turnStyle]) turnDesc.textContent = TURN_STYLE_INFO[turnStyle].description;

    const unitEra = ((document.getElementById('unit-era') as HTMLSelectElement | null)?.value ?? 'wwii') as UnitEra;
    const eraDesc = document.getElementById('unit-era-description');
    if (eraDesc && UNIT_ERA_INFO[unitEra]) eraDesc.textContent = UNIT_ERA_INFO[unitEra].description;

    const victoryType = (document.getElementById('victory-type') as HTMLSelectElement | null)?.value ?? 'capitals';
    document.getElementById('victory-capitals-row')?.classList.toggle('hidden', victoryType !== 'capitals');
    document.getElementById('victory-domination-row')?.classList.toggle('hidden', victoryType !== 'domination');
    document.getElementById('victory-economic-row')?.classList.toggle('hidden', victoryType !== 'economic');
    this.syncVictoryCapitalLimit();

    const factionId = (document.getElementById('player-faction') as HTMLSelectElement | null)?.value ?? 'atlantic_alliance';
    this.updateFactionInfoCard(factionId);
    this.updateSetupSummary();
  }

  private syncVictoryCapitalLimit(): void {
    const input = document.getElementById('victory-capitals') as HTMLInputElement | null;
    if (!input) return;

    const maxCapitals = getMaxCapturableCapitals(this.getSelectedSetupMap().factions);
    const currentValue = parseInt(input.value || `${maxCapitals}`) || maxCapitals;
    const normalized = normalizeCapitalsToWin(currentValue, this.getSelectedSetupMap().factions);
    input.max = `${maxCapitals}`;
    input.value = `${normalized}`;
    input.title = `This map supports capturing up to ${maxCapitals} enemy capital${maxCapitals === 1 ? '' : 's'}.`;
  }

  private updateSetupSummary(): void {
    const summary = document.getElementById('setup-summary');
    if (!summary) return;

    const setupMap = this.getSelectedSetupMap();
    const mapName = setupMap.name;
    const mapId = setupMap.id;
    const unitEra = ((document.getElementById('unit-era') as HTMLSelectElement | null)?.value ?? 'wwii') as UnitEra;
    const mode = (document.getElementById('game-mode') as HTMLSelectElement | null)?.value ?? 'vs-ai';
    const turnStyle = ((document.getElementById('turn-style') as HTMLSelectElement | null)?.value ?? 'quick') as TurnStyle;
    const victoryType = ((document.getElementById('victory-type') as HTMLSelectElement | null)?.value ?? 'capitals') as VictoryType;
    const presetHold10 = (document.getElementById('preset-hold10') as HTMLInputElement | null)?.checked ?? false;
    const turnLimitValue = (document.getElementById('turn-limit') as HTMLSelectElement | null)?.value ?? '50';
    const fogOfWar = (document.getElementById('fog-of-war') as HTMLInputElement | null)?.checked ?? true;
    const autoSave = (document.getElementById('auto-save') as HTMLInputElement | null)?.checked ?? true;

    let playerText = 'Single player vs AI';
    if (mode === 'hotseat') {
      const selected = Array.from((document.getElementById('human-factions') as HTMLSelectElement | null)?.selectedOptions ?? []);
      playerText = selected.length > 0 ? `${selected.length} local players` : 'Choose at least 1 local player';
    } else {
      const factionSelect = document.getElementById('player-faction') as HTMLSelectElement | null;
      playerText = factionSelect?.selectedOptions[0]?.textContent?.trim() || 'Single player vs AI';
    }

    const maxCapitals = getMaxCapturableCapitals(setupMap.factions);
    const selectedCapitals = normalizeCapitalsToWin(
      parseInt((document.getElementById('victory-capitals') as HTMLInputElement | null)?.value || `${maxCapitals}`) || maxCapitals,
      setupMap.factions
    );
    const victoryText = {
      capitals: `Capture ${selectedCapitals} enemy capital${selectedCapitals === 1 ? '' : 's'}`,
      domination: `Control ${(document.getElementById('victory-domination') as HTMLInputElement | null)?.value || '75'}% of territories`,
      economic: `Earn ${(document.getElementById('victory-economic') as HTMLInputElement | null)?.value || '500'} IPCs`,
      elimination: 'Eliminate every rival',
    }[victoryType];
    const turnLimitText = presetHold10 || mapId === 'tutorial'
      ? 'short match'
      : turnLimitValue === '0'
        ? 'unlimited turns'
        : `${turnLimitValue} turns`;
    const recommended = mapId === 'grid' && unitEra === 'wwii' && mode === 'vs-ai' && turnStyle === 'quick'
      ? 'Recommended first game'
      : 'Custom setup';
    const playableCount = setupMap.factions.filter(f => f.isPlayable).length;
    const mapStats = setupMap.data
      ? `${setupMap.data.territories.length} territories, ${playableCount} playable factions`
      : `${playableCount} playable factions`;

    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:center;margin-bottom:0.35rem;">
        <strong style="color:#86efac;">${recommended}</strong>
        <span style="color:#94a3b8;font-size:0.78rem;">${fogOfWar ? 'Fog on' : 'Fog off'} · ${autoSave ? 'Autosave on' : 'Autosave off'}</span>
      </div>
      <div>${mapName} · ${UNIT_ERA_INFO[unitEra]?.name ?? unitEra} · ${TURN_STYLE_INFO[turnStyle]?.name ?? turnStyle}</div>
      <div style="color:#94a3b8;margin-top:0.25rem;">${playerText} · ${victoryText} · ${turnLimitText} · ${mapStats}</div>
    `;
  }

  private maybeOfferTutorial(): void {
    // Canonical first-run onboarding gate: offer once, through one path only.
    if (localStorage.getItem('tutorial-seen') === 'true') return;
    if (localStorage.getItem('tutorial-offered') === '1') return;
    localStorage.setItem('tutorial-offered', '1');
    showFirstRunTutorialOffer(
      () => this.showTutorial(),
      () => {
        // Skip should still count as first-run onboarding being handled.
        localStorage.setItem('tutorial-seen', 'true');
      }
    );
  }

  // ==================== HOT SEAT ====================

  /**
   * Show hot seat turn banner
   */
  showHotSeatBanner(factionName: string, factionColor: string, playerNum: number = 1): Promise<void> {
    return new Promise((resolve) => {
      if (this.gameConfig.mode !== 'hotseat') {
        resolve();
        return;
      }

      const banner = document.createElement('div');
      banner.id = 'hotseat-banner';
      // Full-screen cover prevents the outgoing player from seeing the incoming player's state
      banner.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9500',
        'background:#050b14',
        'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
        'gap:1.2rem',
      ].join(';');
      banner.innerHTML = `
        <div style="font-size:3.5rem;">🎮</div>
        <div style="font-size:0.8rem;color:#64748b;letter-spacing:0.2em;text-transform:uppercase;">Player ${playerNum}</div>
        <h2 style="color:${factionColor};margin:0;font-size:2rem;letter-spacing:0.05em;">${factionName}'s Turn</h2>
        <div style="width:80px;height:6px;border-radius:3px;background:${factionColor};"></div>
        <p style="color:#94a3b8;margin:0;font-size:1rem;">Pass the device to Player ${playerNum}, then click Ready.</p>
        <button id="btn-hotseat-ready" style="
          margin-top:0.5rem;font-size:1.2rem;padding:1rem 2.5rem;
          background:${factionColor};color:#000;border:none;border-radius:8px;
          cursor:pointer;font-weight:bold;letter-spacing:0.05em;
        ">✓ I'm Ready!</button>
      `;
      document.body.appendChild(banner);

      document.getElementById('btn-hotseat-ready')?.addEventListener('click', () => {
        banner.remove();
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
      const on = this.gameConfig.fogOfWar;
      btn.textContent = on ? '🌫️ Fog' : '👁️ Fog';
      btn.title = on ? 'Fog of war ON — scouts reveal adjacent tiles. Click to disable.' : 'Fog of war OFF — click to enable';
      btn.style.opacity = on ? '1' : '0.45';
      btn.style.borderColor = on ? 'rgba(99, 179, 237, 0.7)' : '';
      btn.style.boxShadow = on ? '0 0 8px rgba(99, 179, 237, 0.35)' : '';
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

    // Territories with intel reveal from espionage are visible
    if (this.state.systems.espionageSystem?.isIntelRevealed?.(territoryId)) return true;

    // Build the set of territories that provide visibility for this faction.
    // Standard units: own territory + 1-tile radius.
    // Scout/air units (movement ≥ 3 and canBlitz, or domain === 'air') in a territory
    // extend visibility to a 2-tile radius from that territory.
    const visibilityRadius = (t: import('../data/Territory').Territory): number => {
      if (t.owner !== faction.id) return 0;
      const hasScout = t.units.some(pu => {
        const ut = this.state.unitRegistry.get(pu.unitTypeId);
        return ut && ((ut.movement >= 3 && ut.canBlitz) || ut.domain === 'air');
      });
      return hasScout ? 2 : 1;
    };

    for (const [ownedId, ownedTerritory] of this.state.territories) {
      if (ownedTerritory.owner !== faction.id) continue;
      const radius = visibilityRadius(ownedTerritory);
      if (radius >= 1) {
        // Direct adjacency
        if (ownedTerritory.adjacentTo.includes(territoryId)) return true;
        if (ownedId === territoryId) return true;
      }
      if (radius >= 2) {
        // Second-order adjacency: any neighbor of the owned territory
        for (const adjId of ownedTerritory.adjacentTo) {
          const adj = this.state.territories.get(adjId);
          if (adj && adj.adjacentTo.includes(territoryId)) return true;
          if (adjId === territoryId) return true;
        }
      }
    }

    return false;
  }

  /**
   * Returns true if a territory is adjacent to a visible territory but is not itself visible.
   * Used for the fog-of-war "?" markers — player knows the territory exists but not its contents.
   */
  isTerritoryAdjacentFog(territoryId: string): boolean {
    if (!this.gameConfig.fogOfWar) return false;
    if (this.isTerritoryVisible(territoryId)) return false;
    const territory = this.state.territories.get(territoryId);
    if (!territory) return false;
    return territory.adjacentTo.some(adjId => this.isTerritoryVisible(adjId));
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

  // ==================== CONTEXT MENU ====================

  /** Show a right-click context menu for a territory with relevant quick actions. */
  private showTerritoryContextMenu(territoryId: string, clientX: number, clientY: number): void {
    document.getElementById('territory-context-menu')?.remove();

    const territory = this.state.territories.get(territoryId);
    const faction = this.state.getCurrentFaction();
    if (!territory || !faction || faction.controlledBy !== 'human') return;

    const isOwned = territory.owner === faction.id;
    const isEnemy = territory.owner && faction.isEnemyOf(territory.owner);
    const phase = this.state.currentPhase;
    const isMovementPhase = ['combat_move', 'noncombat_move', 'move', 'orders', 'action'].includes(phase);
    const isBuildPhase = ['purchase', 'production', 'build'].includes(phase);
    const atWar = this.state.factionRegistry.getAll().some(
      f => f.id !== faction.id && !f.isDefeated && faction.isEnemyOf(f.id)
    );

    type MenuItem = { label: string; action: () => void; disabled?: boolean };
    const items: MenuItem[] = [];

    items.push({
      label: '🗺️ Center map here',
      action: () => this.renderer.centerOnTerritory(territoryId),
    });

    if (isOwned && isMovementPhase && territory.getTotalUnitCount() > 0) {
      items.push({
        label: '⚡ Select & show moves',
        action: () => {
          this.state.selectTerritory(territoryId);
          this.updateValidMoves();
          this.renderer.render();
        },
      });
    }

    if (isOwned && isBuildPhase && territory.type !== 'sea') {
      items.push({
        label: '🏭 Mobilize here',
        action: () => this.productionUI.handleMapMobilization(territoryId),
      });
    }

    if (isEnemy && isMovementPhase) {
      const selectedId = this.state.selectedTerritoryId;
      items.push({
        label: '⚔️ Attack from selected',
        disabled: !selectedId,
        action: () => {
          if (selectedId) this.combatUI.showBattlePreview(selectedId, territoryId);
        },
      });
    }

    if (atWar && faction.ipcs >= 5) {
      items.push({
        label: '🕵️ Espionage ops',
        action: () => this.showEspionageModal(),
      });
    }

    if (isOwned) {
      items.push({
        label: '🔬 Research technology',
        action: () => this.techUI.show(),
      });
    }

    const menu = document.createElement('div');
    menu.id = 'territory-context-menu';
    menu.style.cssText = `
      position:fixed;left:${clientX}px;top:${clientY}px;
      background:#1e293b;border:1px solid #475569;border-radius:6px;
      box-shadow:0 4px 16px rgba(0,0,0,0.5);z-index:9000;min-width:190px;
      padding:4px 0;font-size:0.85rem;
    `;
    menu.innerHTML = `<div style="padding:4px 12px 6px;color:#94a3b8;font-size:0.75rem;border-bottom:1px solid #334155;margin-bottom:4px;">${territory.name}</div>`;

    for (const item of items) {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.disabled = item.disabled ?? false;
      btn.style.cssText = `
        display:block;width:100%;padding:6px 14px;background:none;
        border:none;color:${item.disabled ? '#4b5563' : '#e2e8f0'};
        cursor:${item.disabled ? 'default' : 'pointer'};text-align:left;
      `;
      btn.addEventListener('mouseenter', () => { if (!item.disabled) btn.style.background = '#334155'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', () => { menu.remove(); if (!item.disabled) item.action(); });
      menu.appendChild(btn);
    }

    document.body.appendChild(menu);

    // Dismiss on any outside interaction
    const dismiss = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('mousedown', dismiss); }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);

    // Keep menu within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${clientX - rect.width}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${clientY - rect.height}px`;
  }

  // ==================== ESPIONAGE ====================

  /**
   * Show the espionage operations modal.
   */
  showEspionageModal(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'human') return;

    const espionageSystem = this.state.systems.espionageSystem;
    if (!espionageSystem) {
      this.showToast('Espionage system not available', 'info');
      return;
    }

    const enemies = this.state.factionRegistry.getAll().filter(
      f => f.id !== faction.id && !f.isDefeated &&
           this.state.diplomacyManager.getRelation(faction.id, f.id) === 'war'
    );

    let modal = document.getElementById('espionage-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'espionage-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const cooldownUntil = espionageSystem.getCooldownUntil?.(faction.id) ?? 0;
    const onCooldown = this.state.turnNumber < cooldownUntil;
    const turnsLeft = cooldownUntil - this.state.turnNumber;
    const recentHistory = espionageSystem.getHistory?.(faction.id, 5) ?? [];
    const historyHtml = recentHistory.length === 0
      ? '<p style="color:#4b5563;font-size:0.8rem;margin:0">No recent operations.</p>'
      : recentHistory.map(h => {
          const fName = this.state.factionRegistry.get(h.targetFactionId)?.name ?? h.targetFactionId;
          const icon = h.success ? '✓' : (h.exposed ? '⚠' : '✗');
          const col = h.success ? '#4ade80' : (h.exposed ? '#fbbf24' : '#f87171');
          return `<div style="display:flex;gap:6px;align-items:baseline;font-size:0.78rem;padding:2px 0;border-bottom:1px solid #1e293b;">
            <span style="color:${col};font-weight:bold;min-width:14px">${icon}</span>
            <span style="color:#94a3b8;min-width:28px">T${h.turn}</span>
            <span style="flex:1;color:#cbd5e1">${ESPIONAGE_OPS.find(o => o.type === h.opType)?.label ?? h.opType}</span>
            <span style="color:#64748b">→ ${fName}</span>
          </div>`;
        }).join('');

    modal.innerHTML = `
      <div class="modal-container" style="max-width:500px;">
        <div class="modal-header">
          <h2>🕵️ Espionage Operations</h2>
          <button id="btn-close-espionage" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
            <span style="color:#94a3b8">Treasury: <strong style="color:#fbbf24">${faction.ipcs} IPCs</strong></span>
            ${onCooldown
              ? `<span style="color:#f87171;font-size:0.85rem;">⏳ Agents recover in <strong>${turnsLeft}</strong> turn${turnsLeft !== 1 ? 's' : ''}</span>`
              : `<span style="color:#4ade80;font-size:0.85rem;">✓ Agents ready</span>`}
          </div>

          ${enemies.length === 0
            ? '<p style="color:#f87171">No enemies at war to target.</p>'
            : enemies.map(enemy => {
                const enemyCI = (enemy as any).bonuses?.counterIntelBonus ?? 0;
                return `<div style="margin-bottom:1.2rem;border:1px solid #334155;border-radius:6px;padding:0.8rem;">
                  <div style="font-weight:bold;color:${enemy.color};margin-bottom:0.6rem;">${enemy.name}</div>
                  ${ESPIONAGE_OPS.map(op => {
                    const adjustedChance = Math.round(op.successChance * (1 - enemyCI) * 100);
                    const affordable = faction.ipcs >= op.cost;
                    const disabled = !affordable || onCooldown;
                    const disabledStyle = disabled ? 'opacity:0.5;cursor:not-allowed;' : 'cursor:pointer;';
                    return `<button
                      class="esp-op-btn"
                      data-faction-id="${faction.id}"
                      data-enemy-id="${enemy.id}"
                      data-op-type="${op.type}"
                      ${disabled ? 'disabled' : ''}
                      style="display:block;width:100%;margin-bottom:0.4rem;padding:0.45rem 0.7rem;
                             background:#0f172a;border:1px solid #475569;border-radius:4px;
                             color:#e2e8f0;text-align:left;${disabledStyle}">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span>${op.label}</span>
                        <span style="display:flex;gap:8px;align-items:center;">
                          <span style="color:#fbbf24;font-size:0.8rem;">${op.cost} IPCs</span>
                          <span style="color:${adjustedChance >= 55 ? '#4ade80' : adjustedChance >= 35 ? '#fbbf24' : '#f87171'};font-size:0.78rem;">${adjustedChance}%</span>
                        </span>
                      </div>
                      <div style="color:#64748b;font-size:0.75rem;margin-top:2px">${op.description}</div>
                    </button>`;
                  }).join('')}
                </div>`;
              }).join('')}

          <details style="margin-top:0.8rem;">
            <summary style="color:#64748b;font-size:0.8rem;cursor:pointer;user-select:none;">📜 Recent Operations</summary>
            <div style="margin-top:0.5rem;padding:0.5rem;background:#0f172a;border-radius:4px;">
              ${historyHtml}
            </div>
          </details>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');

    document.getElementById('btn-close-espionage')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    modal.querySelectorAll<HTMLButtonElement>('.esp-op-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fId = btn.dataset.factionId!;
        const eId = btn.dataset.enemyId!;
        const opType = btn.dataset.opType as any;
        const result = espionageSystem.executeOperation?.(fId, eId, opType) ?? { success: false, exposed: false, detail: 'Unavailable' };
        modal?.classList.add('hidden');
        const icon = result.success ? '✓' : (result.exposed ? '⚠' : '✗');
        const kind = result.success ? 'success' : 'error';
        this.showToast(`${icon} ${result.detail}`, kind);
      });
    });
  }

  // ==================== NUCLEAR ====================

  /**
   * Show nuclear strike targeting modal.
   */
  showNuclearModal(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'human') return;

    const nuclearSystem = this.state.systems.nuclearSystem;
    if (!nuclearSystem || !nuclearSystem.canLaunch?.(faction.id)) {
      const readiness = Math.round(faction.nuclearReadiness ?? 0);
      this.showToast(`☢️ Nuclear not ready (${readiness}% — needs 100%)`, 'info');
      return;
    }

    let modal = document.getElementById('nuclear-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'nuclear-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const targets = Array.from(this.state.territories.values()).filter(
      t => t.owner && t.owner !== faction.id && t.isLand()
    ).slice(0, 20);

    modal.innerHTML = `
      <div class="modal-container" style="max-width:480px;border:2px solid #ef4444;">
        <div class="modal-header" style="background:#7f1d1d;">
          <h2 style="color:#fca5a5;">☢️ NUCLEAR STRIKE</h2>
          <button id="btn-close-nuclear" class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:#fca5a5;font-weight:bold;margin-bottom:0.5rem;">⚠️ WARNING: This action cannot be undone!</p>
          <p style="color:#aaa;margin-bottom:1rem;">Strike destroys ~80% of units, bombs factory for 5 turns.</p>
          <div style="max-height:300px;overflow-y:auto;">
            ${targets.map(t => {
              const ownerFaction = this.state.factionRegistry.get(t.owner!);
              return `<button onclick="
                if(confirm('Launch nuclear strike on ${t.name}?')){
                  window.__gameState?.nuclearSystem?.launchStrike('${faction.id}','${t.id}');
                  document.getElementById('nuclear-modal')?.classList.add('hidden');
                }
              " style="display:block;width:100%;margin-bottom:0.3rem;padding:0.5rem;background:#1c1917;border:1px solid #ef4444;border-radius:4px;color:#e2e8f0;cursor:pointer;text-align:left;">
                <strong>${t.name}</strong> <span style="color:${ownerFaction?.color ?? '#aaa'}">(${ownerFaction?.name ?? 'Unknown'})</span>
                — ${t.getTotalUnitCount()} units${t.hasFactory ? ' 🏭' : ''}${t.isCapital ? ' ⭐' : ''}
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    document.getElementById('btn-close-nuclear')?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });
    (window as any).__gameState = this.state;
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
      this.handleVictory({ winner: result.winner });
    }
  }

  /**
   * Track IPC earned for economic victory
   */
  trackIncome(factionId: string, amount: number): void {
    const current = this.gameConfig.totalIPCsEarned.get(factionId) || 0;
    this.gameConfig.totalIPCsEarned.set(factionId, current + amount);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getTopThreats(factionId: string): TerritoryThreat[] {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return [];

    return Array.from(this.state.territories.values())
      .filter(t => t.owner === factionId && t.isLand())
      .map(t => calculateTerritoryThreat(this.state, t, faction))
      .filter(t => t.threatLevel > 0)
      .sort((a, b) => b.defenseGap - a.defenseGap || b.threatLevel - a.threatLevel)
      .slice(0, 3);
  }

  private getOpportunityTargets(factionId: string): Array<{ territoryId: string; score: number; reason: string }> {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return [];

    const opportunities = new Map<string, { territoryId: string; score: number; reason: string }>();
    for (const owned of this.state.territories.values()) {
      if (owned.owner !== factionId || !owned.isLand()) continue;
      const availableAttack = owned.units.reduce((sum, unit) => {
        const type = this.state.unitRegistry.get(unit.unitTypeId);
        return sum + (type?.attack ?? 0) * owned.getAvailableUnitCount(unit.unitTypeId);
      }, 0);
      if (availableAttack <= 0) continue;

      for (const adjacentId of owned.adjacentTo) {
        const target = this.state.territories.get(adjacentId);
        if (!target?.owner || !faction.isEnemyOf(target.owner) || target.isSea()) continue;
        const defense = target.units.reduce((sum, unit) => {
          const type = this.state.unitRegistry.get(unit.unitTypeId);
          return sum + (type?.defense ?? 0) * unit.count;
        }, 0);
        const strategicValue = target.production + (target.isCapital ? 8 : 0) + (target.hasFactory ? 5 : 0);
        const score = availableAttack - defense + strategicValue;
        const existing = opportunities.get(target.id);
        if (!existing || score > existing.score) {
          const reason = target.isCapital ? 'enemy capital' : target.hasFactory ? 'factory target' : `+${target.production} IPC`;
          opportunities.set(target.id, { territoryId: target.id, score, reason });
        }
      }
    }

    return Array.from(opportunities.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  private getMobilizationAdvice(): string {
    const options = this.mobilizationSystem.getMobilizationOptions().filter(o => o.canMobilize);
    const best = options.sort((a, b) => {
      const aValue = (a.territory.isCapital ? 8 : 0) + (a.territory.hasFactory ? 6 : 0) + a.units.reduce((s, u) => s + u.count, 0);
      const bValue = (b.territory.isCapital ? 8 : 0) + (b.territory.hasFactory ? 6 : 0) + b.units.reduce((s, u) => s + u.count, 0);
      return bValue - aValue || a.cost - b.cost;
    })[0];
    if (!best) return 'No affordable mobilization is available. Preserve IPCs or advance the phase.';
    return `Mobilize ${best.territory.name}: ${best.type} package for ${best.cost} IPC.`;
  }

  private getBestMobilizationTarget(): { territoryId: string; label: string; detail: string } | null {
    const best = this.mobilizationSystem.getMobilizationOptions()
      .filter(o => o.canMobilize)
      .sort((a, b) => {
        const aThreat = this.getTopThreats(a.territory.owner ?? '')[0]?.territoryId === a.territory.id ? 5 : 0;
        const bThreat = this.getTopThreats(b.territory.owner ?? '')[0]?.territoryId === b.territory.id ? 5 : 0;
        const aValue = aThreat + (a.territory.isCapital ? 10 : 0) + (a.territory.hasFactory ? 7 : 0) + a.territory.production + a.units.reduce((s, u) => s + u.count, 0);
        const bValue = bThreat + (b.territory.isCapital ? 10 : 0) + (b.territory.hasFactory ? 7 : 0) + b.territory.production + b.units.reduce((s, u) => s + u.count, 0);
        return bValue - aValue || a.cost - b.cost;
      })[0];

    if (!best) return null;
    return {
      territoryId: best.territory.id,
      label: `Mobilize ${best.territory.name}`,
      detail: `${best.type} package, ${best.cost} IPC`,
    };
  }

  private getBestMovementSource(factionId: string): { territoryId: string; label: string; detail: string; attacks: number; moves: number } | null {
    const phase = this.state.currentPhase;
    const allowAttacks = ['combat_move', 'move', 'orders', 'action'].includes(phase);
    const candidates: Array<{ territoryId: string; label: string; detail: string; attacks: number; moves: number; score: number }> = [];

    for (const territory of this.state.territories.values()) {
      if (territory.owner !== factionId || territory.isSea()) continue;

      const moveTargets = new Set<string>();
      const attackTargets = new Set<string>();
      let readyUnits = 0;
      let attackPower = 0;

      for (const unit of territory.units) {
        const ready = territory.getAvailableUnitCount(unit.unitTypeId);
        if (ready <= 0) continue;
        readyUnits += ready;
        const unitType = this.state.unitRegistry.get(unit.unitTypeId);
        attackPower += ready * (unitType?.attack ?? 0);

        for (const move of this.movementValidator.getValidMoves(unit.unitTypeId, territory.id, allowAttacks)) {
          if (move.isAttack) attackTargets.add(move.territoryId);
          else moveTargets.add(move.territoryId);
        }
      }

      const attacks = attackTargets.size;
      const moves = moveTargets.size;
      if (readyUnits === 0 || (attacks + moves) === 0) continue;
      const strongestTarget = Array.from(attackTargets)
        .map(id => this.state.territories.get(id))
        .filter((t): t is NonNullable<typeof t> => !!t)
        .sort((a, b) => (b.production + (b.hasFactory ? 4 : 0) + (b.isCapital ? 8 : 0)) - (a.production + (a.hasFactory ? 4 : 0) + (a.isCapital ? 8 : 0)))[0];

      candidates.push({
        territoryId: territory.id,
        label: attacks > 0 ? `Inspect attack from ${territory.name}` : `Move from ${territory.name}`,
        detail: attacks > 0
          ? `${readyUnits} ready units, ${attacks} attack target${attacks === 1 ? '' : 's'}${strongestTarget ? `, best: ${strongestTarget.name}` : ''}`
          : `${readyUnits} ready units, ${moves} move target${moves === 1 ? '' : 's'}`,
        attacks,
        moves,
        score: attacks * 8 + moves + attackPower,
      });
    }

    return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
  }

  private getTurnCoach(faction: NonNullable<ReturnType<typeof this.state.getCurrentFaction>>): {
    headline: string;
    detail: string;
    primaryLabel: string;
    primaryAction: string;
    territoryId?: string;
    secondaryLabel?: string;
    secondaryAction?: string;
  } {
    const phase = this.state.currentPhase as string;

    if (['purchase', 'production', 'build'].includes(phase)) {
      const target = this.getBestMobilizationTarget();
      if (target) {
        return {
          headline: target.label,
          detail: target.detail,
          primaryLabel: 'Focus',
          primaryAction: 'focus-territory',
          territoryId: target.territoryId,
          secondaryLabel: 'Objectives',
          secondaryAction: 'show-objectives',
        };
      }
      return {
        headline: 'No affordable mobilization',
        detail: `Keep ${faction.ipcs} IPCs or advance to movement.`,
        primaryLabel: 'Objectives',
        primaryAction: 'show-objectives',
      };
    }

    if (['combat_move', 'noncombat_move', 'move', 'orders', 'action'].includes(phase)) {
      const selected = this.state.getSelectedTerritory();
      const selectedReady = selected?.owner === faction.id
        ? selected.units.reduce((sum, unit) => sum + selected.getAvailableUnitCount(unit.unitTypeId), 0)
        : 0;
      const source = selectedReady > 0 ? selected : this.getBestMovementSource(faction.id);

      if (source && 'id' in source) {
        return {
          headline: `Use ${source.name}`,
          detail: `${selectedReady} ready unit${selectedReady === 1 ? '' : 's'} selected. Green is movement, red is attack.`,
          primaryLabel: 'Range',
          primaryAction: 'range-overlay',
          territoryId: source.id,
          secondaryLabel: 'Threats',
          secondaryAction: 'threat-overlay',
        };
      }
      if (source) {
        return {
          headline: source.label,
          detail: source.detail,
          primaryLabel: 'Focus',
          primaryAction: 'focus-territory',
          territoryId: source.territoryId,
          secondaryLabel: 'Threats',
          secondaryAction: 'threat-overlay',
        };
      }
      return {
        headline: 'No ready movement',
        detail: 'All available units have acted or no legal destinations are open.',
        primaryLabel: 'Threats',
        primaryAction: 'threat-overlay',
      };
    }

    if (['combat', 'attack', 'resolve'].includes(phase)) {
      const battles = this.state.pendingMoves.length;
      return {
        headline: battles > 0 ? 'Resolve queued battles' : 'No battles queued',
        detail: battles > 0 ? `${battles} battle${battles === 1 ? '' : 's'} waiting in combat resolution.` : 'Advance when ready.',
        primaryLabel: 'Threats',
        primaryAction: 'threat-overlay',
      };
    }

    const income = this.state.calculateIncome(faction.id);
    return {
      headline: ['collect_income', 'end'].includes(phase) ? `Collect +${income} IPC` : 'Check the board',
      detail: ['collect_income', 'end'].includes(phase) ? 'End the turn after income resolves.' : 'Use objectives and threat overlay to decide your next commitment.',
      primaryLabel: 'Objectives',
      primaryAction: 'show-objectives',
      secondaryLabel: 'Threats',
      secondaryAction: 'threat-overlay',
    };
  }

  private runAdvisorAction(action: string, territoryId?: string): void {
    if (territoryId) {
      this.renderer.centerOnTerritory(territoryId);
      this.state.selectTerritory(territoryId);
    }

    if (action === 'range-overlay') {
      this.overlayController.setMode('range');
      this.showToast('Movement and attack range shown', 'info');
    } else if (action === 'threat-overlay') {
      this.overlayController.setMode('threat');
      this.showToast('Threat overlay shown', 'info');
    } else if (action === 'show-objectives') {
      this.updateObjectivesPanel();
      document.getElementById('objectives-panel')?.classList.remove('hidden');
    }
    this.updateMapReadabilityLegend();
  }

  private updateStrategicAdvisor(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'human') {
      this.strategicAdvisor.update({ visible: false });
      return;
    }

    const topThreat = this.getTopThreats(faction.id)[0];
    const topOpportunity = this.getOpportunityTargets(faction.id)[0];
    const activeObjective = this.objectiveSystem.getActive(faction.id)[0];
    const income = this.state.calculateIncome(faction.id);
    const coach = this.getTurnCoach(faction);
    const threatLine = (() => {
      if (!topThreat) return 'No immediate front-line pressure.';
      const name = this.state.territories.get(topThreat.territoryId)?.name ?? topThreat.territoryId;
      const gap = Math.ceil(topThreat.defenseGap);
      if (gap >= 8) return `🚨 ${name} is collapsing — reinforce now`;
      if (gap >= 4) return `⚠ ${name} at risk — defense is thin`;
      return `${name} is exposed, watch the flank`;
    })();
    const opportunityLine = (() => {
      if (!topOpportunity) return 'Build strength before attacking.';
      const name = this.state.territories.get(topOpportunity.territoryId)?.name ?? topOpportunity.territoryId;
      const reasonMap: Record<string, string> = {
        weak_defense: 'lightly defended — strike now',
        isolated:     'cut off from support',
        high_value:   'high-value — worth taking',
        undefended:   'undefended — easy capture',
      };
      const detail = reasonMap[topOpportunity.reason] ?? topOpportunity.reason;
      return `${name} — ${detail}`;
    })();
    const objectiveLine = activeObjective
      ? `${activeObjective.title}: ${activeObjective.description}`
      : 'Secure income and create a new attack lane.';

    this.strategicAdvisor.update({
      visible: true,
      objectiveLine,
      threatLine,
      opportunityLine,
      economyLine: `${faction.ipcs} IPC, +${income}/turn`,
      coach,
      mobilizationAdvice: this.getMobilizationAdvice(),
    });
  }

  private showFirstWarRoom(factionId: string): void {
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction || faction.controlledBy !== 'human') return;

    const threats = this.getTopThreats(factionId);
    const opportunities = this.getOpportunityTargets(factionId);
    const capital = this.state.territories.get(faction.capital);
    const firstThreat = threats[0] ? this.state.territories.get(threats[0].territoryId)?.name : null;
    const firstTarget = opportunities[0] ? this.state.territories.get(opportunities[0].territoryId)?.name : null;
    const coach = this.getTurnCoach(faction);
    const recommendedTerritoryId = coach.territoryId ?? capital?.id;

    this.firstWarRoom.show({
      factionName: faction.name,
      capitalName: capital?.name ?? 'Your capital',
      threatName: firstThreat ?? 'No urgent threat',
      pressureName: firstTarget ?? 'Nearest enemy border',
      mobilizationAdvice: this.getMobilizationAdvice(),
      coachHeadline: coach.headline,
      coachDetail: coach.detail,
      recommendedTerritoryId,
    });
  }

  // Dynamic Feature Methods

  /** Call at turn start for a human faction to tick objectives and supply display. */
  tickDynamicFeatures(factionId: string): void {
    if (settings.getSetting('midGameObjectives')) {
      this.objectiveSystem.tick(factionId);
      this.objectiveSystem.checkHoldConditions(factionId, this.state.turnNumber);
      this.updateObjectivesPanel();
    }
    if (settings.getSetting('warTension')) {
      this.tensionSystem.tick();
      this.updateTensionBar();
    }
    if (settings.getSetting('supplyLinePenalties')) {
      this.updateSupplyIndicator(factionId);
    }
    this.updateFactionAbilityButton(factionId);
    this.updateStrategicAdvisor();
  }

  /** Render the war-tension level as an inline badge in the turn-banner. */
  updateTensionBar(): void {
    const badge = document.getElementById('tension-badge');
    if (!badge) return;
    if (!settings.getSetting('warTension')) { badge.classList.add('hidden'); return; }
    const pct = Math.round(this.tensionSystem.getTension());
    const color = this.tensionSystem.getLevelColor();
    badge.textContent = `${this.tensionSystem.getLevelName()} - ${pct}%`;
    badge.style.color = color;
    badge.classList.remove('hidden');
  }

  /** Render the active objectives panel. */
  updateObjectivesPanel(): void {
    const panel = document.getElementById('objectives-panel');
    const list = document.getElementById('objectives-list') ?? panel;
    if (!panel) return;
    if (!settings.getSetting('midGameObjectives')) { panel.classList.add('hidden'); return; }
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'human') { panel.classList.add('hidden'); return; }
    const active = this.objectiveSystem.getActive(faction.id);
    if (active.length === 0) { if (list) list.innerHTML = ''; panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    if (list) list.innerHTML = active.map(obj => {
      const remaining = obj.deadline - this.state.turnNumber;
      const pct = Math.min(100, Math.round((obj.progress / (obj.condition.count ?? 1)) * 100));
      const rewardStr = obj.reward.type === 'ipc' ? `+${obj.reward.amount} IPC`
        : obj.reward.type === 'units' ? `+${obj.reward.amount} ${obj.reward.unitTypeId}`
        : '+Research';
      return `
        <div class="objective-card" title="${obj.description}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
            <span style="font-weight:600;font-size:0.78rem;">${obj.title}</span>
            <span style="font-size:0.7rem;color:#c9a227;">${rewardStr}</span>
          </div>
          <div style="font-size:0.7rem;color:#aaa;margin-bottom:4px;">${obj.description}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;background:#333;border-radius:4px;height:5px;">
              <div style="width:${pct}%;background:#22c55e;border-radius:4px;height:5px;transition:width 0.3s;"></div>
            </div>
            <span style="font-size:0.65rem;color:${remaining <= 1 ? '#ef4444' : '#888'};">${remaining}t left</span>
          </div>
        </div>
      `;
    }).join('');
  }

  /** Show or hide out-of-supply warning. */
  updateSupplyIndicator(factionId: string): void {
    const indicator = document.getElementById('supply-indicator');
    if (!indicator) return;
    if (!settings.getSetting('supplyLinePenalties')) { indicator.classList.add('hidden'); return; }
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction || faction.controlledBy !== 'human') { indicator.classList.add('hidden'); return; }
    const outOfSupply = Array.from(this.state.territories.values()).filter(t =>
      t.owner === factionId && t.units.length > 0 && !this.supplySystem.isInSupply(t.id, factionId)
    );
    if (outOfSupply.length > 0) {
      indicator.classList.remove('hidden');
      indicator.textContent = `${outOfSupply.length} territor${outOfSupply.length === 1 ? 'y' : 'ies'} out of supply (-1 combat)`;
    } else {
      indicator.classList.add('hidden');
    }
  }

  /** Update the faction ability button state. */
  updateFactionAbilityButton(factionId: string): void {
    const abilitySection = document.getElementById('hq-ability-section');
    const hide = () => {
      this.abilityPanel.update({ visible: false });
      abilitySection?.classList.add('hidden');
    };
    if (!settings.getSetting('factionAbilities')) { hide(); return; }
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction || faction.controlledBy !== 'human') { hide(); return; }
    const ability = this.abilityManager.getAbilityForFaction(factionId);
    if (!ability) { hide(); return; }
    abilitySection?.classList.remove('hidden');
    const ready = this.abilityManager.isReady(factionId, this.state.turnNumber);
    const turnsLeft = this.abilityManager.turnsUntilReady(factionId, this.state.turnNumber);
    this.abilityPanel.update({
      visible: true,
      ability,
      ready,
      turnsLeft,
      disabled: !ready || this.state.getCurrentFaction()?.id !== factionId,
    });
  }

  /** Called when the player clicks the faction ability button. */
  onFactionAbilityClick(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction || faction.controlledBy !== 'human') return;
    if (!settings.getSetting('factionAbilities')) return;
    const ability = this.abilityManager.getAbilityForFaction(faction.id);
    if (!ability || !this.abilityManager.isReady(faction.id, this.state.turnNumber)) return;
    if (ability.cost > 0 && faction.ipcs < ability.cost) {
      this.showToast(`Not enough IPCs (need ${ability.cost})`, 'info');
      return;
    }
    if (ability.needsTarget) {
      this.showToast(`Select a ${ability.targetFilter ?? 'any'} territory to use ${ability.name}.`, 'info');
      this.pendingAbilityTarget = true;
      return;
    }
    this.executeAbility(faction.id, ability.id, undefined);
  }

  /** Called when a territory is selected while pendingAbilityTarget is true. */
  handleAbilityTargetSelection(territoryId: string): boolean {
    if (!this.pendingAbilityTarget) return false;
    this.pendingAbilityTarget = false;
    const faction = this.state.getCurrentFaction();
    if (!faction) return false;
    const ability = this.abilityManager.getAbilityForFaction(faction.id);
    if (!ability) return false;
    this.executeAbility(faction.id, ability.id, territoryId);
    return true;
  }

  private executeAbility(factionId: string, abilityId: string, targetId?: string): void {
    const ability = FACTION_ABILITIES.find(a => a.id === abilityId);
    if (!ability) return;
    const faction = this.state.factionRegistry.get(factionId);
    if (!faction) return;
    if (ability.cost > 0) faction.spendIPCs(ability.cost);
    const result = applyFactionAbility(abilityId, factionId, this.state, targetId);
    this.abilityManager.markUsed(factionId, this.state.turnNumber);
    this.showToast(`${ability.name}: ${result}`, 'success');
    this.updateFactionAbilityButton(factionId);
    this.updateFactionPanel();
    this.renderer.render();
  }

  /** Wire up the objectives callback - call once after initialization. */
  setupObjectiveCallbacks(): void {
    this.objectiveSystem.onChange((obj: Objective, event: 'new' | 'complete' | 'fail') => {
      if (event === 'new') {
        this.showToast(`New objective: ${obj.title} - ${obj.description}`, 'info');
      } else if (event === 'complete') {
        const rewardStr = obj.reward.type === 'ipc' ? `+${obj.reward.amount} IPC`
          : `+${obj.reward.amount} ${obj.reward.unitTypeId ?? 'research'}`;
        this.showToast(`Objective complete: ${obj.title}! Reward: ${rewardStr}`, 'success');
        visualEffects.confetti(window.innerWidth / 2, window.innerHeight * 0.4, 25);
      } else {
        this.showToast(`Objective failed: ${obj.title}`, 'error');
      }
      this.updateObjectivesPanel();
    });

    this.tensionSystem.onChange((_tension, _level) => {
      this.updateTensionBar();
    });
  }

}

