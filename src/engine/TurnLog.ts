/**
 * TurnLog - Records turn/phase summaries for replay and recap
 */

export interface TurnLogEntry {
  turn: number;
  phase: string;
  factionId: string;
  summary: string;
  timestamp: number;
}

export class TurnLog {
  private entries: TurnLogEntry[] = [];
  private maxEntries = 500;

  log(turn: number, phase: string, factionId: string, summary: string): void {
    this.entries.push({
      turn,
      phase,
      factionId,
      summary,
      timestamp: Date.now(),
    });
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getEntries(): TurnLogEntry[] {
    return [...this.entries];
  }

  getEntriesForTurn(turn: number): TurnLogEntry[] {
    return this.entries.filter(e => e.turn === turn);
  }

  clear(): void {
    this.entries = [];
  }

  /** Export as text for replay/share */
  exportText(): string {
    return this.entries
      .map(e => `Turn ${e.turn} | ${e.phase} | ${e.factionId}: ${e.summary}`)
      .join('\n');
  }
}

export const turnLog = new TurnLog();