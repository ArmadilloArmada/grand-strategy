/**
 * Seedable pseudo-random number generator.
 *
 * Goals:
 * - Deterministic, reproducible randomness when a seed is set (same seed →
 *   identical game: combat dice, AI decisions, events, etc.). This makes games
 *   shareable/replayable and tests reliable.
 * - Zero behavior change when NOT seeded: `next()` transparently falls back to
 *   `Math.random()`. Existing code and tests that stub `Math.random` keep working.
 *
 * The RNG state is a single 32-bit integer (mulberry32), so it serializes
 * trivially into save files — restoring a save resumes the exact sequence.
 */

/** mulberry32: fast, well-distributed 32-bit seeded PRNG. */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash an arbitrary string into a 32-bit integer seed (xfnv1a-ish). */
function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class SeededRng {
  private state: number | null = null;
  private generator: (() => number) | null = null;

  /**
   * Set the seed. Pass `null` to return to unseeded mode (uses `Math.random`).
   * String seeds are hashed to a 32-bit integer.
   */
  seed(seed: number | string | null): void {
    if (seed === null || seed === undefined) {
      this.state = null;
      this.generator = null;
      return;
    }
    const numeric = typeof seed === 'string' ? hashStringToSeed(seed) : (seed >>> 0);
    this.state = numeric;
    this.generator = mulberry32(numeric);
  }

  isSeeded(): boolean {
    return this.generator !== null;
  }

  /** Random float in [0, 1). Falls back to Math.random() when unseeded. */
  next(): number {
    if (!this.generator) return Math.random();
    const value = this.generator();
    // Track advancing state so save/load can resume the exact sequence.
    this.state = (this.state! + 0x6d2b79f5) | 0;
    return value;
  }

  /** Random integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Random float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element from a non-empty array (undefined if empty). */
  pick<T>(arr: readonly T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Return a new array with the elements shuffled (Fisher-Yates). */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /**
   * Serialize the current generator state (or null when unseeded). Store this in
   * a save file to resume the exact random sequence on load.
   */
  getState(): number | null {
    return this.isSeeded() ? this.state : null;
  }

  /** Restore a previously serialized state. `null` returns to unseeded mode. */
  setState(state: number | null | undefined): void {
    if (state === null || state === undefined) {
      this.state = null;
      this.generator = null;
      return;
    }
    this.state = state >>> 0;
    this.generator = mulberry32(this.state);
  }
}

/** Shared game RNG. Engine systems should use this instead of Math.random(). */
export const rng = new SeededRng();
