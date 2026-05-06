/**
 * DragManager — makes HUD panels freely draggable with position persistence.
 *
 * Default layout (used on first run or after Reset Layout):
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │ [?]   ┌────────── Turn Info ──────────┐   [Resources]        │
 *  │       │  Phase bar  ·  Turn order     │   ┌────────────────┐ │
 *  │       └──────────────────────────────┘   │  Faction Panel │ │
 *  │                                          └────────────────┘ │
 *  │                                                              │
 *  │                                          ┌────────────────┐ │
 *  │ ┌──────────────────┐                     │  Zoom Controls │ │
 *  │ │  Selection Info  │                     ├────────────────┤ │
 *  │ └──────────────────┘                     │    Minimap     │ │
 *  │ ┌──────────────────┐                     └────────────────┘ │
 *  │ │  Battle Log      │                                         │
 *  ├─┴──────────────────────────────────────────────────────────-┤
 *  │ ⠿ [Undo][Redo] [Move][Attack][Build] … [End Phase] [☰]      │
 *  └──────────────────────────────────────────────────────────────┘
 */

const STORAGE_KEY = 'grand-strategy-panel-positions-v5';
const DRAG_THRESHOLD = 5; // px before a mousedown becomes a drag

type PanelPos = { left: number; top: number };

/**
 * id → CSS selector of the drag handle inside the element.
 * undefined  = use the whole element as handle.
 * '.panel-grip' = inject a dedicated gripper (for all-button panels).
 */
const HANDLE_SELECTORS: Record<string, string | undefined> = {
  // turn-info, action-buttons, resources anchored inside #top-hub — excluded from drag
  'faction-panel':     '#faction-panel-header',
  'zoom-controls':     undefined,
  'help-button':       undefined,
};

/**
 * Default position functions — called with (viewportWidth, viewportHeight, elementRect).
 * These define the intentional starting layout.  Values that reference `r.width` / `r.height`
 * use the actual rendered size so things land correctly regardless of content.
 */
const DEFAULTS: Record<string, (vw: number, vh: number, r: DOMRect) => PanelPos> = {
  // Top-left corner
  'help-button':       (_vw, _vh, _r) => ({ left: 16,                                top: 16 }),

  // War Room content is managed by the panel layout
  'faction-panel':     (vw,  _vh, r)  => ({ left: vw - r.width - 16,                 top: 112 }),

  // Right column — above action bar, clear of War Room panel
  'zoom-controls':     (vw,  _vh,  r)  => ({ left: vw - 326 - r.width - 24, top: 118 }),
};

export class DragManager {
  private initialized = new Set<string>();
  private saved: Record<string, PanelPos> = {};

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.saved = JSON.parse(raw) as Record<string, PanelPos>;
    } catch { /* corrupt data — start fresh */ }
  }

  /**
   * Enable drag for every panel that is currently visible in the DOM.
   * Safe to call multiple times — already-initialized panels are skipped.
   */
  setup(): void {
    for (const id of Object.keys(HANDLE_SELECTORS)) {
      if (this.initialized.has(id)) continue;
      const el = document.getElementById(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue; // hidden / not yet rendered
      this.initPanel(el, rect);
      this.initialized.add(id);
    }
  }

  /** Wipe saved positions and reload to restore the designed defaults. */
  resetLayout(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    location.reload();
  }

  /**
   * Snap all panels back to their designed defaults immediately, without a page reload.
   * Clears saved positions so they won't drift back on next setup().
   */
  resetLayoutInPlace(): void {
    this.saved = {};
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    for (const id of Object.keys(DEFAULTS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const def = DEFAULTS[id](vw, vh, rect);
      const left = Math.max(0, Math.min(def.left, vw - el.offsetWidth));
      const top  = Math.max(0, Math.min(def.top,  vh - el.offsetHeight));
      el.style.transition = 'left 0.35s cubic-bezier(0.22,1,0.36,1), top 0.35s cubic-bezier(0.22,1,0.36,1)';
      el.style.left = `${left}px`;
      el.style.top  = `${top}px`;
      // Remove transition after animation so dragging stays instant
      setTimeout(() => { el.style.transition = ''; }, 380);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private initPanel(el: HTMLElement, rect: DOMRect): void {
    const id = el.id;
    const saved = this.saved[id];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Compute the intended default position for this viewport size
    const def = DEFAULTS[id]
      ? DEFAULTS[id](vw, vh, rect)
      : { left: rect.left, top: rect.top };

    // Use saved position if it exists; otherwise fall back to the designed default
    const initLeft = saved
      ? Math.max(0, Math.min(saved.left, vw - rect.width))
      : Math.max(0, Math.min(def.left, vw - rect.width));
    const initTop  = saved
      ? Math.max(0, Math.min(saved.top,  vh - rect.height))
      : Math.max(0, Math.min(def.top,    vh - rect.height));

    // Cancel any CSS entry animation — it would fight with the inline position.
    // The panel appears instantly at its computed default position instead.
    el.style.animation  = 'none';
    el.style.opacity    = '1';

    // Switch to fixed positioning so the panel is free from the layout flow
    el.style.position  = 'fixed';
    el.style.left      = `${initLeft}px`;
    el.style.top       = `${initTop}px`;
    el.style.bottom    = 'auto';
    el.style.right     = 'auto';
    el.style.transform = 'none';
    el.classList.add('draggable-panel');

    // ── Resolve drag handle ──────────────────────────────────────────────────
    const handleSel = HANDLE_SELECTORS[id];
    let handle: HTMLElement;

    if (handleSel === '.panel-grip') {
      // Panels whose children are all buttons get an injected gripper strip
      const grip = document.createElement('div');
      grip.className = 'panel-grip';
      grip.title = 'Drag to move';
      grip.setAttribute('aria-hidden', 'true');
      grip.innerHTML = '<span>⠿</span>';
      el.insertBefore(grip, el.firstChild);
      handle = grip;
    } else if (handleSel) {
      handle = el.querySelector<HTMLElement>(handleSel) ?? el;
    } else {
      // Use the whole element; show a subtle grip dot on hover
      handle = el;
      const dot = document.createElement('span');
      dot.className = 'panel-drag-dot';
      dot.textContent = '⠿';
      dot.setAttribute('aria-hidden', 'true');
      el.appendChild(dot);
    }

    handle.classList.add('drag-handle');

    // ── Drag events ──────────────────────────────────────────────────────────
    let startMouseX = 0, startMouseY = 0;
    let startLeft   = 0, startTop    = 0;
    let moved = false;
    const isButtonHandle = handle.tagName === 'BUTTON';

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      if (!moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        el.classList.add('is-dragging');
        document.body.classList.add('dragging-active');
      }
      const nx = Math.max(0, Math.min(startLeft + dx, window.innerWidth  - el.offsetWidth));
      const ny = Math.max(0, Math.min(startTop  + dy, window.innerHeight - el.offsetHeight));
      el.style.left = `${nx}px`;
      el.style.top  = `${ny}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup',   onMouseUp,   true);
      el.classList.remove('is-dragging');
      document.body.classList.remove('dragging-active');
      if (moved) {
        // Swallow the click that follows mouseup so a drag doesn't activate buttons
        el.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); },
          { capture: true, once: true });
        this.saved[id] = { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
        this.persist();
      }
      moved = false;
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // Block drag when an interactive child is clicked (unless handle IS that element)
      if (!isButtonHandle && t.closest('button, input, select, a, [role="button"]')) return;
      e.preventDefault();
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startLeft   = parseFloat(el.style.left) || el.getBoundingClientRect().left;
      startTop    = parseFloat(el.style.top)  || el.getBoundingClientRect().top;
      moved = false;
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('mouseup',   onMouseUp,   true);
    });

    // Re-clamp position when the window is resized
    window.addEventListener('resize', () => {
      const cl = parseFloat(el.style.left);
      const ct = parseFloat(el.style.top);
      el.style.left = `${Math.max(0, Math.min(cl, window.innerWidth  - el.offsetWidth))}px`;
      el.style.top  = `${Math.max(0, Math.min(ct, window.innerHeight - el.offsetHeight))}px`;
    }, { passive: true });
  }

  private persist(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.saved)); } catch { /* ignore */ }
  }
}

export const dragManager = new DragManager();
