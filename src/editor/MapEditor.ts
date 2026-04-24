// Map Editor for Grand Strategy Game
// Visual tool for creating and editing game maps

interface Point {
  x: number;
  y: number;
}

interface EditorTerritory {
  id: string;
  name: string;
  type: 'land' | 'sea' | 'coastal' | 'impassable';
  polygon: Point[];
  production: number;
  color: string;
  isCapital: boolean;
  hasFactory: boolean;
  connections: string[];
  center?: Point;
}

interface MapData {
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  territories: EditorTerritory[];
}

type Tool = 'select' | 'polygon' | 'rect' | 'connect' | 'pan' | 'vertex';

class MapEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private containerEl: HTMLElement;
  
  // Map data
  private mapData: MapData = {
    name: 'New Map',
    width: 2000,
    height: 1500,
    backgroundColor: '#1a4d2e',
    territories: [],
  };
  
  // Editor state
  private currentTool: Tool = 'select';
  private selectedTerritoryId: string | null = null;
  private hoveredTerritoryId: string | null = null;
  
  // View state
  private zoom: number = 1;
  private panOffset: Point = { x: 0, y: 0 };
  private isPanning: boolean = false;
  private lastPanPoint: Point = { x: 0, y: 0 };
  
  // Drawing state
  private currentPolygon: Point[] = [];
  private isDrawing: boolean = false;
  private rectStartPoint: Point | null = null;
  
  // Connection state
  private connectionStart: string | null = null;

  // Drag-to-move state (select tool)
  private isDraggingTerritory: boolean = false;
  private dragStartWorld: Point | null = null;
  private hasDragged: boolean = false;

  // Vertex editing state (vertex tool)
  private hoveredVertexIdx: number | null = null;
  private draggingVertexIdx: number | null = null;
  
  // Grid
  private showGrid: boolean = false;
  private gridSize: number = 50;
  
  // Background image
  private backgroundImage: HTMLImageElement | null = null;
  
  // Undo/Redo
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private maxUndoSteps: number = 50;
  
  // Territory counter for unique IDs
  private territoryCounter: number = 1;

  constructor() {
    this.canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.containerEl = document.querySelector('.canvas-container')!;
    
    this.init();
  }

  private init(): void {
    this.resizeCanvas();
    this.setupEventListeners();
    this.render();
    this.saveState(); // Initial state for undo
  }

  private resizeCanvas(): void {
    this.canvas.width = this.containerEl.clientWidth;
    this.canvas.height = this.containerEl.clientHeight;
    this.render();
  }

  private setupEventListeners(): void {
    // Window resize
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Canvas events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e));
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Keyboard events
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    
    // Tool buttons
    document.getElementById('tool-select')?.addEventListener('click', () => this.setTool('select'));
    document.getElementById('tool-polygon')?.addEventListener('click', () => this.setTool('polygon'));
    document.getElementById('tool-rect')?.addEventListener('click', () => this.setTool('rect'));
    document.getElementById('tool-connect')?.addEventListener('click', () => this.setTool('connect'));
    document.getElementById('tool-pan')?.addEventListener('click', () => this.setTool('pan'));
    document.getElementById('tool-vertex')?.addEventListener('click', () => this.setTool('vertex'));
    document.getElementById('tool-zoom-in')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('tool-zoom-out')?.addEventListener('click', () => this.zoomOut());
    document.getElementById('tool-fit')?.addEventListener('click', () => this.fitToScreen());
    document.getElementById('tool-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('tool-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('tool-help')?.addEventListener('click', () => this.showHelp());
    document.getElementById('btn-auto-connect')?.addEventListener('click', () => this.autoConnectAdjacent());
    document.getElementById('btn-clear-connections')?.addEventListener('click', () => this.clearAllConnections());
    
    // Panel inputs
    document.getElementById('map-name')?.addEventListener('change', (e) => {
      this.mapData.name = (e.target as HTMLInputElement).value;
    });
    document.getElementById('canvas-width')?.addEventListener('change', (e) => {
      this.mapData.width = parseInt((e.target as HTMLInputElement).value);
      this.render();
    });
    document.getElementById('canvas-height')?.addEventListener('change', (e) => {
      this.mapData.height = parseInt((e.target as HTMLInputElement).value);
      this.render();
    });
    document.getElementById('bg-color')?.addEventListener('change', (e) => {
      this.mapData.backgroundColor = (e.target as HTMLInputElement).value;
      this.render();
    });
    document.getElementById('show-grid')?.addEventListener('change', (e) => {
      this.showGrid = (e.target as HTMLInputElement).checked;
      this.render();
    });
    document.getElementById('grid-size')?.addEventListener('change', (e) => {
      this.gridSize = parseInt((e.target as HTMLInputElement).value);
      this.render();
    });
    
    // Territory properties
    document.getElementById('btn-apply-territory')?.addEventListener('click', () => this.applyTerritoryChanges());
    document.getElementById('btn-delete-territory')?.addEventListener('click', () => this.deleteSelectedTerritory());
    document.getElementById('add-connection')?.addEventListener('change', (e) => this.addConnectionFromDropdown(e));
    
    // Actions
    document.getElementById('btn-new-map')?.addEventListener('click', () => this.newMap());
    document.getElementById('btn-load-map')?.addEventListener('click', () => this.showLoadModal());
    document.getElementById('btn-import-image')?.addEventListener('click', () => this.importBackgroundImage());
    document.getElementById('btn-export-json')?.addEventListener('click', () => this.showExportModal());
    document.getElementById('btn-preview')?.addEventListener('click', () => this.previewInGame());
    
    // Modal buttons
    document.getElementById('btn-copy-json')?.addEventListener('click', () => this.copyToClipboard());
    document.getElementById('btn-download-json')?.addEventListener('click', () => this.downloadJSON());
    document.getElementById('btn-import-json')?.addEventListener('click', () => this.importFromModal());
    document.getElementById('btn-load-file')?.addEventListener('click', () => this.loadFromFile());
  }

  // ==================== Tools ====================
  
  private setTool(tool: Tool): void {
    this.currentTool = tool;
    
    // Cancel current drawing
    if (this.isDrawing) {
      this.cancelDrawing();
    }
    
    // Update UI
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tool-${tool}`)?.classList.add('active');
    
    // Update status
    const toolNames: Record<Tool, string> = {
      select: 'Select',
      polygon: 'Polygon',
      rect: 'Rectangle',
      connect: 'Connect',
      pan: 'Pan',
      vertex: 'Vertex Edit',
    };
    document.getElementById('status-tool')!.textContent = `Tool: ${toolNames[tool]}`;

    // Update cursor
    const cursors: Record<Tool, string> = {
      select: 'default',
      polygon: 'crosshair',
      rect: 'crosshair',
      connect: 'pointer',
      pan: 'grab',
      vertex: 'crosshair',
    };
    this.canvas.style.cursor = cursors[tool];

    // Reset drag/vertex state on tool switch
    this.isDraggingTerritory = false;
    this.dragStartWorld = null;
    this.hasDragged = false;
    this.draggingVertexIdx = null;
    this.hoveredVertexIdx = null;
    
    this.connectionStart = null;
    this.render();
  }

  // ==================== Mouse Events ====================
  
  private onMouseDown(e: MouseEvent): void {
    const worldPos = this.screenToWorld({ x: e.offsetX, y: e.offsetY });
    
    if (e.button === 1 || (e.button === 0 && (e as any).spaceKey) || this.currentTool === 'pan') {
      // Middle click or space+click or pan tool = start panning
      this.isPanning = true;
      this.lastPanPoint = { x: e.offsetX, y: e.offsetY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    
    if (e.button === 0) {
      switch (this.currentTool) {
        case 'select': {
          const hit = this.getTerritoryAt(worldPos);
          if (hit && hit.id === this.selectedTerritoryId) {
            // Start dragging the already-selected territory
            this.isDraggingTerritory = true;
            this.dragStartWorld = worldPos;
            this.hasDragged = false;
            this.canvas.style.cursor = 'move';
          } else {
            this.selectTerritoryAt(worldPos);
          }
          break;
        }
        case 'vertex':
          this.startVertexDrag(worldPos);
          break;
        case 'polygon':
          this.addPolygonPoint(worldPos);
          break;
        case 'rect':
          this.startRect(worldPos);
          break;
        case 'connect':
          this.handleConnect(worldPos);
          break;
      }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const screenPos = { x: e.offsetX, y: e.offsetY };
    const worldPos = this.screenToWorld(screenPos);
    
    // Update coordinates display
    document.getElementById('status-coords')!.textContent = 
      `X: ${Math.round(worldPos.x)}, Y: ${Math.round(worldPos.y)}`;
    
    if (this.isPanning) {
      const dx = screenPos.x - this.lastPanPoint.x;
      const dy = screenPos.y - this.lastPanPoint.y;
      this.panOffset.x += dx;
      this.panOffset.y += dy;
      this.lastPanPoint = screenPos;
      this.render();
      return;
    }

    // Drag-to-move territory (select tool)
    if (this.isDraggingTerritory && this.dragStartWorld && this.selectedTerritoryId) {
      const territory = this.mapData.territories.find(t => t.id === this.selectedTerritoryId);
      if (territory) {
        const dx = worldPos.x - this.dragStartWorld.x;
        const dy = worldPos.y - this.dragStartWorld.y;
        territory.polygon = territory.polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
        if (territory.center) {
          territory.center = { x: territory.center.x + dx, y: territory.center.y + dy };
        }
        this.dragStartWorld = worldPos;
        this.hasDragged = true;
        this.render();
      }
      return;
    }

    // Vertex dragging (vertex tool)
    if (this.currentTool === 'vertex' && this.draggingVertexIdx !== null && this.selectedTerritoryId) {
      const territory = this.mapData.territories.find(t => t.id === this.selectedTerritoryId);
      if (territory && this.draggingVertexIdx < territory.polygon.length) {
        const snapped = this.showGrid ? this.snapToGrid(worldPos) : worldPos;
        territory.polygon[this.draggingVertexIdx] = snapped;
        territory.center = this.calculateCenter(territory.polygon);
        this.render();
      }
      return;
    }

    // Hover vertex detection (vertex tool)
    if (this.currentTool === 'vertex' && this.selectedTerritoryId) {
      const territory = this.mapData.territories.find(t => t.id === this.selectedTerritoryId);
      const snapDist = 10 / this.zoom;
      let found: number | null = null;
      if (territory) {
        for (let i = 0; i < territory.polygon.length; i++) {
          const v = territory.polygon[i];
          if (Math.hypot(worldPos.x - v.x, worldPos.y - v.y) < snapDist) {
            found = i;
            break;
          }
        }
      }
      if (found !== this.hoveredVertexIdx) {
        this.hoveredVertexIdx = found;
        this.canvas.style.cursor = found !== null ? 'grab' : 'crosshair';
        this.render();
      }
      return;
    }

    // Hover detection
    const territory = this.getTerritoryAt(worldPos);
    if (territory?.id !== this.hoveredTerritoryId) {
      this.hoveredTerritoryId = territory?.id || null;
      this.render();
    }

    // Drawing preview
    if (this.isDrawing) {
      if (this.currentTool === 'polygon') {
        this.render();
        this.drawPolygonPreview(worldPos);
      } else if (this.currentTool === 'rect' && this.rectStartPoint) {
        this.render();
        this.drawRectPreview(worldPos);
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = this.currentTool === 'pan' ? 'grab' : 'default';
      return;
    }

    if (this.isDraggingTerritory) {
      this.isDraggingTerritory = false;
      this.dragStartWorld = null;
      this.canvas.style.cursor = 'default';
      if (this.hasDragged) {
        this.saveState();
        this.hasDragged = false;
      }
      return;
    }

    if (this.currentTool === 'vertex' && this.draggingVertexIdx !== null) {
      this.draggingVertexIdx = null;
      this.canvas.style.cursor = 'crosshair';
      this.saveState();
      return;
    }

    if (this.currentTool === 'rect' && this.rectStartPoint) {
      const worldPos = this.screenToWorld({ x: e.offsetX, y: e.offsetY });
      this.finishRect(worldPos);
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor));
    
    // Zoom towards mouse position
    const mousePos = { x: e.offsetX, y: e.offsetY };
    const worldBefore = this.screenToWorld(mousePos);
    
    this.zoom = newZoom;
    
    const worldAfter = this.screenToWorld(mousePos);
    this.panOffset.x += (worldAfter.x - worldBefore.x) * this.zoom;
    this.panOffset.y += (worldAfter.y - worldBefore.y) * this.zoom;
    
    document.getElementById('status-zoom')!.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
    this.render();
  }

  private onDoubleClick(_e: MouseEvent): void {
    if (this.currentTool === 'polygon' && this.isDrawing && this.currentPolygon.length >= 3) {
      this.finishPolygon();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    // Check for modifier keys
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault();
          this.undo();
          break;
        case 'y':
          e.preventDefault();
          this.redo();
          break;
        case 'n':
          e.preventDefault();
          this.newMap();
          break;
        case 'o':
          e.preventDefault();
          this.showLoadModal();
          break;
        case 's':
          e.preventDefault();
          this.showExportModal();
          break;
        case 'd':
          e.preventDefault();
          this.duplicateSelected();
          break;
      }
      return;
    }
    
    // Tool shortcuts
    switch (e.key.toLowerCase()) {
      case 'v':
        this.setTool('select');
        break;
      case 'p':
        this.setTool('polygon');
        break;
      case 'r':
        this.setTool('rect');
        break;
      case 'c':
        this.setTool('connect');
        break;
      case 'e':
        this.setTool('vertex');
        break;
      case 'f':
        this.fitToScreen();
        break;
      case 'escape':
        this.cancelDrawing();
        break;
      case 'delete':
      case 'backspace':
        if (this.selectedTerritoryId) {
          this.deleteSelectedTerritory();
        }
        break;
      case '=':
      case '+':
        this.zoomIn();
        break;
      case '-':
        this.zoomOut();
        break;
      case '0':
        this.resetZoom();
        break;
      case 'f1':
        e.preventDefault();
        this.showHelp();
        break;
    }
    
    // Space key for panning
    if (e.key === ' ') {
      (e as any).spaceKey = true;
    }
  }

  // ==================== Drawing ====================
  
  private addPolygonPoint(pos: Point): void {
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.currentPolygon = [];
    }
    
    // Snap to grid if enabled
    const point = this.showGrid ? this.snapToGrid(pos) : pos;
    this.currentPolygon.push(point);
    this.render();
  }

  private finishPolygon(): void {
    if (this.currentPolygon.length < 3) return;
    
    const id = `territory_${this.territoryCounter++}`;
    const territory: EditorTerritory = {
      id,
      name: `Territory ${this.mapData.territories.length + 1}`,
      type: 'land',
      polygon: [...this.currentPolygon],
      production: 1,
      color: this.getRandomColor(),
      isCapital: false,
      hasFactory: false,
      connections: [],
      center: this.calculateCenter(this.currentPolygon),
    };
    
    this.mapData.territories.push(territory);
    this.currentPolygon = [];
    this.isDrawing = false;
    this.selectedTerritoryId = id;
    
    this.saveState();
    this.updateTerritoryList();
    this.updateTerritoryPanel();
    this.render();
  }

  private startRect(pos: Point): void {
    this.isDrawing = true;
    this.rectStartPoint = this.showGrid ? this.snapToGrid(pos) : pos;
  }

  private finishRect(endPos: Point): void {
    if (!this.rectStartPoint) return;
    
    const end = this.showGrid ? this.snapToGrid(endPos) : endPos;
    const start = this.rectStartPoint;
    
    // Create polygon from rectangle
    const polygon: Point[] = [
      { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) },
      { x: Math.max(start.x, end.x), y: Math.min(start.y, end.y) },
      { x: Math.max(start.x, end.x), y: Math.max(start.y, end.y) },
      { x: Math.min(start.x, end.x), y: Math.max(start.y, end.y) },
    ];
    
    const id = `territory_${this.territoryCounter++}`;
    const territory: EditorTerritory = {
      id,
      name: `Territory ${this.mapData.territories.length + 1}`,
      type: 'land',
      polygon,
      production: 1,
      color: this.getRandomColor(),
      isCapital: false,
      hasFactory: false,
      connections: [],
      center: this.calculateCenter(polygon),
    };
    
    this.mapData.territories.push(territory);
    this.rectStartPoint = null;
    this.isDrawing = false;
    this.selectedTerritoryId = id;
    
    this.saveState();
    this.updateTerritoryList();
    this.updateTerritoryPanel();
    this.render();
  }

  private cancelDrawing(): void {
    this.currentPolygon = [];
    this.rectStartPoint = null;
    this.isDrawing = false;
    this.connectionStart = null;
    this.render();
  }

  // ==================== Selection ====================
  
  private selectTerritoryAt(pos: Point): void {
    const territory = this.getTerritoryAt(pos);
    this.selectedTerritoryId = territory?.id || null;
    this.updateTerritoryPanel();
    this.render();
  }

  private getTerritoryAt(pos: Point): EditorTerritory | null {
    // Check in reverse order (top-most first)
    for (let i = this.mapData.territories.length - 1; i >= 0; i--) {
      const territory = this.mapData.territories[i];
      if (this.isPointInPolygon(pos, territory.polygon)) {
        return territory;
      }
    }
    return null;
  }

  private isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ==================== Connections ====================
  
  private handleConnect(pos: Point): void {
    const territory = this.getTerritoryAt(pos);
    if (!territory) return;
    
    if (!this.connectionStart) {
      this.connectionStart = territory.id;
      this.render();
    } else if (this.connectionStart !== territory.id) {
      this.addConnection(this.connectionStart, territory.id);
      this.connectionStart = null;
      this.render();
    }
  }

  private addConnection(id1: string, id2: string): void {
    const t1 = this.mapData.territories.find(t => t.id === id1);
    const t2 = this.mapData.territories.find(t => t.id === id2);
    
    if (!t1 || !t2) return;
    
    // Add bidirectional connection
    if (!t1.connections.includes(id2)) {
      t1.connections.push(id2);
    }
    if (!t2.connections.includes(id1)) {
      t2.connections.push(id1);
    }
    
    this.saveState();
    this.updateTerritoryPanel();
  }

  private removeConnection(id1: string, id2: string): void {
    const t1 = this.mapData.territories.find(t => t.id === id1);
    const t2 = this.mapData.territories.find(t => t.id === id2);
    
    if (t1) {
      t1.connections = t1.connections.filter(c => c !== id2);
    }
    if (t2) {
      t2.connections = t2.connections.filter(c => c !== id1);
    }
    
    this.saveState();
    this.updateTerritoryPanel();
    this.render();
  }

  private addConnectionFromDropdown(e: Event): void {
    const select = e.target as HTMLSelectElement;
    const targetId = select.value;
    
    if (targetId && this.selectedTerritoryId) {
      this.addConnection(this.selectedTerritoryId, targetId);
      this.render();
    }
    
    select.value = '';
  }

  // ==================== Rendering ====================
  
  private render(): void {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    // Save context
    ctx.save();
    
    // Apply pan and zoom
    ctx.translate(this.panOffset.x, this.panOffset.y);
    ctx.scale(this.zoom, this.zoom);
    
    // Draw map background
    ctx.fillStyle = this.mapData.backgroundColor;
    ctx.fillRect(0, 0, this.mapData.width, this.mapData.height);
    
    // Draw background image if present
    if (this.backgroundImage) {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.backgroundImage, 0, 0, this.mapData.width, this.mapData.height);
      ctx.globalAlpha = 1;
    }
    
    // Draw grid
    if (this.showGrid) {
      this.drawGrid();
    }
    
    // Draw territories
    for (const territory of this.mapData.territories) {
      this.drawTerritory(territory);
    }
    
    // Draw connections
    this.drawConnections();
    
    // Draw connection in progress
    if (this.connectionStart) {
      const startTerritory = this.mapData.territories.find(t => t.id === this.connectionStart);
      if (startTerritory?.center) {
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 3 / this.zoom;
        ctx.setLineDash([10 / this.zoom, 5 / this.zoom]);
        ctx.beginPath();
        ctx.arc(startTerritory.center.x, startTerritory.center.y, 15 / this.zoom, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // Restore context
    ctx.restore();
  }

  private drawTerritory(territory: EditorTerritory): void {
    const ctx = this.ctx;
    const polygon = territory.polygon;
    
    if (polygon.length < 3) return;
    
    // Fill
    ctx.fillStyle = territory.color;
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) {
      ctx.lineTo(polygon[i].x, polygon[i].y);
    }
    ctx.closePath();
    ctx.fill();
    
    // Stroke
    const isSelected = territory.id === this.selectedTerritoryId;
    const isHovered = territory.id === this.hoveredTerritoryId;
    
    ctx.strokeStyle = isSelected ? '#e94560' : (isHovered ? '#fff' : '#333');
    ctx.lineWidth = isSelected ? 3 / this.zoom : 1 / this.zoom;
    ctx.stroke();
    
    // Draw label
    if (territory.center) {
      ctx.fillStyle = '#fff';
      ctx.font = `${14 / this.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(territory.name, territory.center.x, territory.center.y);
      
      // Draw production value
      if (territory.production > 0) {
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold ${12 / this.zoom}px sans-serif`;
        ctx.fillText(`+${territory.production}`, territory.center.x, territory.center.y + 16 / this.zoom);
      }
      
      // Draw icons
      if (territory.isCapital) {
        ctx.fillText('★', territory.center.x - 20 / this.zoom, territory.center.y - 16 / this.zoom);
      }
      if (territory.hasFactory) {
        ctx.fillText('🏭', territory.center.x + 20 / this.zoom, territory.center.y - 16 / this.zoom);
      }
    }

    // Draw vertex handles when vertex tool is active and territory is selected
    if (this.currentTool === 'vertex' && territory.id === this.selectedTerritoryId) {
      const r = 6 / this.zoom;
      for (let i = 0; i < polygon.length; i++) {
        const v = polygon[i];
        const isHovered = i === this.hoveredVertexIdx;
        const isDragging = i === this.draggingVertexIdx;
        ctx.beginPath();
        ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isDragging ? '#facc15' : isHovered ? '#fff' : '#e94560';
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1 / this.zoom;
        ctx.stroke();
      }
    }
  }

  private drawConnections(): void {
    const ctx = this.ctx;
    const drawn = new Set<string>();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2 / this.zoom;
    
    for (const territory of this.mapData.territories) {
      if (!territory.center) continue;
      
      for (const connId of territory.connections) {
        const key = [territory.id, connId].sort().join('-');
        if (drawn.has(key)) continue;
        drawn.add(key);
        
        const connected = this.mapData.territories.find(t => t.id === connId);
        if (!connected?.center) continue;
        
        ctx.beginPath();
        ctx.moveTo(territory.center.x, territory.center.y);
        ctx.lineTo(connected.center.x, connected.center.y);
        ctx.stroke();
      }
    }
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1 / this.zoom;
    
    for (let x = 0; x <= this.mapData.width; x += this.gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.mapData.height);
      ctx.stroke();
    }
    
    for (let y = 0; y <= this.mapData.height; y += this.gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.mapData.width, y);
      ctx.stroke();
    }
  }

  private drawPolygonPreview(currentPos: Point): void {
    if (this.currentPolygon.length === 0) return;
    
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.panOffset.x, this.panOffset.y);
    ctx.scale(this.zoom, this.zoom);
    
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2 / this.zoom;
    ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
    
    ctx.beginPath();
    ctx.moveTo(this.currentPolygon[0].x, this.currentPolygon[0].y);
    for (let i = 1; i < this.currentPolygon.length; i++) {
      ctx.lineTo(this.currentPolygon[i].x, this.currentPolygon[i].y);
    }
    ctx.lineTo(currentPos.x, currentPos.y);
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = '#e94560';
    for (const point of this.currentPolygon) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5 / this.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }

  private drawRectPreview(currentPos: Point): void {
    if (!this.rectStartPoint) return;
    
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.panOffset.x, this.panOffset.y);
    ctx.scale(this.zoom, this.zoom);
    
    const start = this.rectStartPoint;
    const end = this.showGrid ? this.snapToGrid(currentPos) : currentPos;
    
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 2 / this.zoom;
    ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
    
    ctx.strokeRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y)
    );
    
    ctx.restore();
  }

  // ==================== UI Updates ====================
  
  private updateTerritoryPanel(): void {
    const propsDiv = document.getElementById('territory-properties')!;
    const noSelDiv = document.getElementById('no-selection')!;
    
    if (!this.selectedTerritoryId) {
      propsDiv.style.display = 'none';
      noSelDiv.style.display = 'block';
      return;
    }
    
    const territory = this.mapData.territories.find(t => t.id === this.selectedTerritoryId);
    if (!territory) return;
    
    propsDiv.style.display = 'block';
    noSelDiv.style.display = 'none';
    
    (document.getElementById('territory-name') as HTMLInputElement).value = territory.name;
    (document.getElementById('territory-id') as HTMLInputElement).value = territory.id;
    (document.getElementById('territory-type') as HTMLSelectElement).value = territory.type;
    (document.getElementById('territory-production') as HTMLInputElement).value = territory.production.toString();
    (document.getElementById('territory-color') as HTMLInputElement).value = territory.color;
    (document.getElementById('territory-capital') as HTMLInputElement).checked = territory.isCapital;
    (document.getElementById('territory-factory') as HTMLInputElement).checked = territory.hasFactory;
    
    // Update connections list
    const connList = document.getElementById('connection-list')!;
    connList.innerHTML = '';
    for (const connId of territory.connections) {
      const connected = this.mapData.territories.find(t => t.id === connId);
      const div = document.createElement('div');
      div.className = 'connection-item';
      div.innerHTML = `
        <span>${connected?.name || connId}</span>
        <button class="remove-btn" data-id="${connId}">×</button>
      `;
      div.querySelector('.remove-btn')?.addEventListener('click', () => {
        this.removeConnection(territory.id, connId);
      });
      connList.appendChild(div);
    }
    
    // Update connection dropdown
    const addConn = document.getElementById('add-connection') as HTMLSelectElement;
    addConn.innerHTML = '<option value="">Add connection...</option>';
    for (const t of this.mapData.territories) {
      if (t.id !== territory.id && !territory.connections.includes(t.id)) {
        addConn.innerHTML += `<option value="${t.id}">${t.name}</option>`;
      }
    }
  }

  private updateTerritoryList(): void {
    const list = document.getElementById('territory-list')!;
    const count = document.getElementById('territory-count')!;
    
    count.textContent = this.mapData.territories.length.toString();
    list.innerHTML = '';
    
    for (const territory of this.mapData.territories) {
      const div = document.createElement('div');
      div.className = 'territory-item' + (territory.id === this.selectedTerritoryId ? ' selected' : '');
      div.innerHTML = `
        <div class="territory-color" style="background: ${territory.color}"></div>
        <span>${territory.name}</span>
      `;
      div.addEventListener('click', () => {
        this.selectedTerritoryId = territory.id;
        this.updateTerritoryPanel();
        this.updateTerritoryList();
        this.render();
      });
      list.appendChild(div);
    }
  }

  private applyTerritoryChanges(): void {
    if (!this.selectedTerritoryId) return;
    
    const territory = this.mapData.territories.find(t => t.id === this.selectedTerritoryId);
    if (!territory) return;
    
    const newId = (document.getElementById('territory-id') as HTMLInputElement).value;
    
    // Update ID in connections if changed
    if (newId !== territory.id) {
      for (const t of this.mapData.territories) {
        const idx = t.connections.indexOf(territory.id);
        if (idx >= 0) {
          t.connections[idx] = newId;
        }
      }
    }
    
    territory.id = newId;
    territory.name = (document.getElementById('territory-name') as HTMLInputElement).value;
    territory.type = (document.getElementById('territory-type') as HTMLSelectElement).value as any;
    territory.production = parseInt((document.getElementById('territory-production') as HTMLInputElement).value);
    territory.color = (document.getElementById('territory-color') as HTMLInputElement).value;
    territory.isCapital = (document.getElementById('territory-capital') as HTMLInputElement).checked;
    territory.hasFactory = (document.getElementById('territory-factory') as HTMLInputElement).checked;
    
    this.selectedTerritoryId = newId;
    this.saveState();
    this.updateTerritoryList();
    this.render();
  }

  private deleteSelectedTerritory(): void {
    if (!this.selectedTerritoryId) return;
    
    // Remove from connections
    for (const t of this.mapData.territories) {
      t.connections = t.connections.filter(c => c !== this.selectedTerritoryId);
    }
    
    // Remove territory
    this.mapData.territories = this.mapData.territories.filter(t => t.id !== this.selectedTerritoryId);
    this.selectedTerritoryId = null;
    
    this.saveState();
    this.updateTerritoryPanel();
    this.updateTerritoryList();
    this.render();
  }

  private duplicateSelected(): void {
    if (!this.selectedTerritoryId) return;
    
    const original = this.mapData.territories.find(t => t.id === this.selectedTerritoryId);
    if (!original) return;
    
    const id = `territory_${this.territoryCounter++}`;
    const offset = 50;
    
    const duplicate: EditorTerritory = {
      ...original,
      id,
      name: `${original.name} (copy)`,
      polygon: original.polygon.map(p => ({ x: p.x + offset, y: p.y + offset })),
      connections: [],
      center: original.center ? { x: original.center.x + offset, y: original.center.y + offset } : undefined,
    };
    
    this.mapData.territories.push(duplicate);
    this.selectedTerritoryId = id;
    
    this.saveState();
    this.updateTerritoryPanel();
    this.updateTerritoryList();
    this.render();
  }

  // ==================== Undo/Redo ====================
  
  private saveState(): void {
    const state = JSON.stringify(this.mapData);
    this.undoStack.push(state);
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private undo(): void {
    if (this.undoStack.length <= 1) return;
    
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);
    
    const previous = this.undoStack[this.undoStack.length - 1];
    this.mapData = JSON.parse(previous);
    
    this.selectedTerritoryId = null;
    this.updateTerritoryPanel();
    this.updateTerritoryList();
    this.render();
  }

  private redo(): void {
    if (this.redoStack.length === 0) return;
    
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);
    this.mapData = JSON.parse(next);
    
    this.selectedTerritoryId = null;
    this.updateTerritoryPanel();
    this.updateTerritoryList();
    this.render();
  }

  // ==================== Zoom/Pan ====================
  
  private zoomIn(): void {
    this.zoom = Math.min(5, this.zoom * 1.2);
    document.getElementById('status-zoom')!.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
    this.render();
  }

  private zoomOut(): void {
    this.zoom = Math.max(0.1, this.zoom / 1.2);
    document.getElementById('status-zoom')!.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
    this.render();
  }

  private resetZoom(): void {
    this.zoom = 1;
    this.panOffset = { x: 0, y: 0 };
    document.getElementById('status-zoom')!.textContent = 'Zoom: 100%';
    this.render();
  }

  // ==================== File Operations ====================
  
  private newMap(): void {
    if (!confirm('Create a new map? Unsaved changes will be lost.')) return;
    
    this.mapData = {
      name: 'New Map',
      width: 2000,
      height: 1500,
      backgroundColor: '#1a4d2e',
      territories: [],
    };
    this.territoryCounter = 1;
    this.selectedTerritoryId = null;
    this.undoStack = [];
    this.redoStack = [];
    
    // Update UI
    (document.getElementById('map-name') as HTMLInputElement).value = this.mapData.name;
    (document.getElementById('canvas-width') as HTMLInputElement).value = this.mapData.width.toString();
    (document.getElementById('canvas-height') as HTMLInputElement).value = this.mapData.height.toString();
    (document.getElementById('bg-color') as HTMLInputElement).value = this.mapData.backgroundColor;
    
    this.saveState();
    this.updateTerritoryPanel();
    this.updateTerritoryList();
    this.render();
  }

  private showLoadModal(): void {
    document.getElementById('load-modal')!.classList.add('visible');
    (document.getElementById('load-json') as HTMLTextAreaElement).value = '';
  }

  private showExportModal(): void {
    const exportData = this.generateExportData();
    (document.getElementById('export-json') as HTMLTextAreaElement).value = 
      JSON.stringify(exportData, null, 2);
    document.getElementById('export-modal')!.classList.add('visible');
  }

  private generateExportData(): any {
    // Convert to game-compatible format (MapData / TerritoryData)
    return {
      id: this.mapData.name.toLowerCase().replace(/\s+/g, '_'),
      name: this.mapData.name,
      version: '1.0',
      width: this.mapData.width,
      height: this.mapData.height,
      backgroundColor: this.mapData.backgroundColor,
      territories: this.mapData.territories.map(t => {
        // Convert Point[] ({x,y}) to [number,number][] tuples as TerritoryData expects
        const polygon: [number, number][] = t.polygon.map(p => [p.x, p.y]);
        const centerPt = t.center ?? this.calculateCenter(t.polygon);
        const center: [number, number] = [centerPt.x, centerPt.y];
        // game only supports land/sea/coastal; map impassable → land
        const type = (t.type === 'impassable' ? 'land' : t.type) as 'land' | 'sea' | 'coastal';
        return {
          id: t.id,
          name: t.name,
          type,
          polygon,
          center,
          production: t.production,
          color: t.color,
          isCapital: t.isCapital,
          hasFactory: t.hasFactory,
          adjacentTo: t.connections,  // game field name
          owner: null,
          originalOwner: null,
        };
      }),
      startingUnits: [],
    };
  }

  private copyToClipboard(): void {
    const textarea = document.getElementById('export-json') as HTMLTextAreaElement;
    textarea.select();
    document.execCommand('copy');
    alert('Copied to clipboard!');
  }

  private downloadJSON(): void {
    const exportData = this.generateExportData();
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.mapData.name.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  private importFromModal(): void {
    const textarea = document.getElementById('load-json') as HTMLTextAreaElement;
    try {
      const data = JSON.parse(textarea.value);
      this.loadMapData(data);
      document.getElementById('load-modal')!.classList.remove('visible');
    } catch (e) {
      alert('Invalid JSON format');
    }
  }

  private loadFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          this.loadMapData(data);
          document.getElementById('load-modal')!.classList.remove('visible');
        } catch (err) {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private loadMapData(data: any): void {
    this.mapData = {
      name: data.name || 'Imported Map',
      width: data.width || 2000,
      height: data.height || 1500,
      backgroundColor: data.backgroundColor || '#1a4d2e',
      territories: (data.territories || []).map((t: any) => {
        // Support both editor format ({x,y} objects) and game format ([x,y] tuples)
        const rawPolygon: any[] = t.polygon || [];
        const polygon: Point[] = rawPolygon.map((p: any) =>
          Array.isArray(p) ? { x: p[0], y: p[1] } : p
        );
        const rawCenter: any = t.center;
        const center: Point = rawCenter
          ? (Array.isArray(rawCenter) ? { x: rawCenter[0], y: rawCenter[1] } : rawCenter)
          : this.calculateCenter(polygon);
        // Support both editor field name (connections) and game field name (adjacentTo)
        const connections: string[] = t.connections ?? t.adjacentTo ?? [];
        return {
          id: t.id,
          name: t.name,
          type: t.type || 'land',
          polygon,
          center,
          production: t.production || 0,
          color: t.color || '#4a7c59',
          isCapital: t.isCapital || false,
          hasFactory: t.hasFactory || false,
          connections,
        };
      }),
    };
    
    // Update territory counter
    let maxNum = 0;
    for (const t of this.mapData.territories) {
      const match = t.id.match(/territory_(\d+)/);
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1]));
      }
    }
    this.territoryCounter = maxNum + 1;
    
    // Update UI
    (document.getElementById('map-name') as HTMLInputElement).value = this.mapData.name;
    (document.getElementById('canvas-width') as HTMLInputElement).value = this.mapData.width.toString();
    (document.getElementById('canvas-height') as HTMLInputElement).value = this.mapData.height.toString();
    (document.getElementById('bg-color') as HTMLInputElement).value = this.mapData.backgroundColor;
    
    this.selectedTerritoryId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.saveState();
    this.updateTerritoryPanel();
    this.updateTerritoryList();
    this.render();
  }

  private importBackgroundImage(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          this.backgroundImage = img;
          this.render();
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  private previewInGame(): void {
    // Save map data to localStorage and open game
    const exportData = this.generateExportData();
    localStorage.setItem('editor_preview_map', JSON.stringify(exportData));
    window.open('/', '_blank');
  }

  // ==================== Utility ====================
  
  private screenToWorld(screenPos: Point): Point {
    return {
      x: (screenPos.x - this.panOffset.x) / this.zoom,
      y: (screenPos.y - this.panOffset.y) / this.zoom,
    };
  }

  private snapToGrid(pos: Point): Point {
    return {
      x: Math.round(pos.x / this.gridSize) * this.gridSize,
      y: Math.round(pos.y / this.gridSize) * this.gridSize,
    };
  }

  private calculateCenter(polygon: Point[]): Point {
    if (polygon.length === 0) return { x: 0, y: 0 };
    
    let x = 0, y = 0;
    for (const p of polygon) {
      x += p.x;
      y += p.y;
    }
    return { x: x / polygon.length, y: y / polygon.length };
  }

  private getRandomColor(): string {
    const colors = [
      '#4a7c59', '#7c4a4a', '#4a5d7c', '#7c6e4a', '#5d4a7c',
      '#4a7c6e', '#7c4a6e', '#6e7c4a', '#4a6e7c', '#6e4a7c',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private showHelp(): void {
    document.getElementById('help-overlay')!.classList.add('visible');
  }

  // ==================== Vertex Editing ====================

  private startVertexDrag(worldPos: Point): void {
    if (!this.selectedTerritoryId) return;
    const territory = this.mapData.territories.find(t => t.id === this.selectedTerritoryId);
    if (!territory) return;

    const snapDist = 10 / this.zoom;
    for (let i = 0; i < territory.polygon.length; i++) {
      const v = territory.polygon[i];
      if (Math.hypot(worldPos.x - v.x, worldPos.y - v.y) < snapDist) {
        this.draggingVertexIdx = i;
        this.canvas.style.cursor = 'grabbing';
        return;
      }
    }

    // Clicking on the territory body in vertex mode selects it
    const hit = this.getTerritoryAt(worldPos);
    if (hit && hit.id !== this.selectedTerritoryId) {
      this.selectedTerritoryId = hit.id;
      this.hoveredVertexIdx = null;
      this.updateTerritoryPanel();
      this.render();
    }
  }

  // ==================== Fit to Screen ====================

  private fitToScreen(): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (this.mapData.territories.length > 0) {
      for (const t of this.mapData.territories) {
        for (const p of t.polygon) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
    } else {
      minX = 0; minY = 0; maxX = this.mapData.width; maxY = this.mapData.height;
    }

    const padding = 40;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;

    const scaleX = this.canvas.width / contentW;
    const scaleY = this.canvas.height / contentH;
    this.zoom = Math.min(scaleX, scaleY, 5);

    this.panOffset = {
      x: (this.canvas.width - contentW * this.zoom) / 2 - (minX - padding) * this.zoom,
      y: (this.canvas.height - contentH * this.zoom) / 2 - (minY - padding) * this.zoom,
    };

    document.getElementById('status-zoom')!.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;
    this.render();
  }

  // ==================== Auto-connect Adjacent ====================

  /**
   * Auto-connect territories whose polygons share an edge or are within `threshold` world units.
   */
  private autoConnectAdjacent(threshold: number = 15): void {
    const territories = this.mapData.territories;
    let added = 0;

    for (let i = 0; i < territories.length; i++) {
      for (let j = i + 1; j < territories.length; j++) {
        const a = territories[i];
        const b = territories[j];
        if (a.connections.includes(b.id)) continue;

        if (this.polygonsAreAdjacent(a.polygon, b.polygon, threshold)) {
          a.connections.push(b.id);
          b.connections.push(a.id);
          added++;
        }
      }
    }

    if (added > 0) {
      this.saveState();
      this.updateTerritoryPanel();
      this.render();
    }
  }

  private polygonsAreAdjacent(polyA: Point[], polyB: Point[], threshold: number): boolean {
    for (const va of polyA) {
      for (const vb of polyB) {
        if (Math.hypot(va.x - vb.x, va.y - vb.y) <= threshold) return true;
      }
    }
    return false;
  }

  private clearAllConnections(): void {
    if (!confirm('Remove ALL connections from all territories?')) return;
    for (const t of this.mapData.territories) t.connections = [];
    this.saveState();
    this.updateTerritoryPanel();
    this.render();
  }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new MapEditor();
});
