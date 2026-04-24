/**
 * ReplayUI - Replay browser and playback controls
 * Shows a list of stored replays and a scrubber/control bar while a replay is running.
 */

import { replayManager, Replay, ReplayAction } from '../engine/ReplayManager';

export class ReplayUI {
  private container: HTMLElement | null = null;
  private controlBar: HTMLElement | null = null;
  private onApplyAction: ((action: ReplayAction) => void) | null = null;
  private onRestoreInitialState: ((json: string) => void) | null = null;
  private unsubStep: (() => void) | null = null;
  private unsubEnd: (() => void) | null = null;

  /**
   * Set callbacks the UI needs to drive the actual game state.
   * @param applyAction   Apply a single replay action to the live GameState
   * @param restoreState  Restore from the replay's initial JSON snapshot
   */
  setCallbacks(
    applyAction: (action: ReplayAction) => void,
    restoreState: (json: string) => void
  ): void {
    this.onApplyAction = applyAction;
    this.onRestoreInitialState = restoreState;
  }

  // ── Replay Browser ──────────────────────────────────────────────────────

  /** Render a list of saved replays into `container`. */
  showBrowser(container: HTMLElement): void {
    this.container = container;
    this.renderBrowser();
  }

  hideBrowser(): void {
    if (this.container) {
      this.container.innerHTML = '';
      this.container = null;
    }
  }

  private renderBrowser(): void {
    if (!this.container) return;
    const replays = replayManager.getStoredReplays();

    if (replays.length === 0) {
      this.container.innerHTML = '<div style="color:#888;padding:1rem">No replays saved yet. Complete a game to record one.</div>';
      return;
    }

    let html = '<div style="display:flex;flex-direction:column;gap:0.5rem;">';
    for (const r of replays) {
      const date  = new Date(r.metadata.createdAt).toLocaleString();
      const dur   = this.formatDuration(r.metadata.duration);
      const turns = r.metadata.turns;
      const winner = r.metadata.winner ? ` • Winner: ${r.metadata.winner}` : '';
      html += `
        <div data-id="${r.metadata.id}"
             style="border:1px solid #444;padding:0.75rem;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:bold;color:#ddd">${r.metadata.name}</div>
            <div style="font-size:0.8em;color:#888;margin-top:0.25rem">
              ${date} &nbsp;•&nbsp; ${turns} turns &nbsp;•&nbsp; ${dur}${winner}
            </div>
            <div style="font-size:0.75em;color:#666;margin-top:0.1rem">
              Factions: ${r.metadata.factions.join(', ')} &nbsp;•&nbsp; ${r.metadata.actionCount} actions
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;">
            <button data-action="watch" data-id="${r.metadata.id}"
                    style="background:#1e3a5f;color:#ddd;border:1px solid #4a90d9;padding:0.3rem 0.7rem;border-radius:3px;cursor:pointer;">
              ▶ Watch
            </button>
            <button data-action="delete" data-id="${r.metadata.id}"
                    style="background:#3a1e1e;color:#ddd;border:1px solid #d94a4a;padding:0.3rem 0.7rem;border-radius:3px;cursor:pointer;">
              🗑
            </button>
          </div>
        </div>`;
    }
    html += '</div>';
    this.container.innerHTML = html;

    this.container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!btn) return;
      const id     = btn.dataset.id ?? '';
      const action = btn.dataset.action;
      if (action === 'watch') this.watchReplay(id);
      if (action === 'delete') {
        replayManager.deleteReplay(id);
        this.renderBrowser();
      }
    });
  }

  // ── Playback ────────────────────────────────────────────────────────────

  /** Load a replay by ID and show the control bar. */
  watchReplay(id: string): void {
    const replay = replayManager.loadReplay(id);
    if (!replay) { console.warn('[ReplayUI] Replay not found:', id); return; }
    this.startWatching(replay);
  }

  private startWatching(replay: Replay): void {
    // Restore initial state
    if (this.onRestoreInitialState) {
      this.onRestoreInitialState(replay.initialState);
    }

    replayManager.startPlayback(replay);

    // Subscribe to step events to apply actions to live state
    this.unsubStep?.();
    this.unsubStep = replayManager.onStep((action) => {
      if (this.onApplyAction) this.onApplyAction(action);
      this.updateControlBar();
    });

    this.unsubEnd?.();
    this.unsubEnd = replayManager.onPlaybackEnd(() => {
      this.updateControlBar();
    });

    this.hideBrowser();
    this.showControlBar();
  }

  // ── Control Bar ─────────────────────────────────────────────────────────

  private showControlBar(): void {
    this.removeControlBar();

    this.controlBar = document.createElement('div');
    this.controlBar.id = 'replay-control-bar';
    Object.assign(this.controlBar.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      right: '0',
      background: 'rgba(10,20,30,0.95)',
      borderTop: '1px solid #2a4a6f',
      padding: '0.5rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      zIndex: '9000',
      fontFamily: 'monospace',
      fontSize: '0.85rem',
      color: '#ccc',
    });

    this.controlBar.innerHTML = `
      <span id="rp-title" style="color:#7ab;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Replay</span>
      <button id="rp-rewind"  title="Back to start"   style="${this.btnStyle()}">⏮</button>
      <button id="rp-back"    title="Step back"        style="${this.btnStyle()}">⏪</button>
      <button id="rp-play"    title="Play/Pause"       style="${this.btnStyle()}">▶</button>
      <button id="rp-forward" title="Step forward"     style="${this.btnStyle()}">⏩</button>
      <input  id="rp-scrubber" type="range" min="0" max="0" value="0"
              style="flex:2;accent-color:#4a90d9;" />
      <span   id="rp-counter" style="color:#888;white-space:nowrap">0 / 0</span>
      <select id="rp-speed"   title="Playback speed"   style="background:#1a2a3a;color:#ccc;border:1px solid #444;padding:0.2rem;border-radius:3px;">
        <option value="1500">0.5×</option>
        <option value="800"  selected>1×</option>
        <option value="400">2×</option>
        <option value="150">5×</option>
      </select>
      <button id="rp-close" title="Exit replay"       style="${this.btnStyle('#3a1e1e','#d94a4a')}">✕</button>`;

    document.body.appendChild(this.controlBar);
    this.updateControlBar();

    // Wire up events
    document.getElementById('rp-rewind')?.addEventListener('click', () => this.doRewind());
    document.getElementById('rp-back')?.addEventListener('click',   () => this.doBack());
    document.getElementById('rp-play')?.addEventListener('click',   () => this.doPlayPause());
    document.getElementById('rp-forward')?.addEventListener('click',() => replayManager.stepForward());
    document.getElementById('rp-close')?.addEventListener('click',  () => this.stopWatching());
    document.getElementById('rp-speed')?.addEventListener('change', (e) => {
      const ms = parseInt((e.target as HTMLSelectElement).value, 10);
      if (replayManager.isPlaying()) {
        replayManager.pausePlayback();
        replayManager.play(ms);
      }
    });
    document.getElementById('rp-scrubber')?.addEventListener('input', (e) => {
      const idx = parseInt((e.target as HTMLInputElement).value, 10);
      this.doSeek(idx);
    });
  }

  private updateControlBar(): void {
    if (!this.controlBar) return;
    const step  = replayManager.getCurrentStep();
    const total = replayManager.getTotalSteps();
    const meta  = replayManager.getPlaybackMetadata();

    const title   = this.controlBar.querySelector('#rp-title') as HTMLElement | null;
    const counter = this.controlBar.querySelector('#rp-counter') as HTMLElement | null;
    const scrubber= this.controlBar.querySelector('#rp-scrubber') as HTMLInputElement | null;
    const playBtn = this.controlBar.querySelector('#rp-play') as HTMLButtonElement | null;

    if (title && meta)     title.textContent = meta.name;
    if (counter)           counter.textContent = `${step} / ${total}`;
    if (scrubber) {
      scrubber.max   = String(total);
      scrubber.value = String(step);
    }
    if (playBtn) playBtn.textContent = replayManager.isPlaying() ? '⏸' : '▶';
  }

  private removeControlBar(): void {
    if (this.controlBar) {
      this.controlBar.remove();
      this.controlBar = null;
    }
  }

  // ── Control actions ─────────────────────────────────────────────────────

  private doPlayPause(): void {
    if (replayManager.isPlaying()) {
      replayManager.pausePlayback();
    } else {
      const speedEl = document.getElementById('rp-speed') as HTMLSelectElement | null;
      const ms = speedEl ? parseInt(speedEl.value, 10) : 800;
      replayManager.play(ms);
    }
    this.updateControlBar();
  }

  private doRewind(): void {
    replayManager.pausePlayback();
    const replay = replayManager.getPlaybackMetadata();
    if (!replay) return;
    // Restore initial state
    const loaded = replayManager.loadReplay(replay.id);
    if (loaded && this.onRestoreInitialState) {
      this.onRestoreInitialState(loaded.initialState);
    }
    replayManager.seekTo(0);
    this.updateControlBar();
  }

  private doBack(): void {
    replayManager.pausePlayback();
    const prevIndex = replayManager.getCurrentStep() - 1;
    if (prevIndex < 0) return;

    // Re-apply from scratch (restore initial state then replay up to prevIndex)
    const meta = replayManager.getPlaybackMetadata();
    if (!meta) return;
    const loaded = replayManager.loadReplay(meta.id);
    if (!loaded) return;

    if (this.onRestoreInitialState) this.onRestoreInitialState(loaded.initialState);
    replayManager.seekTo(0);

    for (let i = 0; i < prevIndex; i++) {
      const action = loaded.actions[i];
      if (this.onApplyAction) this.onApplyAction(action);
    }
    replayManager.seekTo(prevIndex);
    this.updateControlBar();
  }

  private doSeek(targetIndex: number): void {
    replayManager.pausePlayback();
    const meta = replayManager.getPlaybackMetadata();
    if (!meta) return;
    const loaded = replayManager.loadReplay(meta.id);
    if (!loaded) return;

    if (this.onRestoreInitialState) this.onRestoreInitialState(loaded.initialState);
    replayManager.seekTo(0);

    const limit = Math.min(targetIndex, loaded.actions.length);
    for (let i = 0; i < limit; i++) {
      if (this.onApplyAction) this.onApplyAction(loaded.actions[i]);
    }
    replayManager.seekTo(limit);
    this.updateControlBar();
  }

  private stopWatching(): void {
    replayManager.pausePlayback();
    replayManager.stopPlayback();
    this.unsubStep?.();
    this.unsubEnd?.();
    this.unsubStep = null;
    this.unsubEnd  = null;
    this.removeControlBar();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private btnStyle(bg = '#1a2a3a', border = '#4a90d9'): string {
    return `background:${bg};color:#ddd;border:1px solid ${border};padding:0.25rem 0.6rem;border-radius:3px;cursor:pointer;font-size:1rem;`;
  }

  private formatDuration(ms: number): string {
    if (!ms) return '—';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
}
