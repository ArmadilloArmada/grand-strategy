/**
 * Grand Strategy - Main Entry Point
 * A modern grand strategy wargame
 */

import { GameState } from './engine/GameState';
import { TurnManager } from './engine/TurnManager';
import { AIController } from './engine/AIController';
import { MapRenderer } from './renderer/MapRenderer';
import { DataLoader } from './loaders/DataLoader';
import { HUD } from './ui/HUD';
import { SaveManager } from './ui/SaveManager';
import { settings } from './ui/Settings';
import { soundManager } from './audio/SoundManager';
import { MultiplayerUI } from './network/MultiplayerUI';

// New feature imports
import { achievementManager } from './engine/AchievementManager';
import { campaignManager, CampaignMission } from './engine/CampaignManager';
import { tutorialManager } from './engine/TutorialManager';
import { replayManager } from './engine/ReplayManager';
import { steamManager } from './engine/SteamManager';
import { achievementsUI } from './ui/AchievementsUI';
import { campaignUI } from './ui/CampaignUI';
import { EventsSystem, GameEvent as StrategicEvent } from './engine/EventsSystem';
import { MoraleSystem } from './engine/MoraleSystem';
import { EspionageSystem } from './engine/EspionageSystem';
import { NuclearSystem } from './engine/NuclearSystem';
import { getStartingCommander } from './data/commanders';
import { networkManager, GameAction } from './network/NetworkManager';
import { DebugPanel } from './ui/DebugPanel';
import { ReplayUI } from './ui/ReplayUI';

// Export managers for external access
export { campaignManager, replayManager };

// Import game data - Full world map with 4 factions
import unitsData from '../assets/units/full-units.json';
import wwiUnitsData from '../assets/units/wwi-units.json';
import wwiiUnitsData from '../assets/units/wwii-units.json';
import coldwarUnitsData from '../assets/units/coldwar-units.json';
import modernUnitsData from '../assets/units/modern-units.json';
import factionsData from '../assets/factions/world-factions.json';

// Unit era registry
const UNIT_ERAS: Record<string, { name: string; description: string; data: any }> = {
  'wwi': { name: 'World War I (1914)', description: 'Slow trench warfare. Limited mobility.', data: wwiUnitsData },
  'wwii': { name: 'World War II (1942)', description: 'Classic combined arms. Balanced gameplay.', data: wwiiUnitsData },
  'coldwar': { name: 'Cold War (1970)', description: 'Faster units. Jet age warfare.', data: coldwarUnitsData },
  'modern': { name: 'Modern (2020)', description: 'High-tech, fast, and expensive.', data: modernUnitsData },
};
import _gridMapData from '../assets/maps/grid-world-map.json';
import _tutorialMapData from '../assets/maps/tutorial-map.json';
import _gridEuropeData from '../assets/maps/grid-europe.json';
import _gridPacificData from '../assets/maps/grid-pacific.json';
import _gridAmericasData from '../assets/maps/grid-americas.json';
import _gridAfricaData from '../assets/maps/grid-africa.json';
import _gridEasternFrontData from '../assets/maps/grid-eastern-front.json';
import _gridSkirmishData from '../assets/maps/grid-skirmish.json';
import { registerMap, getMapById } from './data/mapRegistry';
import type { MapData } from './loaders/MapLoader';
const gridMapData = _gridMapData as unknown as MapData;
const tutorialMapData = _tutorialMapData as unknown as MapData;
const gridEuropeData = _gridEuropeData as unknown as MapData;
const gridPacificData = _gridPacificData as unknown as MapData;
const gridAmericasData = _gridAmericasData as unknown as MapData;
const gridAfricaData = _gridAfricaData as unknown as MapData;
const gridEasternFrontData = _gridEasternFrontData as unknown as MapData;
const gridSkirmishData = _gridSkirmishData as unknown as MapData;

/**
 * Main Game class - orchestrates all systems
 */
class Game {
  private state: GameState;
  private turnManager: TurnManager;
  private renderer!: MapRenderer;
  private hud!: HUD;
  private aiController: AIController;
  private dataLoader: DataLoader;
  private saveManager: SaveManager;
  private multiplayerUI: MultiplayerUI;
  private eventsSystem: EventsSystem;
  private moraleSystem: MoraleSystem;
  private espionageSystem: EspionageSystem;
  private nuclearSystem: NuclearSystem;

  private isGameStarted: boolean = false;
  private saveLoadMode: 'save' | 'load' = 'save';
  private replayUI: ReplayUI = new ReplayUI();
  // Campaign state
  private activeCampaignId: string | null = null;
  private activeMission: CampaignMission | null = null;
  private lastGameWinnerFaction: string | null = null;
  // Cleanup handles for per-game event listeners (prevents leaks on New Game)
  private unsubCampaignListeners: Array<() => void> = [];

  constructor() {
    // Initialize core systems
    this.state = new GameState();
    this.dataLoader = new DataLoader(this.state);
    this.turnManager = new TurnManager(this.state);
    this.aiController = new AIController(this.state, this.turnManager);
    this.saveManager = new SaveManager(this.state);
    this.multiplayerUI = new MultiplayerUI();
    this.eventsSystem = new EventsSystem(this.state);
    this.moraleSystem = new MoraleSystem(this.state);
    this.espionageSystem = new EspionageSystem(this.state);
    this.nuclearSystem = new NuclearSystem(this.state);

    this.state.systems.moraleSystem = this.moraleSystem;
    this.state.systems.espionageSystem = this.espionageSystem;
    this.state.systems.nuclearSystem = this.nuclearSystem;
    this.state.systems.aiController = this.aiController;

    // Apply AI difficulty from settings
    this.aiController.setDifficulty(settings.getSetting('aiDifficulty'));
  }

  /**
   * Initialize the game
   */
  async init(): Promise<void> {
    // Register available maps (grid maps only)
    registerMap('grid', 'World at War (Grid)', gridMapData);
    registerMap('tutorial', 'Tutorial', tutorialMapData);
    registerMap('grid-europe', 'European Theater (Grid)', gridEuropeData);
    registerMap('grid-pacific', 'Pacific Ring (Grid)', gridPacificData);
    registerMap('grid-americas', 'Western Hemisphere (Grid)', gridAmericasData);
    registerMap('grid-africa', 'African Campaign (Grid)', gridAfricaData);
    registerMap('grid-eastern-front', 'Eastern Front (Grid)', gridEasternFrontData);
    registerMap('grid-skirmish', 'Skirmish 2v2 (Grid)', gridSkirmishData);

    // Load game data (default map - grid for easier clicking)
    this.dataLoader.loadBundle({
      units: unitsData as import('./data/Unit').UnitTypeData[],
      factions: factionsData,
      map: gridMapData,
    });

    // Initialize renderer and HUD
    this.renderer = new MapRenderer(this.state, 'game-canvas');
    this.hud = new HUD(this.state, this.turnManager, this.renderer);
    // DebugPanel registers DOM/keyboard listeners and manages its own lifecycle
    new DebugPanel(this.state, this.turnManager);

    this.state.systems.technologyManager = this.hud.technologyManager;

    // Setup fog of war and intel reveal callbacks
    this.renderer.setFogOfWarCallback((id) => this.hud.isTerritoryVisible(id));
    this.renderer.setIntelRevealCallback((id) => this.espionageSystem.isIntelRevealed(id));
    this.renderer.setAdjacentFogCallback((id) => this.hud.isTerritoryAdjacentFog(id));

    // Setup event listeners
    this.state.on('turn_start', () => this.onTurnStart());
    this.state.on('phase_end', () => this.autoSave());
    this.state.on('turn_end', () => this.checkVictory());

    // Multiplayer: apply incoming actions from other players
    networkManager.on('game_action', (raw: any) => this.applyNetworkAction(raw as GameAction));

    // Multiplayer: handle desync detection
    networkManager.on('state_verify', (msg: { checksum: number; turnNumber: number; phase: string }) => {
      const localChecksum = this.state.computeChecksum();
      if (localChecksum !== msg.checksum) {
        console.error(
          `[Desync] Turn ${msg.turnNumber} phase "${msg.phase}": ` +
          `remote=${msg.checksum} local=${localChecksum}`
        );
        this.hud.showToast(
          `⚠️ State desync on turn ${msg.turnNumber}. Reload from host to resync.`,
          'info'
        );
      }
    });

    // Multiplayer: surface connection loss to the player
    networkManager.on('connection_lost', (data: { attempt: number; maxAttempts: number }) => {
      if (this.isGameStarted) {
        this.hud.showToast(
          `🔌 Connection lost — reconnecting (${data.attempt}/${data.maxAttempts})…`,
          'info'
        );
      }
    });
    networkManager.on('connection_failed', () => {
      if (this.isGameStarted) {
        this.hud.showToast('❌ Connection lost. Could not reconnect to server.', 'info');
      }
    });

    // Setup UI event listeners
    this.setupMenuListeners();
    this.setupSettingsListeners();
    this.setupKeyboardShortcuts();
    this.setupCrashHandler();

    // Initialize Steam integration (if available)
    steamManager.initialize();

    // Wire replay playback callbacks (apply actions to game state + restore initial snapshot)
    this.replayUI.setCallbacks(
      (action) => {
        // Apply a single replay action to the live game state
        switch (action.action.type) {
          case 'move': {
            const d = action.action.data as { unitTypeId: string; count: number; fromId: string; toId: string };
            const from = this.state.territories.get(d.fromId);
            const to   = this.state.territories.get(d.toId);
            if (from && to) { from.removeUnits(d.unitTypeId, d.count); to.addUnits(d.unitTypeId, d.count); }
            break;
          }
          case 'combat_result': {
            const d = action.action.data as { attackerLosses: Record<string,number>; defenderLosses: Record<string,number>; captured: boolean; newOwner: string|null; fromId: string; toId: string };
            for (const [uid, cnt] of Object.entries(d.attackerLosses ?? {})) this.state.territories.get(d.fromId)?.removeUnits(uid, cnt);
            for (const [uid, cnt] of Object.entries(d.defenderLosses ?? {})) this.state.territories.get(d.toId)?.removeUnits(uid, cnt);
            if (d.captured && d.newOwner) { const t = this.state.territories.get(d.toId); if (t) t.owner = d.newOwner; }
            break;
          }
          case 'produce': {
            const d = action.action.data as { unitTypeId: string; count: number; territoryId: string };
            this.state.territories.get(d.territoryId)?.addUnits(d.unitTypeId, d.count);
            break;
          }
          case 'phase_end':
            this.turnManager.advancePhase();
            break;
        }
        this.renderer.render();
        this.hud.updateTurnInfo();
      },
      (json) => {
        // Restore from initial snapshot
        try { this.state.loadFromJSON(json); } catch { /* legacy replay snapshots may be partial */ }
        this.renderer.render();
        this.hud.updateTurnInfo();
      }
    );

    // Start background music on menu
    soundManager.playMusic('menu');

    // Link achievements to Steam
    achievementManager.onUnlock((achievement) => {
      steamManager.unlockAchievement(achievement.id);
    });

    // Wire replay recording events (recordAction is a no-op when not recording)
    this.state.on('combat_end', (e: any) => {
      const data = e.data as { attackingFactionId: string };
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, data.attackingFactionId ?? '', 'combat_result', e.data);
    });
    this.state.on('units_produced', (e: any) => {
      const data = e.data as { factionId: string };
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, data.factionId ?? '', 'produce', e.data);
    });
    this.state.on('phase_end', () => {
      const faction = this.state.getCurrentFaction();
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, faction?.id ?? '', 'phase_end', { phase: this.state.currentPhase });
    });

    // If the map editor stored a preview map, auto-start with it
    const previewRaw = localStorage.getItem('editor_preview_map');
    if (previewRaw) {
      try {
        const previewMap = JSON.parse(previewRaw);
        localStorage.removeItem('editor_preview_map');
        registerMap('custom', previewMap.name || 'Custom Map', previewMap);
        this.hud.gameConfig = {
          ...this.hud.gameConfig,
          mapId: 'custom',
          mode: 'vs-ai',
          humanFactions: ['atlantic_alliance'],
        };
        this.startNewGame();
      } catch (e) {
        console.warn('Failed to load editor preview map:', e);
        this.showMainMenu();
      }
    } else {
      // Show main menu
      this.showMainMenu();
    }

    console.log('✓ Game initialized!');
  }

  /**
   * Quick start a new game with preset settings
   */
  quickStart(turnStyle: 'classic' | 'quick'): void {
    // Set up default config
    this.hud.gameConfig = {
      ...this.hud.gameConfig,
      mode: 'vs-ai',
      humanFactions: ['atlantic_alliance'],
      turnStyle: turnStyle,
      victoryType: 'capitals',
      turnLimit: 50,
      fogOfWar: true,
      autoSave: true,
    };

    this.startNewGame();
  }

  /**
   * Start a new game
   */
  startNewGame(): void {
    const mapId = this.hud.gameConfig.mapId ?? 'grid';
    const mapToLoad = getMapById(mapId) ?? gridMapData;
    
    // Get units for selected era
    const unitEra = this.hud.gameConfig.unitEra ?? 'wwii';
    const eraUnits = UNIT_ERAS[unitEra]?.data ?? wwiiUnitsData;
    // Reset game state by reloading data
    this.dataLoader.loadBundle({
      units: eraUnits as import('./data/Unit').UnitTypeData[],
      factions: factionsData,
      map: mapToLoad,
    });

    // Set faction AI control based on game config (from HUD setup modal)
    const factions = this.state.factionRegistry.getInTurnOrder();
    const humanFactions = this.hud.gameConfig.humanFactions;
    
    for (const faction of factions) {
      // Check if this faction should be human controlled
      faction.controlledBy = humanFactions.includes(faction.id) ? 'human' : 'ai';
    }

    // Apply current difficulty and personality
    this.aiController.setDifficulty(settings.getSetting('aiDifficulty'));
    this.aiController.setPersonality((settings.getSetting('aiPersonality') ?? 'default') as any);

    // Set turn style from config
    this.turnManager.setTurnStyle(this.hud.gameConfig.turnStyle);

    // Fit map to screen
    this.renderer.fitToScreen();

    // Start the game
    this.turnManager.startGame();

    // Start replay recording
    const recordFactions = this.state.factionRegistry.getAll().map(f => f.id);
    replayManager.startRecording(JSON.stringify({ mapId, turn: 0 }), mapId, recordFactions);

    // Set Steam Rich Presence
    const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
    steamManager.setRichPresence('In Battle', {
      map: mapId,
      faction: humanFaction?.name ?? 'Commander',
    });

    this.hud.updateTurnInfo();

    // Assign starting commanders to each faction's capital territory
    for (const faction of this.state.factionRegistry.getAll()) {
      const commander = getStartingCommander(faction.id);
      if (!commander) continue;
      // Find this faction's capital territory
      const capital = Array.from(this.state.territories.values()).find(
        t => t.owner === faction.id && t.isCapital
      );
      if (capital && capital.units.length > 0) {
        // Attach to first land unit stack
        const landUnit = capital.units.find(u => {
          const unitType = this.state.unitRegistry.get(u.unitTypeId);
          return unitType?.domain === 'land';
        });
        if (landUnit) {
          (landUnit as any).commander = commander;
        }
      }
    }

    // Expose game state globally for modal onclick handlers
    (window as any).__gameState = this.state;

    this.isGameStarted = true;

    // Clean up any previous per-game listeners before adding new ones
    for (const unsub of this.unsubCampaignListeners) unsub();
    this.unsubCampaignListeners = [];

    // Wire campaign tracking events if in campaign mode
    if (this.activeCampaignId) {
      this.unsubCampaignListeners.push(
        this.state.on('combat_end', (e) => {
          if (!this.activeCampaignId) return;
          const combat = (e.data as any)?.combat;
          if (!combat) return;
          const humanFaction = this.hud.gameConfig.humanFactions?.[0];
          if (combat.attackingFactionId === humanFaction) {
            const defenderLosses = (combat.defenders as Array<{ casualties: number }>)
              ?.reduce((sum: number, d: { casualties: number }) => sum + (d.casualties ?? 0), 0) ?? 0;
            if (defenderLosses > 0) campaignManager.trackUnitsDestroyed(defenderLosses);
            if (combat.captured) campaignManager.trackCapture(combat.territoryId);
          }
        }),
        this.state.on('territory_mobilized', (e) => {
          if (!this.activeCampaignId) return;
          const data = e.data as any;
          const humanFaction = this.hud.gameConfig.humanFactions?.[0];
          if (data?.factionId === humanFaction && data?.count) {
            campaignManager.trackUnitsProduced(data.count as number);
          }
        })
      );
    }

    // Hide main menu
    this.hideMainMenu();

    // Show tutorial for new players
    const tutorialSeen = localStorage.getItem('tutorial-seen') === 'true';
    if (!tutorialSeen) {
      this.hud.showTutorial();
    }

  }

  /**
   * Continue last game (auto save)
   */
  continueGame(): boolean {
    if (!this.saveManager.hasAutoSave()) {
      this.hud.showToast('No saved game found', 'info');
      return false;
    }

    if (this.saveManager.loadAutoSave()) {
      this.renderer.fitToScreen();
      this.renderer.render();
      this.hud.updateTurnInfo();
      this.isGameStarted = true;
      this.hideMainMenu();
      this.hud.showToast('Game loaded!', 'success');
      return true;
    }

    return false;
  }

  /**
   * Show main menu
   */
  showMainMenu(): void {
    steamManager.clearRichPresence();
    const modal = document.getElementById('main-menu-modal');
    if (modal) modal.classList.remove('hidden');

    // Update continue button state
    const continueBtn = document.getElementById('btn-continue-game') as HTMLButtonElement;
    if (continueBtn) {
      continueBtn.disabled = !this.saveManager.hasAutoSave();
    }
  }

  /**
   * Hide main menu
   */
  hideMainMenu(): void {
    const modal = document.getElementById('main-menu-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Show save confirmation modal when leaving a game
   */
  private showSaveConfirmModal(onSave: () => void, onDiscard: () => void, onCancel: () => void): void {
    // Remove existing modal if any
    const existing = document.getElementById('save-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'save-confirm-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="text-align: center; max-width: 400px;">
        <h2>💾 Save Current Game?</h2>
        <p style="margin: 1rem 0; color: #aaa;">
          You have a game in progress. Would you like to save before starting a new game?
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.5rem;">
          <button id="btn-save-and-continue" class="primary" style="padding: 0.8rem;">
            💾 Save and Continue
          </button>
          <button id="btn-discard-game" style="padding: 0.8rem; background: #dc2626;">
            🗑️ Don't Save
          </button>
          <button id="btn-cancel-leave" style="padding: 0.8rem;">
            ↩️ Cancel
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-save-and-continue')?.addEventListener('click', () => {
      modal.remove();
      this.saveManager.quickSave();
      this.hud.showToast('Game saved!', 'success');
      onSave();
    });

    document.getElementById('btn-discard-game')?.addEventListener('click', () => {
      modal.remove();
      onDiscard();
    });

    document.getElementById('btn-cancel-leave')?.addEventListener('click', () => {
      modal.remove();
      onCancel();
    });
  }

  /**
   * Confirm leaving the current game - shows save dialog if game is in progress
   * @param callback - Function to call after confirmation (starts new game mode)
   */
  private confirmLeaveGame(callback: () => void): void {
    if (!this.isGameStarted) {
      // No game in progress, just proceed
      callback();
      return;
    }

    // Game in progress - show save confirmation
    this.showSaveConfirmModal(
      () => {
        // Save and continue
        this.isGameStarted = false;
        callback();
      },
      () => {
        // Discard and continue
        this.isGameStarted = false;
        callback();
      },
      () => {
        // Cancel - do nothing
      }
    );
  }

  /**
   * Show in-game menu
   */
  showGameMenu(): void {
    const modal = document.getElementById('game-menu-modal');
    if (modal) modal.classList.remove('hidden');
  }

  /**
   * Hide in-game menu
   */
  hideGameMenu(): void {
    const modal = document.getElementById('game-menu-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Show save/load modal
   */
  showSaveLoadModal(mode: 'save' | 'load'): void {
    this.saveLoadMode = mode;
    
    const modal = document.getElementById('save-load-modal');
    const title = document.getElementById('save-load-title');
    
    if (modal) modal.classList.remove('hidden');
    if (title) title.textContent = mode === 'save' ? '💾 Save Game' : '📂 Load Game';

    this.renderSaveSlots();
  }

  /**
   * Hide save/load modal
   */
  hideSaveLoadModal(): void {
    const modal = document.getElementById('save-load-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Show multiplayer modal
   */
  showMultiplayer(): void {
    const modal = document.getElementById('multiplayer-modal');
    if (modal) modal.classList.remove('hidden');
    
    const content = document.getElementById('multiplayer-content');
    if (content) {
      this.multiplayerUI.show(content);
    }
  }

  /**
   * Hide multiplayer modal
   */
  hideMultiplayer(): void {
    const modal = document.getElementById('multiplayer-modal');
    if (modal) modal.classList.add('hidden');
    this.multiplayerUI.hide();
  }

  /**
   * Show campaign modal
   */
  showCampaign(): void {
    const modal = document.getElementById('campaign-modal');
    if (modal) modal.classList.remove('hidden');
    
    const content = document.getElementById('campaign-content');
    if (content) {
      campaignUI.show(content);
      campaignUI.onStart((mission, campaignId) => {
        // Show mission briefing overlay before launching
        campaignUI.showBriefing(
          mission,
          campaignId,
          () => {
            // Player clicked "Launch Mission"
            this.hideCampaign();
            this.hideMainMenu();

            const missionMap = getMapById(mission.mapId);
            if (!missionMap) {
              this.hud.showToast(`Map not found: ${mission.mapId}`, 'info');
              return;
            }

            // Store active campaign state
            this.activeCampaignId = campaignId;
            this.activeMission = mission;
            this.lastGameWinnerFaction = null;
            campaignManager.activeCampaignId = campaignId;
            campaignManager.activeMissionId = mission.id;
            campaignManager.resetCounters();

            // Ensure progress entry exists
            campaignManager.startCampaign(campaignId);

            this.hud.gameConfig = {
              ...this.hud.gameConfig,
              mapId: mission.mapId,
              mode: 'vs-ai',
              humanFactions: [mission.faction],
              turnStyle: 'classic',
              victoryType: 'capitals',
              turnLimit: 50,
              fogOfWar: true,
              autoSave: true,
            };

            this.startNewGame();
          },
          () => {
            // Player clicked "Back" — briefing closes, campaign list remains visible
          }
        );
      });
    }
  }

  /**
   * Hide campaign modal
   */
  hideCampaign(): void {
    const modal = document.getElementById('campaign-modal');
    if (modal) modal.classList.add('hidden');
    campaignUI.hide();
  }

  /**
   * Show campaign debriefing after a mission ends (win or loss)
   */
  private showCampaignDebriefing(): void {
    const campaignId = this.activeCampaignId;
    const mission = this.activeMission;
    if (!campaignId || !mission) {
      this.showMainMenu();
      return;
    }

    const humanFaction = this.hud.gameConfig.humanFactions?.[0] ?? '';
    const won = this.lastGameWinnerFaction === humanFaction;

    let appliedRewards: string[] = [];
    let nextMission: CampaignMission | null = null;

    if (won) {
      // Collect bonus objectives completed during the mission
      const bonusCompleted = campaignManager.checkBonusObjectives(
        mission,
        {
          turnNumber: this.state.turnNumber,
          territoriesOwnedBy: (fid) =>
            Array.from(this.state.territories.values())
              .filter(t => t.owner === fid)
              .map(t => ({ id: t.id, name: t.name })),
          totalUnitsKilled: 0,
          totalUnitsProduced: 0,
        },
        humanFaction
      );

      // Apply rewards and get next mission
      appliedRewards = campaignManager.applyRewards(
        mission.rewards,
        (amount) => {
          const faction = this.state.factionRegistry.get(humanFaction);
          if (faction) faction.ipcs += amount;
        },
        (_techId) => {
          // Tech rewards are informational only — actual tech application on next mission load
        }
      );

      nextMission = campaignManager.completeMission(campaignId, bonusCompleted);
    }

    // Clear active campaign state
    this.activeCampaignId = null;
    this.activeMission = null;
    campaignManager.activeCampaignId = null;
    campaignManager.activeMissionId = null;

    campaignUI.showDebriefing(
      mission,
      won,
      appliedRewards,
      nextMission,
      () => {
        // "Next Mission" — show campaign screen so player can launch next
        this.showMainMenu();
        this.showCampaign();
      },
      () => {
        // "Return to Campaign" — go back to main menu with campaign modal
        this.showMainMenu();
        this.showCampaign();
      }
    );
  }

  /**
   * Show achievements modal
   */
  showAchievements(): void {
    const modal = document.getElementById('achievements-modal');
    if (modal) modal.classList.remove('hidden');
    
    const content = document.getElementById('achievements-content');
    if (content) {
      achievementsUI.show(content);
    }
  }

  /**
   * Hide achievements modal
   */
  hideAchievements(): void {
    const modal = document.getElementById('achievements-modal');
    if (modal) modal.classList.add('hidden');
    achievementsUI.hide();
  }

  /**
   * Show interactive tutorial selection
   */
  showInteractiveTutorial(): void {
    const modal = document.getElementById('interactive-tutorial-modal');
    if (modal) modal.classList.remove('hidden');
    
    const list = document.getElementById('tutorial-list');
    if (list) {
      const tutorials = tutorialManager.getTutorials();
      list.innerHTML = tutorials.map(t => `
        <button class="tutorial-item" data-id="${t.id}" style="
          width: 100%;
          text-align: left;
          padding: 1rem;
          background: ${tutorialManager.isCompleted(t.id) ? 'linear-gradient(135deg, #2a5d3e 0%, #1a4d2e 100%)' : '#1a1a1a'};
          border: 1px solid ${tutorialManager.isCompleted(t.id) ? '#4a6a4a' : '#333'};
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div>
            <strong style="color: #c9a227;">${t.name}</strong>
            <div style="color: #888; font-size: 0.85em; margin-top: 4px;">${t.description}</div>
          </div>
          ${tutorialManager.isCompleted(t.id) ? '<span style="color: #4CAF50;">✓</span>' : ''}
        </button>
      `).join('');
      
      // Add click handlers
      list.querySelectorAll('.tutorial-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (id) {
            this.hideInteractiveTutorial();
            tutorialManager.start(id);
          }
        });
      });
    }
  }

  /**
   * Hide interactive tutorial selection
   */
  hideInteractiveTutorial(): void {
    const modal = document.getElementById('interactive-tutorial-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Render save slots
   */
  renderSaveSlots(): void {
    const container = document.getElementById('save-slots');
    if (!container) return;

    const slots = this.saveManager.getSlots();
    let html = '';

    for (const slot of slots) {
      const isEmpty = slot.isEmpty;
      const factionName = slot.currentFaction 
        ? this.state.factionRegistry.get(slot.currentFaction)?.name || slot.currentFaction
        : '';

      html += `
        <div class="save-slot ${isEmpty ? 'empty' : ''}" data-slot="${slot.id}">
          <div class="save-slot-info">
            <div class="save-slot-name">${isEmpty ? `Empty Slot ${slot.id}` : slot.name}</div>
            <div class="save-slot-details">
              ${isEmpty 
                ? 'No save data' 
                : `Turn ${slot.turnNumber} • ${factionName} • ${this.saveManager.formatTimestamp(slot.timestamp)}`
              }
            </div>
          </div>
          <div class="save-slot-actions">
            ${this.saveLoadMode === 'save' 
              ? `<button class="btn-slot-save primary" data-slot="${slot.id}">Save</button>`
              : isEmpty 
                ? '' 
                : `<button class="btn-slot-load primary" data-slot="${slot.id}">Load</button>`
            }
            ${!isEmpty ? `<button class="btn-slot-delete danger" data-slot="${slot.id}">🗑️</button>` : ''}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // Add event listeners
    container.querySelectorAll('.btn-slot-save').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = parseInt((btn as HTMLElement).dataset.slot || '1');
        const slot = this.saveManager.getSlots().find(s => s.id === slotId);
        if (!slot?.isEmpty && !confirm('Overwrite existing save?')) return;
        this.saveManager.saveToSlot(slotId);
        this.hud.showToast('Game saved!', 'success');
        this.renderSaveSlots();
      });
    });

    container.querySelectorAll('.btn-slot-load').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = parseInt((btn as HTMLElement).dataset.slot || '1');
        if (this.saveManager.loadFromSlot(slotId)) {
          this.renderer.fitToScreen();
          this.renderer.render();
          this.hud.updateTurnInfo();
          this.isGameStarted = true;
          this.hideSaveLoadModal();
          this.hideGameMenu();
          this.hideMainMenu();
          this.hud.showToast('Game loaded!', 'success');
        }
      });
    });

    container.querySelectorAll('.btn-slot-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = parseInt((btn as HTMLElement).dataset.slot || '1');
        if (confirm('Delete this save?')) {
          this.saveManager.deleteSlot(slotId);
          this.renderSaveSlots();
          this.hud.showToast('Save deleted', 'info');
        }
      });
    });
  }

  /**
   * Show settings modal
   */
  showSettings(): void {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.remove('hidden');

    // Load current settings into UI
    const s = settings.get();
    (document.getElementById('setting-game-speed') as HTMLSelectElement).value = s.gameSpeed;
    (document.getElementById('setting-ai-difficulty') as HTMLSelectElement).value = s.aiDifficulty;
    (document.getElementById('setting-ai-personality') as HTMLSelectElement).value = s.aiPersonality ?? 'default';
    (document.getElementById('setting-move-highlights') as HTMLInputElement).checked = s.showMoveHighlights;
    (document.getElementById('setting-confirm-end') as HTMLInputElement).checked = s.confirmEndTurn;
    (document.getElementById('setting-music-enabled') as HTMLInputElement).checked = s.musicEnabled;
    (document.getElementById('setting-sfx-enabled') as HTMLInputElement).checked = s.sfxEnabled;
    (document.getElementById('setting-master-volume') as HTMLInputElement).value = s.masterVolume.toString();
    (document.getElementById('setting-animations') as HTMLInputElement).checked = s.animationsEnabled;
    (document.getElementById('setting-territory-names') as HTMLInputElement).checked = s.showTerritoryNames;
  }

  /**
   * Hide settings modal
   */
  hideSettings(): void {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Save settings from UI
   */
  saveSettings(): void {
    settings.update({
      gameSpeed: (document.getElementById('setting-game-speed') as HTMLSelectElement).value as any,
      aiDifficulty: (document.getElementById('setting-ai-difficulty') as HTMLSelectElement).value as any,
      aiPersonality: (document.getElementById('setting-ai-personality') as HTMLSelectElement).value as any,
      showMoveHighlights: (document.getElementById('setting-move-highlights') as HTMLInputElement).checked,
      confirmEndTurn: (document.getElementById('setting-confirm-end') as HTMLInputElement).checked,
      musicEnabled: (document.getElementById('setting-music-enabled') as HTMLInputElement).checked,
      sfxEnabled: (document.getElementById('setting-sfx-enabled') as HTMLInputElement).checked,
      masterVolume: parseInt((document.getElementById('setting-master-volume') as HTMLInputElement).value),
      animationsEnabled: (document.getElementById('setting-animations') as HTMLInputElement).checked,
      showTerritoryNames: (document.getElementById('setting-territory-names') as HTMLInputElement).checked,
    });

    // Apply AI difficulty and personality
    this.aiController.setDifficulty(settings.getSetting('aiDifficulty'));
    this.aiController.setPersonality((settings.getSetting('aiPersonality') ?? 'default') as any);

    this.hideSettings();
    this.hud.showToast('Settings saved!', 'success');
  }

  /**
   * Setup menu button listeners
   */
  private setupMenuListeners(): void {
    // Quick Start - Classic Mode
    document.getElementById('btn-quick-classic')?.addEventListener('click', () => {
      this.confirmLeaveGame(() => {
        this.quickStart('classic');
      });
    });

    // Quick Start - Simple Mode
    document.getElementById('btn-quick-simple')?.addEventListener('click', () => {
      this.confirmLeaveGame(() => {
        this.quickStart('quick');
      });
    });

    // Custom Game Setup
    document.getElementById('btn-new-game')?.addEventListener('click', () => {
      this.confirmLeaveGame(() => {
        this.hideMainMenu();
        this.hud.showNewGameModal();
      });
    });

    // Listen for game started event from HUD
    this.hud.events.on('gameStarted', () => {
      this.startNewGame();
    });

    // Track victory winner for campaign debriefing
    this.state.on('victory', (e) => {
      const data = e.data as { winner: string };
      this.lastGameWinnerFaction = data.winner;
    });

    // Victory/defeat screen: return to main menu (or show campaign debriefing)
    this.hud.events.on('showMainMenu', () => {
      replayManager.stopRecording();
      this.isGameStarted = false;

      if (this.activeCampaignId && this.activeMission) {
        this.showCampaignDebriefing();
      } else {
        this.showMainMenu();
      }
    });

    // Listen for auto-save event
    this.hud.events.on('autoSave', () => {
      this.saveManager.quickSave();
    });

    // HUD keyboard shortcut events
    this.hud.events.on('quickSave', () => {
      if (this.isGameStarted) this.saveManager.quickSave();
    });
    this.hud.events.on('quickLoad', () => {
      if (this.saveManager.quickLoad()) {
        this.renderer.render();
        this.hud.updateTurnInfo();
      }
    });

    document.getElementById('btn-continue-game')?.addEventListener('click', () => {
      this.confirmLeaveGame(() => {
        this.continueGame();
      });
    });

    document.getElementById('btn-load-game')?.addEventListener('click', () => {
      this.confirmLeaveGame(() => {
        this.showSaveLoadModal('load');
      });
    });

    document.getElementById('btn-multiplayer')?.addEventListener('click', () => {
      this.showMultiplayer();
    });

    document.getElementById('btn-close-multiplayer')?.addEventListener('click', () => {
      this.hideMultiplayer();
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.showSettings();
    });

    // Campaign mode
    document.getElementById('btn-campaign')?.addEventListener('click', () => {
      this.confirmLeaveGame(() => {
        this.showCampaign();
      });
    });

    document.getElementById('btn-close-campaign')?.addEventListener('click', () => {
      this.hideCampaign();
    });

    // Achievements
    document.getElementById('btn-achievements')?.addEventListener('click', () => {
      this.showAchievements();
    });

    document.getElementById('btn-close-achievements')?.addEventListener('click', () => {
      this.hideAchievements();
    });

    // Replays
    document.getElementById('btn-replays')?.addEventListener('click', () => {
      const modal = document.getElementById('replays-modal');
      const content = document.getElementById('replays-content');
      if (modal) modal.classList.remove('hidden');
      if (content) this.replayUI.showBrowser(content);
    });
    document.getElementById('btn-close-replays')?.addEventListener('click', () => {
      document.getElementById('replays-modal')?.classList.add('hidden');
      this.replayUI.hideBrowser();
    });

    // Interactive tutorial
    document.getElementById('btn-tutorial')?.addEventListener('click', () => {
      this.confirmLeaveGame(() => {
        this.showInteractiveTutorial();
      });
    });

    document.getElementById('btn-close-interactive-tutorial')?.addEventListener('click', () => {
      this.hideInteractiveTutorial();
    });

    // In-game menu button
    document.getElementById('btn-menu')?.addEventListener('click', () => {
      this.showGameMenu();
    });

    // Game menu buttons
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.hideGameMenu();
    });

    document.getElementById('btn-save-game')?.addEventListener('click', () => {
      this.showSaveLoadModal('save');
    });

    document.getElementById('btn-load-game-ingame')?.addEventListener('click', () => {
      this.showSaveLoadModal('load');
    });

    document.getElementById('btn-settings-ingame')?.addEventListener('click', () => {
      this.showSettings();
    });

    document.getElementById('btn-how-to-play')?.addEventListener('click', () => {
      this.hideGameMenu();
      this.hud.showTutorial();
    });

    document.getElementById('btn-main-menu')?.addEventListener('click', () => {
      if (confirm('Return to main menu? Unsaved progress will be lost.')) {
        this.hideGameMenu();
        this.isGameStarted = false;
        this.showMainMenu();
      }
    });

    // Save/load modal
    document.getElementById('btn-close-save-load')?.addEventListener('click', () => {
      this.hideSaveLoadModal();
    });
  }

  /**
   * Setup settings listeners
   */
  private setupSettingsListeners(): void {
    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
      if (confirm('Reset all settings to default?')) {
        settings.reset();
        this.showSettings(); // Refresh UI
        this.hud.showToast('Settings reset', 'info');
      }
    });
  }

  /**
   * Setup keyboard shortcuts
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Escape - clear selection, or close modal, or open/close menu
      if (e.key === 'Escape') {
        if (this.isGameStarted) {
          const gameMenu = document.getElementById('game-menu-modal');
          const anyModal = document.querySelector('.modal:not(.hidden)');
          if (anyModal && anyModal !== gameMenu) {
            (anyModal as HTMLElement).classList.add('hidden');
          } else if (this.state.selectedTerritoryId) {
            this.state.selectTerritory(null);
            this.renderer.render();
            this.hud.updateSelectionInfo();
          } else if (gameMenu?.classList.contains('hidden')) {
            this.showGameMenu();
          } else {
            this.hideGameMenu();
          }
        }
      }

      // Ctrl+S - Quick save
      if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        if (this.isGameStarted) {
          this.saveManager.quickSave();
          this.hud.showToast('Quick saved!', 'success');
        }
      }

      // Ctrl+L - Quick load
      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        if (this.saveManager.quickLoad()) {
          this.renderer.render();
          this.hud.updateTurnInfo();
          this.hud.showToast('Quick loaded!', 'success');
        }
      }

      // Enter or Space - End phase
      if ((e.key === 'Enter' || e.key === ' ') && this.isGameStarted) {
        const faction = this.state.getCurrentFaction();
        if (faction?.controlledBy === 'human') {
          e.preventDefault();
          document.getElementById('btn-end-phase')?.click();
        }
      }

      // B - Open build menu (during purchase phase)
      if (e.key === 'b' && this.isGameStarted) {
        if (this.state.currentPhase === 'purchase') {
          e.preventDefault();
          document.getElementById('btn-build')?.click();
        }
      }

      // P - Production placement (during production phase)
      if (e.key === 'p' && this.isGameStarted) {
        if (this.state.currentPhase === 'production') {
          e.preventDefault();
          document.getElementById('btn-build')?.click();
        }
      }

      // A - Attack (during combat phase)
      if (e.key === 'a' && this.isGameStarted) {
        if (this.state.currentPhase === 'combat') {
          document.getElementById('btn-attack')?.click();
        }
      }

      // H - Help/Tutorial
      if (e.key === 'h' && this.isGameStarted) {
        document.getElementById('help-button')?.click();
      }

      // F - Fit map to screen
      if (e.key === 'f' && this.isGameStarted) {
        this.renderer.fitToScreen();
        this.hud.showToast('Map centered', 'info');
      }

      // C - Center on capital
      if (e.key === 'c' && this.isGameStarted) {
        const faction = this.state.getCurrentFaction();
        if (faction) {
          this.renderer.centerOnTerritory(faction.capital);
          this.hud.showToast('Centered on capital', 'info');
        }
      }

      // Tab / Shift+Tab - Next/previous territory
      if (e.key === 'Tab' && this.isGameStarted) {
        e.preventDefault();
        this.hud.cycleSelectedTerritory(e.shiftKey ? -1 : 1);
      }

      // O - Toggle map overlay (range / threat)
      if (e.key === 'o' && this.isGameStarted) {
        e.preventDefault();
        this.hud.cycleOverlay();
      }

      // ? - Keyboard shortcut cheat-sheet
      if (e.key === '?' && this.isGameStarted) {
        e.preventDefault();
        this.hud.toggleShortcutSheet();
      }

    });
  }

  /**
   * Handle turn start - check for AI
   */
  private async onTurnStart(): Promise<void> {
    const faction = this.state.getCurrentFaction();
    const turnStyle = this.hud.gameConfig.turnStyle;
    
    if (!faction) return;
    
    // Clean up expired event effects
    this.eventsSystem.cleanupExpiredEffects();
    
    // Human player's turn - just update UI and wait for input
    if (faction.controlledBy === 'human') {
      soundManager.play('your_turn');
      steamManager.setRichPresence('Playing', {
        turn: this.state.turnNumber.toString(),
        faction: faction.name,
      });
      
      // Roll for random strategic event (human players only)
      const event = this.eventsSystem.rollForEvent(faction.id);
      if (event) {
        await this.showStrategicEvent(event, faction.id);
      }
      
      // Low IPC warning in vs-ai when it's purchase phase
      if (this.hud.gameConfig.mode === 'vs-ai' && faction.ipcs < 10 && this.state.currentPhase === 'purchase') {
        soundManager.play('low_ipc');
      }
      
      // Hot seat mode - show banner
      if (this.hud.gameConfig.mode === 'hotseat') {
        await this.hud.showHotSeatBanner(faction.name, faction.color);
      }
      
      // Update UI for human
      this.hud.updateTurnInfo();
      this.hud.updatePhaseInfo();
      this.renderer.render();
      return; // STOP - wait for human input
    }
    
    // AI turn - execute automatically
    // Roll for AI strategic event (apply automatically)
    const aiEvent = this.eventsSystem.rollForEvent(faction.id);
    if (aiEvent && aiEvent.type !== 'choice') {
      this.eventsSystem.applyEvent(aiEvent, faction.id);
      this.hud.showToast(`${faction.name}: ${aiEvent.name}`, 'info');
    } else if (aiEvent && aiEvent.type === 'choice' && aiEvent.choices) {
      // AI picks first non-costly option or the cheapest one
      const affordableChoice = aiEvent.choices.find(c => !c.cost || c.cost <= faction.ipcs) || aiEvent.choices[0];
      this.eventsSystem.applyEvent(aiEvent, faction.id, affordableChoice.id);
    }
    
    // Show AI indicator
    this.hud.showToast(`${faction.name} is playing...`, 'info');
    
    // Wait so player can see
    await new Promise(resolve => setTimeout(resolve, settings.getAIDelay()));
    
    // Execute AI's full turn (all phases)
    await this.aiController.executeTurn();
    this.renderer.render();
    this.hud.renderMinimap();
    
    // Spectator mode - pause to let player review AI moves
    if (turnStyle === 'spectator') {
      await this.hud.showSpectatorContinue(faction.name, faction.color);
    }
    
    // Small delay before next faction
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Show strategic event modal to player
   */
  private async showStrategicEvent(event: StrategicEvent, factionId: string): Promise<void> {
    return new Promise((resolve) => {
      const modal = document.getElementById('event-modal');
      const iconEl = document.getElementById('event-icon');
      const titleEl = document.getElementById('event-title');
      const descEl = document.getElementById('event-description');
      const effectsEl = document.getElementById('event-effects');
      const choicesEl = document.getElementById('event-choices');
      const okContainer = document.getElementById('event-ok-container');
      const okBtn = document.getElementById('btn-event-ok');

      if (!modal || !iconEl || !titleEl || !descEl || !effectsEl || !choicesEl || !okContainer || !okBtn) {
        // If modal doesn't exist, just apply the event
        this.eventsSystem.applyEvent(event, factionId);
        resolve();
        return;
      }

      // Populate modal
      iconEl.textContent = event.icon;
      titleEl.textContent = event.name;
      descEl.textContent = event.description;

      // Color based on event type
      const typeColors = {
        positive: '#22c55e',
        negative: '#ef4444',
        neutral: '#3b82f6',
        choice: '#a855f7'
      };
      titleEl.style.color = typeColors[event.type] || '#fff';

      // Show effects summary
      if (event.type !== 'choice') {
        effectsEl.innerHTML = this.formatEventEffects(event.effects);
        effectsEl.style.display = 'block';
        choicesEl.style.display = 'none';
        okContainer.style.display = 'block';
      } else {
        effectsEl.style.display = 'none';
        choicesEl.style.display = 'flex';
        okContainer.style.display = 'none';

        // Populate choices
        choicesEl.innerHTML = '';
        if (event.choices) {
          for (const choice of event.choices) {
            const btn = document.createElement('button');
            btn.className = 'primary';
            btn.style.padding = '0.8rem';
            btn.style.textAlign = 'left';
            btn.innerHTML = `
              <div style="font-weight: bold;">${choice.text}</div>
              <div style="font-size: 0.8rem; color: #aaa; margin-top: 0.25rem;">
                ${this.formatEventEffects(choice.effects)}
              </div>
            `;
            btn.addEventListener('click', () => {
              this.eventsSystem.applyEvent(event, factionId, choice.id);
              modal.classList.add('hidden');
              soundManager.play('click');
              resolve();
            });
            choicesEl.appendChild(btn);
          }
        }
      }

      // OK button handler
      const handleOk = () => {
        this.eventsSystem.applyEvent(event, factionId);
        modal.classList.add('hidden');
        okBtn.removeEventListener('click', handleOk);
        soundManager.play('click');
        resolve();
      };
      okBtn.addEventListener('click', handleOk);

      // Show modal with animation
      modal.classList.remove('hidden');
      soundManager.play('event');
    });
  }

  /**
   * Format event effects for display
   */
  private formatEventEffects(effects: { type: string; value?: number; unitType?: string; duration?: number }[]): string {
    if (effects.length === 0) return '<span style="color: #666;">No immediate effects</span>';

    return effects.map(e => {
      const sign = (e.value ?? 0) >= 0 ? '+' : '';
      switch (e.type) {
        case 'ipc_bonus': return `<span style="color: #22c55e;">💰 ${sign}${e.value} IPCs</span>`;
        case 'ipc_penalty': return `<span style="color: #ef4444;">💸 -${e.value} IPCs</span>`;
        case 'unit_spawn': return `<span style="color: #22c55e;">🎖️ +${e.value} ${e.unitType || 'units'}</span>`;
        case 'unit_loss': return `<span style="color: #ef4444;">☠️ -${e.value} ${e.unitType || 'units'}</span>`;
        case 'attack_bonus': return `<span style="color: #f59e0b;">⚔️ +${e.value} attack${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
        case 'defense_bonus': return `<span style="color: #3b82f6;">🛡️ +${e.value} defense${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
        case 'movement_bonus': return `<span style="color: #8b5cf6;">🚀 ${sign}${e.value} movement${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
        case 'production_bonus': return `<span style="color: #22c55e;">🏭 +${e.value} production${e.duration ? ` (${e.duration} turns)` : ''}</span>`;
        case 'factory_damage': return `<span style="color: #ef4444;">💥 Factory damaged</span>`;
        case 'morale_boost': return `<span style="color: #22c55e;">✨ Morale boost</span>`;
        case 'intel_reveal': return `<span style="color: #3b82f6;">🕵️ Enemy intel revealed</span>`;
        default: return `<span>${e.type}</span>`;
      }
    }).join('<br>');
  }


  /**
   * Auto save at end of each phase
   */
  /**
   * Apply a game action received from another player via multiplayer
   */
  private applyNetworkAction(action: GameAction): void {
    if (!this.isGameStarted) return;
    switch (action.type) {
      case 'advance_phase':
        this.turnManager.advancePhase();
        break;
      case 'move_units': {
        const from = this.state.territories.get(action.fromId);
        const to   = this.state.territories.get(action.toId);
        if (from && to) {
          from.removeUnits(action.unitTypeId, action.count);
          if (!to.owner && from.owner) to.owner = from.owner;
          to.addUnits(action.unitTypeId, action.count);
        }
        break;
      }
      case 'purchase_units': {
        const t = this.state.territories.get(action.territoryId);
        if (t) t.addUnits(action.unitTypeId, action.count);
        break;
      }
      case 'research_tech': {
        const tm = this.state.systems.technologyManager;
        if (tm?.startResearch) tm.startResearch(action.factionId, action.techId);
        break;
      }
      case 'combat_result': {
        for (const [uid, count] of Object.entries(action.attackerLosses)) {
          this.state.territories.get(action.fromId)?.removeUnits(uid, count);
        }
        for (const [uid, count] of Object.entries(action.defenderLosses)) {
          this.state.territories.get(action.toId)?.removeUnits(uid, count);
        }
        if (action.captured && action.newOwner) {
          const to = this.state.territories.get(action.toId);
          if (to) to.owner = action.newOwner;
        }
        break;
      }
    }
    this.renderer.render();

    // Broadcast checksum so peers can verify state consistency
    if (networkManager.isConnected()) {
      networkManager.sendStateChecksum(
        this.state.computeChecksum(),
        this.state.turnNumber,
        this.state.currentPhase
      );
    }
  }

  private autoSave(): void {
    if (this.isGameStarted && this.hud.gameConfig.autoSave) {
      this.saveManager.autoSave();
      this.flashSaveIndicator();
    }
  }

  private flashSaveIndicator(): void {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    el.classList.remove('hidden', 'visible');
    void el.offsetWidth; // reflow to restart transition
    el.classList.add('visible');
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.classList.add('hidden'), 300);
    }, 2000);
  }

  /**
   * Register global window error handlers so uncaught errors show a
   * friendly recovery dialog instead of a silent crash.
   */
  private setupCrashHandler(): void {
    let hasCrashed = false;

    const showCrashDialog = (message: string): void => {
      if (hasCrashed) return;
      hasCrashed = true;

      // Try to auto-save before showing the dialog
      try {
        this.saveManager.autoSave();
      } catch (e) {
        console.error('Emergency save failed:', e);
      }

      const overlay = document.createElement('div');
      overlay.id = 'crash-overlay';
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(0,0,0,0.85)',
        'display:flex', 'align-items:center', 'justify-content:center',
      ].join(';');

      overlay.innerHTML = `
        <div style="background:#1a1a2e;border:2px solid #dc2626;border-radius:12px;
          padding:2rem;max-width:480px;width:90%;text-align:center;
          box-shadow:0 0 40px rgba(220,38,38,0.4);">
          <div style="font-size:3rem;margin-bottom:1rem;">💥</div>
          <h2 style="color:#ef4444;margin-bottom:0.5rem;">Something went wrong</h2>
          <p style="color:#aaa;margin-bottom:0.5rem;font-size:0.9rem;">
            An unexpected error occurred. Your progress has been auto-saved.
          </p>
          <details style="margin:1rem 0;text-align:left;">
            <summary style="color:#888;cursor:pointer;font-size:0.8rem;">Error details</summary>
            <pre style="color:#ef4444;font-size:0.75rem;margin-top:0.5rem;overflow:auto;
              max-height:120px;background:#0d0d1a;padding:0.5rem;border-radius:4px;
              white-space:pre-wrap;word-break:break-all;">${message.replace(/</g, '&lt;')}</pre>
          </details>
          <div style="display:flex;gap:0.5rem;justify-content:center;margin-top:1rem;">
            <button id="crash-reload" style="padding:0.7rem 1.5rem;background:#2563eb;
              color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;">
              ↺ Reload
            </button>
            <button id="crash-dismiss" style="padding:0.7rem 1.5rem;background:#374151;
              color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:1rem;">
              ✕ Dismiss
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      document.getElementById('crash-reload')?.addEventListener('click', () => {
        window.location.reload();
      });

      document.getElementById('crash-dismiss')?.addEventListener('click', () => {
        overlay.remove();
        hasCrashed = false;
      });
    };

    window.onerror = (_msg, _src, _line, _col, error) => {
      console.error('[Crash] Uncaught error:', error ?? _msg);
      showCrashDialog(error?.stack ?? String(_msg));
      return false;
    };

    window.onunhandledrejection = (event) => {
      console.error('[Crash] Unhandled promise rejection:', event.reason);
      const msg = event.reason instanceof Error
        ? (event.reason.stack ?? event.reason.message)
        : String(event.reason);
      showCrashDialog(msg);
    };
  }

  /**
   * Check for victory at end of turn
   */
  private checkVictory(): void {
    if (this.isGameStarted) {
      this.hud.checkVictoryConditions();
    }
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  const game = new Game();
  await game.init();

  // Expose game instance for debugging
  (window as any).game = game;
});
