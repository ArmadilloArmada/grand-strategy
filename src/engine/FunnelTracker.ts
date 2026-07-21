/**
 * First-hour funnel instrumentation (Horizon 2).
 * Events: menu_start → briefing_dismiss → first_mobilize → first_attack → first_tactical → mission_1_complete
 */

export type FunnelStep =
  | 'menu_start'
  | 'briefing_dismiss'
  | 'first_mobilize'
  | 'first_attack'
  | 'first_tactical'
  | 'mission_1_complete';

export interface FunnelEvent {
  step: FunnelStep;
  at: number;
}

class FunnelTrackerImpl {
  private events: FunnelEvent[] = [];
  private onceSteps = new Set<FunnelStep>();

  track(step: FunnelStep, options?: { once?: boolean }): void {
    if (options?.once) {
      if (this.onceSteps.has(step)) return;
      this.onceSteps.add(step);
    }
    this.events.push({ step, at: Date.now() });
    if (typeof globalThis.dispatchEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent('gs-funnel', { detail: { step, at: Date.now() } }));
    }
  }

  getEvents(): readonly FunnelEvent[] {
    return this.events;
  }

  hasStep(step: FunnelStep): boolean {
    return this.events.some(e => e.step === step);
  }

  reset(): void {
    this.events = [];
    this.onceSteps.clear();
  }
}

export const funnelTracker = new FunnelTrackerImpl();
