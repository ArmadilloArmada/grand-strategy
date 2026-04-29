/**
 * TurnLog tests
 */
import { describe, it, expect } from 'vitest';
import { TurnLog } from '../TurnLog';

describe('TurnLog — log / getEntries', () => {
  it('starts with an empty log', () => {
    const log = new TurnLog();
    expect(log.getEntries()).toHaveLength(0);
  });

  it('log adds an entry with correct fields', () => {
    const log = new TurnLog();
    log.log(1, 'combat', 'alpha', 'Battle at Paris');
    const entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].turn).toBe(1);
    expect(entries[0].phase).toBe('combat');
    expect(entries[0].factionId).toBe('alpha');
    expect(entries[0].summary).toBe('Battle at Paris');
    expect(typeof entries[0].timestamp).toBe('number');
  });

  it('getEntries returns a copy (mutation does not affect internal state)', () => {
    const log = new TurnLog();
    log.log(1, 'combat', 'alpha', 'First');
    const entries = log.getEntries();
    entries.push({ turn: 99, phase: 'x', factionId: 'z', summary: 'fake', timestamp: 0 });
    expect(log.getEntries()).toHaveLength(1);
  });

  it('multiple log calls accumulate in order', () => {
    const log = new TurnLog();
    log.log(1, 'purchase', 'alpha', 'Bought infantry');
    log.log(1, 'combat', 'alpha', 'Attacked Berlin');
    log.log(2, 'purchase', 'beta', 'Bought tanks');
    expect(log.getEntries()).toHaveLength(3);
    expect(log.getEntries()[0].phase).toBe('purchase');
    expect(log.getEntries()[2].factionId).toBe('beta');
  });
});

describe('TurnLog — getEntriesForTurn', () => {
  it('returns only entries for the specified turn', () => {
    const log = new TurnLog();
    log.log(1, 'combat', 'alpha', 'T1 event');
    log.log(2, 'combat', 'alpha', 'T2 event');
    log.log(2, 'income', 'beta', 'T2 income');
    const t1 = log.getEntriesForTurn(1);
    const t2 = log.getEntriesForTurn(2);
    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(2);
  });

  it('returns empty array for a turn with no entries', () => {
    const log = new TurnLog();
    log.log(1, 'combat', 'alpha', 'event');
    expect(log.getEntriesForTurn(99)).toHaveLength(0);
  });
});

describe('TurnLog — clear', () => {
  it('removes all entries', () => {
    const log = new TurnLog();
    log.log(1, 'combat', 'alpha', 'event');
    log.log(2, 'income', 'beta', 'event 2');
    log.clear();
    expect(log.getEntries()).toHaveLength(0);
  });
});

describe('TurnLog — exportText', () => {
  it('returns empty string when log is empty', () => {
    const log = new TurnLog();
    expect(log.exportText()).toBe('');
  });

  it('formats each entry as "Turn N | phase | faction: summary"', () => {
    const log = new TurnLog();
    log.log(3, 'combat', 'alpha', 'Captured London');
    const text = log.exportText();
    expect(text).toBe('Turn 3 | combat | alpha: Captured London');
  });

  it('joins multiple entries with newlines', () => {
    const log = new TurnLog();
    log.log(1, 'purchase', 'alpha', 'A1');
    log.log(1, 'combat', 'beta', 'B1');
    const lines = log.exportText().split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('TurnLog — maxEntries cap', () => {
  it('drops oldest entry when maxEntries is exceeded', () => {
    const log = new TurnLog();
    // Fill to max (500) + 1
    for (let i = 0; i < 501; i++) {
      log.log(i, 'combat', 'alpha', `event ${i}`);
    }
    const entries = log.getEntries();
    expect(entries.length).toBe(500);
    // Oldest (i=0) should have been dropped
    expect(entries[0].turn).toBe(1);
  });
});
