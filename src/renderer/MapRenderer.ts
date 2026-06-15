/**
 * MapRenderer - Renders the game map using HTML5 Canvas
 * Board game aesthetic with felt background and styled territories
 */

import { GameState } from '../engine/GameState';
import { Territory } from '../data/Territory';
import type { UnitEra } from '../engine/GameConfig';

export interface RenderOptions {
  showGrid: boolean;
  showUnitCounts: boolean;
  highlightSelected: boolean;
  highlightValidMoves: boolean;
  fogOfWarCallback?: (territoryId: string) => boolean; // Returns true if visible
  intelRevealCallback?: (territoryId: string) => boolean; // Returns true if espionage-revealed
  adjacentFogCallback?: (territoryId: string) => boolean; // Returns true if adjacent-but-hidden
}

interface PerfBucket {
  samples: number;
  avg: number;
  max: number;
  p95: number;
  recent: number[];
}

interface PerfRoot {
  [metric: string]: PerfBucket;
}

export type UnitDropKind = 'move' | 'attack' | 'invalid';

export interface UnitDragController {
  canDragFrom(territoryId: string): boolean;
  onDragStart(fromTerritoryId: string): void;
  onDragHover(toTerritoryId: string | null): void;
  onDragDrop(fromTerritoryId: string, toTerritoryId: string): void;
  onDragCancel(): void;
  getDropKind(fromTerritoryId: string, toTerritoryId: string): UnitDropKind;
}

interface ActiveUnitDrag {
  fromId: string;
  startScreenX: number;
  startScreenY: number;
  currentScreenX: number;
  currentScreenY: number;
  committed: boolean;
}

export class MapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  
  // Camera/viewport
  private offsetX: number = 0;
  private offsetY: number = 0;
  private scale: number = 1;
  
  // Interaction state
  private isDragging: boolean = false;
  private didDrag: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private hoveredTerritoryId: string | null = null;
  private unitDragController: UnitDragController | null = null;
  private unitDrag: ActiveUnitDrag | null = null;
  private dragHoverTerritoryId: string | null = null;
  private dragHoverKind: UnitDropKind = 'invalid';
  private activeCommandUnitTypeId: string | null = null;
  private activeCommandUnitIcon: string = '';
  private activeCommandDomain: 'land' | 'sea' | 'air' | null = null;
  private static readonly UNIT_DRAG_THRESHOLD = 8;

  // Valid move highlights
  private validMoveTargets: Set<string> = new Set();
  private attackTargets: Set<string> = new Set();
  private coastalStrikeTargets: Set<string> = new Set();
  private unitEra: UnitEra = 'wwii';

  // Mobilization highlights (build phase)
  private mobilizableTargets: Set<string> = new Set();
  private mobilizedTargets: Set<string> = new Set();

  // Territory hover callback for tooltips
  private territoryHoverCallback: ((territoryId: string | null, clientX: number, clientY: number) => void) | null = null;

  // Right-click context menu callback
  private contextMenuCallback: ((territoryId: string, clientX: number, clientY: number) => void) | null = null;

  // Map overlays: movement range, threat (enemy can reach), economic heat map
  private overlayMode: 'off' | 'range' | 'threat' | 'economic' = 'off';
  private threatTerritoryIds: Set<string> = new Set();

  // Capture color-bleed animations: territoryId → {startTime, factionColor}
  private captureAnimations: Map<string, { startTime: number; factionColor: string }> = new Map();
  private captureRafId: number | null = null;

  // AI activity pulse: territoryId → startTime (cyan shimmer for 1.8s)
  private aiPulseTerritories: Map<string, number> = new Map();

  // RAF-based render debouncing: coalesce multiple render() calls into one per frame
  private renderPending: boolean = false;

  // Two-layer rendering: static offscreen cache + dynamic per-frame overlay
  private staticCanvas: HTMLCanvasElement | null = null;
  private staticCtx: CanvasRenderingContext2D | null = null;
  private staticDirty: boolean = true;
  private staticLastScale: number = -1;
  private staticLastOffsetX: number = -1;
  private staticLastOffsetY: number = -1;

  // Render options
  private options: RenderOptions = {
    showGrid: false,
    showUnitCounts: true,
    highlightSelected: true,
    highlightValidMoves: true,
  };
  private perfEnabled: boolean = false;

  /** Skip expensive terrain/wave effects on very large maps (e.g. fine grid). */
  private isLargeMap(): boolean {
    return this.state.territories.size >= 400;
  }

  // Military map / wargame color palette
  private readonly COLORS = {
    parchment: '#cfc090',
    parchmentLight: '#ddd0a0',
    seaDeep: '#1e3252',
    seaMid: '#243a5e',
    neutral: '#7a7060',
    neutralLight: '#908878',
    borderDark: '#2a1808',
    borderNeutral: '#5a4830',
    gold: '#c89030',
    ivory: '#e8d8a8',
  };

  constructor(
    private state: GameState,
    canvasId: string
  ) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error(`Canvas element ${canvasId} not found`);
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    this.perfEnabled = this.readPerfFlag();

    this.setupCanvas();
    this.setupEventListeners();

    // Re-render whenever units are placed so AI mobilizations are visible immediately
    this.state.on('territory_mobilized', () => { this.staticDirty = true; this.render(); });
    this.state.on('units_produced', () => { this.staticDirty = true; this.render(); });

    // Invalidate static cache when game state changes visual appearance
    const dirtyCb = () => { this.staticDirty = true; };
    this.state.on('combat_end', dirtyCb);
    this.state.on('fortification_built', dirtyCb);
    this.state.on('espionage_result', dirtyCb);
    this.state.on('units_moved', dirtyCb);
    this.state.on('turn_start', dirtyCb);
  }

  /**
   * Setup canvas size
   */
  private setupCanvas(): void {
    const resize = () => {
      // Make canvas slightly smaller than window for border effect
      this.width = window.innerWidth - 40;
      this.height = window.innerHeight - 40;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.staticDirty = true;
      this.render();
    };

    window.addEventListener('resize', resize);
    resize();
  }

  /**
   * Setup mouse/touch event listeners
   */
  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    window.addEventListener('mousemove', this.onWindowMouseMove.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));
    this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this));
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
  }

  /**
   * Set fog of war visibility callback (used by game for human/AI visibility)
   */
  setFogOfWarCallback(callback: (territoryId: string) => boolean): void {
    this.options.fogOfWarCallback = callback;
  }

  setIntelRevealCallback(callback: (territoryId: string) => boolean): void {
    this.options.intelRevealCallback = callback;
  }

  setAdjacentFogCallback(callback: (territoryId: string) => boolean): void {
    this.options.adjacentFogCallback = callback;
  }

  markStaticDirty(): void {
    this.staticDirty = true;
  }

  setTerritoryHoverCallback(callback: (territoryId: string | null, clientX: number, clientY: number) => void): void {
    this.territoryHoverCallback = callback;
  }

  setOverlayMode(mode: 'off' | 'range' | 'threat' | 'economic', threatIds?: Set<string>): void {
    this.overlayMode = mode;
    this.threatTerritoryIds = threatIds ?? new Set();
  }

  /** Start a 1.5s color-bleed animation on a captured territory. */
  startCaptureAnimation(territoryId: string, factionColor: string): void {
    this.captureAnimations.set(territoryId, { startTime: Date.now(), factionColor });
    if (this.captureRafId === null) this.runCaptureLoop();
  }

  private runCaptureLoop(): void {
    const now = Date.now();
    let anyActive = false;
    for (const [id, anim] of this.captureAnimations) {
      if (now - anim.startTime > 1600) this.captureAnimations.delete(id);
      else anyActive = true;
    }
    for (const [id, startTime] of this.aiPulseTerritories) {
      if (now - startTime > 1800) this.aiPulseTerritories.delete(id);
      else anyActive = true;
    }
    // Keep loop alive while a territory is selected or mobilizable targets are pulsing
    if (this.state.selectedTerritoryId !== null) anyActive = true;
    if (this.mobilizableTargets.size > 0) anyActive = true;
    if (this.unitDrag?.committed) anyActive = true;
    // Use drawFrame() directly — the animation loop already owns the RAF cadence
    this.renderPending = false;
    const start = performance.now();
    this.drawFrame();
    this.recordPerf('captureLoopFrameMs', performance.now() - start);
    if (anyActive) this.captureRafId = requestAnimationFrame(() => this.runCaptureLoop());
    else this.captureRafId = null;
  }

  /** Trigger a cyan shimmer on a territory to indicate AI activity there. */
  setAIPulseTerritory(territoryId: string): void {
    this.aiPulseTerritories.set(territoryId, Date.now());
    if (this.captureRafId === null) this.runCaptureLoop();
  }

  /** Start the continuous animation loop (e.g. when selection changes). */
  startContinuousRender(): void {
    if (this.captureRafId === null) this.runCaptureLoop();
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale,
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.scale + this.offsetX,
      y: worldY * this.scale + this.offsetY,
    };
  }

  /**
   * Schedule a render on the next animation frame. Multiple calls within the
   * same frame are collapsed into one draw, preventing redundant canvas work.
   */
  render(): void {
    if (this.renderPending) return;
    this.renderPending = true;
    requestAnimationFrame(() => {
      this.renderPending = false;
      const start = performance.now();
      this.drawFrame();
      this.recordPerf('renderFrameMs', performance.now() - start);
    });
  }

  private readPerfFlag(): boolean {
    try {
      return localStorage.getItem('gs-perf') === '1';
    } catch {
      return false;
    }
  }

  private recordPerf(metric: string, value: number): void {
    if (!this.perfEnabled) return;
    const root = globalThis as unknown as { __gsPerf?: PerfRoot };
    root.__gsPerf = root.__gsPerf ?? {};
    const bucket: PerfBucket = root.__gsPerf[metric] ?? { samples: 0, avg: 0, max: 0, p95: 0, recent: [] };
    bucket.samples += 1;
    bucket.avg += (value - bucket.avg) / bucket.samples;
    bucket.max = Math.max(bucket.max, value);
    bucket.recent.push(value);
    if (bucket.recent.length > 120) bucket.recent.shift();
    const sorted = [...bucket.recent].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95) - 1));
    bucket.p95 = sorted[idx] ?? value;
    root.__gsPerf[metric] = bucket;
  }

  /** Immediate synchronous draw — used internally and by the capture animation loop. */
  private drawFrame(): void {
    if (this.state.territories.size === 0) {
      this.fillCanvasBackdrop();
      return;
    }

    const scaleChanged = this.scale !== this.staticLastScale;
    const panChanged = this.offsetX !== this.staticLastOffsetX
      || this.offsetY !== this.staticLastOffsetY;
    const cameraChanged = scaleChanged || panChanged;
    if (this.staticDirty || cameraChanged) {
      this.rebuildStaticLayer();
    }

    // Blit the cached static layer onto the main canvas
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (this.staticCanvas) {
      this.ctx.drawImage(this.staticCanvas, 0, 0);
    } else {
      this.fillCanvasBackdrop();
    }

    // Draw dynamic layer: interaction highlights, animations, map overlays
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    this.drawDynamicTerritoryOverlays();
    this.drawSelectionGlow();
    this.drawActiveCommandBadge();
    this.drawUnitDragOverlay();

    if (this.overlayMode === 'economic') {
      this.drawEconomicOverlay();
    } else if (this.overlayMode === 'range' && (this.validMoveTargets.size > 0 || this.attackTargets.size > 0)) {
      this.drawOverlayLayer(this.validMoveTargets, 'rgba(34, 197, 94, 0.25)');
      this.drawOverlayLayer(this.coastalStrikeTargets, 'rgba(251, 146, 60, 0.35)');
      this.drawOverlayLayer(
        [...this.attackTargets].filter(id => !this.coastalStrikeTargets.has(id)),
        'rgba(239, 68, 68, 0.3)',
      );
    } else if (this.overlayMode === 'threat' && this.threatTerritoryIds.size > 0) {
      this.drawOverlayLayer(this.threatTerritoryIds, 'rgba(239, 68, 68, 0.35)');
    }

    this.ctx.restore();
  }

  private drawOverlayLayer(territoryIds: Set<string>, fillStyle: string): void {
    this.ctx.fillStyle = fillStyle;
    for (const tid of territoryIds) {
      const territory = this.state.territories.get(tid);
      if (!territory || territory.isSea()) continue;
      this.ctx.beginPath();
      const poly = territory.polygon;
      this.ctx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) this.ctx.lineTo(poly[i][0], poly[i][1]);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }

  /** Render economic heat map: land territories coloured by IPC value (green gradient). */
  private drawEconomicOverlay(): void {
    let maxProduction = 1;
    for (const t of this.state.territories.values()) {
      if (t.isLand() && t.production > maxProduction) maxProduction = t.production;
    }

    for (const territory of this.state.territories.values()) {
      if (territory.isSea() || territory.production <= 0) continue;
      const poly = territory.polygon;
      if (poly.length < 3) continue;

      const intensity = territory.production / maxProduction; // 0–1
      const alpha = 0.15 + intensity * 0.55;
      // Low value → yellow, high value → deep green
      const r = Math.round(34 + (255 - 34) * (1 - intensity));
      const g = Math.round(197 + (220 - 197) * intensity);
      const b = Math.round(94 * (1 - intensity * 0.6));

      this.ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      this.ctx.beginPath();
      this.ctx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) this.ctx.lineTo(poly[i][0], poly[i][1]);
      this.ctx.closePath();
      this.ctx.fill();

      // IPC label at territory center
      const [cx, cy] = territory.center;
      this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
      this.ctx.font = `bold ${Math.max(10, Math.round(10 + intensity * 4))}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`${territory.production}`, cx, cy);
    }
  }

  /**
   * Draw aged parchment / military map background
   */
  private fillCanvasBackdrop(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, '#243a5e');
    gradient.addColorStop(0.55, '#1e3252');
    gradient.addColorStop(1, '#14243d');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawBackground(): void {
    this.fillCanvasBackdrop();

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(180, 210, 255, 0.08)';
    this.ctx.lineWidth = 1;
    const spacing = 18;
    for (let x = -this.height; x < this.width + this.height; x += spacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x + this.height, this.height);
      this.ctx.stroke();
    }
    this.ctx.restore();

    // Edge vignette — makes it feel like a real map on a table
    const vignette = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.3,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.85
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(2,8,20,0.46)');
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw sea zones
   */
  private drawSeaZones(): void {
    const simplified = this.isLargeMap();
    for (const territory of this.state.territories.values()) {
      if (!territory.isSea()) continue;
      this.drawTerritory(territory, true);
      if (!simplified) this.drawSeaWaves(territory.polygon);
    }
  }

  private drawSeaWaves(polygon: [number, number][]): void {
    if (polygon.length < 3) return;
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    for (const [px, py] of polygon) {
      if (px < bMinX) bMinX = px; if (py < bMinY) bMinY = py;
      if (px > bMaxX) bMaxX = px; if (py > bMaxY) bMaxY = py;
    }
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
    this.ctx.closePath();
    this.ctx.clip();
    this.ctx.strokeStyle = 'rgba(180, 210, 255, 0.10)';
    this.ctx.lineWidth = 1;
    const spacing = 11;
    const cos30 = Math.cos(Math.PI / 6), sin30 = Math.sin(Math.PI / 6);
    const diagLen = ((bMaxX - bMinX) + (bMaxY - bMinY)) * 1.4;
    const steps = Math.ceil(diagLen / spacing) + 2;
    const midX = (bMinX + bMaxX) / 2, midY = (bMinY + bMaxY) / 2;
    for (let i = -steps / 2; i < steps / 2; i++) {
      const ox = midX + (-sin30) * i * spacing;
      const oy = midY + cos30 * i * spacing;
      this.ctx.beginPath();
      this.ctx.moveTo(ox - cos30 * diagLen / 2, oy - sin30 * diagLen / 2);
      this.ctx.lineTo(ox + cos30 * diagLen / 2, oy + sin30 * diagLen / 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  /**
   * Draw land territories
   */
  private drawLandTerritories(): void {
    for (const territory of this.state.territories.values()) {
      if (territory.isSea()) continue;
      this.drawTerritory(territory, false);
    }
  }

  /**
   * Draw a single territory
   */
  private drawTerritory(territory: Territory, isSea: boolean): void {
    const polygon = territory.polygon;
    if (polygon.length < 3) return;

    this.ctx.beginPath();
    this.ctx.moveTo(polygon[0][0], polygon[0][1]);
    
    for (let i = 1; i < polygon.length; i++) {
      this.ctx.lineTo(polygon[i][0], polygon[i][1]);
    }
    this.ctx.closePath();

    // Determine fill color (base only — dynamic highlights are drawn as overlays in drawDynamicTerritoryOverlays)
    const fillColor = this.getTerritoryColor(territory, isSea);

    // Check fog of war
    const isVisible = this.options.fogOfWarCallback
      ? this.options.fogOfWarCallback(territory.id)
      : true;

    // Fill gradient — sea gets a depth gradient, land gets a top-lit shading
    const [cx, cy] = territory.center;
    let gradient: CanvasGradient;
    if (isSea) {
      gradient = this.ctx.createLinearGradient(cx, cy - 50, cx, cy + 50);
      gradient.addColorStop(0,   '#2a4878'); // lighter surface blue
      gradient.addColorStop(0.5, this.COLORS.seaDeep);
      gradient.addColorStop(1,   '#121e38'); // deep water dark
    } else {
      gradient = this.ctx.createLinearGradient(cx, cy - 60, cx, cy + 60);
      gradient.addColorStop(0, this.lightenColor(fillColor, 12));
      gradient.addColorStop(1, this.darkenColor(fillColor, 12));
    }
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
    this.ctx.globalAlpha = 1;

    // Terrain texture overlay — clipped to polygon, drawn before capture animation
    if (!isSea && !this.isLargeMap()) {
      this.drawTerrainTexture(polygon, territory.terrain ?? 'plains');
    }

    // Fog of war: draw a dark overlay polygon on top of hidden territories
    if (!isVisible && !isSea) {
      const isAdjacentFog = this.options.adjacentFogCallback?.(territory.id) ?? false;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(polygon[0][0], polygon[0][1]);
      for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
      this.ctx.closePath();
      // Adjacent-fog territories get a slightly lighter overlay to hint at their existence
      this.ctx.fillStyle = isAdjacentFog ? 'rgba(0, 0, 20, 0.52)' : 'rgba(0, 0, 20, 0.72)';
      this.ctx.fill();
      // Draw "?" marker for adjacent-fog territories so players know something is there
      if (isAdjacentFog) {
        const [cx, cy] = territory.center;
        this.ctx.font = 'bold 14px sans-serif';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('?', cx, cy);
      }
      this.ctx.restore();
    }

    // Intel reveal indicator: teal dashed border for espionage-revealed territories
    const isIntel = isVisible && !isSea && (this.options.intelRevealCallback?.(territory.id) ?? false);
    if (isIntel) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(polygon[0][0], polygon[0][1]);
      for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
      this.ctx.closePath();
      this.ctx.strokeStyle = 'rgba(0, 210, 180, 0.7)';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([6, 4]);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Inner vignette: radial gradient darkens territory edges for genuine depth
    if (!this.isLargeMap()) {
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      for (const [px, py] of polygon) {
        if (px < bMinX) bMinX = px; if (py < bMinY) bMinY = py;
        if (px > bMaxX) bMaxX = px; if (py > bMaxY) bMaxY = py;
      }
      const radius = Math.max(bMaxX - bMinX, bMaxY - bMinY) * 0.68;
      const innerAlpha = isSea ? 0.28 : 0.22;
      const vig = this.ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(0,0,0,${innerAlpha})`);
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.moveTo(polygon[0][0], polygon[0][1]);
      for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
      this.ctx.closePath();
      this.ctx.clip();
      this.ctx.fillStyle = vig;
      this.ctx.fillRect(bMinX, bMinY, bMaxX - bMinX, bMaxY - bMinY);
      this.ctx.restore();
    }
  }

  /**
   * Draw territory borders.
   * Owned territories get a thick faction-colored outline — this is the
   * primary ownership indicator in the wargame map aesthetic.
   */
  private drawBorders(): void {
    const tracePath = (polygon: number[][]) => {
      this.ctx.beginPath();
      this.ctx.moveTo(polygon[0][0], polygon[0][1]);
      for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
      this.ctx.closePath();
    };

    for (const territory of this.state.territories.values()) {
      const polygon = territory.polygon;
      if (polygon.length < 3) continue;

      this.ctx.setLineDash([]);

      if (territory.isSea()) {
        tracePath(polygon);
        this.ctx.strokeStyle = 'rgba(180,200,230,0.18)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([6, 6]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        continue;
      }

      // Selected glow is drawn dynamically by drawSelectionGlow(); here just draw the base border.

      // Owned territory: dark thin base stroke first, then faction color on top
      const faction = territory.owner ? this.state.factionRegistry.get(territory.owner) : null;
      if (faction) {
        // Dark outline (gives the colored border a defined edge)
        tracePath(polygon);
        this.ctx.strokeStyle = this.COLORS.borderDark;
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
        // Faction-colored inner stroke
        tracePath(polygon);
        this.ctx.strokeStyle = faction.color;
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();
      } else {
        // Neutral territory: simple dark brown thin border
        tracePath(polygon);
        this.ctx.strokeStyle = this.COLORS.borderNeutral;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    }
  }

  /** Draw the animated selection glow on the currently selected territory (dynamic layer only). */
  private drawSelectionGlow(): void {
    const id = this.state.selectedTerritoryId;
    if (!id) return;
    const territory = this.state.territories.get(id);
    if (!territory || territory.isSea()) return;
    const polygon = territory.polygon;
    if (polygon.length < 3) return;

    const pulse = (Math.sin(Date.now() / 280) + 1) / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
    this.ctx.closePath();
    this.ctx.strokeStyle = `rgba(220, 170, 30, ${0.65 + pulse * 0.35})`;
    this.ctx.lineWidth = 3 + pulse * 2.5;
    this.ctx.shadowColor = '#ffd700';
    this.ctx.shadowBlur = 8 + pulse * 10;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  /** Badge showing which unit type is armed for orders on the selected territory. */
  private drawActiveCommandBadge(): void {
    const id = this.state.selectedTerritoryId;
    if (!id || !this.activeCommandUnitTypeId) return;
    const territory = this.state.territories.get(id);
    if (!territory) return;
    const [cx, cy] = territory.center;
    const label = this.activeCommandUnitIcon || '●';
    this.ctx.save();
    this.ctx.font = '16px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this.ctx.beginPath();
    this.ctx.arc(cx + 14, cy - 14, 11, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(72, 220, 120, 0.9)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.fillStyle = '#fff';
    this.ctx.fillText(label, cx + 14, cy - 14);
    this.ctx.restore();
  }

  /**
   * Resolve which faction color to use for unit counters on this territory.
   * Sea zones often have no owner even when a fleet is present.
   */
  private resolveTerritoryDisplayFactionId(territory: import('../data/Territory').Territory): string | null {
    if (territory.owner) return territory.owner;

    if (territory.type === 'sea' && territory.getTotalUnitCount() > 0) {
      for (const adjId of territory.adjacentTo) {
        const adj = this.state.territories.get(adjId);
        if (adj?.owner && adj.isLand()) return adj.owner;
      }
    }

    return null;
  }

  private getTerritoryDisplayUnits(territory: import('../data/Territory').Territory) {
    return territory.units.filter(pu => {
      const ut = this.state.unitRegistry.get(pu.unitTypeId);
      if (!ut) return false;
      if (ut.domain === 'sea' && territory.type !== 'sea') return false;
      return true;
    });
  }

  /**
   * Draw unit tokens as square NATO-style wargame counters.
   * The entire counter is clipped to the territory polygon so it
   * can never bleed into a neighbouring tile.
   */
  private drawUnitTokens(): void {
    const simplified = this.isLargeMap();
    for (const territory of this.state.territories.values()) {
      const displayUnits = this.getTerritoryDisplayUnits(territory);
      const unitCount = displayUnits.reduce((sum, pu) => sum + pu.count, 0);
      if (unitCount === 0) continue;

      const isVisible = this.options.fogOfWarCallback
        ? this.options.fogOfWarCallback(territory.id)
        : true;
      if (!isVisible) continue;

      const [cx, cy] = territory.center;
      if (simplified) {
        const displayFactionId = this.resolveTerritoryDisplayFactionId(territory);
        const faction = displayFactionId ? this.state.factionRegistry.get(displayFactionId) : null;
        const color = faction?.color ?? '#666666';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = this.COLORS.borderDark;
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        if (unitCount > 1) {
          this.ctx.fillStyle = '#fff';
          this.ctx.font = 'bold 8px monospace';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(String(unitCount), cx, cy);
        }
        continue;
      }
      const displayFactionId = this.resolveTerritoryDisplayFactionId(territory);
      const faction = displayFactionId ? this.state.factionRegistry.get(displayFactionId) : null;
      const factionColor = faction?.color ?? '#666666';

      // Counter size: 55% of the territory's bounding box, capped at 36×26
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      for (const [px, py] of territory.polygon) {
        if (px < bMinX) bMinX = px; if (py < bMinY) bMinY = py;
        if (px > bMaxX) bMaxX = px; if (py > bMaxY) bMaxY = py;
      }
      const w = Math.min(36, Math.max(14, (bMaxX - bMinX) * 0.55));
      const h = Math.min(26, Math.max(11, (bMaxY - bMinY) * 0.50));
      const x = cx - w / 2, y = cy - h / 2;

      this.ctx.save();

      // --- Clip everything to the territory polygon ---
      this.ctx.beginPath();
      this.ctx.moveTo(territory.polygon[0][0], territory.polygon[0][1]);
      for (let i = 1; i < territory.polygon.length; i++) {
        this.ctx.lineTo(territory.polygon[i][0], territory.polygon[i][1]);
      }
      this.ctx.closePath();
      this.ctx.clip();

      // Counter face
      const counterGrad = this.ctx.createLinearGradient(x, y, x, y + h);
      counterGrad.addColorStop(0, this.lightenColor(factionColor, 18));
      counterGrad.addColorStop(1, this.darkenColor(factionColor, 12));
      this.ctx.fillStyle = counterGrad;
      this.ctx.fillRect(x, y, w, h);

      // Outer border
      this.ctx.strokeStyle = this.COLORS.borderDark;
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(x, y, w, h);

      // Inner frame (NATO counter style)
      const inset = Math.max(2, w * 0.07);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);

      // Role sprite + count — on sea zones prefer showing a ship icon over mixed stacks
      const primaryUnit = territory.type === 'sea'
        ? (displayUnits.find(pu => {
            const ut = this.state.unitRegistry.get(pu.unitTypeId);
            return ut?.domain === 'sea';
          }) ?? displayUnits[0])
        : displayUnits.reduce((max, pu) => pu.count > max.count ? pu : max, displayUnits[0]);
      const primaryType = primaryUnit ? this.state.unitRegistry.get(primaryUnit.unitTypeId) : null;

      if (primaryType && w >= 18 && h >= 14) {
        // Sprite in upper ~62% of counter, count in lower strip
        const symCy = y + h * 0.40;
        this.drawUnitSprite(cx, symCy, w * 0.64, h * 0.46, primaryType.domain ?? 'land', primaryUnit.unitTypeId, factionColor);
        const countSize = Math.max(7, Math.min(10, h * 0.36));
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = `bold ${countSize}px "Courier New", monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = 'rgba(0,0,0,0.9)';
        this.ctx.shadowBlur = 2;
        this.ctx.fillText(unitCount.toString(), cx, y + h * 0.78);
        this.ctx.shadowBlur = 0;
      } else {
        // Small counter: just the count
        const fontSize = Math.max(9, Math.min(14, h * 0.62));
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = `bold ${fontSize}px "Courier New", monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.shadowColor = 'rgba(0,0,0,0.9)';
        this.ctx.shadowBlur = 2;
        this.ctx.fillText(unitCount.toString(), cx, cy);
        this.ctx.shadowBlur = 0;
      }

      this.ctx.restore();
    }
  }

  /**
   * Draw capital and factory markers using canvas shapes (no emoji).
   */
  private drawMarkers(): void {
    for (const territory of this.state.territories.values()) {
      const [cx, cy] = territory.center;
      const unitCount = territory.getTotalUnitCount();
      const markerY = unitCount > 0 ? cy - 24 : cy;

      // Capital: command flag token
      if (territory.isCapital) {
        const sx = unitCount > 0 ? cx - 16 : cx - 10;
        const faction = territory.owner ? this.state.factionRegistry.get(territory.owner) : null;
        this.drawCapitalSprite(sx, markerY, faction?.color ?? '#f5c842');
      }

      // Factory: industrial token
      if (territory.hasFactory) {
        const fx = unitCount > 0 ? cx + 12 : cx + 8;
        this.drawFactorySprite(fx, markerY, territory.owner ? '#9ca3af' : '#7a7468');
      }

      // Fortification badge: small tower symbol based on level
      const fortLevel = (territory as any).fortificationLevel ?? 0;
      if (fortLevel > 0) {
        const fbx = cx - (territory.isCapital ? 26 : 16);
        this.drawFortificationBadge(fbx, markerY - 8, fortLevel);
      }

      // Commander badge: gold diamond with ⚜ if a named general is present
      const hasCommander = territory.units.some((u: any) => u.commander);
      if (hasCommander) {
        const bx = cx + (territory.isCapital ? 26 : 16);
        const by = markerY - 8;
        this.drawCommanderBadge(bx, by);
      }

      // Veteran badge: silver star if any unit stack has battle experience
      const hasVeterans = territory.units.some((u: any) => (u.veteranCount ?? 0) > 0);
      if (hasVeterans) {
        const vx = cx + (territory.isCapital || hasCommander ? 38 : 28);
        this.drawVeteranBadge(vx, markerY - 8);
      }
    }
  }

  /** Draw a small gold commander badge diamond. */
  private drawCommanderBadge(cx: number, cy: number): void {
    this.ctx.save();
    const r = 5;
    this.ctx.beginPath();
    this.ctx.moveTo(cx, cy - r);
    this.ctx.lineTo(cx + r, cy);
    this.ctx.lineTo(cx, cy + r);
    this.ctx.lineTo(cx - r, cy);
    this.ctx.closePath();
    this.ctx.fillStyle = '#f5c842';
    this.ctx.fill();
    this.ctx.strokeStyle = '#2a1808';
    this.ctx.lineWidth = 0.8;
    this.ctx.stroke();
    this.ctx.restore();
  }

  /** Draw a small silver star badge for veteran units. */
  private drawVeteranBadge(cx: number, cy: number): void {
    this.ctx.save();
    this.drawStar(cx, cy, 5, '#c0c0c0', '#555555');
    this.ctx.restore();
  }

  /** Draw a small fortification badge — brown square tower, darker outline for level 2. */
  private drawFortificationBadge(cx: number, cy: number, level: 1 | 2): void {
    this.ctx.save();
    const w = 8, h = 7;
    const fill = level >= 2 ? '#4a90d9' : '#a0763e';
    const stroke = level >= 2 ? '#1a3a6a' : '#5a3a1a';
    // Tower body
    this.ctx.fillStyle = fill;
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 0.8;
    this.ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    this.ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    // Battlements (two small squares on top)
    const bw = 2.5, bh = 2;
    this.ctx.fillRect(cx - w / 2, cy - h / 2 - bh, bw, bh);
    this.ctx.strokeRect(cx - w / 2, cy - h / 2 - bh, bw, bh);
    this.ctx.fillRect(cx + w / 2 - bw, cy - h / 2 - bh, bw, bh);
    this.ctx.strokeRect(cx + w / 2 - bw, cy - h / 2 - bh, bw, bh);
    this.ctx.restore();
  }

  /** Draw a tiny role sprite inside the unit token upper zone. */
  private drawUnitSprite(cx: number, cy: number, w: number, h: number, domain: string, unitTypeId: string, factionColor: string): void {
    const id = unitTypeId.toLowerCase();
    if (domain === 'air') {
      this.drawAircraftSprite(cx, cy, w, h, id, factionColor);
    } else if (domain === 'sea') {
      this.drawShipSprite(cx, cy, w, h, id, factionColor, this.unitEra);
    } else if (id.includes('armor') || id.includes('tank') || id.includes('panzer') || id.includes('mech')) {
      this.drawTankSprite(cx, cy, w, h, factionColor);
    } else if (id.includes('artillery') || id.includes('cannon') || id.includes('howitzer')) {
      this.drawArtillerySprite(cx, cy, w, h, factionColor);
    } else if (id.includes('anti_air') || id.includes('antiair') || id.includes('_aa') || id.includes('flak')) {
      this.drawAASprite(cx, cy, w, h, factionColor);
    } else {
      this.drawInfantrySprite(cx, cy, w, h, factionColor);
    }
  }

  private drawInfantrySprite(cx: number, cy: number, w: number, h: number, factionColor: string): void {
    const ctx = this.ctx;
    const r = Math.max(1.6, Math.min(w, h) * 0.18);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = this.lightenColor(factionColor, 34);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx - w * 0.17, cy - h * 0.18, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.15, cy - h * 0.02);
    ctx.lineTo(cx + w * 0.16, cy + h * 0.20);
    ctx.moveTo(cx - w * 0.02, cy - h * 0.10);
    ctx.lineTo(cx + w * 0.34, cy - h * 0.32);
    ctx.moveTo(cx + w * 0.18, cy - h * 0.22);
    ctx.lineTo(cx + w * 0.42, cy - h * 0.36);
    ctx.stroke();
    ctx.restore();
  }

  private drawTankSprite(cx: number, cy: number, w: number, h: number, factionColor: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = this.lightenColor(factionColor, 26);
    ctx.strokeStyle = 'rgba(255,255,255,0.88)';
    ctx.lineWidth = 1.1;
    this.roundRect(cx - w * 0.42, cy - h * 0.16, w * 0.72, h * 0.34, h * 0.12);
    ctx.fill();
    ctx.stroke();
    this.roundRect(cx - w * 0.18, cy - h * 0.30, w * 0.32, h * 0.24, h * 0.08);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.10, cy - h * 0.20);
    ctx.lineTo(cx + w * 0.44, cy - h * 0.34);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx - w * 0.28 + i * w * 0.22, cy + h * 0.10, Math.max(1, h * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawArtillerySprite(cx: number, cy: number, w: number, h: number, factionColor: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle = this.lightenColor(factionColor, 30);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, cy + h * 0.20);
    ctx.lineTo(cx + w * 0.34, cy - h * 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - w * 0.22, cy + h * 0.22, Math.max(1.5, h * 0.16), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + w * 0.12, cy + h * 0.08, Math.max(1, h * 0.10), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawAASprite(cx: number, cy: number, w: number, h: number, factionColor: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle = this.lightenColor(factionColor, 30);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + h * 0.30);
    ctx.lineTo(cx, cy - h * 0.34);
    ctx.moveTo(cx - w * 0.30, cy - h * 0.05);
    ctx.lineTo(cx, cy - h * 0.34);
    ctx.lineTo(cx + w * 0.30, cy - h * 0.05);
    ctx.moveTo(cx - w * 0.22, cy + h * 0.30);
    ctx.lineTo(cx + w * 0.22, cy + h * 0.30);
    ctx.stroke();
    ctx.restore();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  private drawAircraftSprite(cx: number, cy: number, w: number, h: number, unitTypeId: string, factionColor: string): void {
    const ctx = this.ctx;
    const bomber = unitTypeId.includes('bomber') || unitTypeId.includes('heavy');
    ctx.save();
    ctx.fillStyle = this.lightenColor(factionColor, 34);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.44, cy);
    ctx.lineTo(cx - w * 0.12, cy - h * 0.16);
    ctx.lineTo(cx - w * 0.40, cy - h * (bomber ? 0.34 : 0.24));
    ctx.lineTo(cx - w * 0.28, cy);
    ctx.lineTo(cx - w * 0.40, cy + h * (bomber ? 0.34 : 0.24));
    ctx.lineTo(cx - w * 0.12, cy + h * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (bomber) {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.05, cy - h * 0.14);
      ctx.lineTo(cx + w * 0.10, cy + h * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawShipSprite(
    cx: number,
    cy: number,
    w: number,
    h: number,
    unitTypeId: string,
    factionColor: string,
    era: UnitEra = 'wwii',
  ): void {
    const ctx = this.ctx;
    const submarine = unitTypeId.includes('sub');
    const carrier = unitTypeId.includes('carrier');
    const transport = unitTypeId.includes('transport');
    const battleship = unitTypeId.includes('battle');
    const cruiser = unitTypeId.includes('cruiser');
    const destroyer = unitTypeId.includes('destroy');
    ctx.save();
    ctx.fillStyle = this.lightenColor(factionColor, 28);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;

    if (submarine) {
      this.drawSubmarineSprite(cx, cy, w, h, era);
    } else if (carrier) {
      this.drawCarrierSprite(cx, cy, w, h, era);
    } else if (transport) {
      this.drawTransportSprite(cx, cy, w, h, era);
    } else if (battleship) {
      this.drawBattleshipSprite(cx, cy, w, h, era);
    } else if (cruiser) {
      this.drawCruiserSprite(cx, cy, w, h, era);
    } else if (destroyer) {
      this.drawDestroyerSprite(cx, cy, w, h, era);
    } else {
      this.drawDestroyerSprite(cx, cy, w, h, era);
    }
    ctx.restore();
  }

  private drawBattleshipSprite(cx: number, cy: number, w: number, h: number, era: UnitEra): void {
    const ctx = this.ctx;
    const long = era === 'wwi' || era === 'wwii';
    const bow = long ? w * 0.48 : w * 0.40;
    const stern = long ? w * 0.46 : w * 0.36;
    ctx.beginPath();
    ctx.moveTo(cx - stern, cy - h * 0.02);
    ctx.lineTo(cx + bow * 0.72, cy - h * 0.06);
    ctx.lineTo(cx + bow, cy + h * 0.02);
    ctx.lineTo(cx + bow * 0.55, cy + h * 0.28);
    ctx.lineTo(cx - stern * 0.82, cy + h * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const turretCount = era === 'wwi' ? 2 : era === 'modern' ? 1 : 3;
    for (let i = 0; i < turretCount; i++) {
      const tx = cx - stern * 0.35 + i * (stern + bow) * 0.22;
      ctx.fillRect(tx - w * 0.05, cy - h * 0.24, w * 0.10, h * 0.10);
      ctx.strokeRect(tx - w * 0.05, cy - h * 0.24, w * 0.10, h * 0.10);
    }
    if (era === 'wwi') {
      ctx.fillRect(cx - w * 0.06, cy - h * 0.34, w * 0.05, h * 0.12);
      ctx.fillRect(cx + w * 0.02, cy - h * 0.36, w * 0.05, h * 0.14);
    }
  }

  private drawDestroyerSprite(cx: number, cy: number, w: number, h: number, era: UnitEra): void {
    const ctx = this.ctx;
    const slim = era === 'modern' || era === 'coldwar';
    const bow = slim ? w * 0.34 : w * 0.40;
    const stern = slim ? w * 0.30 : w * 0.36;
    ctx.beginPath();
    if (era === 'modern') {
      ctx.moveTo(cx - stern, cy + h * 0.08);
      ctx.lineTo(cx + bow * 0.55, cy - h * 0.10);
      ctx.lineTo(cx + bow, cy + h * 0.04);
      ctx.lineTo(cx - stern * 0.7, cy + h * 0.22);
    } else {
      ctx.moveTo(cx - stern, cy - h * 0.04);
      ctx.lineTo(cx + bow * 0.72, cy - h * 0.06);
      ctx.lineTo(cx + bow, cy + h * 0.04);
      ctx.lineTo(cx - stern * 0.75, cy + h * 0.24);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (era === 'wwi') {
      ctx.beginPath();
      ctx.moveTo(cx + bow * 0.35, cy - h * 0.12);
      ctx.lineTo(cx + bow * 0.55, cy - h * 0.28);
      ctx.stroke();
    } else if (era === 'coldwar' || era === 'modern') {
      ctx.strokeRect(cx - w * 0.04, cy - h * 0.22, w * 0.14, h * 0.08);
    }
  }

  private drawCruiserSprite(cx: number, cy: number, w: number, h: number, era: UnitEra): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.38, cy - h * 0.03);
    ctx.lineTo(cx + w * 0.30, cy - h * 0.05);
    ctx.lineTo(cx + w * 0.36, cy + h * 0.05);
    ctx.lineTo(cx - w * 0.30, cy + h * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(cx - w * 0.08, cy - h * 0.22, w * 0.08, h * 0.08);
    if (era === 'coldwar' || era === 'modern') {
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.08, cy - h * 0.10);
      ctx.lineTo(cx + w * 0.24, cy - h * 0.24);
      ctx.stroke();
    }
  }

  private drawCarrierSprite(cx: number, cy: number, w: number, h: number, era: UnitEra): void {
    const ctx = this.ctx;
    const deckW = era === 'modern' ? w * 0.50 : era === 'coldwar' ? w * 0.46 : w * 0.38;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.40, cy + h * 0.04);
    ctx.lineTo(cx + w * 0.28, cy - h * 0.02);
    ctx.lineTo(cx + w * 0.34, cy + h * 0.22);
    ctx.lineTo(cx - w * 0.34, cy + h * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeRect(cx - deckW * 0.5, cy - h * 0.28, deckW, h * 0.16);
    if (era === 'modern') {
      ctx.beginPath();
      ctx.moveTo(cx + deckW * 0.15, cy - h * 0.28);
      ctx.lineTo(cx + deckW * 0.28, cy - h * 0.42);
      ctx.stroke();
    }
  }

  private drawTransportSprite(cx: number, cy: number, w: number, h: number, era: UnitEra): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, cy - h * 0.02);
    ctx.lineTo(cx + w * 0.26, cy - h * 0.04);
    ctx.lineTo(cx + w * 0.20, cy + h * 0.24);
    ctx.lineTo(cx - w * 0.30, cy + h * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const deckW = era === 'modern' ? w * 0.30 : w * 0.24;
    ctx.strokeRect(cx - deckW * 0.5, cy - h * 0.20, deckW, h * 0.10);
  }

  private drawSubmarineSprite(cx: number, cy: number, w: number, h: number, era: UnitEra): void {
    const ctx = this.ctx;
    const elongated = era === 'coldwar' || era === 'modern';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.04, w * (elongated ? 0.46 : 0.40), h * (elongated ? 0.22 : 0.24), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (era === 'wwi' || era === 'wwii') {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.04, cy - h * 0.18);
      ctx.lineTo(cx - w * 0.04, cy - h * 0.36);
      ctx.lineTo(cx + w * 0.08, cy - h * 0.36);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + w * 0.06, cy - h * 0.10);
      ctx.lineTo(cx + w * 0.10, cy - h * 0.18);
      ctx.stroke();
    }
  }

  /** Draw subtle terrain texture clipped to polygon. */
  private drawTerrainTexture(polygon: [number, number][], terrain: string): void {
    if (terrain === 'plains' || terrain === 'coastal') return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(polygon[0][0], polygon[0][1]);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0], polygon[i][1]);
    ctx.closePath();
    ctx.clip();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of polygon) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    ctx.globalAlpha = 0.18;
    switch (terrain) {
      case 'mountain': {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.7;
        const sp = 14;
        for (let y = minY; y <= maxY; y += sp) {
          ctx.beginPath();
          for (let x = minX; x <= maxX; x += sp * 1.5) {
            ctx.moveTo(x, y + sp * 0.5);
            ctx.lineTo(x + sp * 0.75, y);
            ctx.lineTo(x + sp * 1.5, y + sp * 0.5);
          }
          ctx.stroke();
        }
        break;
      }
      case 'forest':
      case 'jungle': {
        ctx.fillStyle = terrain === 'jungle' ? '#1a3010' : '#2a4020';
        const ds = 13;
        for (let y = minY + 5; y <= maxY; y += ds) {
          const xOff = (Math.floor((y - minY) / ds) % 2 === 0) ? 5 : 11;
          for (let x = minX + xOff; x <= maxX; x += ds) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'desert': {
        ctx.strokeStyle = '#c08020';
        ctx.lineWidth = 0.6;
        const ws = 12;
        for (let y = minY + 4; y <= maxY; y += ws) {
          ctx.beginPath();
          for (let x = minX; x <= maxX; x += 5) {
            const wy = y + Math.sin((x - minX) * 0.3) * 2;
            if (x === minX) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
          }
          ctx.stroke();
        }
        break;
      }
      case 'arctic': {
        ctx.strokeStyle = '#c8e8ff';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 8]);
        const is = 11;
        for (let y = minY + 4; y <= maxY; y += is) {
          ctx.beginPath();
          ctx.moveTo(minX, y);
          ctx.lineTo(maxX, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        break;
      }
      case 'urban': {
        ctx.fillStyle = '#404050';
        const gs = 11;
        for (let y = minY + 4; y <= maxY; y += gs) {
          for (let x = minX + 4; x <= maxX; x += gs) {
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
          }
        }
        break;
      }
    }
    ctx.restore();
  }

  /** Draw a 5-pointed star centered at (cx, cy) with given outer radius. */
  private drawStar(cx: number, cy: number, r: number, fill: string, stroke: string): void {
    this.ctx.save();
    this.ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const outerA = (i * 4 * Math.PI / 5) - Math.PI / 2;
      const innerA = outerA + Math.PI / 5;
      if (i === 0) this.ctx.moveTo(cx + Math.cos(outerA) * r, cy + Math.sin(outerA) * r);
      else         this.ctx.lineTo(cx + Math.cos(outerA) * r, cy + Math.sin(outerA) * r);
      this.ctx.lineTo(cx + Math.cos(innerA) * (r * 0.42), cy + Math.sin(innerA) * (r * 0.42));
    }
    this.ctx.closePath();
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 0.8;
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawCapitalSprite(cx: number, cy: number, factionColor: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#f5c842';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy + 5);
    ctx.lineTo(cx - 3.5, cy - 6);
    ctx.stroke();

    ctx.fillStyle = this.lightenColor(factionColor, 28);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 2.5, cy - 6);
    ctx.lineTo(cx + 6, cy - 4);
    ctx.lineTo(cx + 4, cy + 1);
    ctx.lineTo(cx - 2.5, cy - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    this.drawStar(cx - 4.8, cy + 3.2, 3.5, '#f5c842', '#2a1808');
    ctx.restore();
  }

  private drawFactorySprite(cx: number, cy: number, fill: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    this.roundRect(cx - 10, cy - 8, 20, 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = fill;
    ctx.strokeStyle = '#273142';
    ctx.lineWidth = 0.8;
    ctx.fillRect(cx - 7, cy - 1, 14, 7);
    ctx.strokeRect(cx - 7, cy - 1, 14, 7);
    ctx.fillRect(cx - 5, cy - 6, 3, 6);
    ctx.strokeRect(cx - 5, cy - 6, 3, 6);
    ctx.fillRect(cx + 1, cy - 8, 3, 8);
    ctx.strokeRect(cx + 1, cy - 8, 3, 8);

    ctx.fillStyle = 'rgba(229,231,235,0.85)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cx - 5 + i * 4, cy + 1.5, 2, 2);
    }
    ctx.restore();
  }

  /**
   * Draw per-interaction and per-animation overlays on top of the static layer.
   * Called every frame during the animation loop — must be cheap.
   */
  /** Territories that need per-frame overlay work (avoids O(n) scan on mega maps). */
  private getOverlayTerritoryIds(): Set<string> | null {
    if (!this.isLargeMap()) return null;

    const ids = new Set<string>();
    if (this.state.selectedTerritoryId) ids.add(this.state.selectedTerritoryId);
    if (this.hoveredTerritoryId) ids.add(this.hoveredTerritoryId);
    for (const id of this.validMoveTargets) ids.add(id);
    for (const id of this.attackTargets) ids.add(id);
    for (const id of this.coastalStrikeTargets) ids.add(id);
    for (const id of this.mobilizableTargets) ids.add(id);
    for (const id of this.mobilizedTargets) ids.add(id);
    for (const id of this.captureAnimations.keys()) ids.add(id);
    for (const id of this.aiPulseTerritories.keys()) ids.add(id);

    if (this.options.highlightValidMoves && this.validMoveTargets.size > 0) {
      for (const id of this.validMoveTargets) {
        this.state.territories.get(id)?.adjacentTo.forEach(adj => ids.add(adj));
      }
      if (this.state.selectedTerritoryId) {
        this.state.territories.get(this.state.selectedTerritoryId)?.adjacentTo.forEach(adj => ids.add(adj));
      }
    }
    return ids;
  }

  private drawDynamicTerritoryOverlays(): void {
    const selectedId = this.state.selectedTerritoryId;
    const currentFaction = this.state.getCurrentFaction();
    const overlayIds = this.getOverlayTerritoryIds();
    const territories = overlayIds
      ? [...overlayIds].map(id => this.state.territories.get(id)).filter((t): t is Territory => !!t)
      : [...this.state.territories.values()];

    for (const territory of territories) {
      const polygon = territory.polygon;
      if (polygon.length < 3) continue;
      const isSea = territory.isSea();

      // Determine fill overlay color for this territory
      let overlayColor: string | null = null;

      const isSelected = territory.id === selectedId;
      const isHovered = territory.id === this.hoveredTerritoryId;
      const isDragHover = territory.id === this.dragHoverTerritoryId;

      if (this.options.highlightSelected && isSelected) {
        overlayColor = 'rgba(255,255,255,0.18)';
      } else if (isDragHover) {
        overlayColor = this.dragHoverKind === 'attack'
          ? 'rgba(255,68,68,0.62)'
          : this.dragHoverKind === 'move'
            ? 'rgba(68,255,68,0.55)'
            : 'rgba(255,255,255,0.12)';
      } else if (isHovered) {
        overlayColor = 'rgba(255,255,255,0.10)';
      }

      if (!isSea && this.options.highlightValidMoves) {
        if (this.coastalStrikeTargets.has(territory.id)) {
          overlayColor = 'rgba(251, 146, 60, 0.52)';
        } else if (this.attackTargets.has(territory.id)) {
          overlayColor = 'rgba(255,68,68,0.50)';
        } else if (this.validMoveTargets.has(territory.id)) {
          overlayColor = this.getDomainMoveOverlayColor(this.activeCommandDomain, false);
        }
      } else if (isSea && this.options.highlightValidMoves) {
        if (this.coastalStrikeTargets.has(territory.id)) {
          overlayColor = 'rgba(251, 146, 60, 0.62)';
        } else if (this.attackTargets.has(territory.id)) {
          overlayColor = 'rgba(255,96,96,0.58)';
        } else if (this.validMoveTargets.has(territory.id)) {
          overlayColor = this.getDomainMoveOverlayColor(this.activeCommandDomain, true);
        }
      }

      if (!isSea) {
        if (this.mobilizedTargets.has(territory.id)) {
          overlayColor = 'rgba(34,197,94,0.35)';
        } else if (this.mobilizableTargets.has(territory.id)) {
          // Pulse between 0.15 and 0.38 opacity at ~0.5 Hz to draw attention
          const pulse = 0.15 + 0.23 * Math.abs(Math.sin(Date.now() * 0.0025));
          overlayColor = `rgba(255,215,0,${pulse.toFixed(2)})`;
        }
      }

      // ZOC tint for non-move, non-attack land territories when move-highlights active
      if (!isSea && this.options.highlightValidMoves && currentFaction
          && !this.attackTargets.has(territory.id)
          && !this.coastalStrikeTargets.has(territory.id)
          && !this.validMoveTargets.has(territory.id)) {
        const inZOC = territory.adjacentTo.some(adjId => {
          const adj = this.state.territories.get(adjId);
          return adj && adj.type !== 'sea'
            && adj.owner !== null
            && currentFaction.isEnemyOf(adj.owner)
            && adj.getTotalUnitCount() > 0;
        });
        if (inZOC) overlayColor = 'rgba(255,102,0,0.22)';
      }

      if (overlayColor) {
        this.ctx.fillStyle = overlayColor;
        this.ctx.beginPath();
        this.ctx.moveTo(polygon[0][0], polygon[0][1]);
        for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
        this.ctx.closePath();
        this.ctx.fill();
      }

      // Capture color-bleed animation
      const captureAnim = !isSea ? this.captureAnimations.get(territory.id) : undefined;
      if (captureAnim) {
        const progress = Math.min(1, (Date.now() - captureAnim.startTime) / 1600);
        const alpha = Math.sin(progress * Math.PI) * 0.55;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(polygon[0][0], polygon[0][1]);
        for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
        this.ctx.closePath();
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = captureAnim.factionColor;
        this.ctx.fill();
        this.ctx.restore();
      }

      // AI activity shimmer
      const aiPulseStart = !isSea ? this.aiPulseTerritories.get(territory.id) : undefined;
      if (aiPulseStart !== undefined) {
        const progress = Math.min(1, (Date.now() - aiPulseStart) / 1800);
        const alpha = Math.sin(progress * Math.PI) * 0.38;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(polygon[0][0], polygon[0][1]);
        for (let i = 1; i < polygon.length; i++) this.ctx.lineTo(polygon[i][0], polygon[i][1]);
        this.ctx.closePath();
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = '#00d2b8';
        this.ctx.fill();
        this.ctx.restore();
      }
    }
  }

  /** Rebuild the static offscreen layer. Called when staticDirty or camera changes. */
  private rebuildStaticLayer(): void {
    if (!this.staticCanvas) {
      this.staticCanvas = document.createElement('canvas');
      const sCtx = this.staticCanvas.getContext('2d');
      if (!sCtx) return;
      this.staticCtx = sCtx;
    }
    if (this.staticCanvas.width !== this.width || this.staticCanvas.height !== this.height) {
      this.staticCanvas.width = this.width;
      this.staticCanvas.height = this.height;
    }

    // Swap to offscreen context for the static draw pass
    const mainCtx = this.ctx;
    this.ctx = this.staticCtx!;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground();

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    this.drawSeaZones();
    this.drawLandTerritories();
    this.drawBorders();
    if (this.options.showUnitCounts) this.drawUnitTokens();
    this.drawMarkers();

    this.ctx.restore();

    // Restore main context and mark static clean
    this.ctx = mainCtx;
    this.staticDirty = false;
    this.staticLastScale = this.scale;
    this.staticLastOffsetX = this.offsetX;
    this.staticLastOffsetY = this.offsetY;
  }

  /**
   * Get color for a territory based on owner.
   * Owned territories use a muted faction tint over a parchment base —
   * ownership is primarily communicated via the faction-colored border.
   */
  private getTerrainBaseColor(terrain: string): string {
    switch (terrain) {
      case 'mountain': return '#8a9198'; // gray-slate
      case 'forest':   return '#4f6840'; // muted forest green
      case 'desert':   return '#c4a455'; // sandy ochre
      case 'jungle':   return '#3d5c2a'; // deep jungle green
      case 'arctic':   return '#aac8e0'; // icy pale blue
      case 'urban':    return '#6c707c'; // concrete gray
      case 'coastal':  return '#7a9ea8'; // coastal teal
      default:         return '#b8aa88'; // plains / parchment
    }
  }

  private getTerritoryColor(territory: Territory, isSea: boolean): string {
    if (isSea) return this.COLORS.seaDeep;

    const terrainBase = this.getTerrainBaseColor(territory.terrain ?? 'plains');
    if (!territory.owner) return terrainBase;

    const faction = this.state.factionRegistry.get(territory.owner);
    if (!faction) return terrainBase;

    // 38% faction color blended into terrain-specific base
    return this.blendColors(terrainBase, faction.color, 0.38);
  }

  /**
   * Lighten a hex color
   */
  private lightenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + amount);
    const b = Math.min(255, (num & 0x0000FF) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /**
   * Darken a hex color
   */
  private darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, (num >> 16) - amount);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
    const b = Math.max(0, (num & 0x0000FF) - amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /**
   * Blend two colors
   */
  private blendColors(color1: string, color2: string, ratio: number): string {
    const c1 = parseInt(color1.replace('#', ''), 16);
    const c2 = parseInt(color2.replace('#', ''), 16);
    
    const r1 = c1 >> 16, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;
    const r2 = c2 >> 16, g2 = (c2 >> 8) & 0xFF, b2 = c2 & 0xFF;
    
    const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
    
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  setUnitDragController(controller: UnitDragController | null): void {
    this.unitDragController = controller;
  }

  clearUnitDrag(): void {
    this.unitDrag = null;
    this.dragHoverTerritoryId = null;
    this.dragHoverKind = 'invalid';
    this.render();
  }

  /**
   * Set valid move targets for highlighting
   */
  setValidMoveTargets(moves: string[], attacks: string[], coastalStrikes: string[] = []): void {
    this.validMoveTargets = new Set(moves);
    this.attackTargets = new Set(attacks);
    this.coastalStrikeTargets = new Set(coastalStrikes);
    this.render();
  }

  /** Sync naval/land unit art to the selected game era. */
  setUnitEra(era: UnitEra): void {
    this.unitEra = era;
    this.markStaticDirty();
    this.render();
  }

  /**
   * Clear valid move highlights
   */
  setActiveCommandStack(
    unitTypeId: string | null,
    icon = '',
    domain: 'land' | 'sea' | 'air' | null = null,
  ): void {
    this.activeCommandUnitTypeId = unitTypeId;
    this.activeCommandUnitIcon = icon;
    this.activeCommandDomain = domain;
    this.render();
  }

  private getDomainMoveOverlayColor(domain: 'land' | 'sea' | 'air' | null, onSea: boolean): string {
    if (domain === 'air') return onSea ? 'rgba(167,139,250,0.58)' : 'rgba(167,139,250,0.46)';
    if (domain === 'sea') return onSea ? 'rgba(56,189,248,0.58)' : 'rgba(34,211,238,0.42)';
    return onSea ? 'rgba(56,189,248,0.52)' : 'rgba(68,255,68,0.40)';
  }

  clearValidMoveTargets(): void {
    this.validMoveTargets.clear();
    this.attackTargets.clear();
    this.coastalStrikeTargets.clear();
    this.render();
  }

  /**
   * Set mobilizable territory targets for highlighting (build phase)
   */
  setMobilizationTargets(canMobilize: string[], alreadyMobilized: string[]): void {
    this.mobilizableTargets = new Set(canMobilize);
    this.mobilizedTargets = new Set(alreadyMobilized);
    // Keep the render loop alive so the pulse animation runs continuously
    if (canMobilize.length > 0) this.startContinuousRender();
    else this.render();
  }

  /**
   * Clear mobilization highlights
   */
  clearMobilizationTargets(): void {
    this.mobilizableTargets.clear();
    this.mobilizedTargets.clear();
    this.render();
  }

  /**
   * Center camera on a territory
   */
  centerOnTerritory(territoryId: string): void {
    const territory = this.state.territories.get(territoryId);
    if (!territory) return;

    const [cx, cy] = territory.center;
    this.offsetX = this.width / 2 - cx * this.scale;
    this.offsetY = this.height / 2 - cy * this.scale;
    this.render();
  }

  /**
   * Zoom by a factor
   */
  zoom(factor: number): void {
    const newScale = Math.max(0.3, Math.min(3, this.scale * factor));
    
    // Zoom toward center of screen
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    this.offsetX = centerX - (centerX - this.offsetX) * (newScale / this.scale);
    this.offsetY = centerY - (centerY - this.offsetY) * (newScale / this.scale);
    this.scale = newScale;
    
    this.render();
  }

  /**
   * Navigate to a percentage position on the map
   */
  navigateToPercent(xPercent: number, yPercent: number): void {
    // Calculate map bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const territory of this.state.territories.values()) {
      for (const [x, y] of territory.polygon) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;

    // Calculate target world position
    const worldX = minX + mapWidth * xPercent;
    const worldY = minY + mapHeight * yPercent;

    // Center on that position
    this.offsetX = this.width / 2 - worldX * this.scale;
    this.offsetY = this.height / 2 - worldY * this.scale;

    this.render();
  }

  /**
   * Fit map to screen
   */
  fitToScreen(insets: Partial<{ top: number; right: number; bottom: number; left: number }> = {}): void {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const territory of this.state.territories.values()) {
      for (const [x, y] of territory.polygon) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    const mapWidth = maxX - minX;
    const mapHeight = maxY - minY;
    const leftInset = insets.left ?? 0;
    const rightInset = insets.right ?? 0;
    const topInset = insets.top ?? 0;
    const bottomInset = insets.bottom ?? 0;
    const availableWidth = Math.max(320, this.width - leftInset - rightInset);
    const availableHeight = Math.max(240, this.height - topInset - bottomInset);

    const padding = 80;
    const scaleX = (availableWidth - padding * 2) / mapWidth;
    const scaleY = (availableHeight - padding * 2) / mapHeight;
    this.scale = Math.min(scaleX, scaleY, 2);

    this.offsetX = leftInset + (availableWidth - mapWidth * this.scale) / 2 - minX * this.scale;
    this.offsetY = topInset + (availableHeight - mapHeight * this.scale) / 2 - minY * this.scale;

    this.render();
  }

  // Event handlers
  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const territory = this.getTerritoryAtPoint(world.x, world.y);

    if (territory && this.unitDragController?.canDragFrom(territory.id)) {
      this.unitDrag = {
        fromId: territory.id,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        currentScreenX: e.clientX,
        currentScreenY: e.clientY,
        committed: false,
      };
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.didDrag = false;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (territory) {
      // Territory clicks are handled by onClick (select / attack) — don't pan the map.
      this.didDrag = false;
      return;
    }

    this.isDragging = true;
    this.didDrag = false;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.canvas.style.cursor = 'grabbing';
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.unitDrag) return;

    if (this.isDragging) return;

    const world = this.screenToWorld(x, y);
    const territory = this.getTerritoryAtPoint(world.x, world.y);
    const newHoveredId = territory?.id ?? null;

    if (newHoveredId !== this.hoveredTerritoryId) {
      this.hoveredTerritoryId = newHoveredId;
      const canDrag = newHoveredId && this.unitDragController?.canDragFrom(newHoveredId);
      this.canvas.style.cursor = canDrag ? 'grab' : newHoveredId ? 'pointer' : 'grab';
      this.territoryHoverCallback?.(newHoveredId, e.clientX, e.clientY);
      this.render();
    }
  }

  private onWindowMouseMove(e: MouseEvent): void {
    if (this.unitDrag) {
      this.unitDrag.currentScreenX = e.clientX;
      this.unitDrag.currentScreenY = e.clientY;

      const dx = e.clientX - this.unitDrag.startScreenX;
      const dy = e.clientY - this.unitDrag.startScreenY;
      if (!this.unitDrag.committed) {
        const panDx = e.clientX - this.lastMouseX;
        const panDy = e.clientY - this.lastMouseY;
        if (panDx !== 0 || panDy !== 0) {
          this.didDrag = true;
          this.offsetX += panDx;
          this.offsetY += panDy;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
          this.render();
        }
        if (Math.hypot(dx, dy) >= MapRenderer.UNIT_DRAG_THRESHOLD) {
          this.unitDrag.committed = true;
          this.unitDragController?.onDragStart(this.unitDrag.fromId);
          this.startContinuousRender();
        } else {
          return;
        }
      }

      if (this.unitDrag.committed) {
        this.didDrag = true;
        const rect = this.canvas.getBoundingClientRect();
        const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const hoverTerritory = this.getTerritoryAtPoint(world.x, world.y);
        const hoverId = hoverTerritory?.id ?? null;
        const kind = hoverId && hoverId !== this.unitDrag.fromId
          ? this.unitDragController?.getDropKind(this.unitDrag.fromId, hoverId) ?? 'invalid'
          : 'invalid';
        if (hoverId !== this.dragHoverTerritoryId || kind !== this.dragHoverKind) {
          this.dragHoverTerritoryId = hoverId;
          this.dragHoverKind = kind;
          this.unitDragController?.onDragHover(hoverId);
        }
        this.render();
      }
      return;
    }

    if (!this.isDragging) return;

    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    if (dx === 0 && dy === 0) return;

    this.didDrag = true;
    this.offsetX += dx;
    this.offsetY += dy;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.render();
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.unitDrag) {
      const drag = this.unitDrag;
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const target = this.getTerritoryAtPoint(world.x, world.y);

      if (drag.committed && target && target.id !== drag.fromId) {
        const kind = this.unitDragController?.getDropKind(drag.fromId, target.id) ?? 'invalid';
        if (kind !== 'invalid') {
          this.unitDragController?.onDragDrop(drag.fromId, target.id);
        } else {
          this.unitDragController?.onDragCancel();
        }
      } else if (!drag.committed && target) {
        this.state.selectTerritory(target.id);
        this.render();
      } else if (drag.committed) {
        this.unitDragController?.onDragCancel();
      }

      this.unitDrag = null;
      this.dragHoverTerritoryId = null;
      this.dragHoverKind = 'invalid';
      this.isDragging = false;
      this.canvas.style.cursor = this.hoveredTerritoryId ? 'grab' : 'grab';
      this.render();
      return;
    }

    this.isDragging = false;
    this.canvas.style.cursor = this.hoveredTerritoryId ? 'grab' : 'grab';
  }

  private drawUnitDragOverlay(): void {
    if (!this.unitDrag?.committed) return;

    const from = this.state.territories.get(this.unitDrag.fromId);
    if (!from) return;

    const fromScreen = this.worldToScreen(from.center[0], from.center[1]);
    const rect = this.canvas.getBoundingClientRect();
    const startX = fromScreen.x;
    const startY = fromScreen.y;

    let endX = this.unitDrag.currentScreenX - rect.left;
    let endY = this.unitDrag.currentScreenY - rect.top;
    if (this.dragHoverTerritoryId && this.dragHoverKind !== 'invalid') {
      const hover = this.state.territories.get(this.dragHoverTerritoryId);
      if (hover) {
        const hoverScreen = this.worldToScreen(hover.center[0], hover.center[1]);
        const dist = Math.hypot(hoverScreen.x - startX, hoverScreen.y - startY);
        if (dist < rect.width * 0.55) {
          endX = hoverScreen.x;
          endY = hoverScreen.y;
        }
      }
    }

    const stroke = this.dragHoverKind === 'attack'
      ? 'rgba(255, 80, 80, 0.9)'
      : this.dragHoverKind === 'move'
        ? 'rgba(72, 220, 120, 0.9)'
        : 'rgba(240, 224, 168, 0.75)';

    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([8, 6]);
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    this.ctx.fillStyle = stroke;
    this.ctx.beginPath();
    this.ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(3, this.scale * zoomFactor));
    
    this.offsetX = mouseX - (mouseX - this.offsetX) * (newScale / this.scale);
    this.offsetY = mouseY - (mouseY - this.offsetY) * (newScale / this.scale);
    this.scale = newScale;
    
    this.render();
  }

  private onClick(e: MouseEvent): void {
    if (this.didDrag) {
      this.didDrag = false;
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const world = this.screenToWorld(x, y);
    const territory = this.getTerritoryAtPoint(world.x, world.y);

    if (territory) {
      this.state.selectTerritory(territory.id);
      this.render();
    }
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    if (!this.contextMenuCallback) return;
    const rect = this.canvas.getBoundingClientRect();
    const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const territory = this.getTerritoryAtPoint(world.x, world.y);
    if (territory) this.contextMenuCallback(territory.id, e.clientX, e.clientY);
  }

  setContextMenuCallback(callback: (territoryId: string, clientX: number, clientY: number) => void): void {
    this.contextMenuCallback = callback;
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      this.isDragging = true;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (this.isDragging && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - this.lastMouseX;
      const dy = e.touches[0].clientY - this.lastMouseY;
      this.offsetX += dx;
      this.offsetY += dy;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
      this.render();
    }
  }

  private onTouchEnd(_e: TouchEvent): void {
    this.isDragging = false;
  }

  /**
   * Get territory at world coordinates
   */
  private getTerritoryAtPoint(x: number, y: number): Territory | null {
    // Check land territories first (they're on top)
    for (const territory of this.state.territories.values()) {
      if (!territory.isSea() && this.isPointInPolygon(x, y, territory.polygon)) {
        return territory;
      }
    }
    // Then check sea zones
    for (const territory of this.state.territories.values()) {
      if (territory.isSea() && this.isPointInPolygon(x, y, territory.polygon)) {
        return territory;
      }
    }
    return null;
  }

  /**
   * Point-in-polygon test
   */
  private isPointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }
}
