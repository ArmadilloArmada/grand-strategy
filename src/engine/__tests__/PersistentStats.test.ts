/**
 * PersistentStats tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recordGameEnd, getPersistentStats } from '../PersistentStats';

beforeEach(() => {
  localStorage.clear();
});

describe('getPersistentStats — initial state', () => {
  it('returns zeroed stats on a fresh localStorage', () => {
    const stats = getPersistentStats();
    expect(stats.totalGames).toBe(0);
    expect(stats.totalDurationMinutes).toBe(0);
    expect(stats.byFaction).toEqual({});
  });
});

describe('recordGameEnd — basic counting', () => {
  it('increments totalGames', () => {
    recordGameEnd(['alpha', 'beta'], 'alpha', 10);
    expect(getPersistentStats().totalGames).toBe(1);
    recordGameEnd(['alpha', 'beta'], 'beta', 5);
    expect(getPersistentStats().totalGames).toBe(2);
  });

  it('accumulates totalDurationMinutes', () => {
    recordGameEnd(['alpha', 'beta'], 'alpha', 15);
    recordGameEnd(['alpha', 'beta'], 'beta', 25);
    expect(getPersistentStats().totalDurationMinutes).toBe(40);
  });

  it('increments gamesPlayed for each faction in the game', () => {
    recordGameEnd(['alpha', 'beta', 'gamma'], 'alpha', 10);
    const stats = getPersistentStats();
    expect(stats.byFaction['alpha'].gamesPlayed).toBe(1);
    expect(stats.byFaction['beta'].gamesPlayed).toBe(1);
    expect(stats.byFaction['gamma'].gamesPlayed).toBe(1);
  });

  it('only the winner gets their wins incremented', () => {
    recordGameEnd(['alpha', 'beta'], 'alpha', 10);
    const stats = getPersistentStats();
    expect(stats.byFaction['alpha'].wins).toBe(1);
    expect(stats.byFaction['beta'].wins).toBe(0);
  });

  it('a faction can win multiple games', () => {
    recordGameEnd(['alpha', 'beta'], 'alpha', 10);
    recordGameEnd(['alpha', 'beta'], 'alpha', 10);
    expect(getPersistentStats().byFaction['alpha'].wins).toBe(2);
  });
});

describe('recordGameEnd — persistence', () => {
  it('stats persist across separate getPersistentStats calls', () => {
    recordGameEnd(['alpha'], 'alpha', 5);
    // Second call reads from localStorage
    const stats = getPersistentStats();
    expect(stats.totalGames).toBe(1);
  });

  it('initializes new factions on first encounter', () => {
    recordGameEnd(['newFaction'], 'newFaction', 1);
    const stats = getPersistentStats();
    expect(stats.byFaction['newFaction']).toBeDefined();
    expect(stats.byFaction['newFaction'].gamesPlayed).toBe(1);
  });
});

describe('recordGameEnd — win rate', () => {
  it('win rate can be derived from stored fields', () => {
    recordGameEnd(['alpha', 'beta'], 'alpha', 10);
    recordGameEnd(['alpha', 'beta'], 'alpha', 10);
    recordGameEnd(['alpha', 'beta'], 'beta', 10);
    const stats = getPersistentStats();
    const alphaStats = stats.byFaction['alpha'];
    const winRate = alphaStats.wins / alphaStats.gamesPlayed;
    expect(winRate).toBeCloseTo(2 / 3);
  });
});
