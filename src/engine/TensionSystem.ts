/**
 * TensionSystem - Global war tension that escalates over time
 *
 * Tension rises with battles and captures and decays slowly each round.
 * Higher tension unlocks more dramatic strategic events and warnings.
 *
 * Level 1 (0–24):  Skirmishes — normal gameplay, routine events
 * Level 2 (25–49): Escalation — supply disruptions, heavier morale hits
 * Level 3 (50–74): Total War — atrocities, mass desertions, foreign pressure
 * Level 4 (75–100): Crisis — surrender ultimatums, nuclear brinkmanship
 */

import { GameState } from './GameState';

export type TensionLevel = 1 | 2 | 3 | 4;

const LEVEL_THRESHOLDS: [number, TensionLevel][] = [
  [75, 4],
  [50, 3],
  [25, 2],
  [0,  1],
];

export const TENSION_LEVEL_NAMES: Record<TensionLevel, string> = {
  1: 'Skirmish',
  2: 'Escalation',
  3: 'Total War',
  4: 'Crisis',
};

export const TENSION_LEVEL_COLORS: Record<TensionLevel, string> = {
  1: '#22c55e',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#a855f7',
};

const STORAGE_KEY = 'grand_strategy_tension';

export class TensionSystem {
  private tension: number;
  private listeners: Array<(tension: number, level: TensionLevel) => void> = [];

  constructor(private state: GameState) {
    this.tension = this.load();
  }

  // ── Mutation ──────────────────────────────────────────────────────────────

  recordBattle(totalCasualties: number): void {
    const gain = Math.min(8, 1 + Math.floor(totalCasualties / 3));
    this.set(this.tension + gain);
  }

  recordCapture(isCapital: boolean): void {
    this.set(this.tension + (isCapital ? 12 : 4));
  }

  recordNuclearStrike(): void {
    this.set(Math.min(100, this.tension + 25));
  }

  /** Called each full round — tension decays toward 0 slowly */
  tick(): void {
    const decay = this.getLevel() <= 2 ? 3 : 1;
    this.set(Math.max(0, this.tension - decay));
  }

  reset(): void {
    this.set(0);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  getTension(): number { return this.tension; }

  getLevel(): TensionLevel {
    for (const [threshold, level] of LEVEL_THRESHOLDS) {
      if (this.tension >= threshold) return level;
    }
    return 1;
  }

  getLevelName(): string { return TENSION_LEVEL_NAMES[this.getLevel()]; }
  getLevelColor(): string { return TENSION_LEVEL_COLORS[this.getLevel()]; }

  /** Weight multiplier for strategic event rolls at this tension */
  getEventWeightMultiplier(): number {
    switch (this.getLevel()) {
      case 2: return 1.5;
      case 3: return 2.5;
      case 4: return 4.0;
      default: return 1.0;
    }
  }

  /** Fraction 0–1 for a progress bar */
  getProgress(): number { return this.tension / 100; }

  // ── Listeners ─────────────────────────────────────────────────────────────

  onChange(cb: (tension: number, level: TensionLevel) => void): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private set(value: number): void {
    const prev = this.getLevel();
    this.tension = Math.min(100, Math.max(0, value));
    const next = this.getLevel();
    this.save();
    for (const cb of this.listeners) cb(this.tension, next);

    if (next !== prev) {
      this.state.emit('game_event', {
        type: 'tension_level_change',
        level: next,
        levelName: TENSION_LEVEL_NAMES[next],
        color: TENSION_LEVEL_COLORS[next],
        message: this.getLevelChangeMessage(prev, next),
      });
    }
  }

  private getLevelChangeMessage(from: TensionLevel, to: TensionLevel): string {
    if (to > from) {
      const messages: Record<TensionLevel, string> = {
        1: '',
        2: 'War is escalating. Supply lines are under pressure.',
        3: 'Total war has begun. Civilians flee, morale crumbles.',
        4: 'The world stands on the brink. Every move could be decisive.',
      };
      return messages[to];
    }
    return `Tensions ease. The war settles into ${TENSION_LEVEL_NAMES[to]}.`;
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, String(this.tension)); } catch {}
  }

  private load(): number {
    try {
      const v = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
      return isNaN(v) ? 0 : Math.min(100, Math.max(0, v));
    } catch { return 0; }
  }
}
