/**
 * BattleLog - Manages the battle log panel
 */

export type LogEntryType = 'combat' | 'move' | 'build' | 'income' | 'capture' | 'general';

export interface LogEntry {
  id: number;
  turn: number;
  phase: string;
  faction: string;
  factionColor: string;
  type: LogEntryType;
  message: string;
  timestamp: number;
}

export class BattleLog {
  private entries: LogEntry[] = [];
  private nextId: number = 1;
  private isCollapsed: boolean = false;
  private maxEntries: number = 100;

  constructor() {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    document.getElementById('battle-log-header')?.addEventListener('click', () => this.toggle());
    document.getElementById('btn-toggle-log')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
  }

  /**
   * Toggle panel collapsed state
   */
  toggle(): void {
    this.isCollapsed = !this.isCollapsed;
    const panel = document.getElementById('battle-log-panel');
    if (panel) {
      panel.classList.toggle('collapsed', this.isCollapsed);
    }
  }

  /**
   * Add a log entry
   */
  add(
    turn: number,
    phase: string,
    faction: string,
    factionColor: string,
    type: LogEntryType,
    message: string
  ): void {
    const entry: LogEntry = {
      id: this.nextId++,
      turn,
      phase,
      faction,
      factionColor,
      type,
      message,
      timestamp: Date.now(),
    };

    this.entries.unshift(entry); // Add to beginning

    // Limit entries
    if (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }

    this.render();
  }

  /**
   * Log a combat event
   */
  logCombat(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Combat', faction, color, 'combat', message);
  }

  /**
   * Log a move event
   */
  logMove(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Move', faction, color, 'move', message);
  }

  /**
   * Log a build event
   */
  logBuild(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Production', faction, color, 'build', message);  }

  /**
   * Log an income event
   */
  logIncome(turn: number, faction: string, color: string, message: string | number): void {
    this.add(turn, 'Income', faction, color, 'income', String(message));
  }

  /**
   * Log a capture event
   */
  logCapture(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Capture', faction, color, 'capture', message);
  }

  /**
   * Log a general event
   */
  log(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Event', faction, color, 'general', message);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.render();
  }

  /**
   * Get all entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Render the log entries to the DOM
   */
  private render(): void {
    const container = document.getElementById('battle-log-entries');
    if (!container) return;

    const icons: Record<LogEntryType, string> = {
      combat: '⚔️',
      move: '➡️',
      build: '🏭',
      income: '💰',
      capture: '🚩',
      general: '📋',
    };

    container.innerHTML = this.entries.map(entry => `
      <div class="log-entry log-type-${entry.type}">
        <span class="log-icon">${icons[entry.type]}</span>
        <span class="log-faction" style="color:${entry.factionColor}">${entry.faction}</span>
        <span class="log-message">${entry.message}</span>
        <span class="log-turn">T${entry.turn}</span>
      </div>
    `).join('');
  }
}

export const battleLog = new BattleLog();
