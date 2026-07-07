export interface FirstWarRoomData {
  factionName: string;
  capitalName: string;
  threatName: string;
  pressureName: string;
  mobilizationAdvice: string;
  coachHeadline: string;
  coachDetail: string;
  recommendedTerritoryId?: string;
}

interface FirstWarRoomCallbacks {
  focusTerritory: (territoryId: string) => void;
  showObjectives: () => void;
  showThreatOverlay: () => void;
}

export class FirstWarRoom {
  private shown = false;

  constructor(private callbacks: FirstWarRoomCallbacks) {}

  show(data: FirstWarRoomData): void {
    if (this.shown) return;
    this.shown = true;
    const focusDisabled = data.recommendedTerritoryId ? '' : ' disabled title="No recommendation target available"';

    document.getElementById('first-war-room')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'first-war-room';
    overlay.innerHTML = `
      <div class="first-war-room-card">
        <div class="fwr-kicker">First War Room</div>
        <h2>${this.escape(data.factionName)}</h2>
        <p>Your opening job is simple: protect your capital, turn IPCs into board presence, and take one profitable fight instead of three messy ones. Each turn is one <strong>Command phase</strong>: mobilize, move, attack, then End Turn.</p>
        <div class="fwr-grid">
          <div><span>Anchor</span><strong>${this.escape(data.capitalName)}</strong></div>
          <div><span>Watch</span><strong>${this.escape(data.threatName)}</strong></div>
          <div><span>Pressure</span><strong>${this.escape(data.pressureName)}</strong></div>
        </div>
        <div class="fwr-plan">
          <strong>Suggested opening:</strong>
          <ol>
            <li>${this.escape(data.mobilizationAdvice)}</li>
            <li>Select a border territory with ready units. Mixed stacks? Use <strong>All Unit Types</strong> to see every move and attack target.</li>
            <li>Use the battle preview — check swing factors and favor favorable or overwhelming odds.</li>
            <li>On contested fights, try <strong>Play Tactical</strong> (or press T) to command units on a grid and reduce losses.</li>
          </ol>
        </div>
        <div class="fwr-next">
          <span>Recommended first click</span>
          <strong>${this.escape(data.coachHeadline)}</strong>
          <small>${this.escape(data.coachDetail)}</small>
        </div>
        <div class="fwr-actions">
          <button id="btn-fwr-focus"${focusDisabled}>Focus Recommendation</button>
          <button id="btn-fwr-objectives">Show Objectives</button>
          <button id="btn-fwr-threats">Threat Overlay</button>
          <button id="btn-fwr-close" class="primary">Start Command</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#btn-fwr-close')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('#btn-fwr-focus')?.addEventListener('click', () => {
      if (data.recommendedTerritoryId) {
        this.callbacks.focusTerritory(data.recommendedTerritoryId);
      }
      overlay.remove();
    });
    overlay.querySelector('#btn-fwr-objectives')?.addEventListener('click', () => {
      this.callbacks.showObjectives();
      overlay.remove();
    });
    overlay.querySelector('#btn-fwr-threats')?.addEventListener('click', () => {
      this.callbacks.showThreatOverlay();
      overlay.remove();
    });
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
