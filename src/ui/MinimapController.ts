/**
 * MinimapController - Minimap rendering and navigation
 */

import { GameState } from '../engine/GameState';
import { MapRenderer } from '../renderer/MapRenderer';
import { CombatState } from '../engine/CombatResolver';
import { getThreatenedTerritoryIds } from '../engine/ThreatAnalyzer';
import { settings } from './Settings';
import { soundManager } from '../audio/SoundManager';

export class MinimapController {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private threatMode: boolean = false;
  private getActiveCombat: () => CombatState | null;
  private lastRenderAt = 0;
  private renderQueued = false;
  private forceRender = false;

  constructor(
    private state: GameState,
    private renderer: MapRenderer,
    getActiveCombat: () => CombatState | null,
    private onVolumeChange?: (vol: number) => void
  ) {
    this.getActiveCombat = getActiveCombat;
  }

  setup(): void {
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = 200;
    this.canvas.height = 120;

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      this.renderer.navigateToPercent(x, y);
    });

    // Volume slider in zoom controls
    const zoomControls = document.getElementById('zoom-controls');
    if (zoomControls) {
      const volWrapper = document.createElement('div');
      volWrapper.className = 'hud-volume-ctrl';
      volWrapper.title = 'Master volume';
      volWrapper.innerHTML = `<span class="hud-vol-icon">🔊</span><input type="range" id="hud-volume-slider" min="0" max="100" step="5" value="${settings.getSetting('masterVolume')}" class="hud-vol-slider">`;
      zoomControls.appendChild(volWrapper);

      const slider = volWrapper.querySelector('#hud-volume-slider') as HTMLInputElement;
      slider?.addEventListener('input', () => {
        const vol = Number(slider.value);
        settings.update({ masterVolume: vol });
        soundManager.updateMusicVolume();
        const icon = volWrapper.querySelector('.hud-vol-icon') as HTMLElement;
        if (icon) icon.textContent = vol === 0 ? '🔇' : vol < 50 ? '🔉' : '🔊';
        this.onVolumeChange?.(vol);
      });
    }

    // Threat overlay toggle
    const minimapContainer = document.getElementById('minimap-container');
    if (minimapContainer) {
      const threatBtn = document.createElement('button');
      threatBtn.id = 'btn-minimap-threat';
      threatBtn.className = 'minimap-threat-btn';
      threatBtn.title = 'Toggle threat overlay (shows your territories under threat)';
      threatBtn.textContent = '🔴';
      threatBtn.addEventListener('click', () => {
        this.threatMode = !this.threatMode;
        threatBtn.classList.toggle('active', this.threatMode);
        this.render();
      });
      minimapContainer.appendChild(threatBtn);
    }

    this.render();
  }

  markDirty(): void {
    this.forceRender = true;
    this.render();
  }

  render(): void {
    if (!this.ctx || !this.canvas) return;

    const now = performance.now();
    const isLarge = this.state.territories.size >= 400;
    const minInterval = isLarge ? 220 : 80;
    if (!this.forceRender && now - this.lastRenderAt < minInterval) {
      if (!this.renderQueued) {
        this.renderQueued = true;
        requestAnimationFrame(() => {
          this.renderQueued = false;
          this.render();
        });
      }
      return;
    }
    this.forceRender = false;
    this.lastRenderAt = now;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, w, h);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const territory of this.state.territories.values()) {
      for (const [px, py] of territory.polygon) {
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    }

    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;
    const scaleX = w / mapWidth;
    const scaleY = h / mapHeight;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    const offsetX = (w - mapWidth * scale) / 2;
    const offsetY = (h - mapHeight * scale) / 2;

    const selectedId = this.state.selectedTerritoryId;
    const activeCombat = this.getActiveCombat();
    const combatId = activeCombat?.territoryId;
    const pendingAttackTargets = this.state.pendingMoves.map(m => m.toTerritoryId);
    const threatFaction = this.getThreatFaction();
    const threatenedIds = this.threatMode && threatFaction
      ? getThreatenedTerritoryIds(this.state, threatFaction)
      : new Set<string>();

    for (const territory of this.state.territories.values()) {
      ctx.beginPath();
      const poly = territory.polygon;
      if (poly.length < 3) continue;

      ctx.moveTo((poly[0][0] - minX) * scale + offsetX, (poly[0][1] - minY) * scale + offsetY);
      for (let i = 1; i < poly.length; i++) {
        ctx.lineTo((poly[i][0] - minX) * scale + offsetX, (poly[i][1] - minY) * scale + offsetY);
      }
      ctx.closePath();

      if (territory.isSea()) {
        ctx.fillStyle = '#1a3a5c';
      } else if (!territory.owner) {
        ctx.fillStyle = '#5c5c5c';
      } else if (this.threatMode) {
        if (threatFaction) {
          if (territory.owner === threatFaction.id) {
            ctx.fillStyle = threatenedIds.has(territory.id) ? '#ef4444' : '#22c55e';
          } else if (threatFaction.isEnemyOf(territory.owner)) {
            ctx.fillStyle = '#f97316';
          } else {
            ctx.fillStyle = '#94a3b8';
          }
        } else {
          const ownerFaction = this.state.factionRegistry.get(territory.owner);
          ctx.fillStyle = ownerFaction?.color ?? '#5c5c5c';
        }
      } else {
        const ownerFaction = this.state.factionRegistry.get(territory.owner);
        ctx.fillStyle = ownerFaction?.color ?? '#5c5c5c';
      }
      ctx.fill();

      if (territory.id === selectedId) {
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (territory.id === combatId) {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f87171';
        ctx.shadowBlur = 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (pendingAttackTargets.includes(territory.id)) {
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    for (const territory of this.state.territories.values()) {
      if (territory.isCapital) {
        const centerX = (territory.center[0] - minX) * scale + offsetX;
        const centerY = (territory.center[1] - minY) * scale + offsetY;
        ctx.fillStyle = '#ffd700';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', centerX, centerY);
      }
    }
  }

  private getThreatFaction() {
    const current = this.state.getCurrentFaction();
    if (current?.controlledBy === 'human') return current;
    return this.state.factionRegistry.getAll().find(f => f.controlledBy === 'human') ?? current ?? null;
  }
}
