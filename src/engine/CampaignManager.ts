/**
 * CampaignManager - Handles campaign mode with linked scenarios
 * Tracks progress and carries bonuses between missions
 */

export interface CampaignMission {
  id: string;
  name: string;
  description: string;
  mapId: string;
  faction: string;
  difficulty: 'easy' | 'normal' | 'hard';
  objectives: MissionObjective[];
  bonusObjectives?: MissionObjective[];
  rewards: MissionReward[];
  unlockCondition?: string; // ID of mission that must be completed
  briefing: string;
  debriefingWin: string;
  debriefingLoss: string;
}

export interface MissionObjective {
  id: string;
  description: string;
  type: 'capture' | 'defend' | 'destroy' | 'survive' | 'produce' | 'earn';
  target: string | number;
  current?: number;
  completed?: boolean;
}

export interface MissionReward {
  type: 'ipcs' | 'units' | 'tech' | 'bonus';
  value: number | string;
  description: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  icon: string;
  missions: CampaignMission[];
  unlockCondition?: string; // ID of another campaign to complete first
}

export interface CampaignProgress {
  campaignId: string;
  currentMissionIndex: number;
  completedMissions: string[];
  bonusesEarned: MissionReward[];
  startedAt: number;
  completedAt?: number;
}

// Campaign definitions
export const CAMPAIGNS: Campaign[] = [
  {
    id: 'tutorial_campaign',
    name: 'Basic Training',
    description: 'Learn the fundamentals of Grand Strategy',
    icon: '📚',
    missions: [
      {
        id: 'tutorial_1',
        name: 'First Steps',
        description: 'Learn basic movement and combat',
        mapId: 'tutorial',
        faction: 'atlantic_alliance',
        difficulty: 'easy',
        objectives: [
          { id: 'obj1', description: 'Capture the Contested Territory', type: 'capture', target: 'contested_territory' },
          { id: 'obj2', description: 'Win a battle', type: 'destroy', target: 1 },
        ],
        rewards: [
          { type: 'ipcs', value: 10, description: '+10 IPCs for next mission' },
        ],
        briefing: 'Welcome, Commander! This is your first mission. Learn to move your troops and engage the enemy.',
        debriefingWin: 'Excellent work! You\'ve mastered the basics. Ready for more challenges?',
        debriefingLoss: 'Don\'t give up! Review the tutorial and try again.',
      },
      {
        id: 'tutorial_2',
        name: 'Building an Army',
        description: 'Learn to produce units and manage economy',
        mapId: 'tutorial',
        faction: 'atlantic_alliance',
        difficulty: 'easy',
        objectives: [
          { id: 'obj1', description: 'Produce 3 infantry units', type: 'produce', target: 3 },
          { id: 'obj2', description: 'Capture the enemy capital', type: 'capture', target: 'enemy_capital' },
        ],
        bonusObjectives: [
          { id: 'bonus1', description: 'Win in under 5 turns', type: 'survive', target: 5 },
        ],
        rewards: [
          { type: 'ipcs', value: 15, description: '+15 IPCs for next mission' },
          { type: 'tech', value: 'improved_factories', description: 'Unlock Improved Factories technology' },
        ],
        unlockCondition: 'tutorial_1',
        briefing: 'Time to build your war machine! Produce units and crush the enemy.',
        debriefingWin: 'Your economy skills are impressive. Onward to greater battles!',
        debriefingLoss: 'Resource management is key. Try balancing production and combat.',
      },
    ],
  },
  {
    id: 'europe_campaign',
    name: 'European Liberation',
    description: 'Liberate Europe from Axis control in this 5-mission campaign',
    icon: '🇪🇺',
    missions: [
      {
        id: 'europe_1',
        name: 'D-Day',
        description: 'Establish a beachhead on the coast of France',
        mapId: 'grid-europe',
        faction: 'atlantic_alliance',
        difficulty: 'normal',
        objectives: [
          { id: 'obj1', description: 'Capture Northern France (Normandy)', type: 'capture', target: 'france_n' },
          { id: 'obj2', description: 'Hold Northern France for 3 turns', type: 'defend', target: 'france_n' },
        ],
        bonusObjectives: [
          { id: 'bonus1', description: 'Capture with minimal losses (under 5 units)', type: 'destroy', target: 5 },
        ],
        rewards: [
          { type: 'units', value: 'tank:2', description: '2 Tank reinforcements' },
          { type: 'ipcs', value: 20, description: '+20 IPCs' },
        ],
        briefing: 'The fate of Europe hangs in the balance. Our forces must establish a foothold on the continent. The beaches are heavily defended - expect fierce resistance.',
        debriefingWin: 'The beachhead is secure! The liberation of Europe has begun.',
        debriefingLoss: 'The invasion has failed. We must regroup and try again.',
      },
      {
        id: 'europe_2',
        name: 'March to Paris',
        description: 'Push inland and liberate Paris',
        mapId: 'grid-europe',
        faction: 'atlantic_alliance',
        difficulty: 'normal',
        objectives: [
          { id: 'obj1', description: 'Capture Central France (Paris)', type: 'capture', target: 'france_c' },
          { id: 'obj2', description: 'Destroy 10 enemy units', type: 'destroy', target: 10 },
        ],
        rewards: [
          { type: 'tech', value: 'heavy_tanks', description: 'Unlock Heavy Tanks' },
          { type: 'ipcs', value: 30, description: '+30 IPCs' },
        ],
        unlockCondition: 'europe_1',
        briefing: 'With the beachhead secured, it\'s time to push inland. Paris awaits liberation!',
        debriefingWin: 'Paris is free! The people celebrate as our tanks roll through the streets.',
        debriefingLoss: 'Our advance has stalled. The enemy counterattack was devastating.',
      },
      {
        id: 'europe_3',
        name: 'Battle of the Bulge',
        description: 'Survive the German counteroffensive',
        mapId: 'grid-europe',
        faction: 'atlantic_alliance',
        difficulty: 'hard',
        objectives: [
          { id: 'obj1', description: 'Defend all key positions for 5 turns', type: 'survive', target: 5 },
          { id: 'obj2', description: 'Do not lose Central France (Paris)', type: 'defend', target: 'france_c' },
        ],
        bonusObjectives: [
          { id: 'bonus1', description: 'Counterattack and capture 2 enemy territories', type: 'capture', target: 2 },
        ],
        rewards: [
          { type: 'units', value: 'infantry:5,tank:2', description: 'Major reinforcements' },
          { type: 'bonus', value: 'morale', description: 'Morale boost: +10% combat strength' },
        ],
        unlockCondition: 'europe_2',
        briefing: 'The enemy has launched a massive counteroffensive! Hold the line at all costs!',
        debriefingWin: 'We\'ve weathered the storm. The enemy\'s last gamble has failed.',
        debriefingLoss: 'Our lines have been broken. This is a significant setback.',
      },
      {
        id: 'europe_4',
        name: 'Crossing the Rhine',
        description: 'Cross into Germany and push towards Berlin',
        mapId: 'grid-europe',
        faction: 'atlantic_alliance',
        difficulty: 'hard',
        objectives: [
          { id: 'obj1', description: 'Cross the Rhine into Northern Germany', type: 'capture', target: 'germany_n' },
          { id: 'obj2', description: 'Establish 3 territories in Germany', type: 'capture', target: 3 },
        ],
        rewards: [
          { type: 'units', value: 'fighter:2,bomber:1', description: 'Air support' },
          { type: 'ipcs', value: 50, description: '+50 IPCs' },
        ],
        unlockCondition: 'europe_3',
        briefing: 'The final push begins. Cross the Rhine and strike at the heart of the enemy!',
        debriefingWin: 'We\'re in Germany! Berlin is within reach.',
        debriefingLoss: 'The river crossing was too costly. We need to try a different approach.',
      },
      {
        id: 'europe_5',
        name: 'Fall of Berlin',
        description: 'Capture Berlin and end the war in Europe',
        mapId: 'grid-europe',
        faction: 'atlantic_alliance',
        difficulty: 'hard',
        objectives: [
          { id: 'obj1', description: 'Capture Northern Germany (Berlin)', type: 'capture', target: 'germany_n' },
          { id: 'obj2', description: 'Eliminate all enemy forces', type: 'destroy', target: 'all' },
        ],
        bonusObjectives: [
          { id: 'bonus1', description: 'Complete in under 10 turns', type: 'survive', target: 10 },
        ],
        rewards: [
          { type: 'bonus', value: 'victory_europe', description: 'European Campaign Victory!' },
        ],
        unlockCondition: 'europe_4',
        briefing: 'This is it, Commander. Take Berlin and end this war!',
        debriefingWin: 'Victory in Europe! The war is over. You are a true hero.',
        debriefingLoss: 'So close, yet so far. The enemy made their final stand.',
      },
    ],
  },
  {
    id: 'pacific_campaign',
    name: 'Pacific Storm',
    description: 'Island-hop across the Pacific to victory',
    icon: '🌊',
    missions: [
      {
        id: 'pacific_1',
        name: 'Midway',
        description: 'Defend Midway Island from the enemy fleet',
        mapId: 'grid-pacific',
        faction: 'atlantic_alliance',
        difficulty: 'normal',
        objectives: [
          { id: 'obj1', description: 'Sink 3 enemy carriers', type: 'destroy', target: 3 },
          { id: 'obj2', description: 'Defend Midway Islands for 4 turns', type: 'defend', target: 'pac_mid' },
        ],
        rewards: [
          { type: 'units', value: 'carrier:1,fighter:2', description: 'Naval reinforcements' },
        ],
        briefing: 'Intelligence reports a massive enemy fleet heading for Midway. This could be the turning point of the war.',
        debriefingWin: 'A decisive victory! The enemy fleet is crippled.',
        debriefingLoss: 'Midway has fallen. This is a devastating blow.',
      },
      {
        id: 'pacific_2',
        name: 'Guadalcanal',
        description: 'Secure the island of Guadalcanal',
        mapId: 'grid-pacific',
        faction: 'atlantic_alliance',
        difficulty: 'normal',
        objectives: [
          { id: 'obj1', description: 'Capture Solomon Islands (Guadalcanal)', type: 'capture', target: 'solomon_is' },
          { id: 'obj2', description: 'Build an airfield', type: 'produce', target: 1 },
        ],
        rewards: [
          { type: 'ipcs', value: 25, description: '+25 IPCs' },
          { type: 'tech', value: 'naval_aviation', description: 'Improved carrier aircraft' },
        ],
        unlockCondition: 'pacific_1',
        briefing: 'We need a forward base. Guadalcanal will serve as our stepping stone across the Pacific.',
        debriefingWin: 'Guadalcanal is ours! The road to Tokyo is open.',
        debriefingLoss: 'The jungle fighting was too intense. We\'ll need more troops.',
      },
      {
        id: 'pacific_3',
        name: 'Iwo Jima',
        description: 'Storm the beaches of Iwo Jima',
        mapId: 'grid-pacific',
        faction: 'atlantic_alliance',
        difficulty: 'hard',
        objectives: [
          { id: 'obj1', description: 'Capture Okinawa', type: 'capture', target: 'okinawa' },
          { id: 'obj2', description: 'Eliminate all defenders', type: 'destroy', target: 'all' },
        ],
        rewards: [
          { type: 'units', value: 'bomber:3', description: 'Strategic bomber wing' },
        ],
        unlockCondition: 'pacific_2',
        briefing: 'Iwo Jima is heavily fortified. Expect high casualties, but we need this island.',
        debriefingWin: 'The flag flies over Suribachi! A costly but crucial victory.',
        debriefingLoss: 'The defenders were too well entrenched. We\'ll need a new strategy.',
      },
      {
        id: 'pacific_4',
        name: 'Operation Downfall',
        description: 'Launch the final assault on the Japanese homeland',
        mapId: 'grid-pacific',
        faction: 'atlantic_alliance',
        difficulty: 'hard',
        objectives: [
          { id: 'obj1', description: 'Capture Southern Honshu (Tokyo)', type: 'capture', target: 'honshu_s' },
          { id: 'obj2', description: 'Force unconditional surrender', type: 'destroy', target: 'all' },
        ],
        bonusObjectives: [
          { id: 'bonus1', description: 'Complete campaign with under 50 total unit losses', type: 'destroy', target: 50 },
        ],
        rewards: [
          { type: 'bonus', value: 'victory_pacific', description: 'Pacific Campaign Victory!' },
        ],
        unlockCondition: 'pacific_3',
        briefing: 'The final battle. Take the enemy capital and end this war once and for all.',
        debriefingWin: 'Victory in the Pacific! The long war is finally over.',
        debriefingLoss: 'The homeland defense was too strong. The war continues...',
      },
    ],
  },
  {
    id: 'world_campaign',
    name: 'World at War',
    description: 'The ultimate challenge - fight across every theater',
    icon: '🌐',
    unlockCondition: 'europe_campaign',
    missions: [
      {
        id: 'world_1',
        name: 'Global Mobilization',
        description: 'Prepare your forces for world war',
        mapId: 'grid',
        faction: 'atlantic_alliance',
        difficulty: 'hard',
        objectives: [
          { id: 'obj1', description: 'Produce 20 units', type: 'produce', target: 20 },
          { id: 'obj2', description: 'Control 5 factory territories', type: 'capture', target: 5 },
        ],
        rewards: [
          { type: 'ipcs', value: 100, description: 'War bonds: +100 IPCs' },
        ],
        briefing: 'The world is at war. Build your forces and prepare for the greatest conflict in history.',
        debriefingWin: 'Our war machine is ready. Time to take the fight to the enemy.',
        debriefingLoss: 'We\'re not ready for total war. Build more factories.',
      },
      {
        id: 'world_2',
        name: 'Total Victory',
        description: 'Achieve complete world domination',
        mapId: 'grid',
        faction: 'atlantic_alliance',
        difficulty: 'hard',
        objectives: [
          { id: 'obj1', description: 'Capture all enemy capitals', type: 'capture', target: 'all_capitals' },
          { id: 'obj2', description: 'Destroy all enemy forces', type: 'destroy', target: 'all' },
        ],
        rewards: [
          { type: 'bonus', value: 'victory_world', description: 'World Campaign Victory! You are the Supreme Commander!' },
        ],
        unlockCondition: 'world_1',
        briefing: 'This is the final campaign. Conquer the world and establish lasting peace.',
        debriefingWin: 'TOTAL VICTORY! You have united the world under your banner. History will remember you forever.',
        debriefingLoss: 'The world remains divided. Perhaps next time...',
      },
    ],
  },
];

/** Minimal game state interface for objective checking */
export interface CampaignGameState {
  turnNumber: number;
  territoriesOwnedBy(factionId: string): { id: string; name: string }[];
  totalUnitsKilled: number;
  totalUnitsProduced: number;
}

export class CampaignManager {
  private progress: Map<string, CampaignProgress> = new Map();
  private storageKey = 'grand_strategy_campaigns';
  /** Track the currently active campaign/mission for in-game display */
  activeCampaignId: string | null = null;
  activeMissionId: string | null = null;
  /** Runtime objective progress counters (reset per mission) */
  private runtimeCounters: Map<string, number> = new Map();
  
  constructor() {
    this.load();
  }
  
  /** Call when a territory is captured during a campaign mission */
  trackCapture(_territoryId: string): void {
    const count = this.runtimeCounters.get('captures') ?? 0;
    this.runtimeCounters.set('captures', count + 1);
  }

  /** Call when units are destroyed during a campaign mission */
  trackUnitsDestroyed(count: number): void {
    const cur = this.runtimeCounters.get('destroyed') ?? 0;
    this.runtimeCounters.set('destroyed', cur + count);
  }

  /** Call when units are produced during a campaign mission */
  trackUnitsProduced(count: number): void {
    const cur = this.runtimeCounters.get('produced') ?? 0;
    this.runtimeCounters.set('produced', cur + count);
  }

  /** Reset runtime counters at mission start */
  resetCounters(): void {
    this.runtimeCounters.clear();
  }

  /** Check which objectives are currently met */
  checkObjectives(
    mission: CampaignMission,
    state: CampaignGameState,
    humanFactionId: string
  ): { objective: MissionObjective; met: boolean; progress: string }[] {
    return mission.objectives.map(obj => {
      let met = false;
      let progress = '';

      if (obj.type === 'capture') {
        const owned = state.territoriesOwnedBy(humanFactionId);
        if (typeof obj.target === 'number') {
          const count = owned.length;
          met = count >= obj.target;
          progress = `${Math.min(count, obj.target)}/${obj.target}`;
        } else {
          met = owned.some(t => t.id === obj.target);
          progress = met ? 'Done' : 'Pending';
        }
      } else if (obj.type === 'destroy') {
        if (typeof obj.target === 'number') {
          const cur = this.runtimeCounters.get('destroyed') ?? 0;
          met = cur >= obj.target;
          progress = `${Math.min(cur, obj.target)}/${obj.target}`;
        } else {
          met = false;
          progress = 'Pending';
        }
      } else if (obj.type === 'produce') {
        const cur = this.runtimeCounters.get('produced') ?? 0;
        const target = typeof obj.target === 'number' ? obj.target : 1;
        met = cur >= target;
        progress = `${Math.min(cur, target)}/${target}`;
      } else if (obj.type === 'survive') {
        const target = typeof obj.target === 'number' ? obj.target : 0;
        met = state.turnNumber >= target;
        progress = `Turn ${state.turnNumber}/${target}`;
      } else if (obj.type === 'defend') {
        const owned = state.territoriesOwnedBy(humanFactionId);
        if (typeof obj.target === 'string') {
          met = owned.some(t => t.id === obj.target);
          progress = met ? '✓ Held' : '✗ Lost';
        } else {
          met = false;
          progress = 'Pending';
        }
      } else if (obj.type === 'earn') {
        met = false;
        progress = 'Pending';
      }

      return { objective: obj, met, progress };
    });
  }

  /** Check bonus objectives completion.
   * Bonus "survive" objectives mean "complete within X turns", so the check
   * is turnNumber <= target (the opposite of a main survive objective).
   */
  checkBonusObjectives(
    mission: CampaignMission,
    state: CampaignGameState,
    humanFactionId: string
  ): string[] {
    if (!mission.bonusObjectives) return [];
    return mission.bonusObjectives.map(obj => {
      // For bonus survive: "win in under X turns" → check turnNumber <= target
      if (obj.type === 'survive') {
        const target = typeof obj.target === 'number' ? obj.target : 0;
        const met = state.turnNumber <= target;
        return { objective: obj, met };
      }
      // All other types use the standard check logic
      const results = this.checkObjectives({ ...mission, objectives: [obj] }, state, humanFactionId);
      return results[0] ?? { objective: obj, met: false };
    })
      .filter(r => r.met)
      .map(r => r.objective.id);
  }

  /** Apply rewards from a mission to a faction (returns description of what was applied) */
  applyRewards(rewards: MissionReward[], applyIpcs: (amount: number) => void, applyTech: (techId: string) => void): string[] {
    return rewards.map(reward => {
      if (reward.type === 'ipcs' && typeof reward.value === 'number') {
        applyIpcs(reward.value);
      } else if (reward.type === 'tech' && typeof reward.value === 'string') {
        applyTech(reward.value);
      }
      return reward.description;
    });
  }

  private load(): void {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const data = JSON.parse(saved) as CampaignProgress[];
        for (const p of data) {
          this.progress.set(p.campaignId, p);
        }
      }
    } catch (e) {
      console.error('Failed to load campaign progress:', e);
    }
  }
  
  private save(): void {
    try {
      const data = Array.from(this.progress.values());
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save campaign progress:', e);
    }
  }
  
  /**
   * Get all campaigns
   */
  getCampaigns(): Campaign[] {
    return CAMPAIGNS;
  }
  
  /**
   * Get campaign by ID
   */
  getCampaign(id: string): Campaign | undefined {
    return CAMPAIGNS.find(c => c.id === id);
  }
  
  /**
   * Check if a campaign is unlocked
   */
  isCampaignUnlocked(campaignId: string): boolean {
    const campaign = this.getCampaign(campaignId);
    if (!campaign) return false;
    if (!campaign.unlockCondition) return true;
    
    const requiredProgress = this.progress.get(campaign.unlockCondition);
    return requiredProgress?.completedAt !== undefined;
  }
  
  /**
   * Get campaign progress
   */
  getProgress(campaignId: string): CampaignProgress | undefined {
    return this.progress.get(campaignId);
  }
  
  /**
   * Start a campaign
   */
  startCampaign(campaignId: string): CampaignMission | null {
    const campaign = this.getCampaign(campaignId);
    if (!campaign || !this.isCampaignUnlocked(campaignId)) return null;
    
    let progress = this.progress.get(campaignId);
    if (!progress) {
      progress = {
        campaignId,
        currentMissionIndex: 0,
        completedMissions: [],
        bonusesEarned: [],
        startedAt: Date.now(),
      };
      this.progress.set(campaignId, progress);
      this.save();
    }
    
    return campaign.missions[progress.currentMissionIndex] || null;
  }
  
  /**
   * Complete current mission
   */
  completeMission(campaignId: string, bonusObjectivesCompleted: string[] = []): CampaignMission | null {
    const campaign = this.getCampaign(campaignId);
    const progress = this.progress.get(campaignId);
    if (!campaign || !progress) return null;
    
    const currentMission = campaign.missions[progress.currentMissionIndex];
    if (!currentMission) return null;
    
    // Mark mission complete
    progress.completedMissions.push(currentMission.id);
    
    // Collect rewards
    progress.bonusesEarned.push(...currentMission.rewards);
    
    // Check bonus objectives — each completed one grants a +10 IPC bonus
    if (currentMission.bonusObjectives) {
      for (const bonus of currentMission.bonusObjectives) {
        if (bonusObjectivesCompleted.includes(bonus.id)) {
          progress.bonusesEarned.push({
            type: 'ipcs',
            value: 10,
            description: `Bonus: ${bonus.description}`,
          });
        }
      }
    }
    
    // Move to next mission
    progress.currentMissionIndex++;
    
    // Check if campaign complete
    if (progress.currentMissionIndex >= campaign.missions.length) {
      progress.completedAt = Date.now();
    }
    
    this.save();
    
    // Return next mission or null if complete
    return campaign.missions[progress.currentMissionIndex] || null;
  }
  
  /**
   * Get current mission for a campaign
   */
  getCurrentMission(campaignId: string): CampaignMission | null {
    const campaign = this.getCampaign(campaignId);
    const progress = this.progress.get(campaignId);
    if (!campaign || !progress) return null;
    
    return campaign.missions[progress.currentMissionIndex] || null;
  }
  
  /**
   * Check if campaign is complete
   */
  isCampaignComplete(campaignId: string): boolean {
    const progress = this.progress.get(campaignId);
    return progress?.completedAt !== undefined;
  }
  
  /**
   * Get total campaign completion percentage
   */
  getTotalCompletion(): number {
    const totalMissions = CAMPAIGNS.reduce((sum, c) => sum + c.missions.length, 0);
    let completedMissions = 0;
    
    for (const progress of this.progress.values()) {
      completedMissions += progress.completedMissions.length;
    }
    
    return Math.round((completedMissions / totalMissions) * 100);
  }
  
  /**
   * Reset campaign progress
   */
  resetCampaign(campaignId: string): void {
    this.progress.delete(campaignId);
    this.save();
  }
  
  /**
   * Reset all campaigns
   */
  resetAll(): void {
    this.progress.clear();
    localStorage.removeItem(this.storageKey);
  }
}

// Singleton instance
export const campaignManager = new CampaignManager();
