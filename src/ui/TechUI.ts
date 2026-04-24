/**
 * TechUI - Technology research modal
 */

import { GameState } from '../engine/GameState';
import { TechnologyManager, TECHNOLOGIES } from '../engine/TechnologyManager';
import { statisticsManager } from '../engine/StatisticsManager';
import { soundManager } from '../audio/SoundManager';
import { GameAction } from '../network/NetworkManager';

export interface TechCallbacks {
  showToast(msg: string, type: 'success' | 'info' | 'error'): void;
  sendAction(action: GameAction): void;
  updateTurnInfo(): void;
}

export class TechUI {
  private treeMode = false;

  constructor(
    private state: GameState,
    private technologyManager: TechnologyManager,
    private callbacks: TechCallbacks
  ) {}

  show(): void {
    const modal = document.getElementById('tech-modal');
    if (modal) modal.classList.remove('hidden');
    this.treeMode = false;
    this.update('all');
    this.setupCategoryButtons();
    this.setupTreeToggle();
  }

  close(): void {
    const modal = document.getElementById('tech-modal');
    if (modal) modal.classList.add('hidden');
  }

  private setupTreeToggle(): void {
    const btn = document.getElementById('btn-tech-tree-toggle');
    if (!btn) return;
    btn.onclick = () => {
      this.treeMode = !this.treeMode;
      btn.textContent = this.treeMode ? '📋 List View' : '🌳 Tree View';
      document.getElementById('tech-list')!.classList.toggle('hidden', this.treeMode);
      document.getElementById('tech-categories')!.classList.toggle('hidden', this.treeMode);
      const treeContainer = document.getElementById('tech-tree-container')!;
      treeContainer.classList.toggle('hidden', !this.treeMode);
      if (this.treeMode) this.renderTree();
    };
  }

  private setupCategoryButtons(): void {
    document.querySelectorAll('.tech-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tech-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.getAttribute('data-cat') || 'all';
        this.update(cat);
      });
    });
  }

  /**
   * Render a dependency-tree SVG grouped by category column.
   */
  private renderTree(): void {
    const svg = document.getElementById('tech-tree-svg') as SVGSVGElement | null;
    if (!svg) return;

    const faction = this.state.getCurrentFaction();
    const researchedSet = faction ? this.technologyManager.getResearched(faction.id) : new Set<string>();

    const CATEGORIES = ['infantry', 'armor', 'air', 'naval', 'economy', 'special'] as const;
    const CAT_LABELS: Record<string, string> = {
      infantry: '🎖️ Infantry', armor: '🛡️ Armor', air: '✈️ Air',
      naval: '🚢 Naval', economy: '💰 Economy', special: '⭐ Special',
    };
    const NODE_W = 130, NODE_H = 52, COL_W = 160, ROW_H = 72;
    const PAD_X = 20, PAD_Y = 50;

    // Group by category, topological sort within each
    const byCategory: Record<string, typeof TECHNOLOGIES> = {};
    for (const cat of CATEGORIES) byCategory[cat] = [];
    for (const t of TECHNOLOGIES) {
      if (byCategory[t.category]) byCategory[t.category].push(t);
    }

    // Assign (col, row) positions: prerequisites come before dependents
    const pos: Record<string, { x: number; y: number }> = {};
    CATEGORIES.forEach((cat, colIdx) => {
      const techs = byCategory[cat];
      // Simple topological order: no-prereq items first
      const ordered: typeof TECHNOLOGIES = [];
      const visited = new Set<string>();
      const visit = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        const t = techs.find(x => x.id === id)!;
        if (!t) return;
        (t.prerequisites ?? []).filter(p => techs.find(x => x.id === p)).forEach(visit);
        ordered.push(t);
      };
      techs.forEach(t => visit(t.id));
      ordered.forEach((t, rowIdx) => {
        pos[t.id] = { x: PAD_X + colIdx * COL_W, y: PAD_Y + rowIdx * ROW_H };
      });
    });

    const totalW = PAD_X * 2 + CATEGORIES.length * COL_W;
    const totalH = PAD_Y + Math.max(...Object.values(pos).map(p => p.y)) + NODE_H + 20;
    svg.setAttribute('width', String(totalW));
    svg.setAttribute('height', String(totalH));
    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

    let svgContent = '';

    // Category column headers
    CATEGORIES.forEach((cat, i) => {
      const cx = PAD_X + i * COL_W + NODE_W / 2;
      svgContent += `<text x="${cx}" y="18" text-anchor="middle" font-size="11" fill="#666" font-family="sans-serif">${CAT_LABELS[cat]}</text>`;
    });

    // Arrows (draw before nodes so nodes appear on top)
    for (const tech of TECHNOLOGIES) {
      for (const prereqId of (tech.prerequisites ?? [])) {
        const from = pos[prereqId];
        const to = pos[tech.id];
        if (!from || !to) continue;
        const x1 = from.x + NODE_W / 2;
        const y1 = from.y + NODE_H;
        const x2 = to.x + NODE_W / 2;
        const y2 = to.y;
        const mid = (y1 + y2) / 2;
        svgContent += `<path d="M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}"
          stroke="#aaa" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>`;
      }
    }

    // Arrow marker definition
    svgContent = `<defs>
      <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="#aaa"/>
      </marker>
    </defs>` + svgContent;

    // Tech nodes
    for (const tech of TECHNOLOGIES) {
      const p = pos[tech.id];
      if (!p) continue;
      const researched = researchedSet.has(tech.id);
      const hasPrereqs = !tech.prerequisites || tech.prerequisites.every(pr => researchedSet.has(pr));
      const available = !researched && hasPrereqs && faction && faction.ipcs >= tech.cost;
      const locked = !researched && !hasPrereqs;

      const fill = researched ? '#1a7a5c' : available ? '#2a4a8a' : locked ? '#555' : '#3a3a4a';
      const stroke = researched ? '#22c55e' : available ? '#60a5fa' : '#777';
      const textFill = researched || available ? '#fff' : '#aaa';

      svgContent += `
        <g class="tech-tree-node" data-tech="${tech.id}" style="cursor:${locked ? 'not-allowed' : 'pointer'}">
          <rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="6"
                fill="${fill}" stroke="${stroke}" stroke-width="${researched ? 2 : 1}"/>
          <text x="${p.x + 10}" y="${p.y + 20}" font-size="18" dominant-baseline="middle">${tech.icon}</text>
          <text x="${p.x + 34}" y="${p.y + 16}" font-size="10" fill="${textFill}" font-weight="bold"
                font-family="sans-serif">${tech.name.length > 15 ? tech.name.slice(0, 14) + '…' : tech.name}</text>
          <text x="${p.x + 34}" y="${p.y + 30}" font-size="9" fill="#aaa" font-family="sans-serif">
            ${researched ? '✓ Researched' : tech.cost + ' IPCs'}
          </text>
          ${researched ? `<text x="${p.x + NODE_W - 6}" y="${p.y + 14}" font-size="12" text-anchor="end">✓</text>` : ''}
        </g>
      `;
    }

    svg.innerHTML = svgContent;

    // Wire click to research
    svg.querySelectorAll('.tech-tree-node').forEach(node => {
      node.addEventListener('click', () => {
        const techId = (node as SVGElement).dataset.tech;
        if (techId) (this as any).research(techId);
      });
    });
  }

  update(category: string): void {
    const techListEl = document.getElementById('tech-list');
    const researchedListEl = document.getElementById('researched-list');
    const faction = this.state.getCurrentFaction();

    if (!techListEl || !faction) return;

    const available = this.technologyManager.getAvailableTech(faction.id);
    const researched = this.technologyManager.getResearchedTech(faction.id);

    const filtered = category === 'all' ? available : available.filter(t => t.category === category);

    let html = '';
    for (const tech of filtered) {
      const canAfford = faction.ipcs >= tech.cost;
      const hasPrereqs = !tech.prerequisites || tech.prerequisites.every(
        p => this.technologyManager.hasTech(faction.id, p)
      );
      const locked = !hasPrereqs;

      html += `
        <div class="tech-card ${locked ? 'locked' : ''}" data-tech="${tech.id}"
             title="${locked ? 'Requires: ' + (tech.prerequisites?.join(', ') || '') : ''}">
          <div class="tech-icon">${tech.icon}</div>
          <div class="tech-name">${tech.name}</div>
          <div class="tech-cost">${canAfford ? '' : '⚠️'} ${tech.cost} IPCs</div>
          <div class="tech-desc">${tech.description}</div>
        </div>
      `;
    }

    if (filtered.length === 0) {
      html = '<p style="text-align: center; color: #888; grid-column: 1/-1;">No technologies available in this category</p>';
    }

    techListEl.innerHTML = html;

    techListEl.querySelectorAll('.tech-card:not(.locked)').forEach(el => {
      el.addEventListener('click', () => {
        const techId = el.getAttribute('data-tech');
        if (techId) this.research(techId);
      });
    });

    if (researchedListEl) {
      if (researched.length === 0) {
        researchedListEl.innerHTML = '<span style="color: #888;">No technologies researched yet</span>';
      } else {
        researchedListEl.innerHTML = researched.map(t =>
          `<span class="researched-badge">${t.icon} ${t.name}</span>`
        ).join('');
      }
    }
  }

  private research(techId: string): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const tech = TECHNOLOGIES.find(t => t.id === techId);
    if (!tech) return;

    if (faction.ipcs < tech.cost) {
      this.callbacks.showToast(`Not enough IPCs! Need ${tech.cost}`, 'info');
      return;
    }

    const success = this.technologyManager.startResearch(faction.id, techId);
    if (success) {
      faction.ipcs -= tech.cost;
      this.technologyManager.advanceResearch(faction.id, tech.cost);
      this.state.emit('tech_researched', { factionId: faction.id, techId });
      this.callbacks.showToast(`Researched ${tech.name}!`, 'success');
      soundManager.play('build');
      statisticsManager.trackTechResearched(faction.id);
      statisticsManager.trackSpending(faction.id, tech.cost);
      this.update('all');
      this.callbacks.updateTurnInfo();
      this.callbacks.sendAction({ type: 'research_tech', factionId: faction.id, techId });
    }
  }
}
