/**
 * AnimationManager - Handles smooth unit movement and other animations
 */

import { settings } from '../ui/Settings';

interface MoveAnimation {
  id: string;
  unitTypeId: string;
  count: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number; // 0 to 1
  duration: number; // milliseconds
  startTime: number;
  onComplete?: () => void;
}

export class AnimationManager {
  private moveAnimations: MoveAnimation[] = [];
  private isAnimating: boolean = false;
  private animationFrame: number | null = null;
  private onRenderCallback: (() => void) | null = null;

  /**
   * Set the render callback
   */
  setRenderCallback(callback: () => void): void {
    this.onRenderCallback = callback;
  }

  /**
   * Check if animations are enabled
   */
  private areAnimationsEnabled(): boolean {
    return settings.getSetting('animationsEnabled');
  }

  /**
   * Get animation speed based on game speed setting
   */
  private getAnimationDuration(): number {
    const speed = settings.getSetting('gameSpeed');
    switch (speed) {
      case 'slow': return 800;
      case 'fast': return 200;
      default: return 400;
    }
  }

  /**
   * Add a unit movement animation
   */
  animateMove(
    unitTypeId: string,
    count: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    onComplete?: () => void
  ): Promise<void> {
    return new Promise((resolve) => {
      if (!this.areAnimationsEnabled()) {
        onComplete?.();
        resolve();
        return;
      }

      const animation: MoveAnimation = {
        id: `${Date.now()}-${Math.random()}`,
        unitTypeId,
        count,
        fromX,
        fromY,
        toX,
        toY,
        progress: 0,        duration: this.getAnimationDuration(),
        startTime: performance.now(),
        onComplete: () => {
          onComplete?.();
          resolve();
        },
      };

      this.moveAnimations.push(animation);

      if (!this.isAnimating) {
        this.startLoop();
      }
    });
  }

  /**
   * Start the animation loop
   */
  private startLoop(): void {
    if (this.isAnimating) return;
    this.isAnimating = true;

    const loop = (timestamp: number) => {
      let hasActive = false;

      this.moveAnimations = this.moveAnimations.filter(anim => {
        anim.progress = Math.min(1, (timestamp - anim.startTime) / anim.duration);
        if (anim.progress >= 1) {
          anim.onComplete?.();
          return false;
        }
        hasActive = true;
        return true;
      });

      this.onRenderCallback?.();

      if (hasActive) {
        this.animationFrame = requestAnimationFrame(loop);
      } else {
        this.isAnimating = false;
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(loop);
  }

  /**
   * Get active move animations for rendering
   */
  getActiveMoveAnimations(): Array<{
    unitTypeId: string;
    count: number;
    x: number;
    y: number;
  }> {
    return this.moveAnimations.map(anim => {
      const t = this.easeInOut(anim.progress);
      return {
        unitTypeId: anim.unitTypeId,
        count: anim.count,
        x: anim.fromX + (anim.toX - anim.fromX) * t,
        y: anim.fromY + (anim.toY - anim.fromY) * t,
      };
    });
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /**
   * Check if animations are currently running
   */
  isActive(): boolean {
    return this.isAnimating;
  }

  /**
   * Stop all animations immediately
   */
  stopAll(): void {
    for (const anim of this.moveAnimations) {
      anim.onComplete?.();
    }
    this.moveAnimations = [];
    this.isAnimating = false;
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }
}
