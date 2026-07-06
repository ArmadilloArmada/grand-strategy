/**
 * ProductionUI - Build modal, mobilization, and deployment UI
 */

import { GameState } from '../engine/GameState';
import { MapRenderer } from '../renderer/MapRenderer';
import { ProductionManager } from '../engine/ProductionManager';
import { MobilizationSystem, MobilizationOption, SpawnedUnit } from '../engine/MobilizationSystem';
import { soundManager } from '../audio/SoundManager';
import { battleLog } from './BattleLog';
import { UNIT_ICONS } from './hudConstants';

type QuickBuildPlanId = 'balanced' | 'defend' | 'attack' | 'naval' | 'air';

interface QuickBuildPlan {
  id: QuickBuildPlanId;
  label: string;
  unitPriority: string[];
  fallbackDomains: Array<'land' | 'sea' | 'air'>;
  summary: string;
}

const QUICK_BUILD_PLANS: Record<QuickBuildPlanId, QuickBuildPlan> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    unitPriority: ['infantry', 'artillery', 'tank', 'fighter'],
    fallbackDomains: ['land', 'air'],
    summary: 'mixes cheap defenders, armor, and air cover',
  },
  defend: {
    id: 'defend',
    label: 'Defend',
    unitPriority: ['infantry', 'artillery', 'anti_air', 'fighter'],
    fallbackDomains: ['land', 'air'],
    summary: 'stacks efficient defense on threatened fronts',
  },
  attack: {
    id: 'attack',
    label: 'Attack',
    unitPriority: ['tank', 'artillery', 'fighter', 'bomber', 'infantry'],
    fallbackDomains: ['land', 'air'],
    summary: 'buys mobile power for next-turn attacks',
  },
  naval: {
    id: 'naval',
    label: 'Naval',
    unitPriority: ['destroyer', 'marines', 'submarine', 'carrier', 'battleship', 'fighter'],
    fallbackDomains: ['sea', 'air'],
    summary: 'builds sea control and expeditionary forces',
  },
  air: {
    id: 'air',
    label: 'Air',
    unitPriority: ['fighter', 'bomber', 'infantry'],
    fallbackDomains: ['air', 'land'],
    summary: 'prioritizes flexible strike and defense coverage',
  },
};

export interface ProductionCallbacks {
  showToast(msg: string, type: 'success' | 'info' | 'error'): void;
  updateMobilizationHighlights(): void;
  updateSelectionInfo(): void;
  onMobilized(territoryId: string, cost: number, units: SpawnedUnit[]): void;
}

export class ProductionUI {
  private selectedDeployZone: string | null = null;
  private fhActiveDomain: 'land' | 'sea' | 'air' = 'land';
  private activeQuickPlan: QuickBuildPlanId = 'balanced';

  constructor(
    private state: GameState,
    private renderer: MapRenderer,
    private productionManager: ProductionManager,
    private mobilizationSystem: MobilizationSystem,
    private callbacks: ProductionCallbacks
  ) {}

  private formatSpawnedUnitsDesc(
    mobilizedTerritoryId: string,
    units: SpawnedUnit[],
    withIcons = false,
  ): string {
    return units.map(u => {
      const icon = withIcons ? (UNIT_ICONS[u.unitTypeId] || '⬜') : '';
      const unit = this.state.unitRegistry.get(u.unitTypeId);
      const name = unit?.name || u.unitTypeId;
      const atSea = u.territoryId !== mobilizedTerritoryId;
      const zoneName = atSea
        ? this.state.territories.get(u.territoryId)?.name
        : null;
      const placement = zoneName ? ` → ${zoneName}` : '';
      return `${icon}${u.count}× ${name}${placement}`;
    }).join(', ');
  }

  // ==================== FACTORY HUB ====================

  showFactoryHub(defaultPlan?: QuickBuildPlanId): void {
    const tray = document.getElementById('factory-hub-tray');
    if (!tray) return;
    this.productionManager.clearQueue();
    this.fhActiveDomain = 'land';
    tray.classList.remove('hidden');
    document.body.classList.add('fh-open');
    this.renderFactoryHub();
    this.bindFactoryHubTabs();
    if (defaultPlan) {
      this.applyQuickBuildPlan(defaultPlan);
    }
  }

  closeFactoryHub(): void {
    const tray = document.getElementById('factory-hub-tray');
    if (tray) tray.classList.add('hidden');
    document.body.classList.remove('fh-open');
    this.productionManager.clearQueue();
  }

  private bindFactoryHubTabs(): void {
    const modal = document.getElementById('factory-hub-tray');
    if (!modal) return;
    modal.querySelectorAll<HTMLButtonElement>('.fh-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.fhActiveDomain = tab.dataset.domain as 'land' | 'sea' | 'air';
        modal.querySelectorAll('.fh-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderFactoryHubCatalog();
      });
    });
  }

  renderFactoryHub(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const badge = document.getElementById('fh-faction-badge');
    if (badge) {
      badge.textContent = faction.name;
      badge.style.background = faction.color + '33';
      badge.style.borderColor = faction.color;
      badge.style.color = faction.color;
    }

    this.updateFactoryHubBudget();
    this.renderFactoryHubCatalog();
    this.renderFactoryHubOrders();
    this.bindQuickBuildPlans();
    this.renderQuickBuildSummary();
  }

  private bindQuickBuildPlans(): void {
    const tray = document.getElementById('factory-hub-tray');
    if (!tray || tray.dataset.quickBuildBound === '1') return;
    tray.dataset.quickBuildBound = '1';

    tray.querySelectorAll<HTMLButtonElement>('.fh-plan').forEach(button => {
      button.addEventListener('click', () => {
        const planId = button.dataset.plan as QuickBuildPlanId | undefined;
        if (!planId || !QUICK_BUILD_PLANS[planId]) return;
        this.applyQuickBuildPlan(planId);
      });
    });
  }

  applyQuickBuildPlan(planId: QuickBuildPlanId): void {
    const plan = QUICK_BUILD_PLANS[planId];
    const faction = this.state.getCurrentFaction();
    if (!plan || !faction) return;

    this.activeQuickPlan = planId;
    this.productionManager.clearQueue();

    const affordableUnits = this.getQuickBuildCandidates(plan, faction.id);
    if (affordableUnits.length === 0) {
      this.callbacks.showToast('No compatible units available for this plan', 'info');
      this.renderFactoryHub();
      return;
    }

    let priorityIndex = 0;
    for (let safety = 0; safety < 500; safety++) {
      const remaining = this.productionManager.getRemainingIPCs();
      if (remaining <= 0) break;
      let bought = false;

      for (let attempts = 0; attempts < affordableUnits.length; attempts++) {
        const unit = affordableUnits[(priorityIndex + attempts) % affordableUnits.length];
        if (unit.cost > remaining) continue;
        const result = this.productionManager.queueSimplePurchase(unit.id, 1);
        if (result.success) {
          priorityIndex = (priorityIndex + attempts + 1) % affordableUnits.length;
          bought = true;
          break;
        }
      }

      if (!bought) break;
    }

    soundManager.play('click');
    this.renderFactoryHub();
  }

  private getQuickBuildCandidates(plan: QuickBuildPlan, factionId: string): Array<{ id: string; cost: number; name?: string; domain?: string }> {
    const units = this.state.unitRegistry.getAll()
      .filter((unit: any) => (!unit.factionId || unit.factionId === factionId) && unit.cost > 0 && unit.id !== 'transport');
    const byId = new Map(units.map((unit: any) => [unit.id, unit]));
    const prioritized = plan.unitPriority
      .map(id => byId.get(id))
      .filter(Boolean) as Array<{ id: string; cost: number; name?: string; domain?: string }>;

    if (prioritized.length > 0) return prioritized;

    return units
      .filter((unit: any) => plan.fallbackDomains.includes(unit.domain))
      .sort((a: any, b: any) => a.cost - b.cost);
  }

  private renderQuickBuildSummary(): void {
    const summaryEl = document.getElementById('fh-quick-summary');
    const buyDeployBtn = document.getElementById('fh-btn-buy-deploy') as HTMLButtonElement | null;
    const tray = document.getElementById('factory-hub-tray');
    const queue = this.productionManager.getPurchaseQueue();
    const plan = QUICK_BUILD_PLANS[this.activeQuickPlan];

    tray?.querySelectorAll<HTMLButtonElement>('.fh-plan').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.plan === this.activeQuickPlan);
    });

    if (buyDeployBtn) buyDeployBtn.disabled = queue.length === 0;
    if (!summaryEl) return;

    if (queue.length === 0) {
      summaryEl.textContent = `${plan.label}: ${plan.summary}.`;
      return;
    }

    const totalUnits = queue.reduce((sum, order) => sum + order.count, 0);
    const spent = this.productionManager.getTotalPurchaseCost();
    const left = this.productionManager.getRemainingIPCs();
    const unitSummary = queue.map(order => {
      const unit = this.state.unitRegistry.get(order.unitTypeId);
      return `${order.count} ${unit?.name ?? order.unitTypeId}`;
    }).join(', ');
    summaryEl.textContent = `${plan.label}: spend ${spent} IPCs, add ${totalUnits} units, leave ${left}. ${unitSummary}`;
  }

  private updateFactoryHubBudget(): void {
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const total = faction.ipcs;
    const spent = this.productionManager.getTotalPurchaseCost();
    const remain = this.productionManager.getRemainingIPCs();
    const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;

    const totalEl = document.getElementById('fh-ipc-total');
    const spentEl = document.getElementById('fh-ipc-spent');
    const remainEl = document.getElementById('fh-ipc-remain');
    const fillEl = document.getElementById('fh-budget-fill') as HTMLElement | null;
    const confirmBtn = document.getElementById('fh-btn-confirm') as HTMLButtonElement | null;
    const capUsed = document.getElementById('fh-cap-used');
    const capMax = document.getElementById('fh-cap-max');

    if (totalEl) totalEl.textContent = String(total);
    if (spentEl) spentEl.textContent = String(spent);
    if (remainEl) remainEl.textContent = String(remain);
    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      fillEl.style.background = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#22c55e';
    }
    if (confirmBtn) confirmBtn.disabled = spent === 0;
    const buyDeployBtn = document.getElementById('fh-btn-buy-deploy') as HTMLButtonElement | null;
    if (buyDeployBtn) buyDeployBtn.disabled = spent === 0;

    const maxCap = this.productionManager.getMaxPurchaseCapacity();
    const queued = this.productionManager.getTotalQueuedUnits();
    const inReserve = this.productionManager.getReserveSystem().getReserveCount(
      this.state.getCurrentFaction()?.id ?? ''
    );
    if (capUsed) capUsed.textContent = String(queued + inReserve);
    if (capMax) capMax.textContent = String(maxCap);
  }

  private renderFactoryHubCatalog(): void {
    const listEl = document.getElementById('fh-unit-list');
    if (!listEl) return;
    this.ensureFactoryHubHorizontalScroll(listEl);

    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const units = this.state.unitRegistry.getByDomain(this.fhActiveDomain)
      .filter(u => u.id !== 'transport' && (!u.factionId || u.factionId === faction.id));

    if (units.length === 0) {
      listEl.innerHTML = `<p class="fh-empty-msg">No ${this.fhActiveDomain} units available</p>`;
      return;
    }

    const queue = this.productionManager.getPurchaseQueue();
    const remainIPCs = this.productionManager.getRemainingIPCs();

    let html = '';
    for (const unit of units) {
      const icon = UNIT_ICONS[unit.id] || '⬜';
      const queuedEntry = queue.find(q => q.unitTypeId === unit.id);
      const queuedCount = queuedEntry ? queuedEntry.count : 0;
      const canAffordOne = unit.cost <= remainIPCs;
      const maxAffordable = unit.cost > 0 ? Math.floor(remainIPCs / unit.cost) : 0;

      const cardClass = [
        'fh-unit-card',
        !canAffordOne && queuedCount === 0 ? 'fh-unit-unaffordable' : '',
        queuedCount > 0 ? 'fh-unit-queued' : '',
      ].filter(Boolean).join(' ');

      html += `
        <div class="${cardClass}">
          <div class="fh-unit-icon">${icon}</div>
          <div class="fh-unit-info">
            <div class="fh-unit-name">${unit.name}</div>
            <div class="fh-unit-stats">
              ⚔️${unit.attack} 🛡️${unit.defense} 🚶${unit.movement}
              <span class="fh-unit-cost">💰${unit.cost}</span>
            </div>
          </div>
          <div class="fh-unit-controls">
            <button class="fh-minus" data-unit="${unit.id}" ${queuedCount === 0 ? 'disabled' : ''}>−</button>
            <span class="fh-count" id="fh-count-${unit.id}">${queuedCount}</span>
            <button class="fh-plus" data-unit="${unit.id}" ${!canAffordOne ? 'disabled' : ''}>+</button>
            <button class="fh-max" data-unit="${unit.id}" data-max="${maxAffordable}" ${maxAffordable === 0 ? 'disabled' : ''} title="Buy max (${maxAffordable})">Max</button>
          </div>
        </div>
      `;
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll<HTMLButtonElement>('.fh-plus:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitId = btn.dataset.unit!;
        const result = this.productionManager.queueSimplePurchase(unitId, 1);
        if (!result.success) {
          this.callbacks.showToast(result.reason || 'Cannot add unit', 'info');
        }
        soundManager.play('click');
        this.updateFactoryHubBudget();
        this.renderFactoryHubCatalog();
        this.renderFactoryHubOrders();
        this.renderQuickBuildSummary();
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>('.fh-minus:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitId = btn.dataset.unit!;
        this.productionManager.removeFromQueue(unitId, 1);
        soundManager.play('click');
        this.updateFactoryHubBudget();
        this.renderFactoryHubCatalog();
        this.renderFactoryHubOrders();
        this.renderQuickBuildSummary();
      });
    });

    listEl.querySelectorAll<HTMLButtonElement>('.fh-max:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitId = btn.dataset.unit!;
        const max = parseInt(btn.dataset.max ?? '0', 10);
        for (let i = 0; i < max; i++) {
          const result = this.productionManager.queueSimplePurchase(unitId, 1);
          if (!result.success) break;
        }
        soundManager.play('click');
        this.updateFactoryHubBudget();
        this.renderFactoryHubCatalog();
        this.renderFactoryHubOrders();
        this.renderQuickBuildSummary();
      });
    });
  }

  private ensureFactoryHubHorizontalScroll(listEl: HTMLElement): void {
    if ((listEl as HTMLElement).dataset.scrollBound === '1') return;
    (listEl as HTMLElement).dataset.scrollBound = '1';

    // Convert vertical wheel gestures into horizontal strip scrolling.
    listEl.addEventListener('wheel', (e) => {
      const dominantDelta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (dominantDelta === 0) return;
      listEl.scrollLeft += dominantDelta;
      e.preventDefault();
    }, { passive: false });
  }

  private renderFactoryHubOrders(): void {
    const listEl = document.getElementById('fh-order-list');
    if (!listEl) return;

    const queue = this.productionManager.getPurchaseQueue();
    if (queue.length === 0) {
      listEl.innerHTML = `<p class="fh-empty-msg">No units ordered yet.<br><span>Use + buttons to add units.</span></p>`;
      return;
    }

    let html = '';
    let totalCost = 0;
    for (const order of queue) {
      const unit = this.state.unitRegistry.get(order.unitTypeId);
      if (!unit) continue;
      const icon = UNIT_ICONS[order.unitTypeId] || '⬜';
      const lineCost = unit.cost * order.count;
      totalCost += lineCost;
      html += `
        <div class="fh-order-row">
          <span class="fh-order-icon">${icon}</span>
          <span class="fh-order-name">${unit.name}</span>
          <span class="fh-order-qty">×${order.count}</span>
          <span class="fh-order-cost">${lineCost} IPCs</span>
          <button class="fh-order-remove" data-unit="${order.unitTypeId}" title="Remove all">✕</button>
        </div>
      `;
    }
    html += `<div class="fh-order-total">Total: ${totalCost} IPCs</div>`;
    listEl.innerHTML = html;

    listEl.querySelectorAll<HTMLButtonElement>('.fh-order-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitId = btn.dataset.unit!;
        const q = this.productionManager.getPurchaseQueue();
        const entry = q.find(e => e.unitTypeId === unitId);
        if (entry) {
          this.productionManager.removeFromQueue(unitId, entry.count);
        }
        soundManager.play('click');
        this.updateFactoryHubBudget();
        this.renderFactoryHubCatalog();
        this.renderFactoryHubOrders();
        this.renderQuickBuildSummary();
      });
    });
  }

  optimizeFactoryHubOrders(): void {
    this.productionManager.clearQueue();
    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const units = this.state.unitRegistry.getByDomain(this.fhActiveDomain)
      .filter(u => u.id !== 'transport' && (!u.factionId || u.factionId === faction.id) && u.cost > 0)
      .sort((a, b) => a.cost - b.cost);

    if (units.length === 0) return;

    // Round-robin through the 3 cheapest unit types for a balanced force.
    // Falls back to cheapest when higher-cost units become unaffordable.
    const palette = units.slice(0, Math.min(3, units.length));
    let idx = 0;
    for (let safety = 0; safety < 500; safety++) {
      const remaining = this.productionManager.getRemainingIPCs();
      if (remaining <= 0) break;
      let bought = false;
      for (let attempt = 0; attempt < palette.length; attempt++) {
        const unit = palette[(idx + attempt) % palette.length];
        if (unit.cost <= remaining) {
          const result = this.productionManager.queueSimplePurchase(unit.id, 1);
          if (result.success) {
            idx = (idx + attempt + 1) % palette.length;
            bought = true;
            break;
          }
        }
      }
      if (!bought) break;
    }

    soundManager.play('click');
    this.updateFactoryHubBudget();
    this.renderFactoryHubCatalog();
    this.renderFactoryHubOrders();
    this.renderQuickBuildSummary();
  }

  confirmFactoryHubOrders(autoDeploy = false): void {
    const queue = this.productionManager.getPurchaseQueue();
    if (queue.length === 0) {
      this.callbacks.showToast('No units ordered', 'info');
      return;
    }

    const faction = this.state.getCurrentFaction();
    const totalCost = this.productionManager.getTotalPurchaseCost();
    const success = this.productionManager.confirmPurchases();

    if (success) {
      const summary = queue.map(o => {
        const unit = this.state.unitRegistry.get(o.unitTypeId);
        return `${o.count}× ${unit?.name ?? o.unitTypeId}`;
      }).join(', ');

      this.callbacks.showToast(`Ordered: ${summary} (${totalCost} IPCs). New units are ready next turn.`, 'success');
      soundManager.play('build');

      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color,
          `Purchase order confirmed: ${summary}`);
        const ipcEl = document.getElementById('ipc-display');
        if (ipcEl) ipcEl.textContent = `${faction.ipcs} IPCs`;
      }

      if (autoDeploy) {
        const deployResult = this.productionManager.autoDeployReserves();
        if (deployResult.deployed > 0) {
          const names = deployResult.territories
            .map(id => this.state.territories.get(id)?.name ?? id)
            .slice(0, 3)
            .join(', ');
          this.callbacks.showToast(`Ordered and deployed ${deployResult.deployed} units${names ? ` to ${names}` : ''}. New units are ready next turn.`, 'success');
          this.renderer.render();
          this.callbacks.updateSelectionInfo();
          if (faction) {
            battleLog.logBuild(this.state.turnNumber, faction.name, faction.color,
              `Auto-deployed ${deployResult.deployed} new units`);
          }
        } else {
          this.callbacks.showToast(`Ordered: ${summary}. No valid auto-deploy slots available; deploy from reserves later.`, 'info');
        }
      }

      document.getElementById('factory-hub-tray')?.classList.add('hidden');
      document.body.classList.remove('fh-open');
    } else {
      this.callbacks.showToast('Could not confirm orders — check IPC balance', 'error');
    }
  }

  // ==================== BUILD MODAL ====================

  showBuildModal(): void {
    const modal = document.getElementById('build-modal');
    if (modal) modal.classList.remove('hidden');
    this.updateMobilizationOptions();
  }

  closeBuildModal(): void {
    const modal = document.getElementById('build-modal');
    if (modal) modal.classList.add('hidden');
  }

  updateMobilizationOptions(): void {
    const ipcRemainingEl = document.getElementById('ipc-remaining');
    const mobilizedCountEl = document.getElementById('mobilized-count');
    const spentIPCsEl = document.getElementById('spent-ipcs');

    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    if (ipcRemainingEl) ipcRemainingEl.textContent = String(faction.ipcs);
    if (mobilizedCountEl) mobilizedCountEl.textContent = String(this.mobilizationSystem.getMobilizationCount());
    if (spentIPCsEl) spentIPCsEl.textContent = String(this.mobilizationSystem.getMobilizationSpending());

    const options = this.mobilizationSystem.getMobilizationOptions();
    const factories = options.filter(o => o.type === 'factory');
    const capital = options.filter(o => o.type === 'capital');
    const coastal = options.filter(o => o.type === 'coastal');
    const land = options.filter(o => o.type === 'land');

    this.renderMobilizationGroup('mobilize-factories', '🏭 Factories', factories, 'factory');
    this.renderMobilizationGroup('mobilize-capital', '⭐ Capital', capital, 'capital');
    this.renderMobilizationGroup('mobilize-coastal', '🌊 Coastal', coastal, 'coastal');
    this.renderMobilizationGroup('mobilize-land', '🏠 Land', land, 'land');
  }

  renderMobilizationGroup(containerId: string, title: string, options: MobilizationOption[], typeClass: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (options.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = `<div class="mobilize-group-title ${typeClass}">${title}</div>`;
    html += '<div class="mobilize-grid">';

    for (const option of options) {
      const wasMobilized = this.mobilizationSystem.wasMobilized(option.territory.id);
      const disabled = !option.canMobilize || wasMobilized;

      const unitsStr = option.units.map(u => {
        const icon = UNIT_ICONS[u.unitTypeId] || '⬜';
        return `<span class="mobilize-unit-chip" data-unittype="${u.unitTypeId}">${icon}×${u.count}</span>`;
      }).join(' ');

      const cardClasses = ['mobilize-card'];
      if (disabled && !wasMobilized) cardClasses.push('disabled');
      if (wasMobilized) cardClasses.push('mobilized');

      html += `
        <div class="${cardClasses.join(' ')}"
             data-territory="${option.territory.id}"
             title="${option.reason || ''}">
          <div class="mobilize-card-header">
            <span class="mobilize-card-name">${option.territory.name}</span>
            <span class="mobilize-card-cost">${option.cost} IPCs</span>
          </div>
          <div class="mobilize-card-units">
            ${wasMobilized ? '✓ Mobilized' : `Spawns: ${unitsStr}`}
          </div>
          ${option.reason && !wasMobilized ? `<div class="mobilize-card-error">${option.reason}</div>` : ''}
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.mobilize-card:not(.disabled):not(.mobilized)').forEach(el => {
      el.addEventListener('click', () => {
        const territoryId = el.getAttribute('data-territory');
        if (territoryId) this.onMobilizeTerritory(territoryId);
      });
    });

    // Unit chip hover tooltips
    container.querySelectorAll('.mobilize-unit-chip').forEach(chip => {
      chip.addEventListener('mouseenter', () => {
        const unitTypeId = (chip as HTMLElement).dataset.unittype;
        if (!unitTypeId) return;
        const unit = this.state.unitRegistry.get(unitTypeId);
        if (!unit) return;
        const tooltip = document.getElementById('unit-tooltip');
        const content = document.getElementById('tooltip-content');
        if (!tooltip || !content) return;
        content.innerHTML = `
          <strong>${unit.name}</strong><br>
          ⚔️ ATK ${unit.attack} &nbsp; 🛡️ DEF ${unit.defense}<br>
          🚶 MOV ${unit.movement} &nbsp; 💰 ${unit.cost} IPCs
        `;
        const rect = (chip as HTMLElement).getBoundingClientRect();
        tooltip.style.left = `${rect.right + 8}px`;
        tooltip.style.top = `${rect.top}px`;
        tooltip.classList.remove('hidden');
      });
      chip.addEventListener('mouseleave', () => {
        document.getElementById('unit-tooltip')?.classList.add('hidden');
      });
    });
  }

  onMobilizeTerritory(territoryId: string): void {
    const option = this.mobilizationSystem.getTerritoryMobilization(
      this.state.territories.get(territoryId)!
    );
    const result = this.mobilizationSystem.mobilize(territoryId);

    if (result.success) {
      this.callbacks.onMobilized(territoryId, option.cost, result.unitsSpawned ?? []);

      const territory = this.state.territories.get(territoryId);
      const unitsDesc = this.formatSpawnedUnitsDesc(territoryId, result.unitsSpawned ?? []);

      this.callbacks.showToast(`Mobilized ${territory?.name}: ${unitsDesc}`, 'success');
      soundManager.play('build');

      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color,
          `Mobilized ${territory?.name}: ${unitsDesc}`);
      }

      const ipcEl = document.getElementById('ipc-display');
      if (ipcEl && faction) {
        ipcEl.textContent = `${faction.ipcs} IPCs`;
      }

      this.updateMobilizationOptions();
      this.callbacks.updateMobilizationHighlights();
      this.renderer.render();
    } else {
      this.callbacks.showToast(result.reason || 'Cannot mobilize', 'info');
    }
  }

  handleMapMobilization(territoryId: string): void {
    const option = this.mobilizationSystem.getTerritoryMobilization(
      this.state.territories.get(territoryId)!
    );

    if (!option.canMobilize) {
      if (this.mobilizationSystem.wasMobilized(territoryId)) {
        this.callbacks.showToast('Already mobilized this turn', 'info');
      } else {
        this.callbacks.showToast(option.reason || 'Cannot mobilize', 'info');
      }
      return;
    }

    const result = this.mobilizationSystem.mobilize(territoryId);

    if (result.success) {
      this.callbacks.onMobilized(territoryId, option.cost, result.unitsSpawned ?? []);

      const territory = this.state.territories.get(territoryId);
      const unitsDesc = this.formatSpawnedUnitsDesc(territoryId, result.unitsSpawned ?? [], true);

      this.callbacks.showToast(`⚔️ ${territory?.name}: ${unitsDesc}`, 'success');
      soundManager.play('build');

      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color, `Mobilized ${territory?.name}`);
        const ipcEl = document.getElementById('ipc-display');
        if (ipcEl) ipcEl.textContent = `${faction.ipcs} IPCs`;
      }

      this.callbacks.updateSelectionInfo();
      this.callbacks.updateMobilizationHighlights();
      this.renderer.render();
    } else {
      this.callbacks.showToast(result.reason || 'Cannot mobilize', 'info');
    }
  }

  // ==================== DEPLOYMENT MODAL ====================

  showDeploymentModal(): void {
    const modal = document.getElementById('deployment-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.selectedDeployZone = null;
      this.updateDeploymentOptions();
    }
  }

  closeDeploymentModal(): void {
    const modal = document.getElementById('deployment-modal');
    if (modal) modal.classList.add('hidden');
  }

  updateDeploymentOptions(): void {
    const zonesListEl = document.getElementById('deployment-zones-list');
    const zoneInfoEl = document.getElementById('deploy-zone-info');
    const unitControlsEl = document.getElementById('deploy-unit-controls');
    const reserveSummaryEl = document.getElementById('reserve-summary');
    const pendingCountEl = document.getElementById('pending-deploy-count');
    const pendingListEl = document.getElementById('pending-deployments-list');
    const pendingItemsEl = document.getElementById('pending-deploy-items');

    const faction = this.state.getCurrentFaction();
    if (!faction) return;

    const reserves = this.productionManager.getCurrentReserves();
    const zones = this.productionManager.getDeploymentZones();
    const pendingDeployments = this.productionManager.getReserveSystem().getPendingDeployments();

    if (reserveSummaryEl) {
      if (reserves.length === 0) {
        reserveSummaryEl.textContent = 'No units';
      } else {
        const summary = reserves.map(r => {
          const icon = UNIT_ICONS[r.unitTypeId] || '⬜';
          return `${icon}${r.count}`;
        }).join(' ');
        reserveSummaryEl.innerHTML = summary;
      }
    }

    const totalPending = pendingDeployments.reduce((sum: number, p: any) => sum + p.count, 0);
    if (pendingCountEl) pendingCountEl.textContent = `${totalPending} units`;

    if (pendingListEl && pendingItemsEl) {
      if (pendingDeployments.length > 0) {
        pendingListEl.style.display = 'block';
        let html = '';
        for (const p of pendingDeployments) {
          const icon = UNIT_ICONS[p.unitTypeId] || '⬜';
          const territory = this.state.territories.get(p.territoryId);
          html += `<span style="display: inline-block; margin: 0.15rem; padding: 0.25rem 0.5rem; background: rgba(34,197,94,0.2); border-radius: 4px; font-size: 0.8rem;">
            ${icon}${p.count} → ${territory?.name || p.territoryId}
          </span>`;
        }
        pendingItemsEl.innerHTML = html;
      } else {
        pendingListEl.style.display = 'none';
      }
    }

    const zoneIcons: Record<string, string> = { factory: '🏭', capital: '👑', frontline: '⚔️', rear: '🏠' };
    const zoneColors: Record<string, string> = { factory: '#1a7a5c', capital: '#8b6914', frontline: '#c53030', rear: '#4a5568' };

    if (zonesListEl) {
      let html = '';
      for (const zone of zones) {
        const icon = zoneIcons[zone.type];
        const color = zoneColors[zone.type];
        const isFull = zone.remainingCapacity === 0;
        const isSelected = this.selectedDeployZone === zone.territory.id;

        html += `
          <div class="deployment-zone ${isFull ? 'full' : ''} ${isSelected ? 'selected' : ''}"
               data-territory="${zone.territory.id}"
               style="padding: 0.5rem 0.75rem; background: ${isSelected ? 'rgba(184,134,11,0.12)' : 'rgba(0,0,0,0.05)'};
                      border-radius: 8px; border: 2px solid ${isSelected ? '#8b6914' : (isFull ? '#bbb' : color)};
                      cursor: ${isFull ? 'not-allowed' : 'pointer'}; opacity: ${isFull ? '0.5' : '1'};
                      transition: all 0.15s ease;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; font-size: 0.9rem;">${icon} ${zone.territory.name}</span>
              <span style="font-size: 0.75rem; color: ${zone.remainingCapacity > 0 ? '#1a7a5c' : '#c53030'};">
                ${zone.remainingCapacity}/${zone.maxCapacity}
              </span>
            </div>
          </div>
        `;
      }
      zonesListEl.innerHTML = html;

      zonesListEl.querySelectorAll('.deployment-zone:not(.full)').forEach(el => {
        el.addEventListener('click', () => {
          const territoryId = el.getAttribute('data-territory');
          if (territoryId) {
            this.selectedDeployZone = territoryId;
            soundManager.play('click');
            this.updateDeploymentOptions();
          }
        });
      });
    }

    if (zoneInfoEl && unitControlsEl) {
      if (!this.selectedDeployZone) {
        zoneInfoEl.innerHTML = '<p style="color: #666; font-size: 0.85rem; text-align: center;">← Select a zone first</p>';
        unitControlsEl.innerHTML = '';
      } else {
        const selectedZone = zones.find(z => z.territory.id === this.selectedDeployZone);
        if (selectedZone) {
          const icon = zoneIcons[selectedZone.type];
          const color = zoneColors[selectedZone.type];
          zoneInfoEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600;">${icon} ${selectedZone.territory.name}</span>
              <span style="font-size: 0.85rem; color: ${color};">${selectedZone.type.toUpperCase()}</span>
            </div>
            <div style="font-size: 0.85rem; color: #888; margin-top: 0.25rem;">
              Remaining Capacity: <span style="color: ${selectedZone.remainingCapacity > 0 ? '#22c55e' : '#ef4444'}; font-weight: bold;">
                ${selectedZone.remainingCapacity}
              </span>
            </div>
          `;

          let controlsHtml = '';
          for (const reserve of reserves) {
            const unit = this.state.unitRegistry.get(reserve.unitTypeId);
            const icon = UNIT_ICONS[reserve.unitTypeId] || '⬜';
            const domain = unit?.domain || 'land';

            // Sea units may deploy to sea zones or coastal ports (zones are never pure sea in practice).
            const canDeploy =
              (domain === 'sea' &&
                (selectedZone.territory.type === 'sea' || selectedZone.territory.type === 'coastal')) ||
              (domain !== 'sea' && selectedZone.territory.type !== 'sea') ||
              domain === 'air';

            if (!canDeploy) continue;

            const queuedHere = pendingDeployments
              .filter((p: any) => p.unitTypeId === reserve.unitTypeId && p.territoryId === this.selectedDeployZone)
              .reduce((sum: number, p: any) => sum + p.count, 0);

            controlsHtml += `
              <div class="deploy-unit-row" data-unit="${reserve.unitTypeId}"
                   style="display: flex; align-items: center; justify-content: space-between;
                          padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.04); border-radius: 8px;
                          border: 1px solid rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="font-size: 1.3rem;">${icon}</span>
                  <div>
                    <div style="font-weight: 600; font-size: 0.9rem;">${unit?.name || reserve.unitTypeId}</div>
                    <div style="font-size: 0.75rem; color: #888;">Available: ${reserve.count}</div>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                  <button class="deploy-minus" data-unit="${reserve.unitTypeId}"
                          style="width: 32px; height: 32px; font-size: 1.2rem; border-radius: 6px;
                                 background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4);
                                 color: #c53030; cursor: pointer; ${queuedHere === 0 ? 'opacity: 0.3; cursor: not-allowed;' : ''}"
                          ${queuedHere === 0 ? 'disabled' : ''}>−</button>
                  <span style="min-width: 40px; text-align: center; font-weight: bold; font-size: 1.1rem;">
                    ${queuedHere}
                  </span>
                  <button class="deploy-plus" data-unit="${reserve.unitTypeId}"
                          style="width: 32px; height: 32px; font-size: 1.2rem; border-radius: 6px;
                                 background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.4);
                                 color: #1a7a5c; cursor: pointer; ${reserve.count === 0 || selectedZone.remainingCapacity === 0 ? 'opacity: 0.3; cursor: not-allowed;' : ''}"
                          ${reserve.count === 0 || selectedZone.remainingCapacity === 0 ? 'disabled' : ''}>+</button>
                  <button class="deploy-all" data-unit="${reserve.unitTypeId}" data-max="${reserve.count}"
                          title="Queue all ${reserve.count} ${unit?.name ?? ''} to this zone"
                          style="padding: 0 8px; height: 32px; font-size: 0.7rem; border-radius: 6px;
                                 background: rgba(99,102,241,0.18); border: 1px solid rgba(99,102,241,0.4);
                                 color: #818cf8; cursor: pointer; white-space: nowrap;
                                 ${reserve.count === 0 || selectedZone.remainingCapacity === 0 ? 'opacity: 0.3; cursor: not-allowed;' : ''}"
                          ${reserve.count === 0 || selectedZone.remainingCapacity === 0 ? 'disabled' : ''}>All</button>
                </div>
              </div>
            `;
          }

          if (controlsHtml === '') {
            unitControlsEl.innerHTML = '<p style="color: #666; font-size: 0.85rem; text-align: center; padding: 1rem;">No compatible units in reserve</p>';
          } else {
            unitControlsEl.innerHTML = controlsHtml;

            unitControlsEl.querySelectorAll('.deploy-plus:not([disabled])').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitTypeId = btn.getAttribute('data-unit');
                if (unitTypeId && this.selectedDeployZone) {
                  const result = this.productionManager.queueDeployment(unitTypeId, this.selectedDeployZone, 1);
                  if (result.success) {
                    soundManager.play('click');
                    this.updateDeploymentOptions();
                  } else {
                    this.callbacks.showToast(result.reason || 'Cannot deploy', 'info');
                  }
                }
              });
            });

            unitControlsEl.querySelectorAll('.deploy-minus:not([disabled])').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitTypeId = btn.getAttribute('data-unit');
                if (unitTypeId && this.selectedDeployZone) {
                  this.productionManager.removeDeployment(unitTypeId, this.selectedDeployZone, 1);
                  soundManager.play('click');
                  this.updateDeploymentOptions();
                }
              });
            });

            unitControlsEl.querySelectorAll('.deploy-all:not([disabled])').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const unitTypeId = btn.getAttribute('data-unit');
                const max = parseInt(btn.getAttribute('data-max') ?? '0', 10);
                if (!unitTypeId || !this.selectedDeployZone || max <= 0) return;
                let deployed = 0;
                for (let i = 0; i < max; i++) {
                  const result = this.productionManager.queueDeployment(unitTypeId, this.selectedDeployZone, 1);
                  if (!result.success) break;
                  deployed++;
                }
                if (deployed > 0) {
                  soundManager.play('click');
                  this.callbacks.showToast(`Queued all ${deployed} units`, 'success');
                  this.updateDeploymentOptions();
                }
              });
            });
          }
        }
      }
    }
  }

  onClearDeploy(): void {
    const reserveSystem = this.productionManager.getReserveSystem();
    if (reserveSystem.getPendingDeployments().length > 0) {
      reserveSystem.clearPendingDeployments();
      this.callbacks.showToast('Cleared all pending deployments', 'info');
      soundManager.play('click');
      this.updateDeploymentOptions();
    }
  }

  onConfirmDeploy(): void {
    const result = this.productionManager.executeDeployments();

    if (result.deployed > 0) {
      this.callbacks.showToast(`Deployed ${result.deployed} units to ${result.territories.length} territories!`, 'success');
      soundManager.play('build');

      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color,
          `Deployed ${result.deployed} units from reserve`);
      }

      this.renderer.render();
    } else {
      this.callbacks.showToast('No deployments pending', 'info');
    }

    this.closeDeploymentModal();
  }

  onAutoDeploy(): void {
    const result = this.productionManager.autoDeployReserves();

    if (result.deployed > 0) {
      this.callbacks.showToast(`Auto-deployed ${result.deployed} units!`, 'success');
      soundManager.play('build');

      const faction = this.state.getCurrentFaction();
      if (faction) {
        battleLog.logBuild(this.state.turnNumber, faction.name, faction.color,
          `Auto-deployed ${result.deployed} units`);
      }

      this.renderer.render();
    } else {
      this.callbacks.showToast('No reserves to deploy', 'info');
    }

    this.closeDeploymentModal();
  }
}
