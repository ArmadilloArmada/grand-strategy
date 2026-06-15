/**
 * Grand Strategy - Main Entry Point
 * A modern grand strategy wargame
 */

import { GameState } from './engine/GameState';
import { mergePersistedGameConfig } from './engine/GameConfig';
import { TurnManager } from './engine/TurnManager';
import { AIController } from './engine/AIController';
import { MapRenderer } from './renderer/MapRenderer';
import { DataLoader } from './loaders/DataLoader';
import { HUD } from './ui/HUD';
import { SaveManager } from './ui/SaveManager';
import { settings } from './ui/Settings';
import { soundManager } from './audio/SoundManager';

// New feature imports
import { achievementManager } from './engine/AchievementManager';
import { statisticsManager } from './engine/StatisticsManager';
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
import { getAITaunt } from './engine/AITaunts';
import { factionAbilityManager } from './engine/FactionAbilities';
import { DebugPanel } from './ui/DebugPanel';
import { ReplayUI } from './ui/ReplayUI';
import { battleLog } from './ui/BattleLog';
import { visualEffects } from './ui/VisualEffects';
import { cloudSaveManager } from './engine/CloudSaveManager';
import { WeatherSystem } from './engine/WeatherSystem';
import { FortificationSystem } from './engine/FortificationSystem';
import { dragManager } from './ui/DragManager';
import { normalizeCapitalsToWinForMatch, resolveMatchSetup, applyMatchSetupToState } from './engine/SetupValidation';
import { sanitizeUnitPlacement } from './engine/navalPlacement';
import { selectTrait, ALL_TRAITS } from './engine/CommanderProgression';
import type { Commander, CommanderTraitId } from './data/Territory';
import type { UnitTypeData } from './data/Unit';
import { bootstrapGame } from './app/bootstrap';

// Export managers for external access
export { campaignManager, replayManager };

// Import game data - default world data bundle
import unitsData from '../assets/units/full-units.json';
import wwiUnitsData from '../assets/units/wwi-units.json';
import wwiiUnitsData from '../assets/units/wwii-units.json';
import coldwarUnitsData from '../assets/units/coldwar-units.json';
import modernUnitsData from '../assets/units/modern-units.json';
import factionsData from '../assets/factions/world-factions.json';
import worldFactionsMegaData from '../assets/factions/world-factions-mega.json';

// Unit era registry
type UnitEraEntry = { name: string; description: string; data: UnitTypeData[] };
const UNIT_ERAS: Record<string, UnitEraEntry> = {
  'wwi': { name: 'World War I (1914)', description: 'Slow trench warfare. Most units move 1 tile.', data: wwiUnitsData as unknown as UnitTypeData[] },
  'wwii': { name: 'World War II (1942)', description: 'Classic combined arms. Standard mobility.', data: wwiiUnitsData as unknown as UnitTypeData[] },
  'coldwar': { name: 'Cold War (1970)', description: 'Jet age. Armor and fleets move 3 tiles.', data: coldwarUnitsData as unknown as UnitTypeData[] },
  'modern': { name: 'Modern (2020)', description: 'High-tech warfare. Fastest units on land, sea, and air.', data: modernUnitsData as unknown as UnitTypeData[] },
};
import _gridMapData from '../assets/maps/grid-world-map.json';
import _tutorialMapData from '../assets/maps/tutorial-map.json';
import _gridEuropeData from '../assets/maps/grid-europe.json';
import _gridPacificData from '../assets/maps/grid-pacific.json';
import _gridAmericasData from '../assets/maps/grid-americas.json';
import _gridAfricaData from '../assets/maps/grid-africa.json';
import _gridEasternFrontData from '../assets/maps/grid-eastern-front.json';
import _gridSkirmishData from '../assets/maps/grid-skirmish.json';
import _gridMediterraneanData from '../assets/maps/grid-mediterranean.json';
import _gridArcticData from '../assets/maps/grid-arctic.json';
import _gridArchipelagoData from '../assets/maps/grid-archipelago.json';
import _gridWorldMapMega from '../assets/maps/grid-world-map-mega.json';
import { registerMap, getMapEntry, getMapById } from './data/mapRegistry';
import { EUROPE_FACTIONS, PACIFIC_FACTIONS, AMERICAS_FACTIONS, AFRICA_FACTIONS, EASTERN_FRONT_FACTIONS, SKIRMISH_FACTIONS, MEDITERRANEAN_FACTIONS, ARCTIC_FACTIONS, ARCHIPELAGO_FACTIONS, TUTORIAL_FACTIONS } from './data/mapFactions';
import type { MapData } from './loaders/MapLoader';
const gridMapData = _gridMapData as unknown as MapData;
const tutorialMapData = _tutorialMapData as unknown as MapData;
const gridEuropeData = _gridEuropeData as unknown as MapData;
const gridPacificData = _gridPacificData as unknown as MapData;
const gridAmericasData = _gridAmericasData as unknown as MapData;
const gridAfricaData = _gridAfricaData as unknown as MapData;
const gridEasternFrontData = _gridEasternFrontData as unknown as MapData;
const gridSkirmishData = _gridSkirmishData as unknown as MapData;
const gridMediterraneanData = _gridMediterraneanData as unknown as MapData;
const gridArcticData = _gridArcticData as unknown as MapData;
const gridArchipelagoData = _gridArchipelagoData as unknown as MapData;
const gridWorldMapMega = _gridWorldMapMega as unknown as MapData;

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
    this.eventsSystem = new EventsSystem(this.state);
    this.moraleSystem = new MoraleSystem(this.state);
    this.espionageSystem = new EspionageSystem(this.state);
    this.nuclearSystem = new NuclearSystem(this.state);

    this.state.systems.moraleSystem = this.moraleSystem;
    this.state.systems.espionageSystem = this.espionageSystem;
    this.state.systems.nuclearSystem = this.nuclearSystem;
    this.state.systems.aiController = this.aiController;

    // Apply theme immediately from saved settings
    this.applyTheme(settings.getSetting('theme') ?? 'dark');

    // Apply AI difficulty and speed from settings
    this.aiController.setDifficulty(settings.getSetting('aiDifficulty'));
    this.aiController.setSpeed(settings.getAISpeedMultiplier());
  }

  /**
   * Initialize the game
   */
  async init(): Promise<void> {
    // Register available maps — themed maps supply their own faction definitions
    registerMap('grid', 'World at War (Grid)', gridMapData, undefined, factionsData as import('./data/Faction').FactionData[]);
    registerMap(
      'grid-mega',
      'World at War — Fine Grid (Grid)',
      gridWorldMapMega,
      'Same geography as the default world map, split into 25×25 tiles (768 territories).',
      worldFactionsMegaData as import('./data/Faction').FactionData[],
    );
    registerMap('tutorial', 'Tutorial', tutorialMapData, undefined, TUTORIAL_FACTIONS);
    registerMap('grid-europe',        'European Theater (Grid)',   gridEuropeData,       undefined, EUROPE_FACTIONS);
    registerMap('grid-pacific',       'Pacific Ring (Grid)',       gridPacificData,      undefined, PACIFIC_FACTIONS);
    registerMap('grid-americas',      'Western Hemisphere (Grid)', gridAmericasData,     undefined, AMERICAS_FACTIONS);
    registerMap('grid-africa',        'African Campaign (Grid)',   gridAfricaData,       undefined, AFRICA_FACTIONS);
    registerMap('grid-eastern-front',  'Eastern Front (Grid)',       gridEasternFrontData,  undefined, EASTERN_FRONT_FACTIONS);
    registerMap('grid-skirmish',       'Skirmish 2v2 (Grid)',        gridSkirmishData,      undefined, SKIRMISH_FACTIONS);
    registerMap('grid-mediterranean',  'Mediterranean Theater (Grid)', gridMediterraneanData, undefined, MEDITERRANEAN_FACTIONS);
    registerMap('grid-arctic',         'Arctic Circle (Grid)',        gridArcticData,        undefined, ARCTIC_FACTIONS);
    registerMap('grid-archipelago',    'Island Chains (Grid)',        gridArchipelagoData,   undefined, ARCHIPELAGO_FACTIONS);

    // Load game data (default map - grid for easier clicking)
    this.dataLoader.loadBundle({
      units: unitsData as import('./data/Unit').UnitTypeData[],
      factions: factionsData,
      map: gridMapData,
    });

    // Initialize renderer and HUD
    this.renderer = new MapRenderer(this.state, 'game-canvas');
    this.hud = new HUD(this.state, this.turnManager, this.renderer);
    this.saveManager.setGameConfigProvider(() => this.hud.gameConfig);
    this.hud.setAISpeedCallback((multiplier) => this.aiController.setSpeed(multiplier));
    // DebugPanel is dev-only; never let it block the main menu from wiring up.
    try {
      new DebugPanel(this.state, this.turnManager);
    } catch (error) {
      console.warn('Debug panel failed to initialize:', error);
    }

    this.state.systems.technologyManager = this.hud.technologyManager;

    // Setup fog of war and intel reveal callbacks
    this.renderer.setFogOfWarCallback((id) => this.hud.isTerritoryVisible(id));
    this.renderer.setIntelRevealCallback((id) => this.espionageSystem.isIntelRevealed(id));
    this.renderer.setAdjacentFogCallback((id) => this.hud.isTerritoryAdjacentFog(id));

    // Setup event listeners
    this.state.on('turn_start', () => this.onTurnStart());
    this.state.on('phase_end', () => this.autoSave());
    this.state.on('turn_end', () => this.checkVictory());

    // Stamp the build version into the main-menu version label
    const versionEl = document.getElementById('main-menu-version');
    if (versionEl) versionEl.textContent = `War Room Edition v${__APP_VERSION__} - Autosaves each phase`;

    // Setup UI event listeners
    this.setupMenuListeners();
    this.setupSettingsListeners();
    this.setupKeyboardShortcuts();
    this.setupElectronMenuListeners();
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

    // Wire dynamic feature callbacks
    this.hud.setupObjectiveCallbacks();

    // Faction ability button
    document.getElementById('btn-faction-ability')?.addEventListener('click', () => {
      this.hud.onFactionAbilityClick();
    });

    // Wire replay recording events (recordAction is a no-op when not recording)
    this.state.on('combat_end', (e: any) => {
      const data = e.data as {
        combat?: { winner?: string; attackingFactionId?: string; defendingFactionId?: string; territoryId?: string };
        attackingFactionId?: string;
        xpOutcome?: { attackerResult?: { leveledUp?: boolean; newLevel?: number; traitChoices?: CommanderTraitId[] }; defenderResult?: { leveledUp?: boolean; newLevel?: number; traitChoices?: CommanderTraitId[] } };
        attackerCommander?: Commander | null;
        defenderCommander?: Commander | null;
      };
      const combat = data.combat;
      const attackerId = combat?.attackingFactionId ?? data.attackingFactionId ?? '';
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, attackerId, 'combat_result', e.data);
      if (data.xpOutcome?.attackerResult?.leveledUp) achievementManager.updateProgress('commander_leveled', 1);
      if (data.xpOutcome?.defenderResult?.leveledUp) achievementManager.updateProgress('commander_leveled', 1);
      // Show trait choice modal if a player commander leveled up
      const atkResult = data.xpOutcome?.attackerResult;
      if (atkResult?.leveledUp && atkResult.traitChoices?.length && data.attackerCommander) {
        this.showCommanderTraitModal(data.attackerCommander, atkResult.traitChoices, atkResult.newLevel ?? 2);
      }
      const defResult = data.xpOutcome?.defenderResult;
      if (defResult?.leveledUp && defResult.traitChoices?.length && data.defenderCommander) {
        this.showCommanderTraitModal(data.defenderCommander, defResult.traitChoices, defResult.newLevel ?? 2);
      }
      // Morale: battle victory reduces war weariness for the winning side
      if (combat?.winner === 'attacker' && combat.attackingFactionId) {
        const ter = combat.territoryId ? this.state.territories.get(combat.territoryId) : null;
        this.state.systems.moraleSystem?.recordVictory?.(
          combat.attackingFactionId,
          ter?.isCapital ?? false,
          ter?.hasFactory ?? false,
        );
        if ((combat as { resolvedTactically?: boolean }).resolvedTactically) {
          this.state.systems.moraleSystem?.recordTacticalVictory?.(
            combat.attackingFactionId,
            (combat as { tacticalCleanWin?: boolean }).tacticalCleanWin ?? false,
          );
        }
      }
    });
    this.state.on('units_produced', (e: any) => {
      const data = e.data as { factionId: string };
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, data.factionId ?? '', 'produce', e.data);
    });
    this.state.on('phase_end', () => {
      const faction = this.state.getCurrentFaction();
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, faction?.id ?? '', 'phase_end', { phase: this.state.currentPhase });
    });
    this.state.on('units_moved', (e: any) => {
      const d = e.data as { unitTypeId: string; count: number; from: string; to: string };
      const faction = this.state.getCurrentFaction();
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, faction?.id ?? '', 'move', {
        unitTypeId: d.unitTypeId,
        count: d.count,
        fromId: d.from,
        toId: d.to,
      });
      const destination = this.state.territories.get(d.to);
      if (destination) {
        const screen = this.renderer.worldToScreen(destination.center[0], destination.center[1]);
        visualEffects.floatText(screen.x, screen.y - 12, `+${d.count} moved`, faction?.color ?? '#fbbf24', 16);
      }
    });
    this.state.on('tech_researched', (e: any) => {
      const d = e.data as { factionId: string; techId: string };
      replayManager.recordAction(this.state.turnNumber, this.state.currentPhase, d.factionId, 'research', { techId: d.techId });
    });
    this.state.on('espionage_result', (e: any) => {
      achievementManager.updateProgress('espionage_op', 1);
      const d = e.data as { factionId?: string; success?: boolean };
      if (d.factionId) statisticsManager.trackEspionageOp(d.factionId, d.success ?? false);
    });
    this.state.on('nuclear_strike', (e: any) => {
      achievementManager.updateProgress('nuclear_strike', 1);
      const d = e.data as { factionId?: string };
      if (d.factionId) statisticsManager.trackNukeLaunched(d.factionId);
    });
    this.state.on('fortification_built', (e: any) => {
      achievementManager.updateProgress('fortification_built', 1);
      const d = e.data as { factionId?: string };
      if (d.factionId) statisticsManager.trackFortificationBuilt(d.factionId);
    });
    this.state.on('alliance_formed', (e: any) => {
      achievementManager.updateProgress('alliance_formed', 1);
      const d = e.data as { factionId?: string };
      if (d.factionId) statisticsManager.trackAllianceFormed(d.factionId);
    });
    this.state.on('pact_formed', (e: any) => {
      const d = e.data as { factionId?: string };
      if (d.factionId) statisticsManager.trackPactFormed(d.factionId);
    });
    this.state.on('alliance_betrayed', (e: any) => {
      const d = e.data as { factionId?: string };
      if (d.factionId) statisticsManager.trackBetrayal(d.factionId);
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

    // Set up drag for panels visible on the main menu screen
    dragManager.setup();
  }

  /**
   * Quick start a new game with preset settings
   */
  quickStart(turnStyle: 'classic' | 'quick'): void {
    const isQuick = turnStyle === 'quick';
    this.hud.gameConfig = {
      ...this.hud.gameConfig,
      mode: 'vs-ai',
      humanFactions: ['atlantic_alliance'],
      turnStyle: turnStyle,
      victoryType: 'capitals',
      capitalsToWin: isQuick ? 2 : 3,
      turnLimit: isQuick ? 25 : 50,
      fogOfWar: true,
      autoSave: true,
      simpleMode: isQuick,
      guidedOnboarding: isQuick,
      aiDifficulty: isQuick ? 'easy' : 'medium',
      aiPersonality: 'default',
    };

    this.startNewGame();
    if (isQuick) {
      this.showSimpleCampaignBriefing();
    }
  }

  private showSimpleCampaignBriefing(): void {
    document.getElementById('scenario-briefing-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'scenario-briefing-overlay';
    overlay.className = 'scenario-briefing-overlay';
    overlay.innerHTML = `
      <div class="scenario-briefing-card">
        <div class="scenario-briefing-kicker">Simple Campaign</div>
        <h2>Your First Command</h2>
        <p class="scenario-briefing-subtitle">Three phases per turn — Build, Move, End. The Co-Pilot will guide each step.</p>
        <div class="scenario-briefing-goals">
          <div class="scenario-briefing-goal"><span>1</span><strong>Mobilize your capital or a factory to raise troops.</strong></div>
          <div class="scenario-briefing-goal"><span>2</span><strong>Move into a neighboring enemy territory and attack.</strong></div>
          <div class="scenario-briefing-goal"><span>3</span><strong>Capture 2 enemy capitals before turn 25 to win.</strong></div>
        </div>
        <div class="scenario-briefing-doctrine">Easy AI · Favorable economy · Co-Pilot coaching enabled</div>
        <div class="scenario-briefing-actions">
          <button class="primary" id="btn-start-command">Begin Turn 1</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('btn-start-command')?.addEventListener('click', () => overlay.remove());
  }

  private startScenario(scenario: string): void {
    this.hud.gameConfig = {
      ...this.hud.gameConfig,
      mode: 'vs-ai',
      humanFactions: ['atlantic_alliance'],
      turnStyle: 'quick',
      victoryType: scenario === 'factory-rush' ? 'economic' : 'capitals',
      economicTarget: scenario === 'factory-rush' ? 180 : this.hud.gameConfig.economicTarget,
      capitalsToWin: scenario === 'first-war' ? 2 : 3,
      turnLimit: scenario === 'hold-capital' ? 12 : 20,
      fogOfWar: true,
      autoSave: true,
      simpleMode: true,
      guidedOnboarding: true,
      aiDifficulty: scenario === 'first-war' ? 'medium' : 'easy',
      aiPersonality: scenario === 'hold-capital' ? 'defensive' : scenario === 'factory-rush' ? 'economic' : 'aggressive',
    };
    this.startNewGame();
    this.showScenarioBriefing(scenario);
    const labels: Record<string, string> = {
      'hold-capital': 'Hold the Capital: survive and reinforce Washington D.C.',
      'factory-rush': 'Factory Rush: build your economy and outproduce the AI.',
      'first-war': 'First War: follow the co-pilot into an early attack.',
    };
    this.hud.showToast(labels[scenario] ?? 'Scenario started', 'success');
  }

  private showScenarioBriefing(scenario: string): void {
    document.getElementById('scenario-briefing-overlay')?.remove();

    const briefings: Record<string, { title: string; subtitle: string; goals: string[]; doctrine: string }> = {
      'hold-capital': {
        title: 'Hold the Capital',
        subtitle: 'Protect Washington D.C. long enough to turn the front line.',
        goals: ['Build defenders first.', 'Use the Threats overlay to spot danger.', 'End the phase when the co-pilot has no urgent warning.'],
        doctrine: 'Defensive AI: reinforces strongholds and punishes exposed capitals.',
      },
      'factory-rush': {
        title: 'Factory Rush',
        subtitle: 'Win by turning production into unstoppable pressure.',
        goals: ['Use Buy & Auto-Deploy in factory territories.', 'Protect production hubs.', 'Bank income when the front is stable.'],
        doctrine: 'Economic AI: expands factories and tries to outproduce you.',
      },
      'first-war': {
        title: 'First War',
        subtitle: 'Learn the clean loop: build, move, fight, review.',
        goals: ['Follow Do This Next.', 'Attack only when the preview looks favorable.', 'Watch moved units become ready next turn.'],
        doctrine: 'Aggressive AI: looks for early attacks and weak borders.',
      },
    };

    const briefing = briefings[scenario] ?? {
      title: 'Scenario',
      subtitle: 'A guided operation is ready.',
      goals: ['Follow the co-pilot.', 'Keep factories protected.', 'End phases when your plan is complete.'],
      doctrine: `AI doctrine: ${this.describeAIDoctrine(this.hud.gameConfig.aiPersonality)}.`,
    };

    const overlay = document.createElement('div');
    overlay.id = 'scenario-briefing-overlay';
    overlay.className = 'scenario-briefing-overlay';
    overlay.innerHTML = `
      <div class="scenario-briefing-card">
        <div class="scenario-briefing-kicker">Operation Briefing</div>
        <h2>${briefing.title}</h2>
        <p class="scenario-briefing-subtitle">${briefing.subtitle}</p>
        <div class="scenario-briefing-goals">
          ${briefing.goals.map((goal, index) => `
            <div class="scenario-briefing-goal">
              <span>${index + 1}</span>
              <strong>${goal}</strong>
            </div>
          `).join('')}
        </div>
        <div class="scenario-briefing-doctrine">${briefing.doctrine}</div>
        <div class="scenario-briefing-actions">
          <button class="primary" id="btn-start-command">Start Command</button>
          <button id="btn-briefing-copilot">Show Co-Pilot</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('btn-start-command')?.addEventListener('click', close);
    document.getElementById('btn-briefing-copilot')?.addEventListener('click', () => {
      close();
      document.querySelector<HTMLElement>('.strategic-advisor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  /**
   * Start a new game
   */
  startNewGame(): void {
    this.hud.resetVictoryState();
    const mapId = this.hud.gameConfig.mapId ?? 'grid';
    const mapEntry = getMapEntry(mapId);
    const mapToLoad = mapEntry?.data ?? gridMapData;
    const mapFactions = (mapEntry?.factions ?? factionsData) as import('./data/Faction').FactionData[];

    // Get units for selected era
    const unitEra = this.hud.gameConfig.unitEra ?? 'wwii';
    const eraUnits = UNIT_ERAS[unitEra]?.data ?? wwiiUnitsData;
    // Reset game state by reloading data
    this.dataLoader.loadBundle({
      units: eraUnits as import('./data/Unit').UnitTypeData[],
      factions: mapFactions,
      map: mapToLoad,
    });

    // Resolve match participants and apply to loaded map data.
    const matchSetup = resolveMatchSetup({
      mode: this.hud.gameConfig.mode ?? 'vs-ai',
      humanFactionIds: this.hud.gameConfig.humanFactions,
      availableFactions: mapFactions,
      pickedOpponentIds: this.hud.gameConfig.aiOpponents,
      opponentCountRaw: this.hud.gameConfig.aiOpponentCount === 0
        ? 'all'
        : String(this.hud.gameConfig.aiOpponentCount ?? 'all'),
    });
    this.hud.gameConfig.humanFactions = matchSetup.humanFactionIds;
    this.hud.gameConfig.aiOpponents = matchSetup.aiOpponentIds;
    this.hud.gameConfig.aiOpponentCount = matchSetup.aiOpponentCount;
    this.hud.gameConfig.activeFactionIds = matchSetup.activeFactionIds;
    this.hud.gameConfig.capitalsToWin = normalizeCapitalsToWinForMatch(
      this.hud.gameConfig.capitalsToWin,
      matchSetup.activeFactionIds,
      matchSetup.humanFactionIds,
      mapFactions,
    );
    applyMatchSetupToState(this.state, matchSetup);
    sanitizeUnitPlacement(this.state);

    this.hud.syncRendererFromConfig();

    // Apply current difficulty and personality
    this.aiController.setDifficulty(this.hud.gameConfig.aiDifficulty ?? settings.getSetting('aiDifficulty'));
    this.aiController.setPersonality(this.hud.gameConfig.aiPersonality ?? settings.getSetting('aiPersonality') ?? 'default');

    // Set turn style from config
    this.turnManager.setTurnStyle(this.hud.gameConfig.turnStyle);

    // Reset dynamic feature systems for fresh game
    this.hud.tensionSystem.reset();
    this.hud.objectiveSystem.reset();
    this.hud.objectiveSystem.setScenarioMap(mapId);
    factionAbilityManager.reset();
    this.hud.isFirstTurnLoad = true;

    // Start the game
    this.turnManager.startGame();

    // Wire optional systems based on settings
    if (settings.getSetting('dynamicWeather')) {
      this.state.systems.weatherSystem = new WeatherSystem(this.state);
    } else {
      this.state.systems.weatherSystem = undefined;
    }

    const humanFactionIds = this.hud.gameConfig.humanFactions ?? [];
    if (settings.getSetting('commanderProgression') && humanFactionIds.length > 0) {
      // When commanderAbilities is off, pass empty array so all trait picks are auto-selected
      this.state.systems.commanderProgression = {
        playerFactionIds: settings.getSetting('commanderAbilities') ? humanFactionIds : [],
      };
    } else {
      this.state.systems.commanderProgression = undefined;
    }

    if (settings.getSetting('fortifications')) {
      this.state.systems.fortificationSystem = new FortificationSystem(this.state);
    } else {
      this.state.systems.fortificationSystem = undefined;
    }

    // Fresh ability state for this game session (tracks in-flight ability effects)
    this.state.systems.abilityState = {
      pendingIPCBonuses: new Map(),
      scorchedTerritories: new Map(),
      islandHoppingTurns: new Map(),
    };

    // Start replay recording. Replay metadata only includes factions that
    // actually participated, matching what the in-game UI shows.
    const recordFactions = this.state.factionRegistry.getActiveIncludingDefeated().map(f => f.id);
    replayManager.startRecording(JSON.stringify({ mapId, turn: 0 }), mapId, recordFactions);

    // Set Steam Rich Presence
    const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
    steamManager.setRichPresence('In Battle', {
      map: mapId,
      faction: humanFaction?.name ?? 'Commander',
    });

    this.hud.updateTurnInfo();

    // Assign starting commanders to each active faction's capital territory
    for (const faction of this.state.factionRegistry.getActive()) {
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
    soundManager.playMusic('gameplay');

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
          const humanFactions = this.hud.gameConfig.humanFactions ?? [];
          if (humanFactions.includes(combat.attackingFactionId)) {
            const defenderLosses = (combat.defenders as Array<{ casualties: number }>)
              ?.reduce((sum: number, d: { casualties: number }) => sum + (d.casualties ?? 0), 0) ?? 0;
            if (defenderLosses > 0) campaignManager.trackUnitsDestroyed(defenderLosses);
            if (combat.captured) campaignManager.trackCapture(combat.territoryId);
            if ((combat as { resolvedTactically?: boolean }).resolvedTactically && combat.winner === 'attacker') {
              campaignManager.trackTacticalVictory(1);
            }
          }
        }),
        this.state.on('territory_mobilized', (e) => {
          if (!this.activeCampaignId) return;
          const data = e.data as any;
          const humanFactions = this.hud.gameConfig.humanFactions ?? [];
          if (humanFactions.includes(data?.factionId) && data?.count) {
            campaignManager.trackUnitsProduced(data.count as number);
          }
        })
      );
    }

    // Hide main menu
    this.hideMainMenu();
    this.scheduleFitMapToCommandLayout();

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
      this.applyLoadedMatchSettings();
      this.hud.updateTurnInfo();
      this.isGameStarted = true;
      this.hideMainMenu();
      this.scheduleFitMapToCommandLayout();
      this.hud.showToast('Game loaded!', 'success');
      return true;
    }

    this.hud.showToast('Could not load autosave', 'error');
    return false;
  }

  private quickSaveWithFeedback(): void {
    if (!this.isGameStarted) {
      this.hud.showToast('Start a game before saving', 'info');
      return;
    }

    if (this.saveManager.quickSave()) {
      this.hud.showToast('Quick saved!', 'success');
      this.flashSaveIndicator();
    } else {
      this.hud.showToast('Quick save failed', 'error');
    }
  }

  private applyLoadedMatchSettings(): void {
    const saved = this.saveManager.consumeLastLoadedConfig();
    if (!saved) return;
    this.hud.gameConfig = mergePersistedGameConfig(this.hud.gameConfig, saved);
    this.turnManager.setTurnStyle(this.hud.gameConfig.turnStyle);
    this.aiController.setDifficulty(this.hud.gameConfig.aiDifficulty ?? settings.getSetting('aiDifficulty'));
    this.aiController.setPersonality(this.hud.gameConfig.aiPersonality ?? settings.getSetting('aiPersonality') ?? 'default');
  }

  private quickLoadWithFeedback(): void {
    if (this.saveManager.quickLoad()) {
      this.applyLoadedMatchSettings();
      this.hud.updateTurnInfo();
      this.isGameStarted = true;
      this.hideMainMenu();
      this.scheduleFitMapToCommandLayout();
      this.hud.showToast('Quick loaded!', 'success');
    } else {
      this.hud.showToast('No valid quick save found', 'info');
    }
  }

  /**
   * Show main menu
   */
  showMainMenu(): void {
    steamManager.clearRichPresence();
    const modal = document.getElementById('main-menu-modal');
    if (modal) modal.classList.remove('hidden');
    this.setMainMenuTab('new');

    // Hide HUD elements that have no meaning without an active game
    document.getElementById('turn-info')?.classList.add('hidden');
    document.getElementById('resources')?.classList.add('hidden');
    document.getElementById('action-buttons')?.classList.add('hidden');
    document.getElementById('selection-info')?.classList.add('hidden');

    // Update continue button state
    const continueBtn = document.getElementById('btn-continue-game') as HTMLButtonElement;
    if (continueBtn) {
      const hasAutoSave = this.saveManager.hasAutoSave();
      continueBtn.disabled = !hasAutoSave;
      continueBtn.title = hasAutoSave ? 'Loads the latest autosave from the Resume tab.' : 'No autosave found yet.';
    }
  }

  /**
   * Hide main menu
   */
  hideMainMenu(): void {
    const modal = document.getElementById('main-menu-modal');
    if (modal) modal.classList.add('hidden');

    // Restore HUD elements
    document.getElementById('turn-info')?.classList.remove('hidden');
    document.getElementById('resources')?.classList.remove('hidden');
    document.getElementById('action-buttons')?.classList.remove('hidden');
    document.getElementById('selection-info')?.classList.remove('hidden');

    // Enable drag for gameplay panels now that they are visible
    requestAnimationFrame(() => dragManager.setup());
  }

  private setMainMenuTab(tabName: 'new' | 'resume'): void {
    document.querySelectorAll<HTMLElement>('[data-menu-tab]').forEach(tab => {
      const isActive = tab.dataset.menuTab === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    document.querySelectorAll<HTMLElement>('[data-menu-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.menuPanel === tabName);
    });
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
          You have a game in progress. Starting fresh will not load your autosave; it stays available from the Resume tab until another autosave replaces it.
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
            const missionMapEntry = getMapEntry(mission.mapId);
            if (!missionMap) {
              this.hud.showToast(`Map not found: ${mission.mapId}`, 'info');
              return;
            }
            const missionFactions = missionMapEntry?.factions ?? [];
            const missionFaction = missionFactions.some(f => f.id === mission.faction)
              ? mission.faction
              : (missionFactions.find(f => f.isPlayable)?.id ?? missionFactions[0]?.id ?? mission.faction);

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
              humanFactions: [missionFaction],
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
   * Show credits overlay
   */
  showCredits(): void {
    const existing = document.getElementById('credits-overlay');
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'credits-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9000;
      display:flex;align-items:center;justify-content:center;
    `;
    overlay.innerHTML = `
      <div style="
        background:#0f172a;border:1px solid #334155;border-radius:14px;
        padding:2.5rem 3rem;max-width:540px;width:90%;color:#e2e8f0;
        max-height:80vh;overflow-y:auto;box-shadow:0 0 60px rgba(0,0,0,0.8);
      ">
        <div style="text-align:center;margin-bottom:2rem;">
          <div style="font-size:2.5rem;">🌍</div>
          <h2 style="margin:0.5rem 0 0.25rem;color:#60a5fa;font-size:1.6rem;letter-spacing:0.05em;">
            GRAND STRATEGY
          </h2>
          <p style="margin:0;color:#64748b;font-size:0.9rem;">Version 1.0.0</p>
        </div>

        <section style="margin-bottom:1.5rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Development
          </h3>
          <p style="margin:0 0 0.4rem;font-weight:bold;">ArmadilloArmada</p>
          <p style="margin:0;color:#64748b;font-size:0.9rem;">Game design, programming, art</p>
        </section>

        <section style="margin-bottom:1.5rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Built With
          </h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;font-size:0.9rem;color:#94a3b8;">
            <span>⚡ Electron</span><span>🛠️ Vite</span>
            <span>🔷 TypeScript</span><span>🎮 steamworks.js</span>
            <span>🧪 Vitest</span><span>🎨 HTML5 Canvas</span>
          </div>
        </section>

        <section style="margin-bottom:1.5rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Inspired By
          </h3>
          <p style="margin:0;color:#94a3b8;font-size:0.9rem;">
            TripleA · Axis &amp; Allies · Hearts of Iron
          </p>
        </section>

        <section style="margin-bottom:2rem;">
          <h3 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 0.75rem;">
            Open Source Licenses
          </h3>
          <p style="margin:0;color:#64748b;font-size:0.85rem;line-height:1.6;">
            This game uses open-source software. All third-party libraries
            are used under their respective licenses (MIT, Apache 2.0, BSD).
            Full license text is included in the installation directory
            under <code style="color:#94a3b8;">licenses/</code>.
          </p>
        </section>

        <div style="text-align:center;">
          <button id="btn-close-credits" style="
            background:#1e3a5f;color:#60a5fa;border:1px solid #2563eb;
            border-radius:8px;padding:0.5rem 2rem;font-size:1rem;cursor:pointer;
          ">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('btn-close-credits')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
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
            <div class="save-slot-name">${isEmpty ? `Empty Slot ${slot.id}` : this.escapeHTML(slot.name)}</div>
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
            ${!isEmpty ? `<button class="btn-slot-rename" data-slot="${slot.id}">Rename</button>` : ''}
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
        const defaultName = slot?.isEmpty ? `Save ${slotId}` : slot?.name ?? `Save ${slotId}`;
        const saveName = prompt('Save name:', defaultName);
        if (saveName === null) return;
        if (this.saveManager.saveToSlot(slotId, saveName)) {
          this.hud.showToast('Game saved!', 'success');
          this.flashSaveIndicator();
        } else {
          this.hud.showToast('Save failed', 'error');
        }
        this.renderSaveSlots();
      });
    });

    container.querySelectorAll('.btn-slot-load').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = parseInt((btn as HTMLElement).dataset.slot || '1');
        if (this.saveManager.loadFromSlot(slotId)) {
          this.applyLoadedMatchSettings();
          this.hud.updateTurnInfo();
          this.isGameStarted = true;
          this.hideSaveLoadModal();
          this.hideGameMenu();
          this.hideMainMenu();
          this.scheduleFitMapToCommandLayout();
          this.hud.showToast('Game loaded!', 'success');
        } else {
          this.hud.showToast('Could not load save slot', 'error');
        }
      });
    });

    container.querySelectorAll('.btn-slot-rename').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = parseInt((btn as HTMLElement).dataset.slot || '1');
        const slot = this.saveManager.getSlots().find(s => s.id === slotId);
        if (!slot || slot.isEmpty) return;
        const newName = prompt('Rename save slot:', slot.name);
        if (newName === null) return;
        if (this.saveManager.renameSlot(slotId, newName)) {
          this.renderSaveSlots();
          this.hud.showToast('Save renamed', 'success');
        } else {
          this.hud.showToast('Rename failed', 'error');
        }
      });
    });

    container.querySelectorAll('.btn-slot-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slotId = parseInt((btn as HTMLElement).dataset.slot || '1');
        this.showConfirm('Delete Save?', 'This save slot will be permanently deleted.', () => {
          this.saveManager.deleteSlot(slotId);
          this.renderSaveSlots();
          this.hud.showToast('Save deleted', 'info');
        });
      });
    });
  }

  private escapeHTML(value: string): string {
    return value.replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char] ?? char));
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
    (document.getElementById('setting-music-volume') as HTMLInputElement).value = s.musicVolume.toString();
    (document.getElementById('setting-sfx-volume') as HTMLInputElement).value = s.sfxVolume.toString();
    (document.getElementById('setting-animations') as HTMLInputElement).checked = s.animationsEnabled;
    (document.getElementById('setting-territory-names') as HTMLInputElement).checked = s.showTerritoryNames;
    (document.getElementById('setting-battle-narratives') as HTMLInputElement).checked = s.battleNarratives ?? true;
    (document.getElementById('setting-commander-abilities') as HTMLInputElement).checked = s.commanderAbilities ?? true;
    (document.getElementById('setting-supply-lines') as HTMLInputElement).checked = s.supplyLinePenalties ?? true;
    (document.getElementById('setting-war-tension') as HTMLInputElement).checked = s.warTension ?? true;
    (document.getElementById('setting-faction-abilities') as HTMLInputElement).checked = s.factionAbilities ?? true;
    (document.getElementById('setting-mid-objectives') as HTMLInputElement).checked = s.midGameObjectives ?? true;
    (document.getElementById('setting-ai-taunts') as HTMLInputElement).checked = s.aiTaunts ?? true;
    (document.getElementById('setting-battle-animations') as HTMLInputElement).checked = s.battleAnimations ?? true;
    (document.getElementById('setting-tactical-battles') as HTMLInputElement).checked = s.tacticalBattles ?? true;
    (document.getElementById('setting-commander-progression') as HTMLInputElement).checked = s.commanderProgression ?? true;
    (document.getElementById('setting-dynamic-weather') as HTMLInputElement).checked = s.dynamicWeather ?? true;
    (document.getElementById('setting-fortifications') as HTMLInputElement).checked = s.fortifications ?? true;
    (document.getElementById('setting-theme') as HTMLSelectElement).value = s.theme ?? 'dark';

    // Sync fullscreen button label
    const fsBtn = document.getElementById('btn-toggle-fullscreen') as HTMLButtonElement | null;
    if (fsBtn) {
      const updateFsLabel = async () => {
        const isFull = await window.electronAPI?.isFullscreen?.() ?? document.fullscreenElement != null;
        fsBtn.textContent = isFull ? 'Exit Fullscreen' : 'Enter Fullscreen';
      };
      updateFsLabel();
    }
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
      gameSpeed: (document.getElementById('setting-game-speed') as HTMLSelectElement).value as 'slow' | 'normal' | 'fast',
      aiDifficulty: (document.getElementById('setting-ai-difficulty') as HTMLSelectElement).value as 'easy' | 'medium' | 'hard',
      aiPersonality: (document.getElementById('setting-ai-personality') as HTMLSelectElement).value,
      showMoveHighlights: (document.getElementById('setting-move-highlights') as HTMLInputElement).checked,
      confirmEndTurn: (document.getElementById('setting-confirm-end') as HTMLInputElement).checked,
      musicEnabled: (document.getElementById('setting-music-enabled') as HTMLInputElement).checked,
      sfxEnabled: (document.getElementById('setting-sfx-enabled') as HTMLInputElement).checked,
      masterVolume: parseInt((document.getElementById('setting-master-volume') as HTMLInputElement).value),
      musicVolume: parseInt((document.getElementById('setting-music-volume') as HTMLInputElement).value),
      sfxVolume: parseInt((document.getElementById('setting-sfx-volume') as HTMLInputElement).value),
      animationsEnabled: (document.getElementById('setting-animations') as HTMLInputElement).checked,
      showTerritoryNames: (document.getElementById('setting-territory-names') as HTMLInputElement).checked,
      battleNarratives: (document.getElementById('setting-battle-narratives') as HTMLInputElement).checked,
      commanderAbilities: (document.getElementById('setting-commander-abilities') as HTMLInputElement).checked,
      supplyLinePenalties: (document.getElementById('setting-supply-lines') as HTMLInputElement).checked,
      warTension: (document.getElementById('setting-war-tension') as HTMLInputElement).checked,
      factionAbilities: (document.getElementById('setting-faction-abilities') as HTMLInputElement).checked,
      midGameObjectives: (document.getElementById('setting-mid-objectives') as HTMLInputElement).checked,
      aiTaunts: (document.getElementById('setting-ai-taunts') as HTMLInputElement).checked,
      battleAnimations: (document.getElementById('setting-battle-animations') as HTMLInputElement).checked,
      tacticalBattles: (document.getElementById('setting-tactical-battles') as HTMLInputElement).checked,
      commanderProgression: (document.getElementById('setting-commander-progression') as HTMLInputElement).checked,
      dynamicWeather: (document.getElementById('setting-dynamic-weather') as HTMLInputElement).checked,
      fortifications: (document.getElementById('setting-fortifications') as HTMLInputElement).checked,
      theme: (document.getElementById('setting-theme') as HTMLSelectElement).value as 'dark' | 'light',
    });

    this.applyTheme(settings.getSetting('theme'));

    // Apply AI difficulty and personality
    this.aiController.setDifficulty(settings.getSetting('aiDifficulty'));
    this.aiController.setPersonality(settings.getSetting('aiPersonality') ?? 'default');

    this.hideSettings();
    this.hud.showToast('Settings saved!', 'success');
  }

  applyTheme(theme: 'dark' | 'light'): void {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /**
   * Setup menu button listeners
   */
  private setupMenuListeners(): void {
    const runMenuAction = (action: () => void): void => {
      try {
        action();
      } catch (error) {
        console.error('Main menu action failed:', error);
        this.hud?.showToast?.(
          error instanceof Error ? `Could not start: ${error.message}` : 'Could not start game',
          'error'
        );
      }
    };

    document.querySelectorAll<HTMLElement>('[data-menu-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.menuTab === 'resume' ? 'resume' : 'new';
        this.setMainMenuTab(target);
      });
    });

    // Theme toggle button in HUD
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      const current = settings.getSetting('theme') ?? 'dark';
      const next: 'dark' | 'light' = current === 'dark' ? 'light' : 'dark';
      settings.update({ theme: next });
      this.applyTheme(next);
    });

    // Quick Start - Classic Mode
    document.getElementById('btn-quick-classic')?.addEventListener('click', () => {
      runMenuAction(() => this.confirmLeaveGame(() => this.quickStart('classic')));
    });

    // Quick Start - Simple Mode
    document.getElementById('btn-quick-simple')?.addEventListener('click', () => {
      runMenuAction(() => this.confirmLeaveGame(() => this.quickStart('quick')));
    });

    document.querySelectorAll<HTMLElement>('.scenario-btn').forEach(button => {
      button.addEventListener('click', () => {
        const scenario = button.dataset.scenario ?? 'first-war';
        runMenuAction(() => this.confirmLeaveGame(() => this.startScenario(scenario)));
      });
    });

    // Custom Game Setup
    document.getElementById('btn-new-game')?.addEventListener('click', () => {
      runMenuAction(() => this.confirmLeaveGame(() => {
        this.hideMainMenu();
        this.hud.showNewGameModal();
      }));
    });

    // Listen for game started event from HUD
    this.hud.events.on('gameStarted', () => {
      this.startNewGame();
    });

    // Track victory winner for campaign debriefing + AI victory taunts
    this.state.on('victory', (e) => {
      const data = e.data as { winner: string };
      this.lastGameWinnerFaction = data.winner;
      if (settings.getSetting('aiTaunts')) {
        const winner = this.state.factionRegistry.get(data.winner);
        if (winner?.controlledBy === 'ai') {
          const taunt = getAITaunt(data.winner, 'victory');
          setTimeout(() => this.hud.showToast(`💬 ${taunt}`, 'info'), 2000);
        }
      }
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
      if (!this.saveManager.quickSave()) {
        this.hud.showToast('Quick save failed', 'error');
      }
    });

    // HUD keyboard shortcut events
    this.hud.events.on('quickSave', () => {
      this.quickSaveWithFeedback();
    });
    this.hud.events.on('quickLoad', () => {
      this.quickLoadWithFeedback();
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

    // Credits
    document.getElementById('btn-credits')?.addEventListener('click', () => {
      this.showCredits();
    });

    // In-game menu button
    document.getElementById('btn-menu')?.addEventListener('click', () => {
      this.showGameMenu();
    });

    // Game menu buttons
    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.hideGameMenu();
    });
    document.getElementById('btn-close-game-menu')?.addEventListener('click', () => {
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

    document.getElementById('btn-resign')?.addEventListener('click', () => {
      this.hideGameMenu();
      this.showConfirm(
        'Resign Game?',
        'You will be counted as defeated. The game will continue without you.',
        () => {
          const humanFaction = this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human');
          if (!humanFaction) return;
          humanFaction.defeat();
          this.state.emit('faction_defeated', { factionId: humanFaction.id, factionName: humanFaction.name });
          const winner = this.turnManager.checkVictory();
          if (winner) {
            this.state.emit('victory', { winner: winner.id });
          } else {
            // No winner yet — return to menu since human is out
            this.isGameStarted = false;
            this.showMainMenu();
          }
        }
      );
    });

    document.getElementById('btn-main-menu')?.addEventListener('click', () => {
      this.showConfirm(
        'Return to Main Menu?',
        'Unsaved progress will be lost.',
        () => {
          this.hideGameMenu();
          this.isGameStarted = false;
          this.showMainMenu();
        }
      );
    });

    // Confirm modal
    document.getElementById('confirm-cancel')?.addEventListener('click', () => {
      document.getElementById('confirm-modal')?.classList.add('hidden');
    });
    document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('confirm-modal'))
        document.getElementById('confirm-modal')?.classList.add('hidden');
    });

    // Save/load modal
    document.getElementById('btn-close-save-load')?.addEventListener('click', () => {
      this.hideSaveLoadModal();
    });

    document.getElementById('btn-export-save')?.addEventListener('click', () => {
      // Export the first non-empty slot, or slot 1 if all empty
      const slots = this.saveManager.getSlots();
      const target = slots.find(s => !s.isEmpty) ?? slots[0];
      if (this.saveManager.exportToFile(target.id)) {
        this.hud.showToast('Save export started', 'success');
      } else {
        this.hud.showToast('No save to export', 'info');
      }
    });

    document.getElementById('btn-import-save')?.addEventListener('click', async () => {
      // Import into the first empty slot, or slot 1 if all full
      const slots = this.saveManager.getSlots();
      const target = slots.find(s => s.isEmpty) ?? slots[0];
      const ok = await this.saveManager.importFromFile(target.id);
      if (ok) {
        this.renderSaveSlots();
        this.hud.showToast('Save imported!', 'success');
      } else {
        this.hud.showToast('Import failed — invalid save file', 'info');
      }
    });
  }

  /**
   * Show a styled confirmation dialog instead of the browser-native confirm().
   */
  showConfirm(title: string, message: string, onConfirm: () => void): void {
    const modal = document.getElementById('confirm-modal')!;
    const titleEl = document.getElementById('confirm-title')!;
    const msgEl = document.getElementById('confirm-message')!;
    const okBtn = document.getElementById('confirm-ok')!;

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.classList.remove('hidden');

    const handler = () => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', handler);
      onConfirm();
    };
    okBtn.removeEventListener('click', handler);
    okBtn.addEventListener('click', handler);
  }

  /**
   * Setup settings listeners
   */
  private setupSettingsListeners(): void {
    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      this.hideSettings();
    });

    document.getElementById('btn-reset-settings')?.addEventListener('click', () => {
      this.showConfirm('Reset Settings?', 'All settings will return to their defaults.', () => {
        settings.reset();
        this.showSettings();
        this.hud.showToast('Settings reset', 'info');
      });
    });

    document.getElementById('btn-reset-layout')?.addEventListener('click', () => {
      this.showConfirm('Reset Panel Layout?', 'All panels will return to their default positions.', () => {
        dragManager.resetLayoutInPlace();
        this.hud.showToast('Panel layout reset', 'success');
      });
    });

    document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', async () => {
      if (window.electronAPI?.toggleFullscreen) {
        await window.electronAPI.toggleFullscreen();
      } else {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
      }
      // Refresh label after toggle
      await new Promise(r => setTimeout(r, 100));
      const isFull = await window.electronAPI?.isFullscreen?.() ?? document.fullscreenElement != null;
      const btn = document.getElementById('btn-toggle-fullscreen') as HTMLButtonElement | null;
      if (btn) btn.textContent = isFull ? 'Exit Fullscreen' : 'Enter Fullscreen';
    });
  }

  private resetViewAndPanels(): void {
    dragManager.resetLayoutInPlace();
    this.scheduleFitMapToCommandLayout();
  }

  /** Same map framing as the in-game UI reset / zoom-fit (sidebars + action bar insets). */
  private scheduleFitMapToCommandLayout(): void {
    requestAnimationFrame(() => this.hud.fitMapToCommandLayout());
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

      // Escape - close open modal, or clear selection / toggle menu
      if (e.key === 'Escape') {
        const mainMenu = document.getElementById('main-menu-modal');
        const gameMenu = document.getElementById('game-menu-modal');
        const anyModal = document.querySelector<HTMLElement>('.modal:not(.hidden)');
        if (anyModal && anyModal !== mainMenu && anyModal !== gameMenu) {
          const closeBtn = anyModal.querySelector<HTMLElement>(
            '[id^="btn-close"], [id^="btn-cancel"], #btn-skip-tutorial',
          );
          if (closeBtn && !(closeBtn as HTMLButtonElement).disabled) {
            closeBtn.click();
          } else {
            anyModal.classList.add('hidden');
          }
          e.preventDefault();
          return;
        }

        if (this.isGameStarted) {
          if (this.state.selectedTerritoryId) {
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
        this.quickSaveWithFeedback();
      }

      // Ctrl+L - Quick load
      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault();
        this.quickLoadWithFeedback();
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

      // A - Resolve combat (during combat phase)
      if (e.key === 'a' && this.isGameStarted) {
        if (this.state.currentPhase === 'combat') {
          this.hud.resolveCombat();
        }
      }

      // H - Help/Tutorial
      if (e.key === 'h' && this.isGameStarted) {
        document.getElementById('help-button')?.click();
      }

      // F - Fit map to screen
      if (e.key === 'f' && this.isGameStarted) {
        this.resetViewAndPanels();
        this.hud.showToast('View and panels reset', 'info');
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

    sanitizeUnitPlacement(this.state);

    // Clean up expired event effects
    this.eventsSystem.cleanupExpiredEffects();
    
    // Human player's turn - just update UI and wait for input
    if (faction.controlledBy === 'human') {
      soundManager.play('your_turn');
      steamManager.setRichPresence('Playing', {
        turn: this.state.turnNumber.toString(),
        faction: faction.name,
      });

      // Show "YOUR TURN" banner only on real turn transitions, not on initial game load
      if (!this.hud.isFirstTurnLoad) {
        this.hud.showYourTurnBanner(faction.name, faction.colorLight ?? faction.color);
      } else {
        this.hud.isFirstTurnLoad = false;
      }

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
        const humanFactions = this.hud.gameConfig.humanFactions ?? [];
        const playerNum = humanFactions.indexOf(faction.id) + 1;
        await this.hud.showHotSeatBanner(faction.name, faction.color, playerNum);
      }

      // Update UI for human
      this.hud.updateTurnInfo();
      this.hud.updatePhaseInfo();
      this.renderer.render();
      this.updateCampaignObjectivesPanel();
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
      const affordableChoice = aiEvent.choices.find(c => !c.cost || c.cost <= faction.ipcs) ?? aiEvent.choices[0];
      if (affordableChoice) this.eventsSystem.applyEvent(aiEvent, faction.id, affordableChoice.id);
    }
    
    // Show AI indicator
    this.hud.showToast(`${faction.name} is playing (${this.describeAIDoctrine(this.hud.gameConfig.aiPersonality)} doctrine)...`, 'info');
    
    // Wait so player can see
    await new Promise(resolve => setTimeout(resolve, settings.getAIDelay()));
    
    const aiBefore = this.captureAISummary(faction.id);

    // Execute AI's full turn (all phases)
    await this.aiController.executeTurn();
    this.renderer.render();
    this.hud.renderMinimap();
    const aiSummary = this.describeAITurn(faction.id, aiBefore);
    if (aiSummary) {
      battleLog.addAI(this.state.turnNumber, faction.name, faction.color, aiSummary, 'Turn recap');
      this.hud.showToast(`${faction.name}: ${aiSummary}`, 'info');
      this.focusMostRelevantAITerritory(faction.id);
    }
    
    // Spectator mode - pause to let player review AI moves
    if (turnStyle === 'spectator') {
      await this.hud.showSpectatorContinue(faction.name, faction.color);
    }
    
    // Small delay before next faction
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  private captureAISummary(factionId: string): { territories: number; units: number; ipcs: number; capitals: number } {
    const faction = this.state.factionRegistry.get(factionId);
    const territories = Array.from(this.state.territories.values()).filter(t => t.owner === factionId);
    return {
      territories: territories.length,
      units: territories.reduce((sum, territory) => sum + territory.getTotalUnitCount(), 0),
      ipcs: faction?.ipcs ?? 0,
      capitals: territories.filter(t => t.isCapital).length,
    };
  }

  private focusMostRelevantAITerritory(factionId: string): void {
    const candidate = Array.from(this.state.territories.values())
      .filter(t => t.owner === factionId)
      .sort((a, b) => {
        const aScore = (a.isCapital ? 10 : 0) + (a.hasFactory ? 8 : 0) + a.production + a.getTotalUnitCount();
        const bScore = (b.isCapital ? 10 : 0) + (b.hasFactory ? 8 : 0) + b.production + b.getTotalUnitCount();
        return bScore - aScore;
      })[0];
    if (!candidate) return;
    this.renderer.centerOnTerritory(candidate.id);
    this.renderer.setAIPulseTerritory(candidate.id);
  }

  private describeAITurn(factionId: string, before: { territories: number; units: number; ipcs: number; capitals: number }): string {
    const after = this.captureAISummary(factionId);
    const territoryDelta = after.territories - before.territories;
    const unitDelta = after.units - before.units;
    const ipcDelta = after.ipcs - before.ipcs;
    const parts: string[] = [];
    if (territoryDelta > 0) parts.push(`captured ${territoryDelta} territor${territoryDelta === 1 ? 'y' : 'ies'}`);
    if (territoryDelta < 0) parts.push(`lost ${Math.abs(territoryDelta)} territor${territoryDelta === -1 ? 'y' : 'ies'}`);
    if (unitDelta > 0) parts.push(`added ${unitDelta} units`);
    if (unitDelta < 0) parts.push(`lost ${Math.abs(unitDelta)} units`);
    if (ipcDelta > 0) parts.push(`banked +${ipcDelta} IPC`);
    if (ipcDelta < 0) parts.push(`spent ${Math.abs(ipcDelta)} IPC`);
    if (after.capitals > before.capitals) parts.unshift('captured a capital');
    return parts.length > 0 ? parts.slice(0, 3).join(', ') : 'held position and reorganized';
  }

  private describeAIDoctrine(personality?: string): string {
    switch (personality) {
      case 'aggressive': return 'aggressive';
      case 'defensive': return 'defensive';
      case 'economic': return 'economic';
      case 'balanced': return 'balanced';
      default: return 'standard';
    }
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
      if (this.saveManager.autoSave()) {
        this.flashSaveIndicator();
      } else {
        this.hud.showToast('Autosave failed', 'error');
      }
    }
  }

  private flashSaveIndicator(): void {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    const savedAt = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    el.textContent = `Saved ${savedAt}`;
    el.setAttribute('title', `Last saved at ${savedAt}`);
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

    // Auto-save and stop cloud sync cleanly when the page/app unloads
    window.addEventListener('beforeunload', () => {
      if (this.isGameStarted) this.saveManager.autoSave();
      cloudSaveManager.stopAutoSync();
    });
  }

  /**
   * Wire native OS menu items exposed by the Electron preload.
   * Each handler mirrors the equivalent keyboard shortcut / button action.
   */
  private setupElectronMenuListeners(): void {
    const api = window.electronAPI;
    if (!api) return;

    api.onMenuNewGame?.(() => {
      if (this.isGameStarted) {
        this.showConfirm('Start New Game?', 'Unsaved progress will be lost.', () => {
          this.isGameStarted = false;
          this.showMainMenu();
        });
      } else {
        this.showMainMenu();
      }
    });

    api.onMenuSaveGame?.(() => {
      this.quickSaveWithFeedback();
    });

    api.onMenuLoadGame?.(() => {
      this.quickLoadWithFeedback();
    });

    api.onMenuSettings?.(() => this.showSettings());

    api.onMenuHelp?.(() => this.hud.showTutorial());

    api.onMenuZoomIn?.(() => this.renderer.zoom(1.2));
    api.onMenuZoomOut?.(() => this.renderer.zoom(0.8));
    api.onMenuZoomReset?.(() => {
      this.resetViewAndPanels();
      this.hud.showToast('View and panels reset', 'info');
    });
  }

  /**
   * Refresh the campaign mission objectives sidebar panel.
   * Shown only when an active campaign mission is in progress.
   */
  private updateCampaignObjectivesPanel(): void {
    const panel = document.getElementById('campaign-objectives-panel');
    const listEl = document.getElementById('campaign-objectives-list');
    const nameEl = document.getElementById('campaign-mission-name');
    if (!panel || !listEl || !nameEl) return;

    if (!this.activeCampaignId || !this.activeMission) {
      panel.classList.add('hidden');
      return;
    }

    const humanFactionId = this.hud.gameConfig.humanFactions?.[0] ?? '';
    const gameState = {
      turnNumber: this.state.turnNumber,
      territoriesOwnedBy: (fId: string) =>
        Array.from(this.state.territories.values())
          .filter(t => t.owner === fId)
          .map(t => ({ id: t.id, name: t.name })),
      totalUnitsKilled: 0,
      totalUnitsProduced: 0,
    };

    const results = campaignManager.checkObjectives(this.activeMission, gameState, humanFactionId);

    nameEl.textContent = this.activeMission.name;
    listEl.innerHTML = results.map(r => {
      const icon = r.met ? '✅' : '⬜';
      return `<div style="display:flex;gap:6px;align-items:flex-start;">
        <span style="flex-shrink:0;">${icon}</span>
        <span style="${r.met ? 'color:#4ade80;' : ''}">${r.objective.description} <span style="color:#5b9bd5;">(${r.progress})</span></span>
      </div>`;
    }).join('');

    panel.classList.remove('hidden');
    document.getElementById('objectives-panel')?.classList.add('hidden');
  }

  /**
   * Check for victory at end of turn
   */
  private checkVictory(): void {
    if (this.isGameStarted) {
      this.hud.checkVictoryConditions();
    }
  }

  /**
   * Show the commander trait selection modal when a player commander levels up.
   * Blocks until the player picks a trait (no dismiss without choosing).
   */
  private showCommanderTraitModal(commander: Commander, choices: CommanderTraitId[], newLevel: number): void {
    if (!settings.getSetting('commanderAbilities')) return;
    const modal = document.getElementById('commander-levelup-modal');
    const title = document.getElementById('commander-levelup-title');
    const subtitle = document.getElementById('commander-levelup-subtitle');
    const container = document.getElementById('commander-trait-choices');
    if (!modal || !title || !subtitle || !container) return;

    title.textContent = `${commander.name} Promoted to Level ${newLevel}!`;
    subtitle.textContent = `"${commander.name}" gains a new combat trait`;
    container.innerHTML = '';

    for (const traitId of choices) {
      const trait = ALL_TRAITS[traitId];
      if (!trait) continue;
      const btn = document.createElement('button');
      btn.className = 'primary';
      btn.style.cssText = 'text-align:left;padding:0.75rem 1rem;line-height:1.4;';
      btn.innerHTML = `<strong>${trait.name}</strong><br><span style="font-size:0.8rem;color:#94a3b8;">${trait.description}</span>`;
      btn.addEventListener('click', () => {
        selectTrait(commander, traitId);
        modal.classList.add('hidden');
        this.hud.showToast(`${commander.name} learned: ${trait.name}`, 'success');
      });
      container.appendChild(btn);
    }

    modal.classList.remove('hidden');
  }
}

bootstrapGame(() => new Game());
