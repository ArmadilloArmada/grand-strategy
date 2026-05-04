import type { Faction } from '../data/Faction';

export interface TurnRecapStats {
  factionId: string;
  battles: number;
  captures: number;
  mobilizations: number;
  unitsMobilized: number;
  income: number;
  unitsLost: number;
  enemyUnitsDestroyed: number;
}

export interface PhaseRecapData {
  phaseName: string;
  battles: number;
  captures: number;
  unitsLostThisGame: number;
}

export interface TurnRecapData {
  faction: Faction;
  turnNumber: number;
  recap: TurnRecapStats;
  nextDangerName?: string;
  nextObjectiveTitle?: string;
}

export class TurnRecapPanel {
  showPhase(data: PhaseRecapData): void {
    document.getElementById('phase-recap-card')?.remove();

    const rows: string[] = [];
    if (data.battles > 0) {
      rows.push(this.renderRow('Battles fought', data.battles.toString()));
    }
    if (data.captures > 0) {
      rows.push(this.renderRow('Territories captured', data.captures.toString()));
    }
    if (data.unitsLostThisGame > 0) {
      rows.push(this.renderRow('Units lost this game', data.unitsLostThisGame.toString()));
    }

    const card = document.createElement('div');
    card.id = 'phase-recap-card';
    card.className = 'phase-recap-card';
    card.innerHTML = `
      <div class="recap-header">${this.escape(data.phaseName)} - Complete</div>
      ${rows.join('')}
      <div class="recap-dismiss">Click to dismiss</div>`;

    card.addEventListener('click', () => card.remove());
    document.body.appendChild(card);
    setTimeout(() => card.remove(), 5000);
  }

  showTurn(data: TurnRecapData): void {
    document.getElementById('turn-recap-card')?.remove();

    const recap = data.recap;
    const netExchange = recap.enemyUnitsDestroyed - recap.unitsLost;
    const rows = [
      this.renderRow('Battles fought', recap.battles.toString()),
      this.renderRow('Territories captured', recap.captures.toString()),
      this.renderRow('Mobilized territories', recap.mobilizations.toString()),
      this.renderRow('Units mobilized', recap.unitsMobilized.toString()),
      this.renderRow('Income collected', `+${recap.income} IPC`),
      this.renderRow('Combat exchange', `${netExchange >= 0 ? '+' : ''}${netExchange}`),
      data.nextDangerName ? this.renderRow('Next danger', data.nextDangerName, true) : '',
      data.nextObjectiveTitle ? this.renderRow('Next objective', data.nextObjectiveTitle, true) : '',
    ];

    const factionColor = data.faction.colorLight || data.faction.color;
    const card = document.createElement('div');
    card.id = 'turn-recap-card';
    card.className = 'turn-recap-card';
    card.innerHTML = `
      <div class="recap-header">
        <span>Turn ${data.turnNumber} Recap</span>
        <button class="recap-close" title="Dismiss">x</button>
      </div>
      <div class="turn-recap-faction" style="color:${this.escape(factionColor)};">${this.escape(data.faction.name)}</div>
      ${rows.filter(Boolean).join('')}
      <div class="recap-dismiss">Click to dismiss</div>`;

    card.querySelector('.recap-close')?.addEventListener('click', (event) => {
      event.stopPropagation();
      card.remove();
    });
    card.addEventListener('click', () => card.remove());
    document.body.appendChild(card);
    setTimeout(() => card.remove(), 9000);
  }

  private renderRow(label: string, value: string, emphasized = false): string {
    const className = emphasized ? 'recap-row recap-next' : 'recap-row';
    return `<div class="${className}"><span>${this.escape(label)}</span><span class="recap-val">${this.escape(value)}</span></div>`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
