import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeededRng, rng } from '../rng';

describe('SeededRng', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rng.seed(null);
  });

  it('produces a deterministic, repeatable sequence for the same numeric seed', () => {
    const a = new SeededRng();
    const b = new SeededRng();
    a.seed(12345);
    b.seed(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRng();
    const b = new SeededRng();
    a.seed(1);
    b.seed(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('hashes string seeds deterministically', () => {
    const a = new SeededRng();
    const b = new SeededRng();
    a.seed('normandy');
    b.seed('normandy');
    expect(Array.from({ length: 10 }, () => a.next()))
      .toEqual(Array.from({ length: 10 }, () => b.next()));
  });

  it('stays within [0, 1)', () => {
    const r = new SeededRng();
    r.seed(999);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() returns values within the inclusive range', () => {
    const r = new SeededRng();
    r.seed(7);
    for (let i = 0; i < 500; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('falls back to Math.random when unseeded (so stubs still work)', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    const r = new SeededRng();
    expect(r.isSeeded()).toBe(false);
    expect(r.next()).toBe(0.42);
    expect(spy).toHaveBeenCalled();
  });

  it('does not call Math.random when seeded', () => {
    const spy = vi.spyOn(Math, 'random');
    const r = new SeededRng();
    r.seed(3);
    r.next();
    expect(spy).not.toHaveBeenCalled();
  });

  it('resumes the exact sequence via getState/setState (save/load)', () => {
    const r = new SeededRng();
    r.seed(2024);
    // Advance a few steps, then capture state mid-stream.
    r.next(); r.next(); r.next();
    const state = r.getState();
    const expected = [r.next(), r.next(), r.next(), r.next()];

    // A fresh generator restored to that state must reproduce the continuation.
    const restored = new SeededRng();
    restored.setState(state);
    expect([restored.next(), restored.next(), restored.next(), restored.next()]).toEqual(expected);
  });

  it('getState() is null when unseeded', () => {
    const r = new SeededRng();
    expect(r.getState()).toBeNull();
  });

  it('seed(null) returns to unseeded mode', () => {
    const r = new SeededRng();
    r.seed(5);
    expect(r.isSeeded()).toBe(true);
    r.seed(null);
    expect(r.isSeeded()).toBe(false);
  });
});
