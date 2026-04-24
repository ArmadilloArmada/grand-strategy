/**
 * VisualEffects - Adds juice and fun visual feedback to the game
 * Includes explosions, screen shake, confetti, and combat animations
 */

export class VisualEffects {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;
  private animationFrame: number | null = null;
  
  constructor() {
    // Create overlay canvas for effects
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'effects-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;
    document.body.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext('2d')!;
    this.resize();
    
    window.addEventListener('resize', () => this.resize());
    this.startLoop();
  }
  
  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  
  private startLoop(): void {
    const loop = () => {
      this.update();
      this.render();
      this.animationFrame = requestAnimationFrame(loop);
    };
    loop();
  }
  
  private update(): void {
    // Update particles
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= p.decay;
      p.rotation += p.rotationSpeed;
    }
    
    // Decay screen shake
    this.shakeIntensity *= this.shakeDecay;
    if (this.shakeIntensity < 0.1) this.shakeIntensity = 0;
  }
  
  private render(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Apply screen shake
    if (this.shakeIntensity > 0) {
      const offsetX = (Math.random() - 0.5) * this.shakeIntensity;
      const offsetY = (Math.random() - 0.5) * this.shakeIntensity;
      document.body.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    } else {
      document.body.style.transform = '';
    }
    
    // Draw particles
    for (const p of this.particles) {
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.globalAlpha = Math.min(1, p.life / 30);
      
      if (p.type === 'explosion') {
        this.drawExplosionParticle(p);
      } else if (p.type === 'confetti') {
        this.drawConfettiParticle(p);
      } else if (p.type === 'spark') {
        this.drawSparkParticle(p);
      } else if (p.type === 'smoke') {
        this.drawSmokeParticle(p);
      } else if (p.type === 'star') {
        this.drawStarParticle(p);
      }
      
      this.ctx.restore();
    }
  }
  private drawExplosionParticle(p: Particle): void {
    const size = p.size * (p.life / p.maxLife);
    this.ctx.fillStyle = p.color;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = p.color;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, size, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  private drawConfettiParticle(p: Particle): void {
    this.ctx.fillStyle = p.color;
    this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
  }

  private drawSparkParticle(p: Particle): void {
    const len = p.size * 3;
    this.ctx.strokeStyle = p.color;
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(0, 0);
    this.ctx.lineTo(-p.vx * len, -p.vy * len);
    this.ctx.stroke();
  }

  private drawSmokeParticle(p: Particle): void {
    const size = p.size * (2 - p.life / p.maxLife);
    this.ctx.fillStyle = `rgba(150, 150, 150, ${p.life / p.maxLife * 0.3})`;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, size, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawStarParticle(p: Particle): void {
    const r = p.size;
    this.ctx.fillStyle = p.color;
    this.ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  private spawnParticles(
    x: number,
    y: number,
    count: number,
    type: Particle['type'],
    colors: string[],
    speedMin: number,
    speedMax: number,
    life: number,
    gravity: number,
    sizeMin: number,
    sizeMax: number
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const maxLife = life * (0.7 + Math.random() * 0.6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity,
        life: maxLife,
        maxLife,
        decay: 1,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        type,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
      });
    }
  }

  triggerExplosion(x: number, y: number, intensity: number = 1): void {
    const count = Math.floor(20 * intensity);
    this.spawnParticles(x, y, count, 'explosion',
      ['#FF6B35', '#FF4500', '#FFD700', '#FF8C00', '#FFA500'],
      2, 8 * intensity, 60, 0.15, 3, 8 * intensity);
    this.spawnParticles(x, y, count / 2, 'spark',
      ['#FFD700', '#FFF', '#FF6B35'],
      4, 12, 30, 0.2, 1, 2);
    this.spawnParticles(x, y, count / 3, 'smoke',
      ['#888', '#aaa'],
      1, 2, 80, -0.05, 5, 12);
    this.triggerShake(5 * intensity);
  }

  triggerConfetti(x: number, y: number): void {
    const colors = ['#FF6B35', '#4ECDC4', '#45B7D1', '#FED766', '#2AB7CA', '#F9DC5C', '#E84855'];
    this.spawnParticles(x, y, 60, 'confetti', colors, 2, 8, 120, 0.15, 4, 10);
    this.spawnParticles(x, y, 30, 'star', colors, 1, 5, 100, 0.1, 4, 8);
  }

  triggerCaptureEffect(x: number, y: number): void {
    const colors = ['#FFD700', '#FFF', '#4ECDC4'];
    this.spawnParticles(x, y, 25, 'star', colors, 2, 6, 80, 0.1, 3, 7);
    this.triggerShake(3);
  }

  triggerShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  triggerNuclearFlash(): void {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed;inset:0;background:#fff;opacity:1;z-index:9999;
      pointer-events:none;transition:opacity 1.5s ease-out;
    `;
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 1600);
    });
    this.triggerShake(20);
  }

  triggerShockwave(x: number, y: number): void {
    const duration = 1200;
    const start = Date.now();
    const maxRadius = Math.max(window.innerWidth, window.innerHeight) * 1.2;

    const draw = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= duration) return;

      const progress = elapsed / duration;
      const radius = maxRadius * progress;
      const alpha = (1 - progress) * 0.6;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(255, 120, 0, ${alpha})`;
      this.ctx.lineWidth = 6 * (1 - progress);
      this.ctx.stroke();
      this.ctx.restore();

      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  destroy(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    document.body.removeChild(this.canvas);
    window.removeEventListener('resize', () => this.resize());
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  decay: number;
  rotation: number;
  rotationSpeed: number;
  type: 'explosion' | 'confetti' | 'spark' | 'smoke' | 'star';
  color: string;
  size: number;
}

class VisualEffectsProxy {
  private fx: VisualEffects | null = null;

  private get(): VisualEffects {
    if (!this.fx) this.fx = new VisualEffects();
    return this.fx;
  }

  confetti(x: number, y: number, _count?: number): void {
    this.get().triggerConfetti(x, y);
  }

  explosion(x: number, y: number, intensity: number = 1): void {
    this.get().triggerExplosion(x, y, intensity);
  }

  captureEffect(x: number, y: number, _color?: string): void {
    this.get().triggerCaptureEffect(x, y);
  }

  capitalCapture(x: number, y: number, _color?: string): void {
    this.get().triggerCaptureEffect(x, y);
    this.get().triggerShake(6);
  }

  incomeEffect(x: number, y: number, _amount?: number): void {
    this.get().triggerConfetti(x, y);
  }

  shake(intensity: number): void {
    this.get().triggerShake(intensity);
  }

  nuclearFlash(): void {
    this.get().triggerNuclearFlash();
  }

  shockwave(x: number, y: number): void {
    this.get().triggerShockwave(x, y);
  }
}

export const visualEffects = new VisualEffectsProxy();
