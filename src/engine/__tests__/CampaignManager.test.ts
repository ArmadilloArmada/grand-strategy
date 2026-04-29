/**
 * CampaignManager tests
 */
import { describe, it, expect } from 'vitest';
import { CampaignManager, CAMPAIGNS, CampaignGameState } from '../CampaignManager';

function makeManager(): CampaignManager {
  localStorage.clear();
  return new CampaignManager();
}

/** Minimal CampaignGameState for testing */
function makeGameState(overrides: Partial<CampaignGameState> = {}): CampaignGameState {
  return {
    turnNumber: 1,
    territoriesOwnedBy: (_factionId: string) => [],
    totalUnitsKilled: 0,
    totalUnitsProduced: 0,
    ...overrides,
  };
}

describe('CampaignManager — getCampaigns / getCampaign', () => {
  it('returns all campaigns', () => {
    const cm = makeManager();
    expect(cm.getCampaigns()).toHaveLength(CAMPAIGNS.length);
  });

  it('getCampaign returns the correct campaign by id', () => {
    const cm = makeManager();
    const c = cm.getCampaign('tutorial_campaign');
    expect(c).toBeDefined();
    expect(c!.id).toBe('tutorial_campaign');
  });

  it('getCampaign returns undefined for unknown id', () => {
    const cm = makeManager();
    expect(cm.getCampaign('nonexistent')).toBeUndefined();
  });
});

describe('CampaignManager — unlock checks', () => {
  it('campaigns without unlockCondition are always unlocked', () => {
    const cm = makeManager();
    expect(cm.isCampaignUnlocked('tutorial_campaign')).toBe(true);
    expect(cm.isCampaignUnlocked('europe_campaign')).toBe(true);
  });

  it('campaign with unlockCondition is locked when prerequisite not complete', () => {
    const cm = makeManager();
    // world_campaign requires europe_campaign completion
    expect(cm.isCampaignUnlocked('world_campaign')).toBe(false);
  });
});

describe('CampaignManager — startCampaign', () => {
  it('returns first mission when starting an unlocked campaign', () => {
    const cm = makeManager();
    const mission = cm.startCampaign('tutorial_campaign');
    expect(mission).not.toBeNull();
    expect(mission!.id).toBe('tutorial_1');
  });

  it('returns null when trying to start a locked campaign', () => {
    const cm = makeManager();
    expect(cm.startCampaign('world_campaign')).toBeNull();
  });

  it('creates progress entry on first start', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    const progress = cm.getProgress('tutorial_campaign');
    expect(progress).toBeDefined();
    expect(progress!.completedMissions).toHaveLength(0);
    expect(progress!.currentMissionIndex).toBe(0);
  });

  it('returns the same mission if campaign is re-started without completing', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    const mission = cm.startCampaign('tutorial_campaign');
    expect(mission!.id).toBe('tutorial_1');
  });
});

describe('CampaignManager — completeMission', () => {
  it('advances to the next mission after completion', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    const next = cm.completeMission('tutorial_campaign');
    expect(next).not.toBeNull();
    expect(next!.id).toBe('tutorial_2');
  });

  it('records mission as completed', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    cm.completeMission('tutorial_campaign');
    const progress = cm.getProgress('tutorial_campaign');
    expect(progress!.completedMissions).toContain('tutorial_1');
  });

  it('collects base rewards into bonusesEarned', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    cm.completeMission('tutorial_campaign');
    const progress = cm.getProgress('tutorial_campaign');
    expect(progress!.bonusesEarned.length).toBeGreaterThan(0);
  });

  it('grants bonus IPC reward for each completed bonus objective', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    // tutorial_2 has bonus objective 'bonus1'
    cm.completeMission('tutorial_campaign'); // completes tutorial_1, moves to tutorial_2
    cm.completeMission('tutorial_campaign', ['bonus1']); // completes tutorial_2 with bonus
    const progress = cm.getProgress('tutorial_campaign')!;
    const bonusIpcs = progress.bonusesEarned.filter(r => r.description.startsWith('Bonus:'));
    expect(bonusIpcs.length).toBeGreaterThan(0);
    expect(bonusIpcs[0].value).toBe(10);
  });

  it('marks campaign complete when last mission is finished', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    cm.completeMission('tutorial_campaign'); // mission 1 → 2
    cm.completeMission('tutorial_campaign'); // mission 2 → done
    expect(cm.isCampaignComplete('tutorial_campaign')).toBe(true);
  });

  it('returns null after last mission is completed', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    cm.completeMission('tutorial_campaign');
    const result = cm.completeMission('tutorial_campaign');
    expect(result).toBeNull();
  });
});

describe('CampaignManager — checkObjectives', () => {
  it('capture objective by territory id: met when faction owns it', () => {
    const cm = makeManager();
    const mission = CAMPAIGNS[0].missions[0]; // tutorial_1 capture obj1
    const state = makeGameState({
      territoriesOwnedBy: () => [{ id: 'contested_territory', name: 'Contested' }],
    });
    const results = cm.checkObjectives(mission, state, 'player');
    const captureResult = results.find(r => r.objective.id === 'obj1');
    expect(captureResult!.met).toBe(true);
  });

  it('capture objective by territory id: not met when faction does not own it', () => {
    const cm = makeManager();
    const mission = CAMPAIGNS[0].missions[0];
    const state = makeGameState({ territoriesOwnedBy: () => [] });
    const results = cm.checkObjectives(mission, state, 'player');
    const captureResult = results.find(r => r.objective.id === 'obj1');
    expect(captureResult!.met).toBe(false);
  });

  it('destroy numeric objective: met when destroyed count >= target', () => {
    const cm = makeManager();
    cm.trackUnitsDestroyed(5);
    const mission = CAMPAIGNS[0].missions[0]; // obj2: destroy 1
    const state = makeGameState();
    const results = cm.checkObjectives(mission, state, 'player');
    const destroyResult = results.find(r => r.objective.id === 'obj2');
    expect(destroyResult!.met).toBe(true);
  });

  it('produce objective: met when produced count >= target', () => {
    const cm = makeManager();
    cm.trackUnitsProduced(3);
    const mission = CAMPAIGNS[0].missions[1]; // tutorial_2 obj1: produce 3
    const state = makeGameState();
    const results = cm.checkObjectives(mission, state, 'player');
    const produceResult = results.find(r => r.objective.id === 'obj1');
    expect(produceResult!.met).toBe(true);
  });

  it('survive objective: met when turn >= target', () => {
    const cm = makeManager();
    // europe_3 obj1: survive 5 turns
    const europe3 = CAMPAIGNS[1].missions[2];
    const state = makeGameState({ turnNumber: 5 });
    const results = cm.checkObjectives(europe3, state, 'player');
    const surviveResult = results.find(r => r.objective.id === 'obj1');
    expect(surviveResult!.met).toBe(true);
  });
});

describe('CampaignManager — checkBonusObjectives', () => {
  it('bonus survive objective met when turnNumber <= target', () => {
    const cm = makeManager();
    const mission = CAMPAIGNS[0].missions[1]; // bonus1: win under 5 turns
    const state = makeGameState({ turnNumber: 4 });
    const bonusIds = cm.checkBonusObjectives(mission, state, 'player');
    expect(bonusIds).toContain('bonus1');
  });

  it('bonus survive objective not met when turnNumber > target', () => {
    const cm = makeManager();
    const mission = CAMPAIGNS[0].missions[1];
    const state = makeGameState({ turnNumber: 6 });
    const bonusIds = cm.checkBonusObjectives(mission, state, 'player');
    expect(bonusIds).not.toContain('bonus1');
  });
});

describe('CampaignManager — applyRewards', () => {
  it('calls applyIpcs for IPC rewards', () => {
    const cm = makeManager();
    const rewards = CAMPAIGNS[0].missions[0].rewards; // +10 IPCs
    let applied = 0;
    cm.applyRewards(rewards, (n) => { applied += n; }, () => {});
    expect(applied).toBe(10);
  });

  it('calls applyTech for tech rewards', () => {
    const cm = makeManager();
    const rewards = CAMPAIGNS[0].missions[1].rewards; // includes 'improved_factories'
    const techs: string[] = [];
    cm.applyRewards(rewards, () => {}, (t) => techs.push(t));
    expect(techs).toContain('improved_factories');
  });

  it('returns descriptions for all rewards', () => {
    const cm = makeManager();
    const rewards = CAMPAIGNS[0].missions[0].rewards;
    const descs = cm.applyRewards(rewards, () => {}, () => {});
    expect(descs.length).toBe(rewards.length);
  });
});

describe('CampaignManager — runtime counters', () => {
  it('trackCapture increments capture counter', () => {
    const cm = makeManager();
    cm.trackCapture('territory_a');
    cm.trackCapture('territory_b');
    // Counters are internal but we can verify through checkObjectives
    // using a numeric capture objective
    const europe1 = CAMPAIGNS[1].missions[3]; // europe_4: capture 3 territories
    const state = makeGameState({ territoriesOwnedBy: () => [
      { id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }
    ]});
    const results = cm.checkObjectives(europe1, state, 'player');
    const captureNumResult = results.find(r => r.objective.id === 'obj2');
    expect(captureNumResult!.met).toBe(true);
  });

  it('resetCounters zeroes all runtime counters', () => {
    const cm = makeManager();
    cm.trackUnitsDestroyed(10);
    cm.resetCounters();
    // After reset, destroy objective should not be met
    const mission = CAMPAIGNS[0].missions[0]; // obj2: destroy 1
    const state = makeGameState();
    const results = cm.checkObjectives(mission, state, 'player');
    const destroyResult = results.find(r => r.objective.id === 'obj2');
    expect(destroyResult!.met).toBe(false);
  });
});

describe('CampaignManager — getTotalCompletion', () => {
  it('returns 0 when no missions completed', () => {
    const cm = makeManager();
    expect(cm.getTotalCompletion()).toBe(0);
  });

  it('increases after completing missions', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    cm.completeMission('tutorial_campaign');
    expect(cm.getTotalCompletion()).toBeGreaterThan(0);
  });
});

describe('CampaignManager — resetCampaign / resetAll', () => {
  it('resetCampaign removes progress for a specific campaign', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    cm.resetCampaign('tutorial_campaign');
    expect(cm.getProgress('tutorial_campaign')).toBeUndefined();
  });

  it('resetAll removes all campaign progress', () => {
    const cm = makeManager();
    cm.startCampaign('tutorial_campaign');
    cm.startCampaign('europe_campaign');
    cm.resetAll();
    expect(cm.getProgress('tutorial_campaign')).toBeUndefined();
    expect(cm.getProgress('europe_campaign')).toBeUndefined();
  });
});
