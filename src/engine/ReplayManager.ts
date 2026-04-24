/**
 * ReplayManager - Records and plays back game sessions
 * Allows players to review completed games turn-by-turn.
 */

export interface ReplayAction {
  turn: number;
  phase: string;
  factionId: string;
  timestamp: number;
  action: {
    type: 'move' | 'attack' | 'produce' | 'research' | 'phase_end' | 'combat_result';
    data: any;
  };
}

export interface ReplayMetadata {
  id: string;
  name: string;
  mapId: string;
  factions: string[];
  winner?: string;
  turns: number;
  duration: number;
  createdAt: number;
  actionCount: number;
}

export interface Replay {
  metadata: ReplayMetadata;
  initialState: string; // JSON snapshot
  actions: ReplayAction[];
}

type StepListener = (action: ReplayAction, index: number, total: number) => void;
type EndListener  = () => void;

export class ReplayManager {
  // ── Recording ───────────────────────────────────────────────────────────

  private currentReplay: Replay | null = null;
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private storageKey = 'grand_strategy_replays';
  private maxStoredReplays = 10;

  // ── Playback ────────────────────────────────────────────────────────────

  private playbackReplay: Replay | null = null;
  private playbackIndex: number = 0;         // next action index to apply
  private playbackRunning: boolean = false;
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;
  private playbackSpeedMs: number = 800;     // ms between auto-steps

  private stepListeners: StepListener[] = [];
  private endListeners: EndListener[] = [];

  // ── Recording API ───────────────────────────────────────────────────────

  /**
   * Start recording a new game
   */
  startRecording(gameState: string, mapId: string, factions: string[]): void {
    this.currentReplay = {
      metadata: {
        id: `replay_${Date.now()}`,
        name: `Game ${new Date().toLocaleDateString()}`,
        mapId,
        factions,
        turns: 1,
        duration: 0,
        createdAt: Date.now(),
        actionCount: 0,
      },
      initialState: gameState,
      actions: [],
    };
    this.isRecording = true;
    this.recordingStartTime = Date.now();
  }

  /**
   * Record an action during an ongoing game.
   */
  recordAction(
    turn: number,
    phase: string,
    factionId: string,
    actionType: ReplayAction['action']['type'],
    data: any
  ): void {
    if (!this.isRecording || !this.currentReplay) return;

    this.currentReplay.actions.push({
      turn,
      phase,
      factionId,
      timestamp: Date.now() - this.recordingStartTime,
      action: { type: actionType, data },
    });
    this.currentReplay.metadata.actionCount++;
    this.currentReplay.metadata.turns = turn;
  }

  /**
   * Stop recording and persist the replay.
   */
  stopRecording(winner?: string): Replay | null {
    if (!this.isRecording || !this.currentReplay) return null;

    this.isRecording = false;
    this.currentReplay.metadata.duration = Date.now() - this.recordingStartTime;
    this.currentReplay.metadata.winner = winner;

    this.saveReplay(this.currentReplay);
    const replay = this.currentReplay;
    this.currentReplay = null;
    return replay;
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  // ── Storage ─────────────────────────────────────────────────────────────

  private saveReplay(replay: Replay): void {
    try {
      const replays = this.getStoredReplays();
      replays.unshift(replay);
      if (replays.length > this.maxStoredReplays) replays.splice(this.maxStoredReplays);
      localStorage.setItem(this.storageKey, JSON.stringify(replays));
    } catch (e) {
      console.error('Failed to save replay:', e);
    }
  }

  getStoredReplays(): Replay[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  loadReplay(id: string): Replay | null {
    return this.getStoredReplays().find(r => r.metadata.id === id) ?? null;
  }

  deleteReplay(id: string): void {
    const replays = this.getStoredReplays().filter(r => r.metadata.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(replays));
  }

  // ── Playback API ────────────────────────────────────────────────────────

  /**
   * Load a replay into the playback engine and reset to the beginning.
   */
  startPlayback(replay: Replay): void {
    this.stopPlayback();
    this.playbackReplay = replay;
    this.playbackIndex = 0;
    this.playbackRunning = false;
  }

  /** Stop and unload the current playback. */
  stopPlayback(): void {
    this.pausePlayback();
    this.playbackReplay = null;
    this.playbackIndex = 0;
  }

  /**
   * Begin auto-stepping through actions at `speedMs` ms per step.
   * Fires `onStep` callbacks for each action.
   */
  play(speedMs: number = this.playbackSpeedMs): void {
    if (!this.playbackReplay || this.playbackRunning) return;
    this.playbackSpeedMs = speedMs;
    this.playbackRunning = true;
    this.scheduleNextStep();
  }

  /** Pause auto-playback. */
  pausePlayback(): void {
    this.playbackRunning = false;
    if (this.playbackTimer !== null) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  /** Advance one step forward and fire step listeners. Returns the action or null at end. */
  stepForward(): ReplayAction | null {
    if (!this.playbackReplay) return null;
    if (this.playbackIndex >= this.playbackReplay.actions.length) {
      this.fireEndListeners();
      return null;
    }
    const action = this.playbackReplay.actions[this.playbackIndex];
    this.playbackIndex++;
    this.fireStepListeners(action);
    if (this.playbackIndex >= this.playbackReplay.actions.length) {
      this.playbackRunning = false;
      this.fireEndListeners();
    }
    return action;
  }

  /**
   * Step one action back.
   * Returns true if a step back occurred.
   * Note: callers are responsible for re-applying state from `initialState` and
   * replaying actions[0..playbackIndex-1] to restore the correct game state.
   */
  stepBack(): boolean {
    if (!this.playbackReplay || this.playbackIndex === 0) return false;
    this.playbackIndex--;
    return true;
  }

  /** Jump directly to a specific action index (0 = before first action). */
  seekTo(index: number): void {
    if (!this.playbackReplay) return;
    this.playbackIndex = Math.max(0, Math.min(index, this.playbackReplay.actions.length));
  }

  /** Get all actions up to (but not including) the current index — for re-applying state. */
  getActionsToCurrentStep(): ReplayAction[] {
    if (!this.playbackReplay) return [];
    return this.playbackReplay.actions.slice(0, this.playbackIndex);
  }

  /** Current step index (0 = before any actions have been applied). */
  getCurrentStep(): number { return this.playbackIndex; }

  /** Total number of actions in the loaded replay. */
  getTotalSteps(): number { return this.playbackReplay?.actions.length ?? 0; }

  /** Whether auto-play is running. */
  isPlaying(): boolean { return this.playbackRunning; }

  /** Whether a replay is loaded for playback. */
  hasPlayback(): boolean { return this.playbackReplay !== null; }

  /** Return the loaded replay metadata, or null if none loaded. */
  getPlaybackMetadata(): ReplayMetadata | null {
    return this.playbackReplay?.metadata ?? null;
  }

  // ── Listeners ───────────────────────────────────────────────────────────

  /** Subscribe to step events (fired for each action as it is applied). */
  onStep(listener: StepListener): () => void {
    this.stepListeners.push(listener);
    return () => { this.stepListeners = this.stepListeners.filter(l => l !== listener); };
  }

  /** Subscribe to playback-end events. */
  onPlaybackEnd(listener: EndListener): () => void {
    this.endListeners.push(listener);
    return () => { this.endListeners = this.endListeners.filter(l => l !== listener); };
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  private scheduleNextStep(): void {
    if (!this.playbackRunning) return;
    this.playbackTimer = setTimeout(() => {
      const action = this.stepForward();
      if (action && this.playbackRunning) {
        this.scheduleNextStep();
      }
    }, this.playbackSpeedMs);
  }

  private fireStepListeners(action: ReplayAction): void {
    const total = this.playbackReplay?.actions.length ?? 0;
    for (const l of this.stepListeners) {
      try { l(action, this.playbackIndex - 1, total); } catch (e) { console.error(e); }
    }
  }

  private fireEndListeners(): void {
    for (const l of this.endListeners) {
      try { l(); } catch (e) { console.error(e); }
    }
  }
}

export const replayManager = new ReplayManager();
