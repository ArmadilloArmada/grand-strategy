/**
 * DebugPanel - In-game developer debug overlay
 *
 * Toggle with:  Ctrl + Shift + D  (keyboard)
 *              or set  localStorage.debugMode = 'true'
 *
 * Features:
 *   - Live game state snapshot (turn, phase, faction, IPCs, territories)
 *   - Quick-action buttons (add IPCs, end phase, skip to phase)
 *   - Recent game event log (last 20 events)
 *   - Unit injector: spawn units into the selected territory
 *   - FPS counter
 */

import { GameState } from '../engine/GameState';
import { TurnManager } from '../engine/TurnManager';

interface AIDebugPlanView {
  targetName: string;
  expectedSuccess: number;
  strategicValue: number;
  minSuccess: number;
  attackPower: number;
  defenseStrength: number;
  attackers: { fromName: string; unitTypeId: string; count: number }[];
  status: 'chosen' | 'rejected';
  reason: string;
}

interface AIDebugView {
  factionName: string;
  personality: string;
  phase: string;
  plans: AIDebugPlanView[];
  chosenCount: number;
}

export class DebugPanel {
  private panel: HTMLElement;
  private visible: boolean = false;
  private eventLog: { type: string; time: string; data: string }[] = [];
  private aiDebug: AIDebugView | null = null;
  private frameCount: number = 0;
  private fps: number = 0;
  private lastFpsTime: number = performance.now();
  private rafId: number | null = null;

  constructor(private state: GameState, private turnManager: TurnManager) {
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);
    this.setupKeyListener();
    this.subscribeToGameEvents();
    this.startFpsCounter();

    // Auto-show if localStorage flag is set
    if (localStorage.getItem('debugMode') === 'true') {
      this.show();
    }
  }

  // ── Panel DOM ──────────────────────────────────────────────────────────────

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'debug-panel';
    panel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 340px;
      max-height: 90vh;
      overflow-y: auto;
      background: rgba(0,0,0,0.92);
      color: #00ff88;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 12px;
      border: 1px solid #00ff88;
      border-radius: 4px;
      z-index: 99999;
      display: none;
      box-shadow: 0 0 20px rgba(0,255,136,0.3);
    `;
    panel.innerHTML = this.buildHTML();
    this.attachPanelHandlers(panel);
    return panel;
  }

  private buildHTML(): string {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #00ff8844;padding-bottom:6px">
        <span style="font-weight:bold;font-size:14px">⚙ DEBUG PANEL</span>
        <span id="dbg-fps" style="color:#aaa">-- fps</span>
        <button id="dbg-close" style="background:none;border:1px solid #888;color:#aaa;cursor:pointer;padding:2px 8px;border-radius:2px">×</button>
      </div>

      <!-- State snapshot -->
      <div style="margin-bottom:10px">
        <div style="color:#ffcc00;margin-bottom:4px;font-size:11px;text-transform:uppercase">Game State</div>
        <div id="dbg-state" style="line-height:1.6"></div>
      </div>

      <!-- Factions -->
      <div style="margin-bottom:10px">
        <div style="color:#ffcc00;margin-bottom:4px;font-size:11px;text-transform:uppercase">Factions</div>
        <div id="dbg-factions" style="line-height:1.6"></div>
      </div>

      <!-- Quick actions -->
      <div style="margin-bottom:10px">
        <div style="color:#ffcc00;margin-bottom:4px;font-size:11px;text-transform:uppercase">Quick Actions</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          <button class="dbg-btn" id="dbg-add-ipc">+50 IPC</button>
          <button class="dbg-btn" id="dbg-end-phase">End Phase</button>
          <button class="dbg-btn" id="dbg-end-turn">End Turn</button>
          <button class="dbg-btn" id="dbg-capture-selected">Capture Selected</button>
          <button class="dbg-btn" id="dbg-win">Trigger Victory</button>
          <button class="dbg-btn" id="dbg-clear-log">Clear Log</button>
        </div>
      </div>

      <!-- Unit injector -->
      <div style="margin-bottom:10px">
        <div style="color:#ffcc00;margin-bottom:4px;font-size:11px;text-transform:uppercase">Inject Units (selected territory)</div>
        <div style="display:flex;gap:4px;align-items:center">
          <select id="dbg-unit-select" style="background:#111;color:#0f0;border:1px solid #0f0;padding:2px;font-size:11px;flex:1"></select>
          <input id="dbg-unit-count" type="number" value="3" min="1" max="99" style="width:48px;background:#111;color:#0f0;border:1px solid #0f0;padding:2px;font-size:11px">
          <button class="dbg-btn" id="dbg-inject">Inject</button>
        </div>
      </div>

      <!-- AI tuning -->
      <div style="margin-bottom:10px">
        <div style="color:#ffcc00;margin-bottom:4px;font-size:11px;text-transform:uppercase">AI Decisions</div>
        <div id="dbg-ai" style="font-size:10px;line-height:1.45;max-height:220px;overflow-y:auto;color:#aaa;border:1px solid #00ff8833;padding:6px;background:#001108"></div>
      </div>

      <!-- Event log -->
      <div>
        <div style="color:#ffcc00;margin-bottom:4px;font-size:11px;text-transform:uppercase">Event Log (last 20)</div>
        <div id="dbg-log" style="font-size:10px;line-height:1.5;max-height:160px;overflow-y:auto;color:#aaa"></div>
      </div>

      <style>
        .dbg-btn {
          background: #002211;
          border: 1px solid #00ff88;
          color: #00ff88;
          cursor: pointer;
          padding: 3px 8px;
          border-radius: 2px;
          font-size: 11px;
          font-family: 'Courier New', monospace;
        }
        .dbg-btn:hover { background: #004422; }
      </style>
    `;
  }

  private attachPanelHandlers(panel: HTMLElement): void {
    panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.id === 'dbg-close') {
        this.hide();
      } else if (target.id === 'dbg-add-ipc') {
        const faction = this.state.getCurrentFaction();
        if (faction) { faction.addIPCs(50); this.refresh(); }
      } else if (target.id === 'dbg-end-phase') {
        try { this.turnManager.advancePhase(); this.refresh(); } catch {}
      } else if (target.id === 'dbg-end-turn') {
        try {
          const phases = this.state.rules.phases;
          for (let i = 0; i < phases.length; i++) {
            try { this.turnManager.advancePhase(); } catch {}
          }
          this.refresh();
        } catch {}
      } else if (target.id === 'dbg-capture-selected') {
        const sel = this.state.selectedTerritoryId;
        const faction = this.state.getCurrentFaction();
        if (sel && faction) {
          const t = this.state.territories.get(sel);
          if (t) { (t as any).owner = faction.id; this.refresh(); }
        }
      } else if (target.id === 'dbg-win') {
        this.state.emit('victory', { factionId: this.state.currentFactionId, reason: 'debug' });
      } else if (target.id === 'dbg-clear-log') {
        this.eventLog = [];
        this.renderLog();
      } else if (target.id === 'dbg-inject') {
        this.injectUnits(panel);
      }
    });
  }

  private injectUnits(panel: HTMLElement): void {
    const sel = this.state.selectedTerritoryId;
    const unitTypeId = (panel.querySelector('#dbg-unit-select') as HTMLSelectElement)?.value;
    const count = parseInt((panel.querySelector('#dbg-unit-count') as HTMLInputElement)?.value ?? '3', 10);
    if (!sel || !unitTypeId || isNaN(count)) return;
    const territory = this.state.territories.get(sel);
    if (!territory) return;
    territory.addUnits(unitTypeId, count);
    this.refresh();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private refresh(): void {
    if (!this.visible) return;
    this.renderState();
    this.renderFactions();
    this.renderUnitSelect();
    this.renderAIDebug();
    this.renderLog();
  }

  private renderState(): void {
    const el = document.getElementById('dbg-state');
    if (!el) return;
    const sel = this.state.selectedTerritoryId;
    const selTerritory = sel ? this.state.territories.get(sel) : null;
    el.innerHTML = [
      `<span style="color:#fff">Turn:</span> ${this.state.turnNumber}`,
      `<span style="color:#fff">Phase:</span> <span style="color:#88ff88">${this.state.currentPhase}</span>`,
      `<span style="color:#fff">Faction:</span> ${this.state.currentFactionId}`,
      `<span style="color:#fff">Season:</span> ${this.state.currentSeason}`,
      `<span style="color:#fff">Territories:</span> ${this.state.territories.size}`,
      `<span style="color:#fff">Pending moves:</span> ${this.state.pendingMoves.length}`,
      sel
        ? `<span style="color:#fff">Selected:</span> <span style="color:#88ddff">${selTerritory?.name ?? sel}</span> (${selTerritory?.owner ?? 'unowned'})`
        : `<span style="color:#555">No selection</span>`,
    ].join('<br>');
  }

  private renderFactions(): void {
    const el = document.getElementById('dbg-factions');
    if (!el) return;
    const rows = this.state.factionRegistry.getAll().map(f => {
      const territories = Array.from(this.state.territories.values()).filter(t => t.owner === f.id).length;
      const style = f.id === this.state.currentFactionId ? 'color:#ffff44' : 'color:#aaa';
      const defeated = f.isDefeated ? ' <span style="color:#f44">✗</span>' : '';
      return `<span style="${style}">${f.name}${defeated}:</span> ${f.ipcs} IPC  ${territories}t`;
    });
    el.innerHTML = rows.join('<br>');
  }

  private renderUnitSelect(): void {
    const sel = document.getElementById('dbg-unit-select') as HTMLSelectElement | null;
    if (!sel || sel.options.length > 0) return; // populate once
    for (const ut of this.state.unitRegistry.getAll()) {
      const opt = document.createElement('option');
      opt.value = ut.id;
      opt.textContent = `${ut.name} (${ut.cost} IPC)`;
      sel.appendChild(opt);
    }
  }

  private renderLog(): void {
    const el = document.getElementById('dbg-log');
    if (!el) return;
    el.innerHTML = [...this.eventLog].reverse().slice(0, 20).map(e =>
      `<div><span style="color:#555">${e.time}</span> <span style="color:#88ff88">${e.type}</span>${e.data ? ` <span style="color:#888">${e.data}</span>` : ''}</div>`
    ).join('');
  }

  // ── Event subscription ────────────────────────────────────────────────────

  private renderAIDebug(): void {
    const el = document.getElementById('dbg-ai');
    if (!el) return;
    if (!this.aiDebug) {
      el.innerHTML = '<span style="color:#555">No AI planning snapshot yet. End a turn and let an AI move.</span>';
      return;
    }

    const rows = this.aiDebug.plans.slice(0, 12).map(plan => {
      const color = plan.status === 'chosen' ? '#66ff99' : '#ff9977';
      const attackers = plan.attackers
        .map(att => `${att.count}x ${att.unitTypeId} from ${att.fromName}`)
        .join(', ');
      return `
        <div style="border-top:1px solid #00ff8822;padding:5px 0">
          <div><span style="color:${color};font-weight:bold">${plan.status.toUpperCase()}</span> <span style="color:#fff">${this.escapeHtml(plan.targetName)}</span></div>
          <div>odds ${Math.round(plan.expectedSuccess * 100)}% / min ${Math.round(plan.minSuccess * 100)}% · value ${Math.round(plan.strategicValue)} · power ${Math.round(plan.attackPower)} vs ${Math.round(plan.defenseStrength)}</div>
          <div style="color:#ddd">${this.escapeHtml(plan.reason)}</div>
          <div style="color:#777">${this.escapeHtml(attackers || 'no attackers')}</div>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div style="margin-bottom:5px;color:#fff">
        ${this.escapeHtml(this.aiDebug.factionName)} · ${this.escapeHtml(this.aiDebug.personality)} · ${this.escapeHtml(this.aiDebug.phase)}
      </div>
      <div style="margin-bottom:5px;color:#88ff88">${this.aiDebug.chosenCount} chosen / ${this.aiDebug.plans.length} considered</div>
      ${rows || '<span style="color:#ff9977">No attack plans considered.</span>'}
    `;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private subscribeToGameEvents(): void {
    const ALL_EVENTS = [
      'state_loaded', 'turn_start', 'turn_end', 'phase_start', 'phase_end',
      'territory_selected', 'units_moved', 'combat_start', 'combat_round',
      'combat_end', 'territory_mobilized', 'units_produced', 'income_collected',
      'faction_defeated', 'victory', 'tech_researched', 'ai_thinking', 'ai_debug',
      'strategic_bombing', 'naval_bombardment', 'reserve_updated', 'units_deployed',
      'game_event', 'diplomacy_proposal', 'diplomacy_accepted', 'diplomacy_declined',
      'nuclear_strike', 'alliance_betrayed', 'espionage_result',
    ] as const;

    for (const eventType of ALL_EVENTS) {
      this.state.on(eventType, (event) => {
        if (event.type === 'ai_debug') {
          this.aiDebug = event.data as AIDebugView;
        }
        const now = new Date();
        const time = `${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        let data = '';
        try {
          const d = event.data as any;
          if (d && typeof d === 'object') {
            const keys = Object.keys(d).slice(0, 3);
            data = keys.map(k => `${k}:${JSON.stringify(d[k])?.slice(0, 20)}`).join(' ');
          }
        } catch {}
        this.eventLog.push({ type: event.type, time, data });
        if (this.eventLog.length > 100) this.eventLog.shift();
        if (this.visible) this.refresh();
      });
    }
  }

  // ── FPS counter ───────────────────────────────────────────────────────────

  private startFpsCounter(): void {
    const tick = () => {
      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsTime >= 1000) {
        this.fps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsTime = now;
        const fpsEl = document.getElementById('dbg-fps');
        if (fpsEl) fpsEl.textContent = `${this.fps} fps`;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  // ── Show / hide ───────────────────────────────────────────────────────────

  show(): void {
    this.visible = true;
    this.panel.style.display = 'block';
    this.refresh();
    localStorage.setItem('debugMode', 'true');
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = 'none';
    localStorage.removeItem('debugMode');
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ── Keyboard shortcut ─────────────────────────────────────────────────────

  private setupKeyListener(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.panel.remove();
  }
}
