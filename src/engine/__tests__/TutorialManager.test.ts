/**
 * TutorialManager tests
 * Tests purely the state-machine logic (step transitions, completion tracking).
 * Does NOT test DOM positioning or CSS — only method return values and state changes.
 */
import { describe, it, expect } from 'vitest';
import { TutorialManager } from '../TutorialManager';

function makeManager(): TutorialManager {
  localStorage.clear();
  return new TutorialManager();
}

describe('TutorialManager — getTutorials', () => {
  it('returns non-empty tutorials array', () => {
    const tm = makeManager();
    expect(tm.getTutorials().length).toBeGreaterThan(0);
  });

  it('each tutorial has an id, name, and steps array', () => {
    const tm = makeManager();
    for (const t of tm.getTutorials()) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(Array.isArray(t.steps)).toBe(true);
      expect(t.steps.length).toBeGreaterThan(0);
    }
  });
});

describe('TutorialManager — start', () => {
  it('start returns false for unknown tutorial id', () => {
    const tm = makeManager();
    expect(tm.start('nonexistent_tutorial')).toBe(false);
  });

  it('start returns true for a valid tutorial id', () => {
    const tm = makeManager();
    expect(tm.start('basics')).toBe(true);
  });

  it('isRunning is true after start', () => {
    const tm = makeManager();
    tm.start('basics');
    expect(tm.isRunning()).toBe(true);
  });

  it('isRunning is false before start', () => {
    const tm = makeManager();
    expect(tm.isRunning()).toBe(false);
  });
});

describe('TutorialManager — stop', () => {
  it('isRunning becomes false after stop', () => {
    const tm = makeManager();
    tm.start('basics');
    tm.stop();
    expect(tm.isRunning()).toBe(false);
  });
});

describe('TutorialManager — nextStep', () => {
  it('nextStep is a no-op when tutorial is not active', () => {
    const tm = makeManager();
    expect(() => tm.nextStep()).not.toThrow();
  });

  it('advances through steps without stopping early', () => {
    const tm = makeManager();
    tm.start('basics');
    const tutorials = tm.getTutorials();
    const basics = tutorials.find(t => t.id === 'basics')!;
    const stepCount = basics.steps.length;

    // Advance through all but the last step
    for (let i = 0; i < stepCount - 1; i++) {
      expect(tm.isRunning()).toBe(true);
      tm.nextStep();
    }
    expect(tm.isRunning()).toBe(true);
  });

  it('stops and marks completed after advancing past last step', () => {
    const tm = makeManager();
    const basics = tm.getTutorials().find(t => t.id === 'basics')!;
    tm.start('basics');
    for (let i = 0; i < basics.steps.length; i++) {
      tm.nextStep();
    }
    expect(tm.isRunning()).toBe(false);
    expect(tm.isCompleted('basics')).toBe(true);
  });
});

describe('TutorialManager — prevStep', () => {
  it('prevStep is a no-op when at first step', () => {
    const tm = makeManager();
    tm.start('basics');
    expect(() => tm.prevStep()).not.toThrow();
    expect(tm.isRunning()).toBe(true);
  });

  it('prevStep goes back one step', () => {
    const tm = makeManager();
    const basics = tm.getTutorials().find(t => t.id === 'basics')!;
    const stepCallback: string[] = [];
    tm.onStep(step => stepCallback.push(step.id));
    tm.start('basics');
    tm.nextStep();
    const afterNext = stepCallback[stepCallback.length - 1];
    tm.prevStep();
    const afterPrev = stepCallback[stepCallback.length - 1];
    // Should have gone back to earlier step
    expect(afterPrev).toBe(basics.steps[0].id);
    expect(afterNext).toBe(basics.steps[1].id);
  });
});

describe('TutorialManager — isCompleted / allCompleted', () => {
  it('isCompleted returns false for an unstarted tutorial', () => {
    const tm = makeManager();
    expect(tm.isCompleted('basics')).toBe(false);
  });

  it('allCompleted returns false when not all tutorials are done', () => {
    const tm = makeManager();
    expect(tm.allCompleted()).toBe(false);
  });

  it('allCompleted returns true once all tutorials are completed', () => {
    const tm = makeManager();
    const tutorials = tm.getTutorials();
    for (const t of tutorials) {
      tm.start(t.id);
      for (let i = 0; i < t.steps.length; i++) {
        tm.nextStep();
      }
    }
    expect(tm.allCompleted()).toBe(true);
  });

  it('completion persists across manager instances via localStorage', () => {
    const tm = makeManager();
    const basics = tm.getTutorials().find(t => t.id === 'basics')!;
    tm.start('basics');
    for (let i = 0; i < basics.steps.length; i++) {
      tm.nextStep();
    }
    // A new manager should read the completion from localStorage
    const tm2 = new TutorialManager();
    expect(tm2.isCompleted('basics')).toBe(true);
  });
});

describe('TutorialManager — resetProgress', () => {
  it('clears all completed tutorials', () => {
    const tm = makeManager();
    const basics = tm.getTutorials().find(t => t.id === 'basics')!;
    tm.start('basics');
    for (let i = 0; i < basics.steps.length; i++) {
      tm.nextStep();
    }
    tm.resetProgress();
    expect(tm.isCompleted('basics')).toBe(false);
  });
});

describe('TutorialManager — onStep callback', () => {
  it('onStep callback fires when start is called', () => {
    const tm = makeManager();
    const steps: string[] = [];
    tm.onStep(step => steps.push(step.id));
    tm.start('basics');
    expect(steps).toHaveLength(1);
  });

  it('onStep callback fires on each nextStep', () => {
    const tm = makeManager();
    const steps: string[] = [];
    tm.onStep(step => steps.push(step.id));
    tm.start('basics');
    tm.nextStep();
    tm.nextStep();
    expect(steps).toHaveLength(3); // start + 2 nexts
  });
});

describe('TutorialManager — notifyAction', () => {
  it('notifyAction with territory_selected advances step that has territory_selected validation', () => {
    const tm = makeManager();
    const steps: string[] = [];
    tm.onStep(step => steps.push(step.id));
    tm.start('basics');
    // Advance to select_territory step (step index 2 = 'select_territory')
    tm.nextStep(); // → map_overview
    tm.nextStep(); // → select_territory
    const before = steps.length;
    tm.notifyAction('territory_selected');
    // Should have advanced to next step
    expect(steps.length).toBe(before + 1);
  });

  it('notifyAction is a no-op when tutorial is not running', () => {
    const tm = makeManager();
    expect(() => tm.notifyAction('territory_selected')).not.toThrow();
  });

  it('notifyAction does nothing for steps without validation', () => {
    const tm = makeManager();
    const steps: string[] = [];
    tm.onStep(step => steps.push(step.id));
    tm.start('basics');
    // Step 0 = 'welcome' has no validation
    const before = steps.length;
    tm.notifyAction('territory_selected'); // should not advance
    expect(steps.length).toBe(before);
  });
});
