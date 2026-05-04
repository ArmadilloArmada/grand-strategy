/**
 * AIActivityFeed - tracks and renders the AI turn activity sidebar feed.
 * Extracted from HUD.ts to keep AI visualization logic cohesive.
 */

interface AIActivityEntry {
  id: number;
  factionName: string;
  factionColor: string;
  message: string;
  action?: string;
}

class AIActivityFeed {
  private entries: AIActivityEntry[] = [];
  private seq = 0;

  add(factionName: string, factionColor: string, message: string, action?: string): void {
    const cleanMessage = message.startsWith(factionName)
      ? message.slice(factionName.length).trim()
      : message;
    this.entries.unshift({ id: ++this.seq, factionName, factionColor, message: cleanMessage, action });
    this.entries = this.entries.slice(0, 8);
    this.render();
  }

  private render(): void {
    let feed = document.getElementById('ai-activity-feed');
    const inHQ = feed ? !!feed.closest('#hq-panel') : false;

    if (!feed) {
      // Narrow screen fallback: float from body
      feed = document.createElement('div');
      feed.id = 'ai-activity-feed';
      feed.className = 'ai-activity-feed';
      document.body.appendChild(feed);
    }

    if (this.entries.length === 0) {
      feed.innerHTML = '<div class="ai-feed-empty">No recent AI activity</div>';
      if (!inHQ) feed.classList.remove('visible');
      if (!inHQ) document.body.classList.remove('ai-feed-active');
      return;
    }

    feed.innerHTML = this.entries.map(e => `
      <div class="ai-feed-row" data-action="${this.escape(e.action ?? 'think')}">
        <span class="ai-feed-dot" style="background:${this.escape(e.factionColor)}"></span>
        <span class="ai-feed-copy">
          <strong>${this.escape(e.factionName)}</strong>
          ${this.escape(e.message)}
          <small>${this.escape(this.getActionLabel(e.action))}</small>
        </span>
      </div>
    `).join('');

    if (!inHQ) {
      feed.classList.add('visible');
      document.body.classList.add('ai-feed-active');
    }
  }

  hideBanner(): void {
    document.getElementById('ai-activity-banner')?.classList.remove('visible');
    const feed = document.getElementById('ai-activity-feed');
    if (feed && !feed.closest('#hq-panel')) {
      feed.classList.remove('visible');
      document.body.classList.remove('ai-feed-active');
    }
  }

  clear(): void {
    this.entries = [];
    const feed = document.getElementById('ai-activity-feed');
    if (feed) {
      feed.innerHTML = '<div class="ai-feed-empty">No recent AI activity</div>';
      if (!feed.closest('#hq-panel')) {
        feed.classList.remove('visible');
        document.body.classList.remove('ai-feed-active');
      }
    }
  }

  private escape(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private getActionLabel(action?: string): string {
    switch (action) {
      case 'attack': return 'planned attack';
      case 'capture': return 'battle result';
      case 'battle': return 'battle result';
      case 'mobilize': return 'mobilization';
      case 'phase': return 'phase';
      default: return 'thinking';
    }
  }
}

export const aiActivityFeed = new AIActivityFeed();
