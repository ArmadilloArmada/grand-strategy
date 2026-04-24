/**
 * TutorialController - Manages the in-game tutorial modal state
 * Extracted from HUD.ts to reduce its size
 */

export interface TutorialCallbacks {
  showToast: (message: string, type: 'info' | 'success') => void;
}

export class TutorialController {
  private step: number = 0;
  private hasBeenSeen: boolean = false;

  constructor(private callbacks: TutorialCallbacks) {
    this.hasBeenSeen = localStorage.getItem('tutorial-seen') === 'true';
  }

  get shown(): boolean {
    return this.hasBeenSeen;
  }

  /** Show the tutorial modal from the beginning */
  show(): void {
    this.step = 0;
    this.updateDisplay();
    const modal = document.getElementById('tutorial-modal');
    if (modal) modal.classList.remove('hidden');
  }

  /** Close the tutorial modal and mark it as seen */
  close(): void {
    const modal = document.getElementById('tutorial-modal');
    if (modal) modal.classList.add('hidden');
    localStorage.setItem('tutorial-seen', 'true');
    this.hasBeenSeen = true;
  }

  /** Advance to the next step, or close if on the last step */
  next(): void {
    const steps = document.querySelectorAll('.tutorial-step');
    if (this.step < steps.length - 1) {
      this.step++;
      this.updateDisplay();
    } else {
      this.close();
      this.callbacks.showToast('Good luck, Commander! 🎖️', 'success');
    }
  }

  /** Go back to the previous step */
  prev(): void {
    if (this.step > 0) {
      this.step--;
      this.updateDisplay();
    }
  }

  private updateDisplay(): void {
    const steps = document.querySelectorAll('.tutorial-step');
    const dots = document.querySelectorAll('.tutorial-dot');
    const prevBtn = document.getElementById('btn-tutorial-prev') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('btn-tutorial-next') as HTMLButtonElement | null;

    steps.forEach((step, i) => step.classList.toggle('active', i === this.step));
    dots.forEach((dot, i) => dot.classList.toggle('active', i === this.step));

    if (prevBtn) prevBtn.disabled = this.step === 0;
    if (nextBtn) {
      nextBtn.textContent = this.step === steps.length - 1 ? 'Start Playing! 🎮' : 'Next →';
    }
  }
}
