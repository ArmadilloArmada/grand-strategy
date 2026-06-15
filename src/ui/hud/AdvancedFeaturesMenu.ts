export interface AdvancedFeaturesHandlers {
  onTech: () => void;
  onDiplomacy: () => void;
  onEspionage: () => void;
  onStats: () => void;
  onNuclear?: () => void;
}

/** Collapses diplomacy, espionage, tech, and stats behind one action-bar control. */
export class AdvancedFeaturesMenu {
  private open = false;
  private outsideClickListener: ((event: MouseEvent) => void) | null = null;

  init(handlers: AdvancedFeaturesHandlers): void {
    const toggle = document.getElementById('btn-advanced-menu');
    const dropdown = document.getElementById('advanced-menu-dropdown');
    if (!toggle || !dropdown) return;

    const hide = () => {
      this.open = false;
      dropdown.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };

    const show = () => {
      this.open = true;
      dropdown.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    };

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.open) hide();
      else show();
    });

    dropdown.querySelector('[data-advanced-action="tech"]')
      ?.addEventListener('click', () => { hide(); handlers.onTech(); });
    dropdown.querySelector('[data-advanced-action="diplomacy"]')
      ?.addEventListener('click', () => { hide(); handlers.onDiplomacy(); });
    dropdown.querySelector('[data-advanced-action="espionage"]')
      ?.addEventListener('click', () => { hide(); handlers.onEspionage(); });
    dropdown.querySelector('[data-advanced-action="stats"]')
      ?.addEventListener('click', () => { hide(); handlers.onStats(); });
    dropdown.querySelector('[data-advanced-action="nuclear"]')
      ?.addEventListener('click', () => {
        hide();
        handlers.onNuclear?.();
      });

    this.outsideClickListener = (event: MouseEvent) => {
      if (!this.open) return;
      const target = event.target as Node | null;
      if (target && (dropdown.contains(target) || toggle.contains(target))) return;
      hide();
    };
    document.addEventListener('click', this.outsideClickListener);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hide();
    });
  }

  dispose(): void {
    if (this.outsideClickListener) {
      document.removeEventListener('click', this.outsideClickListener);
      this.outsideClickListener = null;
    }
  }

  /** Keep nuclear strike visible in the dropdown when unlocked. */
  syncNuclearVisibility(visible: boolean): void {
    const item = document.querySelector<HTMLElement>('[data-advanced-action="nuclear"]');
    item?.classList.toggle('hidden', !visible);
  }
}
