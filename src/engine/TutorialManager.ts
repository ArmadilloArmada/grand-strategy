/**
 * TutorialManager - Interactive step-by-step tutorial
 * Guides new players through the game mechanics
 */

export interface TutorialStep {
  id: string;
  title: string;
  message: string;
  target?: string;           // CSS selector for element to highlight
  targetType?: 'element' | 'territory' | 'unit' | 'button';
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'click' | 'select' | 'move' | 'attack' | 'build' | 'end_phase' | 'any';
  validation?: {
    type: 'clicked' | 'territory_selected' | 'unit_selected' | 'action_completed';
    target?: string;
  };
  delay?: number;            // Auto-advance delay in ms
  allowSkip?: boolean;
  spotlight?: boolean;       // Dim everything except target
}

export interface Tutorial {
  id: string;
  name: string;
  description: string;
  steps: TutorialStep[];
}

const TUTORIALS: Tutorial[] = [
  {
    id: 'basics',
    name: 'Basic Controls',
    description: 'Learn the fundamental controls and interface',
    steps: [
      {
        id: 'welcome',
        title: 'Welcome to Grand Strategy!',
        message: 'This tutorial will teach you how to play. Click "Next" or press Enter to continue.',
        position: 'center',
        action: 'any',
        allowSkip: true,
      },
      {
        id: 'map_overview',
        title: 'The Map',
        message: 'This is your strategic map. Each colored region is a territory. Your territories are shown in your faction\'s color.',
        target: '#game-canvas',
        targetType: 'element',
        position: 'top',
        action: 'any',
        spotlight: true,
      },
      {
        id: 'select_territory',
        title: 'Selecting Territories',
        message: 'Click on any territory to select it. Try clicking on one of your territories now.',
        target: '#game-canvas',
        targetType: 'element',
        position: 'top',
        action: 'select',
        validation: { type: 'territory_selected' },
        spotlight: true,
      },
      {
        id: 'territory_info',
        title: 'Territory Information',
        message: 'The info panel shows details about the selected territory: its name, owner, units stationed there, and IPC value.',
        target: '#territory-info',
        targetType: 'element',
        position: 'left',
        action: 'any',
      },
      {
        id: 'zoom_pan',
        title: 'Navigation',
        message: 'Use the mouse wheel to zoom in/out. Click and drag (or hold spacebar) to pan around the map.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'turn_info',
        title: 'Turn & Phase',
        message: 'The game is played in turns. Classic mode has 6 phases: Purchase → Combat Move → Combat → Non-Combat Move → Production → Collect Income. Quick mode simplifies to 2: Command (mobilize, move, attack) → End Turn.',
        target: '#turn-info',
        targetType: 'element',
        position: 'bottom',
        action: 'any',
      },
      {
        id: 'basics_complete',
        title: 'Basics Complete!',
        message: 'You\'ve learned the basic controls. Continue to learn about combat and unit movement.',
        position: 'center',
        action: 'any',
      },
    ],
  },
  {
    id: 'units_combat',
    name: 'Units & Combat',
    description: 'Learn how to move units and fight battles',
    steps: [
      {
        id: 'intro',
        title: 'Units & Combat',
        message: 'Now let\'s learn about controlling your military forces.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'unit_types',
        title: 'Unit Types',
        message: 'Land: Infantry (cheap, defensive), Mech Infantry (mobile inf.), Artillery (boosts infantry attack), Tank (powerful, can blitz), Anti-Air (shoots aircraft). Air: Fighter (air superiority), Bomber (strategic bombing). Naval: Submarine (convoy raider), Destroyer (sub hunter), Cruiser, Carrier (hosts 2 fighters, 2 HP), Battleship (2 HP), Transport (carries troops).',
        position: 'center',
        action: 'any',
      },
      {
        id: 'select_units',
        title: 'Selecting Units',
        message: 'Click on a territory with your units. The units panel shows what\'s stationed there.',
        action: 'select',
        validation: { type: 'territory_selected' },
      },
      {
        id: 'movement_basics',
        title: 'Moving Units',
        message: 'During your Command or movement phase, select a friendly territory with ready units. Drag to a highlighted destination or press A to open an attack preview.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'combat_basics',
        title: 'Attacking',
        message: 'During Command or combat phases, select your territory with units, then click or drag onto an adjacent enemy territory. Confirm in the battle preview before dice resolve.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'dice_combat',
        title: 'Combat Resolution',
        message: 'Each unit rolls a d6. Roll ≤ its attack (or defense) value to score a hit. Roll of 1 with a strong unit (value ≥ 3) is a CRITICAL — deals 2 hits! Combat continues until one side is eliminated or retreats.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'combat_complete',
        title: 'Combat Training Complete!',
        message: 'You now understand the basics of unit combat. Practice makes perfect!',
        position: 'center',
        action: 'any',
      },
    ],
  },
  {
    id: 'economy',
    name: 'Economy & Production',
    description: 'Learn how to manage your economy and build units',
    steps: [
      {
        id: 'intro',
        title: 'Economy & Production',
        message: 'A strong economy wins wars. Let\'s learn about managing your resources.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'ipc_income',
        title: 'IPCs (Industrial Production Certificates)',
        message: 'Each territory produces IPCs based on its value. You collect income at the end of your turn.',
        target: '#ipc-display',
        targetType: 'element',
        position: 'bottom',
        action: 'any',
      },
      {
        id: 'factories',
        title: 'Factories',
        message: 'Factories and capitals let you mobilize new units. Click 🏭 Mobilize (or press B) to spend IPCs on territory packages — each site can mobilize once per turn.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'build_phase',
        title: 'Build Phase',
        message: 'Click 🏭 Mobilize to open the factory hub. Pick a mobilization package for a territory you own — units appear there immediately when you confirm.',
        target: '#btn-build',
        targetType: 'element',
        position: 'right',
        action: 'any',
      },
      {
        id: 'unit_costs',
        title: 'Unit Costs (Land)',
        message: 'Land — Infantry: 4 · Artillery: 5 · Anti-Air: 6 · Mech Infantry: 6 · Tank: 8. Air — Fighter: 14 · Bomber: 16. Naval — Submarine: 8 · Transport: 8 · Destroyer: 10 · Cruiser: 14 · Carrier: 18 · Battleship: 24. Balance your purchases by role!',
        position: 'center',
        action: 'any',
      },
      {
        id: 'economy_complete',
        title: 'Economy Training Complete!',
        message: 'You understand the economic system. Build wisely to dominate your enemies!',
        position: 'center',
        action: 'any',
      },
    ],
  },
  {
    id: 'winning',
    name: 'Victory Conditions',
    description: 'Learn how to win the game',
    steps: [
      {
        id: 'intro',
        title: 'How to Win',
        message: 'Let\'s talk about achieving victory!',
        position: 'center',
        action: 'any',
      },
      {
        id: 'capitals',
        title: 'Capital Cities',
        message: 'Each faction has a capital (marked with a star). Capturing enemy capitals is key to victory!',
        position: 'center',
        action: 'any',
      },
      {
        id: 'victory_types',
        title: 'Victory Types',
        message: 'Capitals: Capture the configured number of enemy capitals. Domination: Control the configured territory share. Economic: Reach the configured IPC target. Elimination: Last active faction standing. Victory settings are chosen before the match starts.',
        position: 'center',
        action: 'any',
      },
      {
        id: 'strategy_tips',
        title: 'Strategy Tips',
        message: '1) Protect your capital. 2) Build a balanced army. 3) Control chokepoints. 4) Don\'t overextend!',
        position: 'center',
        action: 'any',
      },
      {
        id: 'tutorial_complete',
        title: 'Tutorial Complete!',
        message: 'Congratulations! You\'re ready to play Grand Strategy. Good luck, Commander!',
        position: 'center',
        action: 'any',
      },
    ],
  },
];

export class TutorialManager {
  private currentTutorial: Tutorial | null = null;
  private currentStepIndex: number = 0;
  private isActive: boolean = false;
  private overlay: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private completedTutorials: Set<string> = new Set();
  private stepCallback: ((step: TutorialStep) => void) | null = null;
  
  constructor() {
    this.loadProgress();
    this.createOverlay();
  }
  
  private loadProgress(): void {
    try {
      const saved = localStorage.getItem('grand_strategy_tutorial_progress');
      if (saved) {
        this.completedTutorials = new Set(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load tutorial progress:', e);
    }
  }
  
  private saveProgress(): void {
    localStorage.setItem('grand_strategy_tutorial_progress', 
      JSON.stringify(Array.from(this.completedTutorials)));
  }
  
  private createOverlay(): void {
    // Create overlay for dimming
    this.overlay = document.createElement('div');
    this.overlay.id = 'tutorial-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 9998;
      display: none;
      pointer-events: none;
    `;
    document.body.appendChild(this.overlay);
    
    // Create tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tutorial-tooltip';
    this.tooltip.style.cssText = `
      position: fixed;
      background: linear-gradient(135deg, #1a4d2e 0%, #0d2818 100%);
      border: 2px solid #c9a227;
      border-radius: 8px;
      padding: 20px;
      max-width: 400px;
      z-index: 9999;
      display: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;
    document.body.appendChild(this.tooltip);
    
    // Listen for keyboard
    document.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      if (e.key === 'Enter' || e.key === ' ') {
        this.nextStep();
      } else if (e.key === 'Escape') {
        this.stop();
      }
    });
  }
  
  /**
   * Get all tutorials
   */
  getTutorials(): Tutorial[] {
    return TUTORIALS;
  }
  
  /**
   * Start a tutorial
   */
  start(tutorialId: string): boolean {
    const tutorial = TUTORIALS.find(t => t.id === tutorialId);
    if (!tutorial) return false;
    
    this.currentTutorial = tutorial;
    this.currentStepIndex = 0;
    this.isActive = true;
    
    this.showStep(this.currentTutorial.steps[0]);
    return true;
  }
  
  /**
   * Stop the current tutorial
   */
  stop(): void {
    this.isActive = false;
    this.currentTutorial = null;
    this.hideOverlay();
    this.hideTooltip();
  }
  
  /**
   * Go to next step
   */
  nextStep(): void {
    if (!this.isActive || !this.currentTutorial) return;
    
    this.currentStepIndex++;
    
    if (this.currentStepIndex >= this.currentTutorial.steps.length) {
      // Tutorial complete
      this.completedTutorials.add(this.currentTutorial.id);
      this.saveProgress();
      this.stop();
      return;
    }
    
    this.showStep(this.currentTutorial.steps[this.currentStepIndex]);
  }
  
  /**
   * Go to previous step
   */
  prevStep(): void {
    if (!this.isActive || !this.currentTutorial || this.currentStepIndex <= 0) return;
    
    this.currentStepIndex--;
    this.showStep(this.currentTutorial.steps[this.currentStepIndex]);
  }
  
  /**
   * Show a tutorial step
   */
  private showStep(step: TutorialStep): void {
    if (!this.tooltip) return;
    
    // Show/hide overlay
    if (step.spotlight) {
      this.showOverlay();
    } else {
      this.hideOverlay();
    }
    
    // Build tooltip content
    this.tooltip.innerHTML = `
      <div style="color: #c9a227; font-size: 1.2em; font-weight: bold; margin-bottom: 10px;">
        ${step.title}
      </div>
      <div style="color: #e0dcc8; line-height: 1.5; margin-bottom: 15px;">
        ${step.message}
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        ${this.currentStepIndex > 0 ? `
          <button id="tutorial-prev" style="
            background: #2a5d3e;
            border: 1px solid #c9a227;
            color: #e0dcc8;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
          ">← Back</button>
        ` : ''}
        ${step.allowSkip ? `
          <button id="tutorial-skip" style="
            background: #4a4a4a;
            border: 1px solid #666;
            color: #999;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
          ">Skip Tutorial</button>
        ` : ''}
        <button id="tutorial-next" style="
          background: #c9a227;
          border: none;
          color: #1a4d2e;
          padding: 8px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        ">${this.currentStepIndex < (this.currentTutorial?.steps.length || 1) - 1 ? 'Next →' : 'Finish'}</button>
      </div>
      <div style="color: #666; font-size: 0.8em; margin-top: 10px; text-align: center;">
        Step ${this.currentStepIndex + 1} of ${this.currentTutorial?.steps.length || 0}
        <br>Press Enter to continue, Esc to exit
      </div>
    `;
    
    // Position tooltip
    this.positionTooltip(step);
    
    // Show tooltip
    this.tooltip.style.display = 'block';
    
    // Assign button handlers via onclick to avoid stacking listeners across steps
    setTimeout(() => {
      const nextBtn = document.getElementById('tutorial-next') as HTMLButtonElement | null;
      const prevBtn = document.getElementById('tutorial-prev') as HTMLButtonElement | null;
      const skipBtn = document.getElementById('tutorial-skip') as HTMLButtonElement | null;
      if (nextBtn) nextBtn.onclick = () => this.nextStep();
      if (prevBtn) prevBtn.onclick = () => this.prevStep();
      if (skipBtn) skipBtn.onclick = () => this.stop();
    }, 0);
    
    // Call step callback
    this.stepCallback?.(step);
    
    // Auto-advance if delay is set
    if (step.delay) {
      setTimeout(() => {
        if (this.isActive && this.currentTutorial?.steps[this.currentStepIndex]?.id === step.id) {
          this.nextStep();
        }
      }, step.delay);
    }
  }
  
  /**
   * Position the tooltip relative to target
   */
  private positionTooltip(step: TutorialStep): void {
    if (!this.tooltip) return;
    
    const tooltipRect = { width: 400, height: 200 }; // Approximate
    
    if (step.position === 'center' || !step.target) {
      this.tooltip.style.left = `calc(50% - ${tooltipRect.width / 2}px)`;
      this.tooltip.style.top = '50%';
      this.tooltip.style.transform = 'translateY(-50%)';
      return;
    }
    
    const target = document.querySelector(step.target);
    if (!target) {
      this.tooltip.style.left = '50%';
      this.tooltip.style.top = '50%';
      this.tooltip.style.transform = 'translate(-50%, -50%)';
      return;
    }
    
    const targetRect = target.getBoundingClientRect();
    
    switch (step.position) {
      case 'top':
        this.tooltip.style.left = `${targetRect.left + targetRect.width / 2 - tooltipRect.width / 2}px`;
        this.tooltip.style.top = `${targetRect.top - tooltipRect.height - 20}px`;
        break;
      case 'bottom':
        this.tooltip.style.left = `${targetRect.left + targetRect.width / 2 - tooltipRect.width / 2}px`;
        this.tooltip.style.top = `${targetRect.bottom + 20}px`;
        break;
      case 'left':
        this.tooltip.style.left = `${targetRect.left - tooltipRect.width - 20}px`;
        this.tooltip.style.top = `${targetRect.top + targetRect.height / 2 - tooltipRect.height / 2}px`;
        break;
      case 'right':
        this.tooltip.style.left = `${targetRect.right + 20}px`;
        this.tooltip.style.top = `${targetRect.top + targetRect.height / 2 - tooltipRect.height / 2}px`;
        break;
    }
    
    this.tooltip.style.transform = 'none';
    
    // Keep on screen
    const rect = this.tooltip.getBoundingClientRect();
    if (rect.left < 10) this.tooltip.style.left = '10px';
    if (rect.right > window.innerWidth - 10) {
      this.tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
    }
    if (rect.top < 10) this.tooltip.style.top = '10px';
    if (rect.bottom > window.innerHeight - 10) {
      this.tooltip.style.top = `${window.innerHeight - tooltipRect.height - 10}px`;
    }
  }
  
  private showOverlay(): void {
    if (this.overlay) this.overlay.style.display = 'block';
  }
  
  private hideOverlay(): void {
    if (this.overlay) this.overlay.style.display = 'none';
  }
  
  private hideTooltip(): void {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }
  
  /**
   * Set step callback for game integration
   */
  onStep(callback: (step: TutorialStep) => void): void {
    this.stepCallback = callback;
  }
  
  /**
   * Notify tutorial of game action (for validation)
   */
  notifyAction(action: string, target?: string): void {
    if (!this.isActive || !this.currentTutorial) return;
    
    const step = this.currentTutorial.steps[this.currentStepIndex];
    if (!step.validation) return;
    
    if (step.validation.type === 'clicked' && action === 'click') {
      if (!step.validation.target || step.validation.target === target) {
        this.nextStep();
      }
    } else if (step.validation.type === 'territory_selected' && action === 'territory_selected') {
      this.nextStep();
    } else if (step.validation.type === 'unit_selected' && action === 'unit_selected') {
      this.nextStep();
    } else if (step.validation.type === 'action_completed' && action === step.validation.target) {
      this.nextStep();
    }
  }
  
  /**
   * Check if tutorial is completed
   */
  isCompleted(tutorialId: string): boolean {
    return this.completedTutorials.has(tutorialId);
  }
  
  /**
   * Check if all tutorials are completed
   */
  allCompleted(): boolean {
    return TUTORIALS.every(t => this.completedTutorials.has(t.id));
  }
  
  /**
   * Reset tutorial progress
   */
  resetProgress(): void {
    this.completedTutorials.clear();
    this.saveProgress();
  }
  
  /**
   * Is tutorial currently active?
   */
  isRunning(): boolean {
    return this.isActive;
  }
}

// Singleton instance
export const tutorialManager = new TutorialManager();
