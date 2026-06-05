import type { CombatState, CombatUnit } from '../engine/CombatResolver';

type TacticalSide = 'attacker' | 'defender';
type TacticalPhase = 'player' | 'enemy' | 'victory' | 'defeat';
type TacticalRole = 'Infantry' | 'Armor' | 'Artillery' | 'Air' | 'Naval';

interface TacticalTerrain {
  name: string;
  cover: number;
  moveCost: number;
  color: string;
  note: string;
}

interface TacticalUnit {
  id: string;
  side: TacticalSide;
  sourceIndex: number;
  name: string;
  role: TacticalRole;
  count: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  range: number;
  move: number;
  acted: boolean;
}

interface TacticalState {
  width: number;
  height: number;
  phase: TacticalPhase;
  turn: number;
  selectedId: string | null;
  units: TacticalUnit[];
  log: string[];
}

export class TacticalBattleUI {
  private state: TacticalState | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private metrics = { tile: 48, offsetX: 0, offsetY: 0 };
  private finishCallback: ((combat: CombatState) => void) | null = null;
  private autoCallback: (() => void) | null = null;
  private activeCombat: CombatState | null = null;
  private territoryName = '';
  private hoveredTile: { x: number; y: number } | null = null;
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
    }
  };

  show(combat: CombatState, territoryName: string, finish: (combat: CombatState) => void, autoBattle: () => void): void {
    this.close();
    this.activeCombat = combat;
    this.finishCallback = finish;
    this.autoCallback = autoBattle;
    this.territoryName = territoryName;
    this.state = this.createState(combat, territoryName);

    const modal = document.createElement('div');
    modal.id = 'tactical-battle-modal';
    modal.className = 'modal tactical-battle-modal';
    modal.innerHTML = `
      <div class="modal-content tactical-battle-content">
        <div class="tactical-header">
          <div>
            <div class="tactical-kicker">Tactical Battle</div>
            <h2>${this.escape(territoryName)}</h2>
          </div>
          <button id="btn-tactical-close" title="Auto battle instead">&times;</button>
        </div>
        <div class="tactical-layout">
          <canvas id="tactical-battle-canvas" class="tactical-canvas"></canvas>
          <aside class="tactical-panel">
            <div class="tactical-actions">
              <button id="btn-tactical-end-turn" class="primary">End Tactical Turn</button>
              <button id="btn-tactical-auto">Auto Battle Instead</button>
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
    modal.querySelector('#btn-tactical-end-turn')?.addEventListener('click', () => this.endTurn());
    modal.querySelector('#btn-tactical-auto')?.addEventListener('click', () => this.autoBattleInstead());
    modal.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('keydown', this.onModalKeyDown, true);

    this.render();
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
    this.canvas?.removeEventListener('click', this.onCanvasClick);
    this.canvas?.removeEventListener('mousemove', this.onCanvasMove);
    document.removeEventListener('keydown', this.onModalKeyDown, true);
    document.getElementById('tactical-battle-modal')?.remove();
    this.canvas = null;
    this.state = null;
    this.hoveredTile = null;
  }

  private createState(combat: CombatState, territoryName: string): TacticalState {
    const units: TacticalUnit[] = [];
    const width = Math.max(8, Math.min(10, 8 + Math.floor(Math.max(combat.attackers.length, combat.defenders.length) / 5)));
    const height = Math.max(6, Math.min(9, Math.ceil(Math.max(combat.attackers.length, combat.defenders.length) / 2) + 2));
    const attackerPositions = this.getDeploymentPositions('attacker', combat.attackers.length, width, height);
    const defenderPositions = this.getDeploymentPositions('defender', combat.defenders.length, width, height);
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
      phase: 'player',
      turn: 1,
      selectedId: units.find(unit => unit.side === 'attacker')?.id ?? null,
      units,
      log: [`Battle for ${territoryName}. Destroy defenders or survive their response.`],
    };
  }

  private makeTacticalUnit(cu: CombatUnit, side: TacticalSide, index: number, x: number, y: number): TacticalUnit {
    const isFast = cu.unitType.id.includes('tank') || cu.unitType.id.includes('armor') || cu.unitType.domain === 'air';
    const isRanged = cu.unitType.id.includes('artillery') || cu.unitType.domain === 'air' || cu.unitType.domain === 'sea';
    const role = this.getRole(cu);
    return {
      id: `${side}-${index}-${cu.unitType.id}`,
      side,
      sourceIndex: index,
      name: cu.unitType.name,
      role,
      count: cu.count,
      x,
      y,
      hp: Math.max(2, cu.count * 3),
      maxHp: Math.max(2, cu.count * 3),
      attack: Math.max(1, side === 'attacker' ? cu.unitType.attack : cu.unitType.defense),
      range: isRanged ? 3 : 1,
      move: isFast ? 3 : 2,
      acted: false,
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
    if (!selected || selected.acted) return;

    if (clickedUnit?.side === 'defender') {
      if (this.distance(selected, clickedUnit) <= selected.range) {
        this.attack(selected, clickedUnit);
      } else {
        this.pushLog(`${clickedUnit.name} is outside weapon range.`);
      }
      this.evaluate();
      this.render();
      return;
    }

    if (this.canMoveTo(selected, point.x, point.y)) {
      selected.x = point.x;
      selected.y = point.y;
      selected.acted = true;
      this.pushLog(`${selected.name} advanced.`);
      this.evaluate();
      this.render();
    }
  };

  private onCanvasMove = (event: MouseEvent): void => {
    if (!this.canvas) return;
    const point = this.screenToGrid(event);
    const previous = this.hoveredTile;
    this.hoveredTile = point;
    this.canvas.style.cursor = point ? 'pointer' : 'default';
    if (previous?.x !== point?.x || previous?.y !== point?.y) this.render();
  };

  private endTurn(): void {
    if (!this.state || this.state.phase !== 'player') return;
    this.state.phase = 'enemy';
    this.pushLog('Enemy command is responding.');

    for (const enemy of this.state.units.filter(unit => unit.side === 'defender' && unit.hp > 0)) {
      const target = this.nearestEnemy(enemy);
      if (!target) continue;
      if (this.distance(enemy, target) <= enemy.range) {
        this.attack(enemy, target);
      } else {
        const move = this.bestStepToward(enemy, target);
        if (move) {
          enemy.x = move.x;
          enemy.y = move.y;
          this.pushLog(`${enemy.name} repositions.`);
        }
        const nextTarget = this.nearestEnemy(enemy);
        if (nextTarget && this.distance(enemy, nextTarget) <= enemy.range) {
          this.attack(enemy, nextTarget);
        }
      }
    }

    this.state.turn += 1;
    this.state.phase = 'player';
    this.state.units.forEach(unit => { if (unit.hp > 0) unit.acted = false; });
    this.state.selectedId = this.state.units.find(unit => unit.side === 'attacker' && unit.hp > 0)?.id ?? null;
    this.pushLog(`Turn ${this.state.turn}. Orders are yours.`);
    this.evaluate();
    this.render();
  }

  private attack(attacker: TacticalUnit, target: TacticalUnit): void {
    const preview = this.getAttackPreview(attacker, target);
    const damage = preview.damage;
    target.hp = Math.max(0, target.hp - damage);
    attacker.acted = true;
    this.pushLog(target.hp <= 0
      ? `${attacker.name} x${attacker.count} destroyed ${target.name} x${target.count}.`
      : `${attacker.name} x${this.getLivingCount(attacker)} hit ${target.name} x${this.getLivingCount(target)} for ${damage} after ${preview.cover} cover.`);
  }

  private evaluate(): void {
    if (!this.state || !this.activeCombat) return;
    const attackersAlive = this.state.units.some(unit => unit.side === 'attacker' && unit.hp > 0);
    const defendersAlive = this.state.units.some(unit => unit.side === 'defender' && unit.hp > 0);
    if (attackersAlive && defendersAlive) return;

    this.state.phase = attackersAlive ? 'victory' : 'defeat';
    this.applyOutcomeToCombat(this.activeCombat, this.state.phase === 'victory');
    this.render();
    this.renderResultPanel(this.state.phase === 'victory');
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
    bg.addColorStop(0, '#101827');
    bg.addColorStop(1, '#151b16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const px = this.metrics.offsetX + x * this.metrics.tile;
        const py = this.metrics.offsetY + y * this.metrics.tile;
        const terrain = this.getTerrain(x, y);
        ctx.fillStyle = terrain.color;
        ctx.fillRect(px, py, this.metrics.tile, this.metrics.tile);
        ctx.strokeStyle = 'rgba(9,12,20,0.48)';
        ctx.strokeRect(px + 0.5, py + 0.5, this.metrics.tile, this.metrics.tile);
        ctx.fillStyle = 'rgba(232,216,168,0.54)';
        ctx.font = `bold ${Math.max(8, this.metrics.tile * 0.16)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(terrain.name.slice(0, 1), px + 5, py + 4);
      }
    }

    const selected = this.getSelected();
    if (selected && this.state.phase === 'player') {
      for (let y = 0; y < this.state.height; y++) {
        for (let x = 0; x < this.state.width; x++) {
          if (this.canMoveTo(selected, x, y)) this.fillTile(ctx, x, y, 'rgba(200,144,48,0.24)');
          if (!this.getUnitAt(x, y) && this.distance(selected, { x, y }) <= selected.range) this.fillTile(ctx, x, y, 'rgba(96,165,250,0.11)');
        }
      }
      this.state.units
        .filter(unit => unit.side === 'defender' && unit.hp > 0 && this.distance(selected, unit) <= selected.range)
        .forEach(unit => this.fillTile(ctx, unit.x, unit.y, 'rgba(220,60,60,0.30)'));
    }

    if (this.hoveredTile) this.fillTile(ctx, this.hoveredTile.x, this.hoveredTile.y, 'rgba(240,224,168,0.16)');
    this.state.units.filter(unit => unit.hp > 0).forEach(unit => this.drawUnit(ctx, unit));
    this.renderHud();
  }

  private renderHud(): void {
    if (!this.state) return;
    const status = document.getElementById('tactical-status');
    const log = document.getElementById('tactical-log');
    const selected = this.getSelected();
    const hoveredUnit = this.hoveredTile ? this.getUnitAt(this.hoveredTile.x, this.hoveredTile.y) : undefined;
    const hoveredTerrain = this.hoveredTile ? this.getTerrain(this.hoveredTile.x, this.hoveredTile.y) : null;
    const preview = selected && hoveredUnit && hoveredUnit.side !== selected.side && this.distance(selected, hoveredUnit) <= selected.range
      ? this.getAttackPreview(selected, hoveredUnit)
      : null;
    const attackerTotals = this.getSideTotals('attacker');
    const defenderTotals = this.getSideTotals('defender');
    if (status) {
      status.innerHTML = `
        <div><span>Phase</span><strong>${this.state.phase === 'player' ? 'Your Orders' : this.state.phase}</strong></div>
        <div><span>Turn</span><strong>${this.state.turn}</strong></div>
        <div><span>Attackers</span><strong>${attackerTotals.alive}/${attackerTotals.total} units</strong></div>
        <div><span>Defenders</span><strong>${defenderTotals.alive}/${defenderTotals.total} units</strong></div>
        <div><span>Selected</span><strong>${selected ? `${this.roleTag(selected)} ${this.escape(selected.name)} x${this.getLivingCount(selected)}` : 'None'}</strong></div>
        ${selected ? `<div><span>Stack HP</span><strong>${selected.hp}/${selected.maxHp}</strong></div>` : ''}
        <div class="tactical-preview">
          <span>Hovered Tile</span>
          <strong>${hoveredTerrain ? `${hoveredTerrain.name} - Cover ${hoveredTerrain.cover}` : 'Move over the map'}</strong>
          ${hoveredTerrain ? `<small>${hoveredTerrain.note}</small>` : ''}
        </div>
        <div class="tactical-preview tactical-preview--attack">
          <span>Attack Preview</span>
          <strong>${preview ? `${preview.damage} damage - ${preview.casualties} likely loss${preview.casualties === 1 ? '' : 'es'}` : 'Hover an enemy in range'}</strong>
          ${preview ? `<small>${this.escape(preview.attacker.name)} vs ${this.escape(preview.target.name)} - cover reduces ${preview.cover}</small>` : ''}
        </div>
        <div class="tactical-roster tactical-roster--attackers">
          <span>Attacking stacks</span>
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
    }
  }

  private drawUnit(ctx: CanvasRenderingContext2D, unit: TacticalUnit): void {
    const size = this.metrics.tile;
    const cx = this.metrics.offsetX + unit.x * size + size * 0.5;
    const cy = this.metrics.offsetY + unit.y * size + size * 0.5;
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
    const tag = this.roleTag(unit);
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
    ctx.fillText(tag, cx, cy + size * 0.44);
    if (unit.acted) {
      ctx.fillStyle = 'rgba(0,0,0,0.40)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
      ctx.fill();
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

  private canMoveTo(unit: TacticalUnit, x: number, y: number): boolean {
    if (!this.state || unit.acted) return false;
    if (this.getUnitAt(x, y)) return false;
    return this.distance(unit, { x, y }) + Math.max(0, this.getTerrain(x, y).moveCost - 1) <= unit.move;
  }

  private getAttackPreview(attacker: TacticalUnit, target: TacticalUnit): { attacker: TacticalUnit; target: TacticalUnit; damage: number; casualties: number; cover: number } {
    const cover = this.getTerrain(target.x, target.y).cover;
    const baseDamage = Math.ceil(attacker.attack * this.getLivingCount(attacker) * 0.65);
    const damage = Math.max(1, baseDamage - cover);
    return {
      attacker,
      target,
      damage,
      casualties: Math.min(this.getLivingCount(target), Math.max(0, Math.floor((Math.min(target.hp, damage) + 2) / 3))),
      cover,
    };
  }

  private getDeploymentPositions(side: TacticalSide, count: number, width: number, height: number): Array<{ x: number; y: number }> {
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
    return units.map(unit => {
      const living = this.getLivingCount(unit);
      const lost = this.getCasualties(unit);
      const selected = unit.id === this.state?.selectedId ? ' selected' : '';
      return `
        <div class="tactical-roster-row${selected}">
          <strong>${this.escape(unit.name)}</strong>
          <span>${this.roleTag(unit)} ${unit.role}</span>
          <em>${living}/${unit.count}</em>
          ${lost > 0 ? `<small>-${lost}</small>` : '<small>ready</small>'}
        </div>
      `;
    }).join('');
  }

  private nearestEnemy(unit: TacticalUnit): TacticalUnit | undefined {
    return this.state?.units
      .filter(candidate => candidate.side !== unit.side && candidate.hp > 0)
      .sort((a, b) => this.distance(unit, a) - this.distance(unit, b))[0];
  }

  private bestStepToward(unit: TacticalUnit, target: TacticalUnit): { x: number; y: number } | null {
    const candidates = [
      { x: unit.x + 1, y: unit.y },
      { x: unit.x - 1, y: unit.y },
      { x: unit.x, y: unit.y + 1 },
      { x: unit.x, y: unit.y - 1 },
    ].filter(point => point.x >= 0 && point.y >= 0 && this.state && point.x < this.state.width && point.y < this.state.height && !this.getUnitAt(point.x, point.y));
    return candidates.sort((a, b) => this.distance(a, target) - this.distance(b, target))[0] ?? null;
  }

  private getTerrain(x: number, y: number): TacticalTerrain {
    if ((x === 3 && y === 2) || (x === 4 && y === 3)) {
      return { name: 'Ridge', cover: 2, moveCost: 2, color: '#56616a', note: 'Strong cover, slower to enter.' };
    }
    if (y === 4 && x >= 1 && x <= 6) {
      return { name: 'Road', cover: 0, moveCost: 1, color: '#756b49', note: 'Open ground for faster advances.' };
    }
    if ((x === 2 && y === 1) || (x === 5 && y === 4)) {
      return { name: 'Woods', cover: 1, moveCost: 2, color: '#345f42', note: 'Light cover, costs extra movement.' };
    }
    return { name: 'Field', cover: 0, moveCost: 1, color: '#64774a', note: 'No cover or movement penalty.' };
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
        <p>${this.escape(this.territoryName)} ${attackerWon ? 'falls after the tactical engagement.' : 'holds after the defenders stop the assault.'}</p>
        <div class="tactical-result-grid">
          <div><small>Attackers</small><strong>${attackers.alive}/${attackers.total}</strong></div>
          <div><small>Defenders</small><strong>${defenders.alive}/${defenders.total}</strong></div>
        </div>
        <button id="btn-tactical-continue" class="primary">Continue Campaign</button>
      </div>
    `;
    document.getElementById('tactical-battle-modal')?.appendChild(panel);
    panel.querySelector('#btn-tactical-continue')?.addEventListener('click', () => {
      if (!this.activeCombat || !this.finishCallback) return;
      const combat = this.activeCombat;
      const finish = this.finishCallback;
      this.close();
      this.activeCombat = null;
      this.finishCallback = null;
      finish(combat);
    });
  }

  private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private pushLog(entry: string): void {
    if (!this.state) return;
    this.state.log.unshift(entry);
    this.state.log = this.state.log.slice(0, 8);
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch] ?? ch));
  }
}
