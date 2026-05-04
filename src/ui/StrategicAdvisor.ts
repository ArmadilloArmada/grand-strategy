export interface StrategicAdvisorCoach {
  headline: string;
  detail: string;
  primaryLabel: string;
  primaryAction: string;
  territoryId?: string;
  secondaryLabel?: string;
  secondaryAction?: string;
}

export interface StrategicAdvisorData {
  visible: boolean;
  objectiveLine?: string;
  threatLine?: string;
  opportunityLine?: string;
  economyLine?: string;
  coach?: StrategicAdvisorCoach;
  mobilizationAdvice?: string;
}

export class StrategicAdvisor {
  constructor(private onAction: (action: string, territoryId?: string) => void) {}

  update(data: StrategicAdvisorData): void {
    const panel = this.getPanel();
    if (!data.visible || !data.coach) {
      panel.classList.add('hidden');
      return;
    }

    const coach = data.coach;
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div class="strategic-advisor-header">
        <span>Strategic Intent</span>
        <button id="btn-advisor-collapse" title="Collapse advisor">-</button>
      </div>
      <div class="strategic-advisor-body">
        <div class="advisor-row"><span>Objective</span><strong>${this.escape(data.objectiveLine ?? '')}</strong></div>
        <div class="advisor-row"><span>Danger</span><strong>${this.escape(data.threatLine ?? '')}</strong></div>
        <div class="advisor-row"><span>Opportunity</span><strong>${this.escape(data.opportunityLine ?? '')}</strong></div>
        <div class="advisor-row"><span>Economy</span><strong>${this.escape(data.economyLine ?? '')}</strong></div>
        <div class="advisor-next-action">
          <span>Next</span>
          <strong>${this.escape(coach.headline)}</strong>
          <small>${this.escape(coach.detail)}</small>
          <div class="advisor-actions">
            ${this.renderActionButton(coach.primaryAction, coach.primaryLabel, coach.territoryId)}
            ${coach.secondaryAction && coach.secondaryLabel ? this.renderActionButton(coach.secondaryAction, coach.secondaryLabel, coach.territoryId) : ''}
          </div>
        </div>
        <div class="advisor-advice">${this.escape(data.mobilizationAdvice ?? '')}</div>
      </div>
    `;

    panel.querySelector('#btn-advisor-collapse')?.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
    panel.querySelectorAll<HTMLButtonElement>('[data-advisor-action]').forEach(button => {
      button.addEventListener('click', () => {
        this.onAction(button.dataset.advisorAction ?? '', button.dataset.territoryId);
      });
    });
  }

  private getPanel(): HTMLElement {
    let panel = document.getElementById('strategic-advisor-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'strategic-advisor-panel';
      document.body.appendChild(panel);
    }
    return panel;
  }

  private renderActionButton(action: string, label: string, territoryId?: string): string {
    const territoryAttr = territoryId ? ` data-territory-id="${this.escape(territoryId)}"` : '';
    return `<button data-advisor-action="${this.escape(action)}"${territoryAttr}>${this.escape(label)}</button>`;
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
