/**
 * MapRenderer - Renders the game map using HTML5 Canvas
 * Board game aesthetic with felt background and styled territories
 */

import { GameState } from '../engine/GameState';
import { Territory } from '../data/Territory';

export interface RenderOptions {
  showGrid: boolean;
  showUnitCounts: boolean;
  highlightSelected: boolean;
  highlightValidMoves: boolean;
  fogOfWarCallback?: (territoryId: string) => boolean; // Returns true if visible
  intelRevealCallback?: (territoryId: string) => boolean; // Returns true if espionage-revealed
  adjacentFogCallback?: (territoryId: string) => boolean; // Returns true if adjacent-but-hidden
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
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private hoveredTerritoryId: string | null = null;

  // Valid move highlights
  private validMoveTargets: Set<string> = new Set();
  private attackTargets: Set<string> = new Set();

  // Mobilization highlights (build phase)
  private mobilizableTargets: Set<string> = new Set();
  private mobilizedTargets: Set<string> = new Set();

  // Territory hover callback for tooltips
  private territoryHoverCallback: ((territoryId: string | null, clientX: number, clientY: number) => void) | null = null;

  // Map overlays: movement range, threat (enemy can reach)
  private overlayMode: 'off' | 'range' | 'threat' = 'off';
  private threatTerritoryIds: Set<string> = new Set();

  // Render options
  private options: RenderOptions = {
    showGrid: false,
    showUnitCounts: true,
    highlightSelected: true,
    highlightValidMoves: true,
  };

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

    this.setupCanvas();
    this.setupEventListeners();

    // Re-render whenever units are placed so AI mobilizations are visible immediately
    this.state.on('territory_mobilized', () => this.render());
    this.state.on('units_produced', () => this.render());
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
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));
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

  setTerritoryHoverCallback(callback: (territoryId: string | null, clientX: number, clientY: number) => void): void {
    this.territoryHoverCallback = callback;
  }

  setOverlayMode(mode: 'off' | 'range' | 'threat', threatIds?: Set<string>): void {
    this.overlayMode = mode;
    this.threatTerritoryIds = threatIds ?? new Set();
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
   * Main render function
   */
  render(): void {
    // Debug: check if territories exist
    const territoryCount = this.state.territories.size;
    if (territoryCount === 0) {
      console.error('!!! RENDER ERROR: No territories in state!');
    }
    
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Draw felt background
    this.drawBackground();
    
    // Apply camera transform
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
    
    // Draw sea zones first (below land)
    this.drawSeaZones();
    
    // Draw land territories
    this.drawLandTerritories();
    
    // Draw territory borders with board game style
    this.drawBorders();
    
    // Draw unit tokens
    if (this.options.showUnitCounts) {
      this.drawUnitTokens();
    }

    // Draw capital and factory markers
    this.drawMarkers();

    // Draw overlay (range or threat) when enabled
    if (this.overlayMode === 'range' && (this.validMoveTargets.size > 0 || this.attackTargets.size > 0)) {
      this.drawOverlayLayer(this.validMoveTargets, 'rgba(34, 197, 94, 0.25)');
      this.drawOverlayLayer(this.attackTargets, 'rgba(239, 68, 68, 0.3)');
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

  /**
   * Draw aged parchment / military map background
   */
  private drawBackground(): void {
    // Parchment base — diagonal gradient for aged-paper warmth
    const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0,   '#d8c88a');
    gradient.addColorStop(0.4, '#cfc090');
    gradient.addColorStop(1,   '#bfae78');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Edge vignette — makes it feel like a real map on a table
    const vignette = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.3,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.85
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(30,18,8,0.38)');
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Draw sea zones
   */
  private drawSeaZones(): void {
    for (const territory of this.state.territories.values()) {
      if (!territory.isSea()) continue;
      this.drawTerritory(territory, true);
    }
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

    // Determine fill color
    let fillColor = this.getTerritoryColor(territory, isSea);
    
    // Check fog of war
    const isVisible = this.options.fogOfWarCallback 
      ? this.options.fogOfWarCallback(territory.id) 
      : true;
    
    // Highlight effects
    const isSelected = territory.id === this.state.selectedTerritoryId;
    const isHovered = territory.id === this.hoveredTerritoryId;
    
    if (this.options.highlightSelected && isSelected) {
      fillColor = this.lightenColor(fillColor, 40);
    } else if (isHovered) {
      fillColor = this.lightenColor(fillColor, 20);
    }

    // Valid move highlight
    if (this.options.highlightValidMoves) {
      if (this.attackTargets.has(territory.id)) {
        fillColor = this.blendColors(fillColor, '#ff4444', 0.5);
      } else if (this.validMoveTargets.has(territory.id)) {
        fillColor = this.blendColors(fillColor, '#44ff44', 0.4);
      }
    }

    // Mobilization highlight (build phase)
    if (this.mobilizedTargets.has(territory.id)) {
      // Already mobilized - green tint
      fillColor = this.blendColors(fillColor, '#22c55e', 0.35);
    } else if (this.mobilizableTargets.has(territory.id)) {
      // Can mobilize - gold pulsing tint
      fillColor = this.blendColors(fillColor, '#ffd700', 0.25);
    }

    // Subtle top-lit map shading (not the billboard "bubble" look)
    const [cx, cy] = territory.center;
    const gradient = this.ctx.createLinearGradient(cx, cy - 60, cx, cy + 60);
    gradient.addColorStop(0, this.lightenColor(fillColor, 8));
    gradient.addColorStop(1, this.darkenColor(fillColor, 8));

    this.ctx.fillStyle = gradient;
    
    this.ctx.fill();
    this.ctx.globalAlpha = 1;

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

    // Inner shadow for depth
    if (!isSea) {
      this.ctx.save();
      this.ctx.clip();
      this.ctx.shadowColor = 'rgba(0,0,0,0.3)';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowOffsetX = 3;
      this.ctx.shadowOffsetY = 3;
      this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      this.ctx.lineWidth = 8;
      this.ctx.stroke();
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

      const isSelected = territory.id === this.state.selectedTerritoryId;
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

      // Selected: bright gold highlight
      if (isSelected) {
        tracePath(polygon);
        this.ctx.strokeStyle = this.COLORS.gold;
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
        continue;
      }

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

  /**
   * Draw unit tokens as square NATO-style wargame counters.
   * The entire counter is clipped to the territory polygon so it
   * can never bleed into a neighbouring tile.
   */
  private drawUnitTokens(): void {
    for (const territory of this.state.territories.values()) {
      const unitCount = territory.getTotalUnitCount();
      if (unitCount === 0) continue;

      const isVisible = this.options.fogOfWarCallback
        ? this.options.fogOfWarCallback(territory.id)
        : true;
      if (!isVisible) continue;

      const [cx, cy] = territory.center;
      const faction = territory.owner ? this.state.factionRegistry.get(territory.owner) : null;
      const factionColor = faction?.color ?? '#666666';

      // Counter size: 55% of the territory's bounding box, capped at 36×26
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      for (const [px, py] of territory.polygon) {
        if (px < bMinX) bMinX = px; if (py < bMinY) bMinY = py;
        if (px > bMaxX) bMaxX = px; if (py > bMaxY) bMaxY = py;
      }
      const w = Math.min(36, Math.max(14, (bMaxX - bMinX) * 0.55));
      const h = Math.min(26, Math.max(11, (bMaxY - bMinY) * 0.50));
      const fontSize = Math.max(9, Math.min(14, h * 0.62));
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

      // Unit count
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = `bold ${fontSize}px "Courier New", monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.shadowColor = 'rgba(0,0,0,0.9)';
      this.ctx.shadowBlur = 2;
      this.ctx.fillText(unitCount.toString(), cx, cy);
      this.ctx.shadowBlur = 0;

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

      // Capital: drawn 5-pointed star
      if (territory.isCapital) {
        const sx = unitCount > 0 ? cx - 14 : cx - 10;
        this.drawStar(sx, markerY, 8, '#f5c842', '#2a1808');
      }

      // Factory: small drawn industry symbol (rectangle + chimney)
      if (territory.hasFactory) {
        const fx = unitCount > 0 ? cx + 10 : cx + 8;
        this.drawFactorySymbol(fx, markerY, '#888888', '#2a1808');
      }

      // Commander badge: gold diamond with ⚜ if a named general is present
      const hasCommander = territory.units.some((u: any) => u.commander);
      if (hasCommander) {
        const bx = cx + (territory.isCapital ? 26 : 16);
        const by = markerY - 8;
        this.drawCommanderBadge(bx, by);
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

  /** Draw a small factory/industry symbol at (cx, cy). */
  private drawFactorySymbol(cx: number, cy: number, fill: string, stroke: string): void {
    this.ctx.save();
    this.ctx.fillStyle = fill;
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 0.8;
    // Main building body
    this.ctx.fillRect(cx - 5, cy - 3, 10, 7);
    this.ctx.strokeRect(cx - 5, cy - 3, 10, 7);
    // Chimney
    this.ctx.fillRect(cx - 2, cy - 7, 3, 5);
    this.ctx.strokeRect(cx - 2, cy - 7, 3, 5);
    this.ctx.restore();
  }

  /**
   * Get color for a territory based on owner.
   * Owned territories use a muted faction tint over a parchment base —
   * ownership is primarily communicated via the faction-colored border.
   */
  private getTerritoryColor(territory: Territory, isSea: boolean): string {
    if (isSea) {
      return this.COLORS.seaDeep;
    }

    if (!territory.owner) {
      return this.COLORS.neutral;
    }

    const faction = this.state.factionRegistry.get(territory.owner);
    if (!faction) return this.COLORS.neutral;

    // 40% faction color blended into a warm parchment/khaki base
    return this.blendColors('#b8aa88', faction.color, 0.40);
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

  /**
   * Set valid move targets for highlighting
   */
  setValidMoveTargets(moves: string[], attacks: string[]): void {
    this.validMoveTargets = new Set(moves);
    this.attackTargets = new Set(attacks);
    this.render();
  }

  /**
   * Clear valid move highlights
   */
  clearValidMoveTargets(): void {
    this.validMoveTargets.clear();
    this.attackTargets.clear();
    this.render();
  }

  /**
   * Set mobilizable territory targets for highlighting (build phase)
   */
  setMobilizationTargets(canMobilize: string[], alreadyMobilized: string[]): void {
    this.mobilizableTargets = new Set(canMobilize);
    this.mobilizedTargets = new Set(alreadyMobilized);
    this.render();
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
  fitToScreen(): void {
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

    const padding = 80;
    const scaleX = (this.width - padding * 2) / mapWidth;
    const scaleY = (this.height - padding * 2) / mapHeight;
    this.scale = Math.min(scaleX, scaleY, 2);

    this.offsetX = (this.width - mapWidth * this.scale) / 2 - minX * this.scale;
    this.offsetY = (this.height - mapHeight * this.scale) / 2 - minY * this.scale;

    this.render();
  }

  // Event handlers
  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.offsetX += dx;
      this.offsetY += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
    } else {
      const world = this.screenToWorld(x, y);
      const territory = this.getTerritoryAtPoint(world.x, world.y);
      const newHoveredId = territory?.id ?? null;
      
      if (newHoveredId !== this.hoveredTerritoryId) {
        this.hoveredTerritoryId = newHoveredId;
        this.canvas.style.cursor = newHoveredId ? 'pointer' : 'grab';
        this.territoryHoverCallback?.(newHoveredId, e.clientX, e.clientY);
        this.render();
      }
    }
  }

  private onMouseUp(_e: MouseEvent): void {
    this.isDragging = false;
    this.canvas.style.cursor = this.hoveredTerritoryId ? 'pointer' : 'grab';
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
    if (this.isDragging) return;
    
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
