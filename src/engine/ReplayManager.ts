/**
 * ReplayManager - Records and plays back game sessions
 * Allows players to review completed games
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

export class ReplayManager {
  private currentReplay: Replay | null = null;
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private storageKey = 'grand_strategy_replays';
  private maxStoredReplays = 10;
  
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
   * Record an action
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
      timestamp: Date.now() - this.recordingStartTime,      action: {
        type: actionType,
        data,
      },
    });
    this.currentReplay.metadata.actionCount++;
    this.currentReplay.metadata.turns = turn;
  }

  /**
   * Stop recording and save
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

  /**
   * Save replay to localStorage
   */
  private saveReplay(replay: Replay): void {
    try {
      const replays = this.getStoredReplays();
      replays.unshift(replay);
      if (replays.length > this.maxStoredReplays) {
        replays.splice(this.maxStoredReplays);
      }
      localStorage.setItem(this.storageKey, JSON.stringify(replays));
    } catch (e) {
      console.error('Failed to save replay:', e);
    }
  }

  /**
   * Get all stored replays
   */
  getStoredReplays(): Replay[] {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Delete a replay by id
   */
  deleteReplay(id: string): void {
    const replays = this.getStoredReplays().filter(r => r.metadata.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(replays));
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}

export const replayManager = new ReplayManager();
