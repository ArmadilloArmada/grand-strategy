import type { CombatState, CombatUnit } from '../engine/CombatResolver';
import { canUnitEngageTarget, canLandUnitStrikeNaval, getLandAntiNavalAttack } from '../engine/NavalSystem';
import { buildTacticalOutcomeMeta, type TacticalOutcomeMeta } from '../engine/TacticalBattleEngine';
import type { UnitDomain } from '../data/Unit';
import { soundManager } from '../audio/SoundManager';
import { visualEffects } from './VisualEffects';

type TacticalSide = 'attacker' | 'defender';
type TacticalPhase = 'player' | 'enemy' | 'victory' | 'defeat';
type TacticalRole = 'Infantry' | 'Armor' | 'Artillery' | 'Air' | 'Naval';
export type TacticalBattleMode = 'land' | 'naval' | 'amphibious';
export type TacticalTerritoryType = 'land' | 'sea' | 'coastal';

export interface TacticalTerrain {
  name: string;
  cover: number;
  moveCost: number;
  color: string;
  note: string;
  kind?: 'land' | 'water' | 'shore';
  isObjective?: boolean;
}

interface TacticalUnit {
  id: string;
  side: TacticalSide;
  sourceIndex: number;
  name: string;
  role: TacticalRole;
  domain: UnitDomain;
  canBombard: boolean;
  count: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  move: number;
  moved: boolean;
  attacked: boolean;
}

interface CombatFx {
  x: number;
  y: number;
  text: string;
  color: string;
  expiresAt: number;
}

interface MoveAnim {
  unitId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  start: number;
  end: number;
}

interface UndoMove {
  unitId: string;
  x: number;
  y: number;
}

interface TacticalState {
  width: number;
  height: number;
  mode: TacticalBattleMode;
  phase: TacticalPhase;
  turn: number;
  selectedId: string | null;
  units: TacticalUnit[];
  terrain: TacticalTerrain[][];
  log: string[];
  fx: CombatFx[];
  pulseTile: { x: number; y: number; expiresAt: number } | null;
  captureProgress: number;
  coastalSupportHp: number;
  undoMove: UndoMove | null;
  moveAnim: MoveAnim | null;
}

/** Deterministic terrain for tactical grids (exported for tests). */
export function buildTacticalTerrainGrid(width: number, height: number): TacticalTerrain[][] {
  const midY = Math.floor(height / 2);
  const grid: TacticalTerrain[][] = [];
  const field: TacticalTerrain = { name: 'Field', kind: 'land', cover: 0, moveCost: 1, color: '#64774a', note: 'Open ground.' };
  const road: TacticalTerrain = { name: 'Road', kind: 'land', cover: 0, moveCost: 1, color: '#756b49', note: 'Fast advance lane.' };
  const woods: TacticalTerrain = { name: 'Woods', kind: 'land', cover: 1, moveCost: 2, color: '#345f42', note: 'Light cover, slower movement.' };
  const ridge: TacticalTerrain = { name: 'Ridge', kind: 'land', cover: 2, moveCost: 2, color: '#56616a', note: 'Strong cover.' };
  const town: TacticalTerrain = { name: 'Town', kind: 'land', cover: 1, moveCost: 1, color: '#6a5a48', note: 'Urban cover, good firing positions.' };

  for (let y = 0; y < height; y++) {
    const row: TacticalTerrain[] = [];
    for (let x = 0; x < width; x++) {
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      const hash = (x * 17 + y * 31 + width * 7) % 100;
      const inSpawnBand = x <= 2 || x >= width - 3;

      if (x === centerX && y === centerY) {
        row.push({ ...town, isObjective: true, note: 'Objective — hold or seize this ground.' });
      } else if (y === midY && x > 0 && x < width - 1) {
        row.push(road);
      } else if (!inSpawnBand && (x === centerX - 1 || x === centerX + 1) && Math.abs(y - centerY) <= 1) {
        row.push(ridge);
      } else if (!inSpawnBand && hash < 18) {
        row.push(woods);
      } else if (!inSpawnBand && hash > 86) {
        row.push(ridge);
      } else {
        row.push({ ...field });
      }
    }
    grid.push(row);
  }
  return grid;
}

const OPEN_WATER: TacticalTerrain = {
  name: 'Open Water',
  kind: 'water',
  cover: 0,
  moveCost: 1,
  color: '#1e5a8a',
  note: 'Standard steaming lanes.',
};
const DEEP_WATER: TacticalTerrain = {
  name: 'Deep Water',
  kind: 'water',
  cover: 0,
  moveCost: 2,
  color: '#153956',
  note: 'Slower passage for large hulls.',
};
const SHORE: TacticalTerrain = {
  name: 'Shore',
  kind: 'shore',
  cover: 1,
  moveCost: 2,
  color: '#8b7355',
  note: 'Coastal waters — bombards can hit land here.',
};
const BEACH: TacticalTerrain = {
  name: 'Beach',
  kind: 'shore',
  cover: 0,
  moveCost: 1,
  color: '#c4a574',
  note: 'Amphibious landing zone.',
};
const COASTAL_FIELD: TacticalTerrain = {
  name: 'Coast',
  kind: 'land',
  cover: 0,
  moveCost: 1,
  color: '#6b8050',
  note: 'Coastal ground — land units only.',
};

/** Pick land vs naval vs amphibious tactical layout from the strategic battle context. */
export function resolveTacticalBattleMode(
  territoryType: TacticalTerritoryType,
  combat: CombatState,
): TacticalBattleMode {
  const hasNaval = (units: CombatUnit[]) => units.some(u => u.unitType.domain === 'sea');
  const allNaval = (units: CombatUnit[]) => units.length > 0 && units.every(u => u.unitType.domain === 'sea');

  if (territoryType === 'sea') return 'naval';
  if (allNaval(combat.attackers) && allNaval(combat.defenders)) return 'naval';
  if (territoryType === 'coastal' && (hasNaval(combat.attackers) || hasNaval(combat.defenders))) {
    return 'amphibious';
  }
  return 'land';
}

/** Water-first tactical grid for fleet engagements and coastal landings. */
export function buildNavalTacticalTerrainGrid(
  width: number,
  height: number,
  mode: 'naval' | 'amphibious',
): TacticalTerrain[][] {
  const grid: TacticalTerrain[][] = [];
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const landStart = mode === 'amphibious' ? Math.ceil(width * 0.62) : width;
  const shoreStart = mode === 'amphibious' ? Math.ceil(width * 0.48) : Math.max(0, width - 2);

  for (let y = 0; y < height; y++) {
    const row: TacticalTerrain[] = [];
    for (let x = 0; x < width; x++) {
      const hash = (x * 19 + y * 29 + width * 5) % 100;
      if (x === centerX && y === centerY) {
        row.push({
          ...OPEN_WATER,
          isObjective: true,
          name: mode === 'amphibious' ? 'Sea Lane' : 'Engagement Zone',
          note: 'Control this zone to win the engagement.',
        });
      } else if (mode === 'amphibious' && x >= landStart) {
        if (x === landStart && y === centerY) {
          row.push({
            ...COASTAL_FIELD,
            isObjective: true,
            name: 'Beachhead',
            kind: 'land',
            note: 'Seize the beachhead or eliminate defenders.',
          });
        } else {
          row.push({ ...COASTAL_FIELD });
        }
      } else if (mode === 'amphibious' && x >= shoreStart && x < landStart) {
        row.push(x === shoreStart ? { ...BEACH } : { ...SHORE });
      } else if (mode === 'naval' && x >= width - 2) {
        row.push({ ...SHORE, note: 'Enemy coastline — bombards can strike here.' });
      } else if (hash > 82) {
        row.push({ ...DEEP_WATER });
      } else {
        row.push({ ...OPEN_WATER });
      }
    }
    grid.push(row);
  }
  return grid;
}

export function getTacticalTerrainLegend(mode: TacticalBattleMode): Array<{ code: string; name: string; note: string; color: string }> {
  if (mode === 'naval') {
    return [
      { code: 'W', name: 'Open Water', note: 'Naval movement', color: OPEN_WATER.color },
      { code: 'P', name: 'Deep Water', note: 'Slower', color: DEEP_WATER.color },
      { code: 'S', name: 'Shore', note: 'Bombardment target', color: SHORE.color },
      { code: 'O', name: 'Zone', note: 'Capture objective', color: '#2563eb' },
    ];
  }
  if (mode === 'amphibious') {
    return [
      { code: 'W', name: 'Water', note: 'Ships only', color: OPEN_WATER.color },
      { code: 'B', name: 'Beach', note: 'Landing zone', color: BEACH.color },
      { code: 'C', name: 'Coast', note: 'Land units', color: COASTAL_FIELD.color },
      { code: 'O', name: 'Zone', note: 'Objectives', color: '#2563eb' },
    ];
  }
  return TERRAIN_LEGEND;
}

export function objectiveLabelForMode(mode: TacticalBattleMode): string {
  switch (mode) {
    case 'naval': return 'Engagement Zone';
    case 'amphibious': return 'Beachhead / Sea Lane';
    default: return 'Town';
  }
}

/** Single-letter map codes (unique per terrain type). */
export function terrainTileCode(name: string): string {
  switch (name) {
    case 'Field': return 'F';
    case 'Road': return 'D';
    case 'Woods': return 'L';
    case 'Ridge': return 'G';
    case 'Town': return 'T';
    case 'Open Water': return 'W';
    case 'Deep Water': return 'P';
    case 'Shore': return 'S';
    case 'Beach': return 'B';
    case 'Coast': return 'C';
    case 'Engagement Zone':
    case 'Sea Lane':
    case 'Beachhead': return 'O';
    default: return name.slice(0, 1).toUpperCase();
  }
}

export const TERRAIN_LEGEND: Array<{ code: string; name: string; note: string; color: string }> = [
  { code: 'F', name: 'Field', note: 'Open ground', color: '#64774a' },
  { code: 'D', name: 'Road', note: 'Fast advance', color: '#756b49' },
  { code: 'L', name: 'Woods', note: '+1 cover, slower', color: '#345f42' },
  { code: 'G', name: 'Ridge', note: '+2 cover, blocks LOS', color: '#56616a' },
  { code: 'T', name: 'Town', note: 'Capture objective', color: '#6a5a48' },
];

export function computeTacticalDamage(
  attacker: { attack: number; count: number; hp: number },
  _target: { hp: number; count: number },
  cover: number,
  flankBonus: number,
  extraDamage = 0,
): number {
  const living = Math.max(1, Math.min(attacker.count, Math.ceil(attacker.hp / 3)));
  const baseDamage = Math.ceil(attacker.attack * living * 0.65);
  return Math.max(1, baseDamage - cover + flankBonus + extraDamage);
}

/** Line-of-sight for naval bombardment — water never blocks. */
export function hasNavalBombardLineOfSight(
  width: number,
  height: number,
  terrain: TacticalTerrain[][],
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  if (steps <= 1) return true;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (x === ax && y === ay) continue;
    if (x === bx && y === by) continue;
    const tile = terrain[y]?.[x];
    if (!tile) return false;
    if (tile.kind === 'land' && tile.cover >= 2) return false;
  }
  return true;
}

export function isTacticalAdjacentToWater(
  width: number,
  height: number,
  terrain: TacticalTerrain[][],
  x: number,
  y: number,
): boolean {
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (terrain[ny]?.[nx]?.kind === 'water') return true;
  }
  return false;
}

export function isTacticalCoastalFiringPosition(
  width: number,
  height: number,
  terrain: TacticalTerrain[][],
  x: number,
  y: number,
): boolean {
  const kind = terrain[y]?.[x]?.kind ?? 'land';
  if (kind === 'shore') return true;
  return kind === 'land' && isTacticalAdjacentToWater(width, height, terrain, x, y);
}

/** Whether a land unit on the tactical grid can fire on a naval unit in water. */
export function canTacticalLandAttackNaval(
  unitType: import('../data/Unit').UnitType,
  attacker: { x: number; y: number; range: number },
  target: { x: number; y: number; domain: UnitDomain; hp: number },
  terrain: TacticalTerrain[][],
  width: number,
  height: number,
  hasRangedLineOfSight: (ax: number, ay: number, bx: number, by: number) => boolean,
): boolean {
  if (target.domain !== 'sea' || target.hp <= 0 || unitType.domain !== 'land') return false;
  if (terrain[target.y]?.[target.x]?.kind !== 'water') return false;

  const dist = Math.max(Math.abs(attacker.x - target.x), Math.abs(attacker.y - target.y));
  const maxRange = canLandUnitStrikeNaval(unitType) ? attacker.range : 1;
  if (dist > maxRange) return false;

  if (canLandUnitStrikeNaval(unitType)) {
    return hasRangedLineOfSight(attacker.x, attacker.y, target.x, target.y);
  }

  if (!isTacticalCoastalFiringPosition(width, height, terrain, attacker.x, attacker.y)) return false;
  return hasNavalBombardLineOfSight(width, height, terrain, attacker.x, attacker.y, target.x, target.y);
}

/** Line-of-sight for ranged fire (woods/ridges/units block). */
export function hasTacticalLineOfSight(
  width: number,
  height: number,
  terrain: TacticalTerrain[][],
  unitPositions: Array<{ x: number; y: number }>,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  if (steps <= 1) return true;
  const blockers = new Set(unitPositions.map(p => `${p.x},${p.y}`));
  blockers.delete(`${ax},${ay}`);
  blockers.delete(`${bx},${by}`);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    if (x === ax && y === ay) continue;
    if (x === bx && y === by) continue;
    const tile = terrain[y]?.[x];
    if (!tile) return false;
    if (tile.cover >= 2 || blockers.has(`${x},${y}`)) return false;
  }
  return true;
}

export class TacticalBattleUI {
  private state: TacticalState | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private metrics = { tile: 48, offsetX: 0, offsetY: 0 };
  private finishCallback: ((combat: CombatState, meta?: TacticalOutcomeMeta) => void) | null = null;
  private autoCallback: (() => void) | null = null;
  private activeCombat: CombatState | null = null;
  private pendingOutcomeMeta: TacticalOutcomeMeta | null = null;
  private territoryName = '';
  private hoveredTile: { x: number; y: number } | null = null;
  private animationFrame: number | null = null;
  private previousFocus: HTMLElement | null = null;

  private readonly onResize = (): void => this.render();

  private readonly onModalKeyDown = (event: KeyboardEvent): void => {
    if (!document.getElementById('tactical-battle-modal')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      const continueButton = document.getElementById('btn-tactical-continue') as HTMLButtonElement | null;
      if (continueButton) {
        continueButton.click();
        return;
      }
      if (this.state?.phase === 'player') this.endTurn();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.autoBattleInstead();
      return;
    }
    if (this.state?.phase !== 'player') return;
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      this.endTurn();
      return;
    }
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      this.fireAtHoveredTarget();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.cycleSelectedAttacker(event.shiftKey);
      return;
    }
    if (event.key === 'u' || event.key === 'U') {
      event.preventDefault();
      this.undoLastMove();
      return;
    }
    const index = Number.parseInt(event.key, 10);
    if (index >= 1 && index <= 9) {
      event.preventDefault();
      this.selectAttackerByIndex(index - 1);
    }
  };

  show(
    combat: CombatState,
    territoryName: string,
    territoryType: TacticalTerritoryType,
    finish: (combat: CombatState, meta?: TacticalOutcomeMeta) => void,
    autoBattle: () => void,
  ): void {
    this.close();
    this.activeCombat = combat;
    this.finishCallback = finish;
    this.autoCallback = autoBattle;
    this.territoryName = territoryName;
    const mode = resolveTacticalBattleMode(territoryType, combat);
    this.state = this.createState(combat, territoryName, mode);
    const brief = mode === 'naval'
      ? 'Fleet action on open water. Battleships and cruisers can bombard the shore (S tiles). Control the engagement zone or sink the enemy fleet.'
      : mode === 'amphibious'
        ? 'Amphibious assault. Ships fight on water; land units take the beach. Bombardment can soften coastal defenders before landing.'
        : 'Move, then fire. Hold the town objective or eliminate defenders. Artillery must deploy before firing.';
    const objectiveLabel = objectiveLabelForMode(mode);
    const legend = getTacticalTerrainLegend(mode);

    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const modal = document.createElement('div');
    modal.id = 'tactical-battle-modal';
    modal.className = `modal tactical-battle-modal tactical-mode-${mode}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'tactical-battle-title');
    modal.innerHTML = `
      <div class="modal-content tactical-battle-content">
        <div class="tactical-header">
          <div>
            <div class="tactical-kicker">${mode === 'naval' ? 'Naval Tactical Battle' : mode === 'amphibious' ? 'Amphibious Tactical Battle' : 'Tactical Battle'}</div>
            <h2 id="tactical-battle-title">${this.escape(territoryName)}</h2>
            <p class="tactical-brief">${this.escape(brief)}</p>
          </div>
          <button id="btn-tactical-close" type="button" title="Auto battle instead" aria-label="Close and auto-resolve battle">&times;</button>
        </div>
        <div id="tactical-objective-wrap" class="tactical-objective-wrap">
          <span>Objective — ${this.escape(objectiveLabel)}</span>
          <div class="tactical-objective-track"><div id="tactical-objective-fill" class="tactical-objective-fill"></div></div>
          <em id="tactical-objective-label">0% secured</em>
        </div>
        <div class="tactical-layout">
          <div class="tactical-map-column">
            <canvas id="tactical-battle-canvas" class="tactical-canvas" aria-label="Tactical battle map"></canvas>
            <div class="tactical-terrain-legend" aria-label="Terrain legend">
              <span class="tactical-legend-title">Map key</span>
              ${legend.map(t => `
                <span class="tactical-legend-item" title="${this.escape(t.note)}">
                  <i style="background:${t.color}"></i>
                  <b>${t.code}</b> ${this.escape(t.name)}
                  <em>${this.escape(t.note)}</em>
                </span>
              `).join('')}
              <span class="tactical-legend-hint">Gold = move · Red = attack · Blue tint = range${mode !== 'land' ? ' · Shore = bombard' : ''}</span>
            </div>
          </div>
          <aside class="tactical-panel">
            <div class="tactical-panel-top">
              <div class="tactical-actions">
                <button id="btn-tactical-fire" class="primary">Fire (Space)</button>
                <button id="btn-tactical-undo">Undo Move (U)</button>
                <button id="btn-tactical-end-turn">End Turn (E)</button>
                <button id="btn-tactical-auto">Auto Battle</button>
              </div>
              <p class="tactical-shortcuts"><kbd>Tab</kbd> cycle · <kbd>Space</kbd> fire · <kbd>U</kbd> undo · <kbd>1</kbd>–<kbd>9</kbd> pick stack</p>
            </div>
            <div id="tactical-status" class="tactical-status"></div>
            <div id="tactical-log" class="tactical-log"></div>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    this.canvas = modal.querySelector<HTMLCanvasElement>('#tactical-battle-canvas');
    this.canvas?.addEventListener('click', this.onCanvasClick);
    this.canvas?.addEventListener('mousemove', this.onCanvasMove);
    modal.querySelector('#btn-tactical-close')?.addEventListener('click', () => this.autoBattleInstead());
    modal.querySelector('#btn-tactical-fire')?.addEventListener('click', () => this.fireAtHoveredTarget());
    modal.querySelector('#btn-tactical-undo')?.addEventListener('click', () => this.undoLastMove());
    modal.querySelector('#btn-tactical-end-turn')?.addEventListener('click', () => this.endTurn());
    modal.querySelector('#btn-tactical-auto')?.addEventListener('click', () => this.autoBattleInstead());
    document.getElementById('tactical-status')?.addEventListener('click', this.onRosterClick);
    modal.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('keydown', this.onModalKeyDown, true);
    window.addEventListener('resize', this.onResize);

    soundManager.play('tactical_start');
    soundManager.playMusic('tactical_combat');
    this.render();
    this.scheduleAnimationFrame();
    (modal.querySelector('#btn-tactical-fire') as HTMLButtonElement | null)?.focus();
  }

  private scheduleAnimationFrame(): void {
    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame);
    const tick = () => {
      if (!this.state || !document.getElementById('tactical-battle-modal')) return;
      const now = Date.now();
      const before = this.state.fx.length;
      this.state.fx = this.state.fx.filter(fx => fx.expiresAt > now);
      const pulseExpired = this.state.pulseTile && this.state.pulseTile.expiresAt <= now;
      if (pulseExpired) this.state.pulseTile = null;
      const animDone = this.state.moveAnim && this.state.moveAnim.end <= now;
      if (animDone) this.state.moveAnim = null;
      if (before !== this.state.fx.length || pulseExpired || animDone) this.render();
      this.animationFrame = requestAnimationFrame(tick);
    };
    this.animationFrame = requestAnimationFrame(tick);
  }

  private autoBattleInstead(): void {
    this.close();
    this.finishCallback = null;
    this.activeCombat = null;
    const auto = this.autoCallback;
    this.autoCallback = null;
    auto?.();
  }

  close(): void {
    if (this.animationFrame != null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.canvas?.removeEventListener('click', this.onCanvasClick);
    this.canvas?.removeEventListener('mousemove', this.onCanvasMove);
    document.removeEventListener('keydown', this.onModalKeyDown, true);
    window.removeEventListener('resize', this.onResize);
    document.getElementById('tactical-status')?.removeEventListener('click', this.onRosterClick);
    document.getElementById('tactical-battle-modal')?.remove();
    this.canvas = null;
    this.state = null;
    this.hoveredTile = null;
    if (this.previousFocus?.isConnected) {
      this.previousFocus.focus();
    }
    this.previousFocus = null;
  }

  private buildOpeningLog(mode: TacticalBattleMode, territoryName: string): string[] {
    const lines = [
      mode === 'naval'
        ? `Fleet action at ${territoryName}.`
        : mode === 'amphibious'
          ? `Amphibious battle for ${territoryName}.`
          : `Battle for ${territoryName}.`,
      mode === 'land'
        ? 'Capture the town (100%) or wipe out defenders. Ranged units need line of sight.'
        : 'Move infantry to shore tiles (S/B) to fire on ships. Artillery and armor can engage from coastal ground.',
    ];
    if (mode === 'amphibious' && typeof localStorage !== 'undefined') {
      const hintKey = 'gs-tactical-amphibious-hint';
      if (!localStorage.getItem(hintKey)) {
        lines.push('Tip: Select infantry, move to shore (S/B), then click enemy ships in range.');
        localStorage.setItem(hintKey, '1');
      }
    }
    return lines;
  }

  private createState(combat: CombatState, territoryName: string, mode: TacticalBattleMode): TacticalState {
    const units: TacticalUnit[] = [];
    const width = Math.max(8, Math.min(10, 8 + Math.floor(Math.max(combat.attackers.length, combat.defenders.length) / 5)));
    const height = Math.max(6, Math.min(9, Math.ceil(Math.max(combat.attackers.length, combat.defenders.length) / 2) + 2));
    const terrain = mode === 'land'
      ? buildTacticalTerrainGrid(width, height)
      : buildNavalTacticalTerrainGrid(width, height, mode);
    const attackerPositions = this.getDeploymentPositions('attacker', combat.attackers, width, height, mode, terrain);
    const defenderPositions = this.getDeploymentPositions('defender', combat.defenders, width, height, mode, terrain);
    combat.attackers.forEach((cu, index) => {
      const position = attackerPositions[index] ?? { x: 1, y: 1 };
      units.push(this.makeTacticalUnit(cu, 'attacker', index, position.x, position.y));
    });
    combat.defenders.forEach((cu, index) => {
      const position = defenderPositions[index] ?? { x: width - 2, y: 1 };
      units.push(this.makeTacticalUnit(cu, 'defender', index, position.x, position.y));
    });
    return {
      width,
      height,
      mode,
      phase: 'player',
      turn: 1,
      selectedId: units.find(unit => unit.side === 'attacker')?.id ?? null,
      units,
      terrain,
      log: this.buildOpeningLog(mode, territoryName),
      fx: [],
      pulseTile: null,
      captureProgress: 0,
      coastalSupportHp: mode === 'land' ? 0 : 30,
      undoMove: null,
      moveAnim: null,
    };
  }

  private makeTacticalUnit(cu: CombatUnit, side: TacticalSide, index: number, x: number, y: number): TacticalUnit {
    const isFast = cu.unitType.id.includes('tank') || cu.unitType.id.includes('armor')
      || cu.unitType.domain === 'air'
      || (cu.unitType.domain === 'sea' && (cu.unitType.id.includes('destroy') || cu.unitType.id.includes('cruiser')));
    const isRanged = cu.unitType.id.includes('artillery') || cu.unitType.domain === 'air' || cu.unitType.domain === 'sea';
    const role = this.getRole(cu);
    const navalRange = cu.unitType.canBombard ? 4 : cu.unitType.id.includes('sub') ? 2 : 3;
    return {
      id: `${side}-${index}-${cu.unitType.id}`,
      side,
      sourceIndex: index,
      name: cu.unitType.name,
      role,
      domain: cu.unitType.domain,
      canBombard: cu.unitType.canBombard,
      count: cu.count,
      x,
      y,
      hp: Math.max(2, cu.count * 3),
      maxHp: Math.max(2, cu.count * 3),
      attack: Math.max(1, side === 'attacker' ? cu.unitType.attack : cu.unitType.defense),
      range: isRanged ? (role === 'Artillery' ? 4 : cu.unitType.domain === 'sea' ? navalRange : 3) : 1,
      move: cu.unitType.domain === 'sea'
        ? Math.max(2, Math.min(4, cu.unitType.movement))
        : isFast ? 3 : 2,
      moved: false,
      attacked: false,
    };
  }

  private onCanvasClick = (event: MouseEvent): void => {
    const point = this.screenToGrid(event);
    if (!point || !this.state || this.state.phase !== 'player') return;

    const clickedUnit = this.getUnitAt(point.x, point.y);
    if (clickedUnit?.side === 'attacker') {
      this.state.selectedId = clickedUnit.id;
      this.render();
      return;
    }

    const selected = this.getSelected();
    if (!selected) return;

    if (clickedUnit?.side === 'defender') {
      this.tryAttack(selected, clickedUnit);
      return;
    }

    if (!clickedUnit && this.canBombardTile(selected, point.x, point.y)) {
      this.performBombardment(selected, point.x, point.y);
      return;
    }

    if (!selected.moved && this.canMoveTo(selected, point.x, point.y)) {
      this.performMove(selected, point.x, point.y);
    }
  };

  private onRosterClick = (event: MouseEvent): void => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.tactical-roster-row');
    if (!row || !this.state || this.state.phase !== 'player') return;
    const unitId = row.dataset.unitId;
    const unit = this.state.units.find(u => u.id === unitId && u.hp > 0);
    if (unit?.side === 'attacker') {
      this.state.selectedId = unit.id;
      this.render();
    }
  };

  private onCanvasMove = (event: MouseEvent): void => {
    if (!this.canvas) return;
    const point = this.screenToGrid(event);
    const previous = this.hoveredTile;
    this.hoveredTile = point;
    const selected = this.getSelected();
    let cursor = 'default';
    if (point && this.state?.phase === 'player' && selected) {
      const hoveredUnit = this.getUnitAt(point.x, point.y);
      if (hoveredUnit?.side === 'defender' && this.canAttackTarget(selected, hoveredUnit)) {
        cursor = 'crosshair';
      } else if (!hoveredUnit && this.canBombardTile(selected, point.x, point.y)) {
        cursor = 'crosshair';
      } else if (!selected.moved && this.canMoveTo(selected, point.x, point.y)) {
        cursor = 'pointer';
      } else if (hoveredUnit?.side === 'attacker') {
        cursor = 'pointer';
      }
    }
    this.canvas.style.cursor = cursor;
    if (previous?.x !== point?.x || previous?.y !== point?.y) this.render();
  };

  private selectAttackerByIndex(index: number): void {
    if (!this.state) return;
    const attackers = this.state.units.filter(u => u.side === 'attacker' && u.hp > 0);
    const unit = attackers[index];
    if (unit) {
      this.state.selectedId = unit.id;
      this.render();
    }
  }

  private cycleSelectedAttacker(reverse: boolean): void {
    if (!this.state) return;
    const attackers = this.state.units.filter(u => u.side === 'attacker' && u.hp > 0);
    if (attackers.length === 0) return;
    const current = attackers.findIndex(u => u.id === this.state?.selectedId);
    const next = reverse
      ? (current <= 0 ? attackers.length - 1 : current - 1)
      : (current < 0 || current >= attackers.length - 1 ? 0 : current + 1);
    this.state.selectedId = attackers[next].id;
    this.render();
  }

  private fireAtHoveredTarget(): void {
    const selected = this.getSelected();
    if (!selected || !this.hoveredTile) return;
    const target = this.getUnitAt(this.hoveredTile.x, this.hoveredTile.y);
    if (target) {
      this.tryAttack(selected, target);
      return;
    }
    if (this.canBombardTile(selected, this.hoveredTile.x, this.hoveredTile.y)) {
      this.performBombardment(selected, this.hoveredTile.x, this.hoveredTile.y);
    }
  }

  private tryAttack(attacker: TacticalUnit, target: TacticalUnit): void {
    if (!this.canAttackTarget(attacker, target)) {
      if (attacker.attacked) this.pushLog(`${attacker.name} already fired.`);
      else if (attacker.role === 'Artillery' && attacker.moved) this.pushLog('Artillery must fire from a deployed position.');
      else if (this.distance(attacker, target) > attacker.range) this.pushLog('Target out of range.');
      else if (attacker.domain === 'land' && target.domain === 'sea' && !this.isCoastalFiringPosition(attacker.x, attacker.y)) {
        this.pushLog('Move to the shore (S/B) or coastal ground to fire on ships.');
      } else if (attacker.domain === 'land' && target.domain === 'sea') {
        this.pushLog('No line of sight to the target ship.');
      } else this.pushLog('No line of sight — clear woods/ridges/units.');
      this.render();
      return;
    }
    this.attack(attacker, target);
    this.state!.undoMove = null;
    this.evaluate();
    this.render();
  }

  private performMove(unit: TacticalUnit, x: number, y: number): void {
    if (!this.state) return;
    this.state.undoMove = { unitId: unit.id, x: unit.x, y: unit.y };
    const fromX = unit.x;
    const fromY = unit.y;
    unit.x = x;
    unit.y = y;
    unit.moved = true;
    const now = Date.now();
    this.state.moveAnim = { unitId: unit.id, fromX, fromY, toX: x, toY: y, start: now, end: now + 240 };
    this.state.pulseTile = { x, y, expiresAt: now + 450 };
    soundManager.play('tactical_move');
    this.pushLog(`${unit.name} → ${this.getTerrain(x, y).name}.`);
    this.evaluate();
    this.render();
  }

  private undoLastMove(): void {
    if (!this.state?.undoMove || this.state.phase !== 'player') return;
    const unit = this.state.units.find(u => u.id === this.state!.undoMove!.unitId);
    if (!unit || unit.attacked) {
      this.pushLog('Cannot undo after firing.');
      return;
    }
    unit.x = this.state.undoMove.x;
    unit.y = this.state.undoMove.y;
    unit.moved = false;
    this.state.undoMove = null;
    this.state.moveAnim = null;
    this.pushLog(`${unit.name} movement undone.`);
    this.render();
  }

  private endTurn(): void {
    if (!this.state || this.state.phase !== 'player') return;
    this.state.undoMove = null;
    this.tickObjectiveCapture();
    if (this.state.captureProgress >= 100) {
      this.pushLog(this.state.mode === 'land' ? 'Town secured — defenders routed!' : 'Engagement zone secured — enemy fleet breaks off!');
      this.evaluate();
      return;
    }
    this.state.phase = 'enemy';
    this.pushLog('Defenders respond…');
    this.render();
    this.runEnemyTurnStep(0);
  }

  private runEnemyTurnStep(index: number): void {
    if (!this.state) return;
    const enemies = this.state.units.filter(unit => unit.side === 'defender' && unit.hp > 0);
    if (index >= enemies.length) {
      this.finishPlayerTurn();
      return;
    }
    const enemy = enemies[index];
    const target = this.pickBestTarget(enemy);
    if (target) {
      if (!enemy.attacked && this.canAttackTarget(enemy, target)) {
        this.attack(enemy, target);
      } else if (!enemy.moved) {
        const steps = enemy.range > 1 ? 1 : enemy.move;
        for (let step = 0; step < steps; step++) {
          const move = this.bestStepToward(enemy, target);
          if (!move || (move.x === enemy.x && move.y === enemy.y)) break;
          enemy.x = move.x;
          enemy.y = move.y;
          enemy.moved = true;
        }
        if (enemy.moved) this.pushLog(`${enemy.name} repositions.`);
        const refreshed = this.pickBestTarget(enemy);
        if (refreshed && this.canAttackTarget(enemy, refreshed)) this.attack(enemy, refreshed);
      }
    } else if (!enemy.attacked && enemy.canBombard) {
      const shoreTile = this.findBombardTile(enemy);
      if (shoreTile) this.performBombardment(enemy, shoreTile.x, shoreTile.y);
    }
    this.evaluate();
    if (this.state.phase === 'victory' || this.state.phase === 'defeat') return;
    this.render();
    window.setTimeout(() => this.runEnemyTurnStep(index + 1), 340);
  }

  private finishPlayerTurn(): void {
    if (!this.state) return;
    this.state.turn += 1;
    this.state.phase = 'player';
    this.state.units.forEach(unit => {
      if (unit.hp > 0) {
        unit.moved = false;
        unit.attacked = false;
      }
    });
    this.state.selectedId = this.state.units.find(unit => unit.side === 'attacker' && unit.hp > 0)?.id ?? null;
    this.pushLog(`Turn ${this.state.turn} — your orders.`);
    this.evaluate();
    this.render();
  }

  private tickObjectiveCapture(): void {
    if (!this.state) return;
    const objective = this.getObjectiveTile();
    if (!objective) return;
    const attackerOn = this.state.units.some(u => u.side === 'attacker' && u.hp > 0 && u.x === objective.x && u.y === objective.y);
    const defenderOn = this.state.units.some(u => u.side === 'defender' && u.hp > 0 && u.x === objective.x && u.y === objective.y);
    if (attackerOn && !defenderOn) {
      this.state.captureProgress = Math.min(100, this.state.captureProgress + 55);
      this.pushLog(`${objectiveLabelForMode(this.state.mode)} ${this.state.captureProgress}% secured.`);
    } else if (defenderOn) {
      this.state.captureProgress = Math.max(0, this.state.captureProgress - 25);
      this.pushLog(`Defenders contest the ${objectiveLabelForMode(this.state.mode).toLowerCase()}.`);
    }
  }

  private pickBestTarget(unit: TacticalUnit): TacticalUnit | undefined {
    const inRange = this.state?.units.filter(
      candidate => candidate.side !== unit.side && candidate.hp > 0 && this.canAttackTarget(unit, candidate),
    ) ?? [];
    if (inRange.length > 0) {
      return inRange.sort((a, b) => a.hp - b.hp || this.getLivingCount(a) - this.getLivingCount(b))[0];
    }
    return this.nearestEnemy(unit);
  }

  private attack(attacker: TacticalUnit, target: TacticalUnit): void {
    const preview = this.getAttackPreview(attacker, target);
    const crit = Math.random() < 0.14;
    const damage = preview.damage + (crit ? 2 : 0);
    target.hp = Math.max(0, target.hp - damage);
    attacker.attacked = true;
    this.spawnDamageFx(target.x, target.y, damage, preview.flankBonus > 0 || crit);
    soundManager.play(target.hp <= 0 ? 'explosion' : 'tactical_fire');
    if (crit || target.hp <= 0) visualEffects.shake(crit ? 0.55 : 0.35);
    const tags = [
      preview.flankBonus ? 'flank' : '',
      preview.chargeBonus ? 'charge' : '',
      crit ? 'crit' : '',
    ].filter(Boolean).join(', ');
    this.pushLog(target.hp <= 0
      ? `${attacker.name} destroyed ${target.name}${tags ? ` (${tags})` : ''}.`
      : `${attacker.name} hit ${target.name} for ${damage}${tags ? ` (${tags})` : ''}.`);
  }

  private performBombardment(attacker: TacticalUnit, x: number, y: number): void {
    if (!this.state || !this.canBombardTile(attacker, x, y)) return;
    const targetUnit = this.getUnitAt(x, y);
    if (targetUnit) {
      this.tryAttack(attacker, targetUnit);
      return;
    }
    const damage = Math.max(2, Math.ceil(attacker.attack * Math.max(1, this.getLivingCount(attacker)) * 0.45));
    attacker.attacked = true;
    if (this.state.coastalSupportHp > 0) {
      this.state.coastalSupportHp = Math.max(0, this.state.coastalSupportHp - damage);
      this.pushLog(`${attacker.name} bombards the coast (${this.state.coastalSupportHp} coastal support left).`);
    } else {
      this.state.captureProgress = Math.min(100, this.state.captureProgress + 20);
      this.pushLog(`${attacker.name} shells the shore — ${this.state.captureProgress}% secured.`);
    }
    this.spawnDamageFx(x, y, damage, true);
    soundManager.play('tactical_fire');
    this.state.undoMove = null;
    this.evaluate();
    this.render();
  }

  private spawnDamageFx(x: number, y: number, damage: number, flank: boolean): void {
    if (!this.state) return;
    this.state.fx.push({
      x,
      y,
      text: flank ? `-${damage} flank` : `-${damage}`,
      color: flank ? '#fbbf24' : '#fca5a5',
      expiresAt: Date.now() + 750,
    });
  }

  private evaluate(): void {
    if (!this.state || !this.activeCombat) return;
    const attackersAlive = this.state.units.some(unit => unit.side === 'attacker' && unit.hp > 0);
    const defendersAlive = this.state.units.some(unit => unit.side === 'defender' && unit.hp > 0);
    const captured = this.state.captureProgress >= 100 && attackersAlive;
    if ((attackersAlive && defendersAlive) && !captured) return;

    const attackerWon = captured || (attackersAlive && !defendersAlive);
    this.state.phase = attackerWon ? 'victory' : 'defeat';
    this.applyOutcomeToCombat(this.activeCombat, attackerWon);
    this.pendingOutcomeMeta = buildTacticalOutcomeMeta(this.activeCombat, attackerWon);
    soundManager.play(attackerWon ? 'tactical_victory' : 'tactical_defeat');
    this.render();
    this.renderResultPanel(attackerWon);
  }

  private applyOutcomeToCombat(combat: CombatState, attackerWon: boolean): void {
    if (!this.state) return;
    combat.winner = attackerWon ? 'attacker' : 'defender';
    combat.isComplete = true;
    combat.rounds.push({
      round: combat.rounds.length + 1,
      attackerRolls: [],
      defenderRolls: [],
      attackerHits: 0,
      defenderHits: 0,
      attackerCriticals: 0,
      defenderCriticals: 0,
      attackerCasualties: [],
      defenderCasualties: [],
    });

    for (const unit of this.state.units) {
      const target = unit.side === 'attacker' ? combat.attackers[unit.sourceIndex] : combat.defenders[unit.sourceIndex];
      if (!target) continue;
      target.casualties = Math.max(target.casualties, this.getCasualties(unit));
    }
    if (attackerWon) {
      combat.defenders.forEach(cu => { cu.casualties = cu.count; });
    } else {
      combat.attackers.forEach(cu => { cu.casualties = cu.count; });
    }
  }

  private render(): void {
    if (!this.state || !this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(bounds.width * ratio);
    this.canvas.height = Math.floor(bounds.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.metrics.tile = Math.floor(Math.min(bounds.width / this.state.width, bounds.height / this.state.height));
    this.metrics.offsetX = Math.floor((bounds.width - this.metrics.tile * this.state.width) / 2);
    this.metrics.offsetY = Math.floor((bounds.height - this.metrics.tile * this.state.height) / 2);

    ctx.clearRect(0, 0, bounds.width, bounds.height);
    const bg = ctx.createLinearGradient(0, 0, bounds.width, bounds.height);
    if (this.state.mode === 'naval' || this.state.mode === 'amphibious') {
      bg.addColorStop(0, '#0b1f3a');
      bg.addColorStop(1, '#071526');
    } else {
      bg.addColorStop(0, '#101827');
      bg.addColorStop(1, '#151b16');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    const objective = this.getObjectiveTile();
    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const px = this.metrics.offsetX + x * this.metrics.tile;
        const py = this.metrics.offsetY + y * this.metrics.tile;
        const terrain = this.getTerrain(x, y);
        ctx.fillStyle = terrain.color;
        ctx.fillRect(px, py, this.metrics.tile, this.metrics.tile);
        if (objective && objective.x === x && objective.y === y) {
          ctx.strokeStyle = 'rgba(224, 184, 74, 0.55)';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, this.metrics.tile - 4, this.metrics.tile - 4);
        }
        ctx.strokeStyle = 'rgba(9,12,20,0.48)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, this.metrics.tile, this.metrics.tile);
        const code = terrainTileCode(terrain.name);
        const fontSize = Math.max(9, this.metrics.tile * 0.2);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(code, px + 6, py + 5);
        ctx.fillStyle = 'rgba(248,240,220,0.92)';
        ctx.fillText(code, px + 5, py + 4);
      }
    }

    const selected = this.getSelected();
    if (selected && this.state.phase === 'player') {
      if (!selected.moved) {
        for (let y = 0; y < this.state.height; y++) {
          for (let x = 0; x < this.state.width; x++) {
            if (this.canMoveTo(selected, x, y)) this.fillTile(ctx, x, y, 'rgba(200,144,48,0.28)');
          }
        }
      }
      const selectedType = this.resolveCombatUnitType(selected);
      if (!selected.attacked && selected.domain === 'land' && selectedType && !canLandUnitStrikeNaval(selectedType)) {
        for (let y = 0; y < this.state.height; y++) {
          for (let x = 0; x < this.state.width; x++) {
            if (this.getUnitAt(x, y)) continue;
            if (isTacticalCoastalFiringPosition(this.state.width, this.state.height, this.state.terrain, x, y)) {
              this.fillTile(ctx, x, y, 'rgba(45, 212, 191, 0.22)');
            }
          }
        }
      }
      if (!selected.attacked) {
        this.state.units
          .filter(unit => unit.side === 'defender' && unit.hp > 0 && this.canAttackTarget(selected, unit))
          .forEach(unit => this.fillTile(ctx, unit.x, unit.y, 'rgba(220,60,60,0.34)'));
        for (let y = 0; y < this.state.height; y++) {
          for (let x = 0; x < this.state.width; x++) {
            if (this.getUnitAt(x, y)) continue;
            if (this.canBombardTile(selected, x, y)) {
              this.fillTile(ctx, x, y, 'rgba(220,90,60,0.36)');
            } else if (selected.domain === 'land' && this.getTerrain(x, y).kind === 'water'
              && this.state.units.some(u => u.side === 'defender' && u.hp > 0 && u.x === x && u.y === y
                && this.canAttackTarget(selected, u))) {
              this.fillTile(ctx, x, y, 'rgba(251, 146, 60, 0.18)');
            } else if (this.distance(selected, { x, y }) <= selected.range) {
              this.fillTile(ctx, x, y, 'rgba(96,165,250,0.08)');
            }
          }
        }
      }
    }

    if (this.state.pulseTile) {
      this.fillTile(ctx, this.state.pulseTile.x, this.state.pulseTile.y, 'rgba(200,144,48,0.42)');
    }
    if (this.hoveredTile) this.fillTile(ctx, this.hoveredTile.x, this.hoveredTile.y, 'rgba(240,224,168,0.14)');
    if (selected && this.hoveredTile && !selected.moved && this.canMoveTo(selected, this.hoveredTile.x, this.hoveredTile.y)) {
      this.drawMovePath(ctx, selected, this.hoveredTile.x, this.hoveredTile.y);
    }

    const now = Date.now();
    for (const fx of this.state.fx) {
      if (fx.expiresAt <= now) continue;
      const alpha = Math.min(1, (fx.expiresAt - now) / 700);
      const px = this.metrics.offsetX + fx.x * this.metrics.tile + this.metrics.tile * 0.5;
      const py = this.metrics.offsetY + fx.y * this.metrics.tile + this.metrics.tile * 0.2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fx.color;
      ctx.font = `bold ${Math.max(11, this.metrics.tile * 0.28)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fx.text, px, py);
      ctx.globalAlpha = 1;
    }

    this.state.units.filter(unit => unit.hp > 0).forEach(unit => this.drawUnit(ctx, unit));
    if (this.state.phase === 'enemy') {
      ctx.fillStyle = 'rgba(8,12,20,0.55)';
      ctx.fillRect(0, 0, bounds.width, bounds.height);
      ctx.fillStyle = '#e8d8a8';
      ctx.font = 'bold 18px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Defender Turn', bounds.width / 2, bounds.height / 2);
    }
    this.renderHud();
    this.updateActionButtons();
    this.updateObjectiveBar();
  }

  private drawMovePath(ctx: CanvasRenderingContext2D, unit: TacticalUnit, tx: number, ty: number): void {
    const size = this.metrics.tile;
    const sx = this.metrics.offsetX + unit.x * size + size * 0.5;
    const sy = this.metrics.offsetY + unit.y * size + size * 0.5;
    const ex = this.metrics.offsetX + tx * size + size * 0.5;
    const ey = this.metrics.offsetY + ty * size + size * 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(200,144,48,0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  private getUnitDrawPosition(unit: TacticalUnit): { x: number; y: number } {
    if (!this.state?.moveAnim || this.state.moveAnim.unitId !== unit.id) {
      return { x: unit.x, y: unit.y };
    }
    const anim = this.state.moveAnim;
    const t = Math.min(1, (Date.now() - anim.start) / (anim.end - anim.start));
    const ease = 1 - (1 - t) ** 2;
    return {
      x: anim.fromX + (anim.toX - anim.fromX) * ease,
      y: anim.fromY + (anim.toY - anim.fromY) * ease,
    };
  }

  private updateObjectiveBar(): void {
    const fill = document.getElementById('tactical-objective-fill');
    const label = document.getElementById('tactical-objective-label');
    const pct = this.state?.captureProgress ?? 0;
    if (fill) fill.style.width = `${pct}%`;
    if (label) {
      label.textContent = pct >= 100
        ? `${objectiveLabelForMode(this.state?.mode ?? 'land')} secured`
        : `${pct}% secured`;
    }
  }

  private updateActionButtons(): void {
    if (!this.state) return;
    const playerPhase = this.state.phase === 'player';
    const selected = this.getSelected();
    const fireBtn = document.getElementById('btn-tactical-fire') as HTMLButtonElement | null;
    const undoBtn = document.getElementById('btn-tactical-undo') as HTMLButtonElement | null;
    const endBtn = document.getElementById('btn-tactical-end-turn') as HTMLButtonElement | null;
    const hoveredEnemy = this.hoveredTile ? this.getUnitAt(this.hoveredTile.x, this.hoveredTile.y) : undefined;
    const canFire = !!(selected && (
      (hoveredEnemy && this.canAttackTarget(selected, hoveredEnemy))
      || (this.hoveredTile && this.canBombardTile(selected, this.hoveredTile.x, this.hoveredTile.y))
    ));
    if (fireBtn) {
      fireBtn.disabled = !playerPhase || !canFire;
    }
    if (undoBtn) {
      undoBtn.disabled = !playerPhase || !this.state.undoMove || !!selected?.attacked;
    }
    if (endBtn) {
      endBtn.disabled = !playerPhase;
      endBtn.textContent = playerPhase ? 'End Turn (E)' : 'Enemy Turn…';
    }
  }

  private getObjectiveTile(): { x: number; y: number } | null {
    if (!this.state) return null;
    const cx = Math.floor(this.state.width / 2);
    const cy = Math.floor(this.state.height / 2);
    return { x: cx, y: cy };
  }

  private renderHud(): void {
    if (!this.state) return;
    const status = document.getElementById('tactical-status');
    const log = document.getElementById('tactical-log');
    const selected = this.getSelected();
    const hoveredUnit = this.hoveredTile ? this.getUnitAt(this.hoveredTile.x, this.hoveredTile.y) : undefined;
    const hoveredTerrain = this.hoveredTile ? this.getTerrain(this.hoveredTile.x, this.hoveredTile.y) : null;
    const preview = selected && hoveredUnit && hoveredUnit.side !== selected.side && this.canAttackTarget(selected, hoveredUnit)
      ? this.getAttackPreview(selected, hoveredUnit)
      : null;
    const attackerTotals = this.getSideTotals('attacker');
    const defenderTotals = this.getSideTotals('defender');
    const orders = selected
      ? `${selected.moved ? 'Moved' : 'Can move'} · ${selected.attacked ? 'Fired' : 'Can fire'}`
      : 'Select an attacking stack';
    if (status) {
      status.innerHTML = `
        <div><span>Phase</span><strong>${this.state.phase === 'player' ? 'Your Orders' : this.state.phase}</strong></div>
        <div><span>Turn</span><strong>${this.state.turn}</strong></div>
        <div><span>Orders</span><strong>${orders}</strong></div>
        <div><span>Attackers</span><strong>${attackerTotals.alive}/${attackerTotals.total}</strong></div>
        <div><span>Defenders</span><strong>${defenderTotals.alive}/${defenderTotals.total}</strong></div>
        <div><span>${this.state.mode === 'land' ? 'Town' : 'Zone'}</span><strong>${this.state.captureProgress}%</strong></div>
        ${this.state.coastalSupportHp > 0 ? `<div><span>Coast</span><strong>${this.state.coastalSupportHp} support</strong></div>` : ''}
        <div><span>Selected</span><strong>${selected ? `${this.roleTag(selected)} ${this.escape(selected.name)} ×${this.getLivingCount(selected)}` : 'None'}</strong></div>
        ${selected ? `<div><span>Role tip</span><strong>${this.escape(this.getRoleTip(selected))}</strong></div>` : ''}
        ${selected ? `<div><span>Stack HP</span><strong>${selected.hp}/${selected.maxHp}</strong></div>` : ''}
        <div class="tactical-preview">
          <span>Hovered Tile</span>
          <strong>${hoveredTerrain ? `${hoveredTerrain.name} — cover ${hoveredTerrain.cover}` : '—'}</strong>
          ${hoveredTerrain ? `<small>${hoveredTerrain.note}</small>` : ''}
        </div>
        <div class="tactical-preview tactical-preview--attack">
          <span>Attack Preview</span>
          <strong>${preview ? `${preview.damage} dmg · ~${preview.casualties} loss${preview.casualties === 1 ? '' : 'es'}${preview.flankBonus ? ' · flank' : ''}${preview.chargeBonus ? ' · charge' : ''}` : 'Hover enemy in range & LOS'}</strong>
          ${preview ? `<small>${this.escape(preview.attacker.name)} vs ${this.escape(preview.target.name)}</small>` : ''}
        </div>
        <div class="tactical-roster tactical-roster--attackers">
          <span>Attacking stacks (1–9)</span>
          ${this.renderRoster('attacker')}
        </div>
        <div class="tactical-roster tactical-roster--defenders">
          <span>Defending stacks</span>
          ${this.renderRoster('defender')}
        </div>
      `;
    }
    if (log) {
      log.innerHTML = this.state.log.map(entry => `<div>${this.escape(entry)}</div>`).join('');
      log.scrollTop = 0;
    }
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: TacticalUnit): void {
    const size = this.metrics.tile;
    const pos = this.getUnitDrawPosition(unit);
    const cx = this.metrics.offsetX + pos.x * size + size * 0.5;
    const cy = this.metrics.offsetY + pos.y * size + size * 0.5;
    const r = size * 0.28;
    ctx.fillStyle = unit.side === 'attacker' ? '#2563a8' : '#9f2f2f';
    ctx.strokeStyle = unit.id === this.state?.selectedId ? '#d4a017' : 'rgba(232,216,168,0.84)';
    ctx.lineWidth = unit.id === this.state?.selectedId ? 3 : 2;
    ctx.beginPath();
    if (unit.range > 1) {
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r * 0.75);
      ctx.lineTo(cx - r, cy + r * 0.75);
      ctx.closePath();
    } else {
      ctx.roundRect(cx - r, cy - r * 0.62, r * 2, r * 1.24, 5);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(8,12,18,0.78)';
    ctx.fillRect(cx - r, cy + size * 0.28, r * 2, 5);
    ctx.fillStyle = unit.hp / unit.maxHp > 0.45 ? '#6ee7b7' : '#d4a017';
    ctx.fillRect(cx - r, cy + size * 0.28, r * 2 * (unit.hp / unit.maxHp), 5);
    const living = this.getLivingCount(unit);
    ctx.fillStyle = '#0a1122';
    ctx.strokeStyle = 'rgba(232,216,168,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx + r * 0.86, cy - r * 0.82, Math.max(8, size * 0.13), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff8e8';
    ctx.font = `bold ${Math.max(9, size * 0.18)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(living), cx + r * 0.86, cy - r * 0.82);
    ctx.fillStyle = '#e8d8a8';
    ctx.font = `bold ${Math.max(8, size * 0.16)}px sans-serif`;
    ctx.fillText(this.roleTag(unit), cx, cy + size * 0.44);
    if (unit.moved || unit.attacked) {
      const badge = unit.moved && unit.attacked ? '✓✓' : unit.moved ? 'M' : 'F';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx - r * 0.5, cy - r * 1.05, r, r * 0.45);
      ctx.fillStyle = '#e8d8a8';
      ctx.font = `bold ${Math.max(7, size * 0.14)}px sans-serif`;
      ctx.fillText(badge, cx - r * 0.02, cy - r * 0.82);
    }
  }

  private fillTile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(
      this.metrics.offsetX + x * this.metrics.tile,
      this.metrics.offsetY + y * this.metrics.tile,
      this.metrics.tile,
      this.metrics.tile,
    );
  }

  private screenToGrid(event: MouseEvent): { x: number; y: number } | null {
    if (!this.canvas || !this.state) return null;
    const bounds = this.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left - this.metrics.offsetX) / this.metrics.tile);
    const y = Math.floor((event.clientY - bounds.top - this.metrics.offsetY) / this.metrics.tile);
    if (x < 0 || y < 0 || x >= this.state.width || y >= this.state.height) return null;
    return { x, y };
  }

  private getSelected(): TacticalUnit | undefined {
    return this.state?.units.find(unit => unit.id === this.state?.selectedId && unit.hp > 0);
  }

  private getUnitAt(x: number, y: number): TacticalUnit | undefined {
    return this.state?.units.find(unit => unit.x === x && unit.y === y && unit.hp > 0);
  }

  private tileAllowsUnit(unit: TacticalUnit, x: number, y: number): boolean {
    const kind = this.getTerrain(x, y).kind ?? 'land';
    if (unit.domain === 'air') return true;
    if (unit.domain === 'sea') return kind === 'water';
    return kind === 'land' || kind === 'shore';
  }

  private isBombardableTile(x: number, y: number): boolean {
    const kind = this.getTerrain(x, y).kind ?? 'land';
    return kind === 'shore' || kind === 'land';
  }

  private canMoveTo(unit: TacticalUnit, x: number, y: number): boolean {
    if (!this.state || unit.moved) return false;
    if (this.getUnitAt(x, y)) return false;
    if (!this.tileAllowsUnit(unit, x, y)) return false;
    const terrainCost = unit.domain === 'air' ? 0 : Math.max(0, this.getTerrain(x, y).moveCost - 1);
    return this.distance(unit, { x, y }) + terrainCost <= unit.move;
  }

  private canBombardTile(attacker: TacticalUnit, x: number, y: number): boolean {
    if (!this.state || attacker.attacked || !attacker.canBombard || attacker.domain !== 'sea') return false;
    if (!this.isBombardableTile(x, y)) return false;
    if (this.distance(attacker, { x, y }) > attacker.range) return false;
    const targetUnit = this.getUnitAt(x, y);
    if (targetUnit?.side === attacker.side) return false;
    return hasNavalBombardLineOfSight(this.state.width, this.state.height, this.state.terrain, attacker.x, attacker.y, x, y);
  }

  private resolveCombatUnitType(unit: TacticalUnit): import('../data/Unit').UnitType | null {
    if (!this.activeCombat) return null;
    const pool = unit.side === 'attacker' ? this.activeCombat.attackers : this.activeCombat.defenders;
    return pool[unit.sourceIndex]?.unitType ?? null;
  }

  private isAdjacentToWater(x: number, y: number): boolean {
    if (!this.state) return false;
    return isTacticalAdjacentToWater(this.state.width, this.state.height, this.state.terrain, x, y);
  }

  private isCoastalFiringPosition(x: number, y: number): boolean {
    if (!this.state) return false;
    return isTacticalCoastalFiringPosition(this.state.width, this.state.height, this.state.terrain, x, y);
  }

  private canLandUnitAttackNavalTactical(attacker: TacticalUnit, target: TacticalUnit): boolean {
    const attackerType = this.resolveCombatUnitType(attacker);
    if (!attackerType || !this.state) return false;
    return canTacticalLandAttackNaval(
      attackerType,
      attacker,
      target,
      this.state.terrain,
      this.state.width,
      this.state.height,
      (ax, ay, bx, by) => this.hasLineOfSight(ax, ay, bx, by),
    );
  }

  private canAttackTarget(attacker: TacticalUnit, target: TacticalUnit): boolean {
    if (!this.state || attacker.attacked || target.hp <= 0) return false;
    const attackerType = this.resolveCombatUnitType(attacker);
    const targetType = this.resolveCombatUnitType(target);
    if (attackerType && targetType) {
      if (attackerType.domain === 'land' && targetType.domain === 'sea') {
        if (!this.canLandUnitAttackNavalTactical(attacker, target)) return false;
      } else if (!canUnitEngageTarget(attackerType, targetType)) {
        return false;
      }
    }
    if (attacker.role === 'Artillery' && attacker.moved) return false;
    if (this.distance(attacker, target) > attacker.range) return false;
    if (attacker.range <= 1) {
      if (attacker.domain === 'land' && target.domain === 'sea') {
        return true;
      }
      return this.tileAllowsUnit(attacker, target.x, target.y) || this.tileAllowsUnit(attacker, attacker.x, attacker.y);
    }
    if (attacker.domain === 'sea' && (target.domain === 'land' || this.isBombardableTile(target.x, target.y))) {
      return hasNavalBombardLineOfSight(
        this.state.width,
        this.state.height,
        this.state.terrain,
        attacker.x,
        attacker.y,
        target.x,
        target.y,
      );
    }
    return this.hasLineOfSight(attacker.x, attacker.y, target.x, target.y);
  }

  private hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    if (!this.state) return false;
    const positions = this.state.units.filter(u => u.hp > 0).map(u => ({ x: u.x, y: u.y }));
    return hasTacticalLineOfSight(
      this.state.width,
      this.state.height,
      this.state.terrain,
      positions,
      ax,
      ay,
      bx,
      by,
    );
  }

  private getRoleTip(unit: TacticalUnit): string {
    switch (unit.role) {
      case 'Armor': return unit.domain === 'land' && this.state?.mode !== 'land'
        ? 'Coastal fire or charge inland after landing'
        : 'Charge: +1 dmg after moving';
      case 'Artillery': return 'Deploy first — no fire after moving';
      case 'Air': return 'Ignores terrain movement cost';
      case 'Naval': return unit.canBombard ? 'Bombard shore tiles (S/C) in range' : 'Fleet combat — stay on water';
      default: return 'Coastal fire: move to shore (S/B) to engage ships';
    }
  }

  private getFlankBonus(attacker: TacticalUnit, target: TacticalUnit): number {
    if (!this.state || attacker.side !== 'attacker') return 0;
    const adjacentFriends = this.state.units.filter(
      u => u.side === 'attacker' && u.hp > 0 && u.id !== attacker.id && this.distance(u, target) === 1,
    ).length;
    return adjacentFriends >= 2 ? 1 : 0;
  }

  private getAttackPreview(attacker: TacticalUnit, target: TacticalUnit): {
    attacker: TacticalUnit;
    target: TacticalUnit;
    damage: number;
    casualties: number;
    cover: number;
    flankBonus: number;
    chargeBonus: number;
  } {
    const cover = this.getTerrain(target.x, target.y).cover;
    const flankBonus = this.getFlankBonus(attacker, target);
    const chargeBonus = attacker.role === 'Armor' && attacker.moved && attacker.side === 'attacker' ? 1 : 0;
    const attackerType = this.resolveCombatUnitType(attacker);
    const targetType = this.resolveCombatUnitType(target);
    let attackPower = attacker.attack;
    if (attackerType && targetType?.domain === 'sea' && attackerType.domain === 'land') {
      attackPower = getLandAntiNavalAttack(attackerType, attackPower);
    }
    const damage = computeTacticalDamage(
      { attack: attackPower, count: attacker.count, hp: attacker.hp },
      target,
      cover,
      flankBonus,
      chargeBonus,
    );
    return {
      attacker,
      target,
      damage,
      casualties: Math.min(this.getLivingCount(target), Math.max(0, Math.floor((Math.min(target.hp, damage) + 2) / 3))),
      cover,
      flankBonus,
      chargeBonus,
    };
  }

  private getDeploymentPositions(
    side: TacticalSide,
    combatUnits: CombatUnit[],
    width: number,
    height: number,
    mode: TacticalBattleMode,
    terrain: TacticalTerrain[][],
  ): Array<{ x: number; y: number }> {
    if (mode === 'land') {
      return this.getLandDeploymentPositions(side, combatUnits.length, width, height);
    }

    const slots: Array<{ x: number; y: number }> = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 0; x < width; x++) {
        const tile = terrain[y]?.[x];
        if (!tile) continue;
        const onAttackerFlank = side === 'attacker' ? x <= Math.floor(width * 0.35) : x >= Math.floor(width * 0.55);
        if (!onAttackerFlank) continue;
        if (tile.kind === 'water' || tile.kind === 'shore' || tile.kind === 'land') {
          slots.push({ x, y });
        }
      }
    }

    return combatUnits.map((cu, index) => {
      const domain = cu.unitType.domain;
      const preferred = slots.filter(({ x, y }) => {
        const kind = terrain[y][x].kind ?? 'land';
        if (domain === 'sea') return kind === 'water';
        if (domain === 'land') return kind === 'land' || kind === 'shore' || kind === 'beach';
        return true;
      });
      const coastalPreferred = domain === 'land'
        ? preferred.filter(({ x, y }) => {
            const kind = terrain[y][x].kind ?? 'land';
            return kind === 'shore' || kind === 'beach';
          })
        : [];
      const pool = coastalPreferred.length > 0 ? coastalPreferred : preferred.length > 0 ? preferred : slots;
      return pool[index % pool.length] ?? pool[0] ?? { x: side === 'attacker' ? 1 : width - 2, y: 1 + index };
    });
  }

  private getLandDeploymentPositions(
    side: TacticalSide,
    count: number,
    width: number,
    height: number,
  ): Array<{ x: number; y: number }> {
    const primaryColumns = side === 'attacker' ? [1, 2] : [width - 2, width - 3];
    const reserveColumns = side === 'attacker' ? [0, 3] : [width - 1, width - 4];
    const columns = [...primaryColumns, ...reserveColumns].filter((x, index, all) => x >= 0 && x < width && all.indexOf(x) === index);
    const startY = count <= 2 ? Math.max(1, Math.floor(height / 2) - 1) : 1;
    const rows = Array.from({ length: Math.max(1, height - 1) }, (_, index) => Math.min(height - 1, startY + index))
      .filter((y, index, all) => y >= 0 && y < height && all.indexOf(y) === index);
    for (let y = startY - 1; y >= 0; y--) rows.push(y);

    const positions: Array<{ x: number; y: number }> = [];
    for (const y of rows) {
      for (const x of columns) {
        positions.push({ x, y });
        if (positions.length >= count) return positions;
      }
    }
    return positions;
  }

  private getLivingCount(unit: TacticalUnit): number {
    if (unit.hp <= 0) return 0;
    return Math.max(1, Math.min(unit.count, Math.ceil(unit.hp / 3)));
  }

  private getCasualties(unit: TacticalUnit): number {
    return Math.max(0, Math.min(unit.count, unit.count - this.getLivingCount(unit)));
  }

  private getSideTotals(side: TacticalSide): { alive: number; total: number } {
    const units = this.state?.units.filter(unit => unit.side === side) ?? [];
    return {
      alive: units.reduce((sum, unit) => sum + this.getLivingCount(unit), 0),
      total: units.reduce((sum, unit) => sum + unit.count, 0),
    };
  }

  private renderRoster(side: TacticalSide): string {
    const units = this.state?.units.filter(unit => unit.side === side) ?? [];
    return units.map((unit, index) => {
      const living = this.getLivingCount(unit);
      const lost = this.getCasualties(unit);
      const selected = unit.id === this.state?.selectedId ? ' selected' : '';
      const dead = unit.hp <= 0 ? ' dead' : '';
      const hotkey = side === 'attacker' && index < 9 ? `<kbd>${index + 1}</kbd>` : '';
      return `
        <div class="tactical-roster-row${selected}${dead}" data-unit-id="${unit.id}" role="button" tabindex="0">
          ${hotkey}
          <strong>${this.escape(unit.name)}</strong>
          <span>${this.roleTag(unit)} · R${unit.range}</span>
          <em>${living}/${unit.count}</em>
          ${lost > 0 ? `<small>−${lost}</small>` : `<small>${unit.moved ? 'M' : '·'}${unit.attacked ? 'F' : '·'}</small>`}
        </div>
      `;
    }).join('');
  }

  private nearestEnemy(unit: TacticalUnit): TacticalUnit | undefined {
    return this.state?.units
      .filter(candidate => candidate.side !== unit.side && candidate.hp > 0)
      .sort((a, b) => this.distance(unit, a) - this.distance(unit, b))[0];
  }

  private findBombardTile(unit: TacticalUnit): { x: number; y: number } | null {
    if (!this.state || !unit.canBombard) return null;
    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        if (this.canBombardTile(unit, x, y)) return { x, y };
      }
    }
    return null;
  }

  private bestStepToward(unit: TacticalUnit, target: TacticalUnit): { x: number; y: number } | null {
    const candidates = [
      { x: unit.x + 1, y: unit.y },
      { x: unit.x - 1, y: unit.y },
      { x: unit.x, y: unit.y + 1 },
      { x: unit.x, y: unit.y - 1 },
    ].filter(point => point.x >= 0 && point.y >= 0 && this.state && point.x < this.state.width && point.y < this.state.height
      && !this.getUnitAt(point.x, point.y) && this.tileAllowsUnit(unit, point.x, point.y));
    const wantsShore = unit.domain === 'land' && target.domain === 'sea';
    return candidates.sort((a, b) => {
      const shoreA = wantsShore && this.isCoastalFiringPosition(a.x, a.y) ? -0.75 : 0;
      const shoreB = wantsShore && this.isCoastalFiringPosition(b.x, b.y) ? -0.75 : 0;
      const da = this.distance(a, target) + this.getTerrain(a.x, a.y).moveCost * 0.1 + shoreA;
      const db = this.distance(b, target) + this.getTerrain(b.x, b.y).moveCost * 0.1 + shoreB;
      return da - db;
    })[0] ?? null;
  }

  private getTerrain(x: number, y: number): TacticalTerrain {
    return this.state?.terrain[y]?.[x] ?? {
      name: 'Field',
      cover: 0,
      moveCost: 1,
      color: '#64774a',
      note: 'Open ground.',
    };
  }

  private getRole(cu: CombatUnit): TacticalRole {
    if (cu.unitType.domain === 'air') return 'Air';
    if (cu.unitType.domain === 'sea') return 'Naval';
    if (cu.unitType.id.includes('artillery')) return 'Artillery';
    if (cu.unitType.id.includes('tank') || cu.unitType.id.includes('armor')) return 'Armor';
    return 'Infantry';
  }

  private roleTag(unit: TacticalUnit): string {
    return ({ Infantry: 'INF', Armor: 'ARM', Artillery: 'ART', Air: 'AIR', Naval: 'NAV' } as Record<TacticalRole, string>)[unit.role];
  }

  private renderResultPanel(attackerWon: boolean): void {
    if (!this.state || !this.activeCombat) return;
    const existing = document.getElementById('tactical-result-panel');
    existing?.remove();
    const attackers = this.getSideTotals('attacker');
    const defenders = this.getSideTotals('defender');
    const panel = document.createElement('div');
    panel.id = 'tactical-result-panel';
    panel.className = 'tactical-result-panel';
    panel.innerHTML = `
      <div class="tactical-result-card">
        <span>Tactical Result</span>
        <h3>${attackerWon ? 'Territory Secured' : 'Assault Repelled'}</h3>
        <p>${this.escape(this.territoryName)} ${attackerWon
    ? (this.state.captureProgress >= 100 ? 'falls after your forces seize the town.' : 'falls after the assault.')
    : 'holds — the defense survives.'}</p>
        <div class="tactical-result-grid">
          <div><small>Attackers surviving</small><strong>${attackers.alive}/${attackers.total}</strong></div>
          <div><small>Defenders surviving</small><strong>${defenders.alive}/${defenders.total}</strong></div>
        </div>
        ${attackerWon && this.pendingOutcomeMeta?.cleanWin ? '<p class="tactical-result-bonus">Clean victory — fewer casualties and a morale boost on the strategic map.</p>' : ''}
        <button id="btn-tactical-continue" class="primary tactical-continue-btn">Continue</button>
      </div>
    `;
    document.querySelector('.tactical-battle-content')?.appendChild(panel);
    panel.querySelector('#btn-tactical-continue')?.addEventListener('click', () => {
      if (!this.activeCombat || !this.finishCallback) return;
      const combat = this.activeCombat;
      const meta = this.pendingOutcomeMeta ?? undefined;
      const finish = this.finishCallback;
      this.close();
      this.activeCombat = null;
      this.finishCallback = null;
      this.pendingOutcomeMeta = null;
      finish(combat, meta);
    });
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private pushLog(entry: string): void {
    if (!this.state) return;
    this.state.log.unshift(entry);
    this.state.log = this.state.log.slice(0, 10);
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch] ?? ch));
  }
}
