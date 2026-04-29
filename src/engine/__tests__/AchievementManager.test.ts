/**
 * AchievementManager tests
 */
import { describe, it, expect } from 'vitest';
import { AchievementManager, ACHIEVEMENTS } from '../AchievementManager';

// Each test gets a fresh manager with clean localStorage
function makeManager(): AchievementManager {
  localStorage.clear();
  return new AchievementManager();
}

describe('AchievementManager — initialization', () => {
  it('initializes progress for all achievements at zero', () => {
    const am = makeManager();
    for (const a of ACHIEVEMENTS) {
      const p = am.getProgress(a.id);
      expect(p).toBeDefined();
      expect(p!.unlocked).toBe(false);
      expect(p!.currentValue).toBe(0);
    }
  });

  it('getAll returns the full ACHIEVEMENTS array', () => {
    const am = makeManager();
    expect(am.getAll()).toHaveLength(ACHIEVEMENTS.length);
  });

  it('getCompletionPercent is 0 on a fresh manager', () => {
    const am = makeManager();
    expect(am.getCompletionPercent()).toBe(0);
  });
});

describe('AchievementManager — updateProgress unlocks', () => {
  it('unlocks first_blood after destroying 1 unit', () => {
    const am = makeManager();
    am.updateProgress('destroy_units', 1);
    expect(am.getProgress('first_blood')!.unlocked).toBe(true);
  });

  it('does not unlock warrior until 100 units destroyed', () => {
    const am = makeManager();
    am.updateProgress('destroy_units', 99);
    expect(am.getProgress('warrior')!.unlocked).toBe(false);
    am.updateProgress('destroy_units', 1);
    expect(am.getProgress('warrior')!.unlocked).toBe(true);
  });

  it('unlocks win_games achievements at correct thresholds', () => {
    const am = makeManager();
    am.updateProgress('win_games', 1);
    expect(am.getProgress('first_victory')!.unlocked).toBe(true);
    expect(am.getProgress('veteran')!.unlocked).toBe(false);

    am.updateProgress('win_games', 9); // total 10
    expect(am.getProgress('veteran')!.unlocked).toBe(true);
  });

  it('accumulates progress across multiple updateProgress calls', () => {
    const am = makeManager();
    am.updateProgress('destroy_units', 50);
    expect(am.getProgress('warrior')!.currentValue).toBe(50);
    am.updateProgress('destroy_units', 50);
    expect(am.getProgress('warrior')!.unlocked).toBe(true);
  });

  it('speed_victory unlocks blitzkrieg when turns <= 10', () => {
    const am = makeManager();
    am.updateProgress('speed_victory', 1, { turns: 8 });
    expect(am.getProgress('blitzkrieg')!.unlocked).toBe(true);
  });

  it('speed_victory does NOT unlock blitzkrieg when turns > 10', () => {
    const am = makeManager();
    am.updateProgress('speed_victory', 1, { turns: 15 });
    expect(am.getProgress('blitzkrieg')!.unlocked).toBe(false);
  });
});

describe('AchievementManager — getUnlocked / completion', () => {
  it('getUnlocked returns only unlocked achievements', () => {
    const am = makeManager();
    expect(am.getUnlocked()).toHaveLength(0);
    am.updateProgress('win_games', 1);
    const unlocked = am.getUnlocked();
    expect(unlocked.some(a => a.id === 'first_victory')).toBe(true);
  });

  it('getCompletionPercent increases as achievements unlock', () => {
    const am = makeManager();
    am.updateProgress('win_games', 1);
    expect(am.getCompletionPercent()).toBeGreaterThan(0);
  });
});

describe('AchievementManager — listener / callbacks', () => {
  it('fires listener when achievement is unlocked', () => {
    const am = makeManager();
    const received: string[] = [];
    am.onUnlock(a => received.push(a.id));
    am.updateProgress('destroy_units', 1);
    expect(received).toContain('first_blood');
  });

  it('does not fire listener for already-unlocked achievement', () => {
    const am = makeManager();
    am.updateProgress('destroy_units', 1); // unlock first_blood
    const received: string[] = [];
    am.onUnlock(a => received.push(a.id));
    am.updateProgress('destroy_units', 1); // should not re-fire
    expect(received).not.toContain('first_blood');
  });
});

describe('AchievementManager — checkGameEnd', () => {
  it('records win_games progress on game win', () => {
    const am = makeManager();
    am.checkGameEnd(true, { faction: 'player', mapId: 'europe', turns: 20, unitsLost: 5, territoriesOwned: 10, enemyTerritoriesOwned: 5 });
    expect(am.getProgress('first_victory')!.unlocked).toBe(true);
  });

  it('unlocks no_losses when won with zero units lost', () => {
    const am = makeManager();
    am.checkGameEnd(true, { faction: 'player', mapId: 'europe', turns: 5, unitsLost: 0, territoriesOwned: 10, enemyTerritoriesOwned: 5 });
    expect(am.getProgress('perfect_game')!.unlocked).toBe(true);
  });

  it('does not unlock no_losses when units were lost', () => {
    const am = makeManager();
    am.checkGameEnd(true, { faction: 'player', mapId: 'europe', turns: 5, unitsLost: 3, territoriesOwned: 10, enemyTerritoriesOwned: 5 });
    expect(am.getProgress('perfect_game')!.unlocked).toBe(false);
  });

  it('unlocks underdog when fewer territories than enemy', () => {
    const am = makeManager();
    am.checkGameEnd(true, { faction: 'player', mapId: 'europe', turns: 10, unitsLost: 0, territoriesOwned: 3, enemyTerritoriesOwned: 10 });
    expect(am.getProgress('underdog')!.unlocked).toBe(true);
  });

  it('resets win streak on loss', () => {
    const am = makeManager();
    localStorage.setItem('win_streak_current', '4');
    am.checkGameEnd(false, { faction: 'player', mapId: 'europe', turns: 10, unitsLost: 5, territoriesOwned: 5, enemyTerritoriesOwned: 10 });
    expect(localStorage.getItem('win_streak_current')).toBe('0');
  });
});

describe('AchievementManager — reset', () => {
  it('reset clears all progress and unlocks', () => {
    const am = makeManager();
    am.updateProgress('destroy_units', 200);
    am.reset();
    expect(am.getUnlocked()).toHaveLength(0);
    expect(am.getProgress('warrior')!.currentValue).toBe(0);
  });
});
