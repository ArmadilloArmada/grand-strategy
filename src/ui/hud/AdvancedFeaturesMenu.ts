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
  private repositionListener: (() => void) | null = null;
  private toggle: HTMLButtonElement | null = null;
  private dropdown: HTMLElement | null = null;

  init(handlers: AdvancedFeaturesHandlers): void {
    const toggle = document.getElementById('btn-advanced-menu') as HTMLButtonElement | null;
    const dropdown = document.getElementById('advanced-menu-dropdown');
    if (!toggle || !dropdown) return;
    this.toggle = toggle;
    this.dropdown = dropdown;

    // Escape the top hub's overflow clipping.
    if (dropdown.parentElement !== document.body) {
      document.body.appendChild(dropdown);
    }

    const hide = () => {
      this.open = false;
      dropdown.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
      if (this.repositionListener) {
        window.removeEventListener('resize', this.repositionListener);
        window.removeEventListener('scroll', this.repositionListener, true);
        this.repositionListener = null;
      }
    };

    const positionDropdown = () => {
      const rect = toggle.getBoundingClientRect();
      dropdown.style.top = `${Math.round(rect.bottom + 6)}px`;
      dropdown.style.left = `${Math.round(rect.left)}px`;
      dropdown.style.right = 'auto';
      const menuWidth = dropdown.offsetWidth || 168;
      const overflowRight = rect.left + menuWidth - window.innerWidth + 8;
      if (overflowRight > 0) {
        dropdown.style.left = `${Math.round(Math.max(8, rect.left - overflowRight))}px`;
      }
      const overflowBottom = rect.bottom + 6 + dropdown.offsetHeight - window.innerHeight + 8;
      if (overflowBottom > 0) {
        dropdown.style.top = `${Math.round(Math.max(8, rect.top - dropdown.offsetHeight - 6))}px`;
      }
    };

    const show = () => {
      this.open = true;
      dropdown.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      positionDropdown();
      this.repositionListener = positionDropdown;
      window.addEventListener('resize', this.repositionListener);
      window.addEventListener('scroll', this.repositionListener, true);
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
    if (this.repositionListener) {
      window.removeEventListener('resize', this.repositionListener);
      window.removeEventListener('scroll', this.repositionListener, true);
      this.repositionListener = null;
    }
    this.open = false;
    this.dropdown?.classList.add('hidden');
    this.toggle = null;
    this.dropdown = null;
  }

  /** Keep nuclear strike visible in the dropdown when unlocked. */
  syncNuclearVisibility(visible: boolean): void {
    const item = document.querySelector<HTMLElement>('[data-advanced-action="nuclear"]');
    item?.classList.toggle('hidden', !visible);
  }
}
