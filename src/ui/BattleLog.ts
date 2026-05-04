/**
 * BattleLog - Unified event feed. Absorbs toasts (non-error) and AI activity.
 */

export type LogEntryType = 'combat' | 'move' | 'build' | 'income' | 'capture' | 'general' | 'ai' | 'alert';

export interface LogEntry {
  id: number;
  turn: number;
  phase: string;
  faction: string;
  factionColor: string;
  type: LogEntryType;
  message: string;
  timestamp: number;
  territoryId?: string;
}

export class BattleLog {
  private entries: LogEntry[] = [];
  private nextId: number = 1;
  private isCollapsed: boolean = true;
  private maxEntries: number = 150;
  private filterText: string = '';
  private filterType: LogEntryType | 'all' = 'all';
  private pendingFlashId: number | null = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (typeof document === 'undefined') return;
    document.getElementById('battle-log-header')?.addEventListener('click', () => this.toggle());
    document.getElementById('btn-toggle-log')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    document.getElementById('btn-clear-log')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clear();
    });
    document.getElementById('blog-filter-text')?.addEventListener('input', (e) => {
      this.filterText = (e.target as HTMLInputElement).value.toLowerCase();
      this.render();
    });
    document.getElementById('blog-filter-type')?.addEventListener('change', (e) => {
      this.filterType = (e.target as HTMLSelectElement).value as LogEntryType | 'all';
      this.render();
    });
  }

  toggle(): void {
    this.isCollapsed = !this.isCollapsed;
    this.applyCollapsedState();
  }

  setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    this.applyCollapsedState();
  }

  private applyCollapsedState(): void {
    const panel = document.getElementById('battle-log-panel');
    document.body.classList.toggle('battle-log-open', !this.isCollapsed);
    if (panel) {
      panel.classList.toggle('collapsed', this.isCollapsed);
      // Only apply floating position when NOT inside the HQ sidebar
      if (!this.isCollapsed && !panel.closest('#hq-panel')) {
        panel.style.top = 'auto';
        panel.style.bottom = '0px';
      }
    }
  }

  add(
    turn: number,
    phase: string,
    faction: string,
    factionColor: string,
    type: LogEntryType,
    message: string,
    territoryId?: string
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
      territoryId,
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) this.entries.pop();
    this.pendingFlashId = entry.id;
    this.render();
  }

  /** Route a toast-style notification into the log (non-error toasts) */
  notify(turn: number, message: string): void {
    this.add(turn, '', '', '#94a3b8', 'alert', message);
  }

  /** Route an AI activity entry into the log */
  addAI(turn: number, factionName: string, factionColor: string, message: string, actionLabel?: string): void {
    const msg = actionLabel ? `${message} · ${actionLabel}` : message;
    this.add(turn, 'AI', factionName, factionColor, 'ai', msg);
  }

  logCombat(turn: number, faction: string, color: string, message: string, territoryId?: string): void {
    this.add(turn, 'Combat', faction, color, 'combat', message, territoryId);
  }

  logMove(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Move', faction, color, 'move', message);
  }

  logBuild(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Production', faction, color, 'build', message);
  }

  logIncome(turn: number, faction: string, color: string, message: string | number): void {
    this.add(turn, 'Income', faction, color, 'income', String(message));
  }

  logCapture(turn: number, faction: string, color: string, message: string, territoryId?: string): void {
    this.add(turn, 'Capture', faction, color, 'capture', message, territoryId);
  }

  log(turn: number, faction: string, color: string, message: string): void {
    this.add(turn, 'Event', faction, color, 'general', message);
  }

  clear(): void {
    this.entries = [];
    this.render();
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  private render(): void {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('battle-log-entries');
    if (!container) return;

    const icons: Record<LogEntryType, string> = {
      combat: '⚔️',
      move: '➡️',
      build: '🏭',
      income: '💰',
      capture: '🚩',
      general: '📋',
      ai: '🤖',
      alert: '⚡',
    };

    const visible = this.entries.filter(e => {
      if (this.filterType !== 'all' && e.type !== this.filterType) return false;
      if (this.filterText) {
        const haystack = `${e.faction} ${e.message}`.toLowerCase();
        if (!haystack.includes(this.filterText)) return false;
      }
      return true;
    });

    if (visible.length === 0) {
      container.innerHTML = '<div style="color:#4b5563;font-size:0.8rem;padding:8px;text-align:center;">No entries match filter</div>';
      return;
    }

    container.innerHTML = visible.map(entry => {
      const linked = entry.territoryId
        ? ` data-territory-id="${entry.territoryId}" class="log-entry log-type-${entry.type} log-linked" title="Click to focus on map"`
        : ` class="log-entry log-type-${entry.type}"`;
      const factionHtml = entry.faction
        ? `<span class="log-faction" style="color:${entry.factionColor}">${entry.faction}</span>`
        : '';
      const turnHtml = entry.turn > 0
        ? `<span class="log-turn">T${entry.turn}</span>`
        : '';
      return `<div${linked} data-entry-id="${entry.id}">
        <span class="log-icon">${icons[entry.type]}</span>
        ${factionHtml}
        <span class="log-message">${entry.message}</span>
        ${turnHtml}
      </div>`;
    }).join('');

    // Flash the newest entry briefly
    if (this.pendingFlashId !== null) {
      const flashId = this.pendingFlashId;
      this.pendingFlashId = null;
      requestAnimationFrame(() => {
        const el = container.querySelector<HTMLElement>(`[data-entry-id="${flashId}"]`);
        if (!el) return;
        el.classList.add('log-new');
        setTimeout(() => el.classList.remove('log-new'), 2500);
      });
    }

    // Click delegation: focus map on linked territory
    container.onclick = (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-territory-id]');
      if (!row) return;
      const tid = row.dataset.territoryId;
      if (tid) document.dispatchEvent(new CustomEvent('battlelog:focus-territory', { detail: { territoryId: tid } }));
    };
  }
}

export const battleLog = new BattleLog();
