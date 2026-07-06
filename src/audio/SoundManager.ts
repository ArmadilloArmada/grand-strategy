/**
 * SoundManager - Handles game audio using Web Audio API
 * Generates simple sounds and procedural music without external audio files
 */

import { settings } from '../ui/Settings';

type SoundType = 
  | 'click'
  | 'dice_roll'
  | 'hit'
  | 'miss'
  | 'victory'
  | 'defeat'
  | 'move'
  | 'build'
  | 'income'
  | 'turn_start'
  | 'combat_start'
  | 'capture'
  | 'phase_end'
  | 'low_ipc'
  | 'your_turn'
  | 'explosion'
  | 'naval_horn'
  | 'aircraft'
  | 'march'
  | 'retreat'
  | 'research'
  | 'achievement'
  | 'event'
  | 'nuclear'
  | 'tactical_start'
  | 'tactical_move'
  | 'tactical_fire'
  | 'tactical_victory'
  | 'tactical_defeat';

type MusicTrack = 'menu' | 'gameplay' | 'combat' | 'tactical_combat' | 'victory_theme' | 'defeat_theme';

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private initialized: boolean = false;
  
  // Music system
  private musicGain: GainNode | null = null;
  private currentTrack: MusicTrack | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private musicInterval: number | null = null;
  private isMusicPlaying: boolean = false;

  constructor() {
    // Initialize on first user interaction (required by browsers)
    document.addEventListener('click', () => this.init(), { once: true });
    document.addEventListener('keydown', () => this.init(), { once: true });
  }

  /**
   * Initialize the audio context
   */
  private init(): void {
    if (this.initialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  /**
   * Check if sound is enabled
   */
  private isSoundEnabled(): boolean {
    return settings.getSetting('sfxEnabled') && this.initialized && this.audioContext !== null;
  }

  /**
   * Get volume (0-1)
   */
  private getVolume(): number {
    const master = settings.getSetting('masterVolume') / 100;
    const sfx = settings.getSetting('sfxVolume') / 100;
    return master * sfx;
  }

  /**
   * Play a sound effect
   */
  play(type: SoundType): void {
    if (!this.isSoundEnabled()) return;

    switch (type) {
      case 'click':
        this.playClick();
        break;
      case 'dice_roll':
        this.playDiceRoll();
        break;
      case 'hit':
        this.playHit();
        break;
      case 'miss':
        this.playMiss();
        break;
      case 'victory':
        this.playVictory();
        break;
      case 'defeat':
        this.playDefeat();
        break;
      case 'move':
        this.playMove();
        break;
      case 'build':
        this.playBuild();
        break;
      case 'income':
        this.playIncome();
        break;
      case 'turn_start':
        this.playTurnStart();
        break;
      case 'combat_start':
        this.playCombatStart();
        break;
      case 'capture':
        this.playCapture();
        break;
      case 'phase_end':
        this.playPhaseEnd();
        break;
      case 'low_ipc':
        this.playLowIpc();
        break;
      case 'your_turn':
        this.playYourTurn();
        break;
      case 'explosion':
        this.playExplosion();
        break;
      case 'naval_horn':
        this.playNavalHorn();
        break;
      case 'aircraft':
        this.playAircraft();
        break;
      case 'march':
        this.playMarch();
        break;
      case 'retreat':
        this.playRetreat();
        break;
      case 'research':
        this.playResearch();
        break;
      case 'achievement':
        this.playAchievement();
        break;
      case 'event':
        this.playEvent();
        break;
      case 'nuclear':
        this.playNuclear();
        break;
      case 'tactical_start':
        this.playTacticalStart();
        break;
      case 'tactical_move':
        this.playTacticalMove();
        break;
      case 'tactical_fire':
        this.playTacticalFire();
        break;
      case 'tactical_victory':
        this.playTacticalVictory();
        break;
      case 'tactical_defeat':
        this.playTacticalDefeat();
        break;
    }
  }

  /**
   * Strategic event notification sound
   */
  private playEvent(): void {
    if (!this.audioContext) return;
    const vol = this.getVolume() * 0.4;
    
    // Mystical/strategic sound - rising arpeggio
    const notes = [392, 494, 587, 740]; // G4-B4-D5-F#5
    notes.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();
      
      osc.connect(gain);
      gain.connect(this.audioContext!.destination);
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const start = this.audioContext!.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  private playPhaseEnd(): void {
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(this.getVolume() * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }

  private playLowIpc(): void {
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    gain.gain.setValueAtTime(this.getVolume() * 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  private playYourTurn(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    [440, 554, 659].forEach((freq, i) => {
      const delay = i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(volume * 0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  }

  /**
   * UI Click sound - short tick
   */
  private playClick(): void {
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(this.getVolume() * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  }

  /**
   * Dice roll sound - rattling effect
   */
  private playDiceRoll(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();

    // Multiple short clicks to simulate dice
    for (let i = 0; i < 6; i++) {
      const delay = i * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(200 + Math.random() * 300, ctx.currentTime + delay);

      gain.gain.setValueAtTime(volume * 0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.03);
    }
  }

  /**
   * Hit sound - impactful thud
   */
  private playHit(): void {
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(this.getVolume() * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  /**
   * Miss sound - whiff
   */
  private playMiss(): void {
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(this.getVolume() * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  /**
   * Victory fanfare
   */
  private playVictory(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

    notes.forEach((freq, i) => {
      const delay = i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + delay);
      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + delay + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  }

  /**
   * Defeat sound - descending tones
   */
  private playDefeat(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    const notes = [392, 330, 262, 196]; // G4, E4, C4, G3

    notes.forEach((freq, i) => {
      const delay = i * 0.2;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(volume * 0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  }

  /**
   * Move sound - whoosh
   */
  private playMove(): void {
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(this.getVolume() * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  /**
   * Build/purchase sound - mechanical
   */
  private playBuild(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();

    // Two tones
    [400, 600].forEach((freq, i) => {
      const delay = i * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(volume * 0.15, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.08);
    });
  }

  /**
   * Income/coins sound
   */
  private playIncome(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();

    // Coin-like jingle
    [1200, 1400, 1600].forEach((freq, i) => {
      const delay = i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gain.gain.setValueAtTime(volume * 0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  }

  /**
   * Turn start notification
   */
  private playTurnStart(): void {
    const ctx = this.audioContext!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(550, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(this.getVolume() * 0.2, ctx.currentTime);
    gain.gain.setValueAtTime(this.getVolume() * 0.2, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  /**
   * Combat start - dramatic
   */
  private playCombatStart(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();

    // Drum-like hit
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  private playTacticalStart(): void {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const volume = this.getVolume() * 0.35;
    [220, 277, 330].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  private playTacticalMove(): void {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const volume = this.getVolume() * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  private playTacticalFire(): void {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const volume = this.getVolume() * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  private playTacticalVictory(): void {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const volume = this.getVolume() * 0.3;
    [392, 494, 587].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.28);
    });
  }

  private playTacticalDefeat(): void {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const volume = this.getVolume() * 0.28;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.35);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  /**
   * Territory captured
   */
  private playCapture(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();

    // Rising triumphant tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(volume * 0.25, ctx.currentTime);
    gain.gain.setValueAtTime(volume * 0.25, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  // ==================== NEW SOUND EFFECTS ====================
  
  private playExplosion(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    
    // White noise burst for explosion
    const bufferSize = ctx.sampleRate * 0.3;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume * 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
  }
  
  private playNavalHorn(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.setValueAtTime(200, ctx.currentTime + 0.3);
    osc.frequency.setValueAtTime(180, ctx.currentTime + 0.6);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume * 0.3, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }
  
  private playAircraft(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(300, ctx.currentTime + 0.3);
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.6);
    
    gain.gain.setValueAtTime(volume * 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  }
  
  private playMarch(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    
    // Drum-like marching sound
    for (let i = 0; i < 4; i++) {
      const delay = i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(80 + (i % 2) * 20, ctx.currentTime + delay);
      
      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.1);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.1);
    }
  }
  
  private playRetreat(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    
    // Descending horn
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.4);
    
    gain.gain.setValueAtTime(volume * 0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }
  
  private playResearch(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    
    // Sci-fi discovery sound
    const notes = [800, 1000, 1200, 1600];
    notes.forEach((freq, i) => {
      const delay = i * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      
      gain.gain.setValueAtTime(volume * 0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  }
  
  private playAchievement(): void {
    const ctx = this.audioContext!;
    const volume = this.getVolume();
    
    // Triumphant achievement unlock
    const notes = [523, 659, 784, 1047, 1319]; // C major arpeggio up
    notes.forEach((freq, i) => {
      const delay = i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      
      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + delay);
      gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime + delay + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  }

  private playNuclear(): void {
    const ctx = this.audioContext!;
    const vol = this.getVolume();

    // Rising siren tone — distinct missile launch warning
    const siren = ctx.createOscillator();
    const sirenGain = ctx.createGain();
    siren.type = 'sawtooth';
    siren.frequency.setValueAtTime(300, ctx.currentTime);
    siren.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.6);
    siren.frequency.linearRampToValueAtTime(300, ctx.currentTime + 1.0);
    sirenGain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
    sirenGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
    siren.connect(sirenGain);
    sirenGain.connect(ctx.destination);
    siren.start(ctx.currentTime);
    siren.stop(ctx.currentTime + 1.0);

    // Massive low-frequency boom after siren
    const bufferSize = Math.floor(ctx.sampleRate * 1.5);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }
    const boom = ctx.createBufferSource();
    boom.buffer = buffer;
    const boomFilter = ctx.createBiquadFilter();
    boomFilter.type = 'lowpass';
    boomFilter.frequency.setValueAtTime(200, ctx.currentTime + 1.0);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0, ctx.currentTime + 1.0);
    boomGain.gain.linearRampToValueAtTime(vol * 0.9, ctx.currentTime + 1.1);
    boomGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
    boom.connect(boomFilter);
    boomFilter.connect(boomGain);
    boomGain.connect(ctx.destination);
    boom.start(ctx.currentTime + 1.0);
  }

  // ==================== BACKGROUND MUSIC SYSTEM ====================
  
  /**
   * Start playing background music
   */
  playMusic(track: MusicTrack): void {
    if (!settings.getSetting('musicEnabled') || !this.initialized || !this.audioContext) return;
    
    // Stop current music
    this.stopMusic();
    
    this.currentTrack = track;
    this.isMusicPlaying = true;
    
    // Create music gain node
    this.musicGain = this.audioContext.createGain();
    this.musicGain.gain.value = this.getMusicVolume();
    this.musicGain.connect(this.audioContext.destination);
    
    switch (track) {
      case 'menu':
        this.playMenuMusic();
        break;
      case 'gameplay':
        this.playGameplayMusic();
        break;
      case 'combat':
        this.playCombatMusic();
        break;
      case 'tactical_combat':
        this.playTacticalCombatMusic();
        break;
      case 'victory_theme':
        this.playVictoryTheme();
        break;
      case 'defeat_theme':
        this.playDefeatTheme();
        break;
    }
  }
  
  /**
   * Stop background music
   */
  stopMusic(): void {
    this.isMusicPlaying = false;
    this.currentTrack = null;
    
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    
    this.musicOscillators.forEach(osc => {
      try {
        osc.stop();
      } catch (e) {
        // Already stopped
      }
    });
    this.musicOscillators = [];
  }
  
  /**
   * Get music volume
   */
  private getMusicVolume(): number {
    const master = settings.getSetting('masterVolume') / 100;
    return master * 0.15; // Music quieter than SFX
  }
  
  /**
   * Menu ambient music - calm, mysterious
   */
  private playMenuMusic(): void {
    if (!this.audioContext || !this.musicGain) return;
    const ctx = this.audioContext;
    
    // Low drone
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 55; // Low A
    drone.connect(this.musicGain);
    drone.start();
    this.musicOscillators.push(drone);
    
    // Ambient pad notes
    const padNotes = [220, 330, 440, 550];
    let noteIndex = 0;
    
    this.musicInterval = window.setInterval(() => {
      if (!this.isMusicPlaying || !this.musicGain) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = padNotes[noteIndex % padNotes.length];
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this.getMusicVolume() * 0.5, ctx.currentTime + 1);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 3);
      
      noteIndex++;
    }, 2000);
  }
  
  /**
   * Gameplay music - strategic, building tension
   */
  private playGameplayMusic(): void {
    if (!this.audioContext || !this.musicGain) return;
    const ctx = this.audioContext;
    
    // Bass line
    const bassNotes = [110, 110, 146.83, 130.81]; // A2, A2, D3, C3
    let bassIndex = 0;
    
    this.musicInterval = window.setInterval(() => {
      if (!this.isMusicPlaying || !this.musicGain) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.value = bassNotes[bassIndex % bassNotes.length];
      
      gain.gain.setValueAtTime(this.getMusicVolume() * 0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
      
      bassIndex++;
    }, 1000);
  }
  
  /**
   * Combat music - intense, driving
   */
  private playCombatMusic(): void {
    if (!this.audioContext || !this.musicGain) return;
    const ctx = this.audioContext;
    
    // Fast percussion-like pattern
    let beat = 0;
    
    this.musicInterval = window.setInterval(() => {
      if (!this.isMusicPlaying || !this.musicGain) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Alternate kick and snare-like sounds
      if (beat % 4 === 0) {
        osc.type = 'sine';
        osc.frequency.value = 60;
        gain.gain.setValueAtTime(this.getMusicVolume() * 0.8, ctx.currentTime);
      } else if (beat % 4 === 2) {
        osc.type = 'square';
        osc.frequency.value = 200;
        gain.gain.setValueAtTime(this.getMusicVolume() * 0.4, ctx.currentTime);
      } else {
        osc.type = 'triangle';
        osc.frequency.value = 100;
        gain.gain.setValueAtTime(this.getMusicVolume() * 0.3, ctx.currentTime);
      }
      
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      
      beat++;
    }, 200);
  }

  /** Tactical grid music — tighter pulse, lower register */
  private playTacticalCombatMusic(): void {
    if (!this.audioContext || !this.musicGain) return;
    const ctx = this.audioContext;
    const pulseNotes = [98, 110, 123.47, 130.81];
    let beat = 0;

    this.musicInterval = window.setInterval(() => {
      if (!this.isMusicPlaying || !this.musicGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = beat % 3 === 0 ? 'square' : 'triangle';
      osc.frequency.value = pulseNotes[beat % pulseNotes.length];
      gain.gain.setValueAtTime(this.getMusicVolume() * (beat % 3 === 0 ? 0.55 : 0.35), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      beat++;
    }, 170);
  }
  
  /**
   * Victory theme - triumphant
   */
  private playVictoryTheme(): void {
    if (!this.audioContext || !this.musicGain) return;
    const ctx = this.audioContext;
    
    // Fanfare melody
    const melody = [523, 659, 784, 1047, 784, 1047, 1319];
    let noteIndex = 0;
    
    const playNote = () => {
      if (!this.isMusicPlaying || noteIndex >= melody.length) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.value = melody[noteIndex];
      
      gain.gain.setValueAtTime(this.getMusicVolume(), ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
      
      noteIndex++;
      if (noteIndex < melody.length) {
        setTimeout(playNote, 300);
      }
    };
    
    playNote();
  }
  
  /**
   * Defeat theme - somber
   */
  private playDefeatTheme(): void {
    if (!this.audioContext || !this.musicGain) return;
    const ctx = this.audioContext;
    
    // Descending minor melody
    const melody = [440, 415, 392, 349, 330, 294, 262];
    let noteIndex = 0;
    
    const playNote = () => {
      if (!this.isMusicPlaying || noteIndex >= melody.length) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = melody[noteIndex];
      
      gain.gain.setValueAtTime(this.getMusicVolume() * 0.8, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      
      noteIndex++;
      if (noteIndex < melody.length) {
        setTimeout(playNote, 500);
      }
    };
    
    playNote();
  }
  
  /**
   * Update music volume (call when settings change)
   */
  updateMusicVolume(): void {
    if (this.musicGain) {
      this.musicGain.gain.value = this.getMusicVolume();
    }
  }
  
  /**
   * Check if music is playing
   */
  isMusicActive(): boolean {
    return this.isMusicPlaying;
  }
  
  /**
   * Get current track
   */
  getCurrentTrack(): MusicTrack | null {
    return this.currentTrack;
  }
}

// Singleton instance
export const soundManager = new SoundManager();