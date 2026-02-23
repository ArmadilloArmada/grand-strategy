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
import { campaignManager } from './engine/CampaignManager';
import { tutorialManager } from './engine/TutorialManager';
import { replayManager } from './engine/ReplayManager';
import { steamManager } from './engine/SteamManager';
import { achievementsUI } from './ui/AchievementsUI';
import { campaignUI } from './ui/CampaignUI';
import { EventsSystem, GameEvent as StrategicEvent } from './engine/EventsSystem';

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
import mapData from '../assets/maps/world-map.json';
import gridMapData from '../assets/maps/grid-world-map.json';
import tutorialMapData from '../assets/maps/tutorial-map.json';
import europeMapData from '../assets/maps/europe-map.json';
import pacificMapData from '../assets/maps/pacific-map.json';
import duelMapData from '../assets/maps/duel-map.json';
import africaMapData from '../assets/maps/africa-map.json';
import asiaMapData from '../assets/maps/asia-map.json';
import americasMapData from '../assets/maps/americas-map.json';
import gridEuropeData from '../assets/maps/grid-europe.json';
import gridPacificData from '../assets/maps/grid-pacific.json';
import gridAmericasData from '../assets/maps/grid-americas.json';
import { registerMap, getMapById } from './data/mapRegistry';

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
  
  private isGameStarted: boolean = false;
  private saveLoadMode: 'save' | 'load' = 'save';

  constructor() {
    // Initialize core systems
    this.state = new GameState();
    this.dataLoader = new DataLoader(this.state);
    this.turnManager = new TurnManager(this.state);
    this.aiController = new AIController(this.state, this.turnManager);
    this.saveManager = new SaveManager(this.state);
    this.multiplayerUI = new MultiplayerUI();
    this.eventsSystem = new EventsSystem(this.state);

    // Apply AI difficulty from settings
    this.aiController.setDifficulty(settings.getSetting('aiDifficulty'));
  }

  /**
   * Initialize the game
   */
  async init(): Promise<void> {
    console.log('🎮 Grand Strategy - Initializing...');

    // Register available maps
    registerMap('grid', 'World at War (Grid)', gridMapData as any);
    registerMap('world', 'World at War (Classic)', mapData as any);
    registerMap('tutorial', 'Tutorial', tutorialMapData as any);
    registerMap('europe', 'Europe', europeMapData as any);
    registerMap('pacific', 'Pacific Theater', pacificMapData as any);
    registerMap('duel', 'Duel', duelMapData as any);
    registerMap('africa', 'African Theater', africaMapData as any);
    registerMap('asia', 'Asian Theater', asiaMapData as any);
    registerMap('americas', 'The Americas', americasMapData as any);
    registerMap('grid-europe', 'European Theater (Grid)', gridEuropeData as any);
    registerMap('grid-pacific', 'Pacific Ring (Grid)', gridPacificData as any);
    registerMap('grid-americas', 'Western Hemisphere (Grid)', gridAmericasData as any);

    // Load game data (default map - grid for easier clicking)
    this.dataLoader.loadBundle({
      units: unitsData as import('./data/Unit').UnitTypeData[],
      factions: factionsData,
      map: gridMapData as any,
    });

    console.log(`✓ Loaded ${this.state.territories.size} territories`);
    console.log(`✓ Loaded ${this.state.unitRegistry.getAll().length} unit types`);
    console.log(`✓ Loaded ${this.state.factionRegistry.getAll().length} factions`);

    // Initialize renderer and HUD
    this.renderer = new MapRenderer(this.state, 'game-canvas');
    this.hud = new HUD(this.state, this.turnManager, this.renderer);

    // Setup fog of war callback
    this.renderer.setFogOfWarCallback((id) => this.hud.isTerritoryVisible(id));

    // Setup event listeners
    this.state.on('turn_start', () => this.onTurnStart());
    this.state.on('phase_end', () => this.autoSave());
    this.state.on('turn_end', () => this.checkVictory());

    // Setup UI event listeners
    this.setupMenuListeners();
    this.setupSettingsListeners();
    this.setupKeyboardShortcuts();
    this.setupCrashHandler();

    // Initialize Steam integration (if available)
    steamManager.initialize().then(available => {
      if (available) {
        console.log('✓ Steam integration active');
      }
    });

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
        console.log('✓ Launched editor preview map:', previewMap.name);
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
      fogOfWar: false, // Disable fog for easier play
      autoSave: true,
    };

    console.log(`🎮 Quick Start: ${turnStyle} mode`);
    this.startNewGame();
  }

  /**
   * Start a new game
   */
  startNewGame(): void {
    const mapId = this.hud.gameConfig.mapId ?? 'grid';
    const mapToLoad = getMapById(mapId) ?? (gridMapData as any);
    
    // Get units for selected era
    const unitEra = this.hud.gameConfig.unitEra ?? 'wwii';
    const eraUnits = UNIT_ERAS[unitEra]?.data ?? wwiiUnitsData;
    console.log(`🎮 Loading ${unitEra.toUpperCase()} era units`);
    
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
      console.log(`${faction.name} controlled by: ${faction.controlledBy}`);
    }

    // Apply current difficulty and personality
    this.aiController.setDifficulty(settings.getSetting('aiDifficulty'));
    this.aiController.setPersonality((settings.getSetting('aiPersonality') ?? 'default') as any);

    // Set turn style from config
    this.turnManager.setTurnStyle(this.hud.gameConfig.turnStyle);
    console.log(`Turn style: ${this.hud.gameConfig.turnStyle}`);

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
    
    this.isGameStarted = true;

    // Hide main menu
    this.hideMainMenu();

    // Show tutorial for new players
    const tutorialSeen = localStorage.getItem('tutorial-seen') === 'true';
    if (!tutorialSeen) {
      this.hud.showTutorial();
    }

    console.log('✓ New game started!');
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
        // Hide all menus
        this.hideCampaign();
        this.hideMainMenu();
        
        console.log(`Starting mission: ${mission.name} from campaign: ${campaignId}`);
        
        // Load the mission map and start the game
        const missionMap = getMapById(mission.mapId);
        if (missionMap) {
          // Set up game config for campaign mission
          this.hud.gameConfig = {
            ...this.hud.gameConfig,
            mode: 'vs-ai',
            humanFactions: [mission.faction],
            turnStyle: 'classic',
            victoryType: 'capitals',
            turnLimit: 50,
            fogOfWar: false,
            autoSave: true,
          };
          
          // Load the map
          this.dataLoader.loadBundle({
            units: unitsData as import('./data/Unit').UnitTypeData[],
            factions: factionsData,
            map: missionMap as import('./loaders/MapLoader').MapData,
          });
          
          // Show mission briefing then start
          this.hud.showToast(`Mission: ${mission.name}`, 'info');
          this.startNewGame();
        } else {
          this.hud.showToast(`Map not found: ${mission.mapId}`, 'info');
        }
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

    // Victory/defeat screen: return to main menu
    this.hud.events.on('showMainMenu', () => {
      replayManager.stopRecording();
      this.isGameStarted = false;
      this.showMainMenu();
    });

    // Listen for auto-save event
    this.hud.events.on('autoSave', () => {
      this.saveManager.quickSave();
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
      console.log(`👤 HUMAN TURN: ${faction.name}`);
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
    console.log(`🤖 AI TURN: ${faction.name}`);
    
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
        console.log('💾 Emergency auto-save completed');
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

  console.log('');
  console.log('🎮 Grand Strategy loaded!');
  console.log('');
  console.log('⌨️ Keyboard shortcuts:');
  console.log('  Ctrl+S  - Quick save');
  console.log('  Ctrl+L  - Quick load');
  console.log('  Escape  - Open/close menu');
  console.log('  Enter   - End phase');
  console.log('  Space   - End phase');
  console.log('  B       - Build units (purchase phase)');
  console.log('  A       - Attack (combat phase)');
  console.log('  H       - Help/tutorial');
  console.log('  F       - Fit map to screen');
  console.log('  C       - Center on capital');
});
