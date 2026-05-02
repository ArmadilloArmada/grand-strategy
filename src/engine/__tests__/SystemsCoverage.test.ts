/**
 * Tests for previously untested engine systems:
 * MoraleSystem, NuclearSystem, EspionageSystem, CampaignManager, EventsSystem, SaveManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MoraleSystem } from '../MoraleSystem';
import { NuclearSystem } from '../NuclearSystem';
import { EspionageSystem } from '../EspionageSystem';
import { CampaignManager, CAMPAIGNS } from '../CampaignManager';
import { EventsSystem } from '../EventsSystem';
import { SaveManager } from '../../ui/SaveManager';
import { buildCombatState } from './testHelpers';

// ─────────────────────────────────────────────────────────────────────────────
// MoraleSystem
// ─────────────────────────────────────────────────────────────────────────────

describe('MoraleSystem', () => {
  it('increases war weariness when at war', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.warWeariness = 0;
    faction.morale = 100;

    // Both factions default to war (no pact set)
    morale.tickAll();
    expect(faction.warWeariness).toBeGreaterThan(0);
    expect(faction.morale).toBeLessThan(100);
  });

  it('recovers weariness when at peace', () => {
    const { state, attackerFactionId, defenderFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.warWeariness = 20;
    faction.morale = 80;

    // Set pact so both factions are at peace
    state.diplomacyManager.proposePact(attackerFactionId, defenderFactionId, 10);
    state.diplomacyManager.acceptProposal(attackerFactionId, defenderFactionId, 'pact');

    morale.tickAll();
    expect(faction.warWeariness).toBeLessThan(20);
  });

  it('getCombatModifier returns 1 for high morale', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    state.factionRegistry.get(attackerFactionId)!.morale = 100;
    expect(morale.getCombatModifier(attackerFactionId)).toBe(1);
  });

  it('getCombatModifier returns -1 for low morale (35-49)', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    state.factionRegistry.get(attackerFactionId)!.morale = 40;
    expect(morale.getCombatModifier(attackerFactionId)).toBe(-1);
  });

  it('getCombatModifier returns -2 for very low morale (20-34)', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    state.factionRegistry.get(attackerFactionId)!.morale = 30;
    expect(morale.getCombatModifier(attackerFactionId)).toBe(-2);
  });

  it('getCombatModifier returns -3 for collapse morale', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    state.factionRegistry.get(attackerFactionId)!.morale = 10;
    expect(morale.getCombatModifier(attackerFactionId)).toBe(-3);
  });

  it('getIncomeModifier scales between 0.7 and 1.0', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);
    const faction = state.factionRegistry.get(attackerFactionId)!;

    faction.morale = 100;
    expect(morale.getIncomeModifier(attackerFactionId)).toBeCloseTo(1.0);

    faction.morale = 0;
    expect(morale.getIncomeModifier(attackerFactionId)).toBeCloseTo(0.7);
  });

  it('recordCasualties increases weariness', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.warWeariness = 10;
    morale.recordCasualties(attackerFactionId, 10);
    expect(faction.warWeariness).toBeGreaterThan(10);
  });

  it('serialize and restore round-trips correctly', () => {
    const { state, attackerFactionId } = buildCombatState();
    const morale = new MoraleSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.warWeariness = 42;
    faction.morale = 58;

    const data = morale.serialize();
    faction.warWeariness = 0;
    faction.morale = 100;

    morale.restore(data);
    expect(faction.warWeariness).toBe(42);
    expect(faction.morale).toBe(58);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NuclearSystem
// ─────────────────────────────────────────────────────────────────────────────

describe('NuclearSystem', () => {
  it('canLaunch returns false when readiness < 100', () => {
    const { state, attackerFactionId } = buildCombatState();
    const nuclear = new NuclearSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.nuclearReadiness = 80;
    // No techManager — canLaunch must return false
    expect(nuclear.canLaunch(attackerFactionId)).toBe(false);
  });

  it('canLaunch returns false when faction is defeated', () => {
    const { state, attackerFactionId } = buildCombatState();
    const nuclear = new NuclearSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.nuclearReadiness = 100;
    faction.isDefeated = true;
    expect(nuclear.canLaunch(attackerFactionId)).toBe(false);
  });

  it('launchStrike returns null when canLaunch is false', () => {
    const { state, attackerFactionId } = buildCombatState();
    const nuclear = new NuclearSystem(state);

    // readiness not full → canLaunch false
    state.factionRegistry.get(attackerFactionId)!.nuclearReadiness = 50;
    const result = nuclear.launchStrike(attackerFactionId, 'target');
    expect(result).toBeNull();
  });

  it('launchStrike destroys ~80% of units and bombs factory', () => {
    const { state, attackerFactionId } = buildCombatState();
    const nuclear = new NuclearSystem(state);

    // Manually wire a minimal techManager so canLaunch passes
    state.systems.technologyManager = {
      hasTech: (_fid: string, _tech: string) => true,
      getTechEffect: () => ({}),
    } as any;

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.nuclearReadiness = 100;

    // Give target 10 infantry
    const target = state.territories.get('target')!;
    target.units = [{ unitTypeId: 'infantry', count: 10 }];
    (target as any).hasFactory = true;

    const result = nuclear.launchStrike(attackerFactionId, 'target');
    expect(result).not.toBeNull();
    expect(result!.unitsDestroyed).toBe(8); // 80% of 10
    expect(target.units[0].count).toBe(2);  // 20% survive
    expect(target.bombedUntilTurn).toBeGreaterThan(0);
    expect(faction.nuclearReadiness).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EspionageSystem
// ─────────────────────────────────────────────────────────────────────────────

describe('EspionageSystem', () => {
  it('returns failure when initiator has insufficient IPCs', () => {
    const { state, attackerFactionId, defenderFactionId } = buildCombatState();
    const espionage = new EspionageSystem(state);

    state.factionRegistry.get(attackerFactionId)!.ipcs = 0;
    const result = espionage.executeOperation(attackerFactionId, defenderFactionId, 'steal_intel');
    expect(result.success).toBe(false);
    expect(result.detail).toMatch(/Insufficient/i);
  });

  it('deducts IPC cost on execution', () => {
    const { state, attackerFactionId, defenderFactionId } = buildCombatState();
    const espionage = new EspionageSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.ipcs = 50;
    // Always succeed by mocking Math.random
    vi.spyOn(Math, 'random').mockReturnValue(0); // 0 < 0.70 → success
    espionage.executeOperation(attackerFactionId, defenderFactionId, 'steal_intel');
    // steal_intel costs 5
    expect(faction.ipcs).toBe(45);
    vi.restoreAllMocks();
  });

  it('forced war on exposure', () => {
    const { state, attackerFactionId, defenderFactionId } = buildCombatState();
    const espionage = new EspionageSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.ipcs = 50;

    // Force fail (random >= successChance) AND expose (second random < 0.15)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)  // op fails
      .mockReturnValueOnce(0.01); // exposed

    // Set a pact so relation starts as something other than war
    state.diplomacyManager.proposePact(attackerFactionId, defenderFactionId, 5);
    state.diplomacyManager.acceptProposal(attackerFactionId, defenderFactionId, 'pact');
    expect(state.diplomacyManager.getRelation(attackerFactionId, defenderFactionId)).toBe('pact');

    espionage.executeOperation(attackerFactionId, defenderFactionId, 'steal_intel');
    // After exposure, must be at war
    expect(state.diplomacyManager.getRelation(attackerFactionId, defenderFactionId)).toBe('war');
    vi.restoreAllMocks();
  });

  it('isIntelRevealed returns true after steal_intel succeeds', () => {
    const { state, attackerFactionId, defenderFactionId } = buildCombatState();
    const espionage = new EspionageSystem(state);

    state.factionRegistry.get(attackerFactionId)!.ipcs = 50;
    vi.spyOn(Math, 'random').mockReturnValue(0); // always succeed
    espionage.executeOperation(attackerFactionId, defenderFactionId, 'steal_intel');

    const defenderTerritory = state.territories.get('target')!;
    expect(espionage.isIntelRevealed(defenderTerritory.id)).toBe(true);
    vi.restoreAllMocks();
  });

  it('sabotage bombs an enemy factory', () => {
    const { state, attackerFactionId, defenderFactionId } = buildCombatState();
    const espionage = new EspionageSystem(state);

    state.factionRegistry.get(attackerFactionId)!.ipcs = 50;
    vi.spyOn(Math, 'random').mockReturnValue(0); // always succeed
    espionage.executeOperation(attackerFactionId, defenderFactionId, 'sabotage');

    const target = state.territories.get('target')!;
    expect(target.bombedUntilTurn).toBeGreaterThan(state.turnNumber);
    vi.restoreAllMocks();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CampaignManager
// ─────────────────────────────────────────────────────────────────────────────

describe('CampaignManager', () => {
  let manager: CampaignManager;

  beforeEach(() => {
    // Use a fresh manager — avoid hitting real localStorage
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    manager = new CampaignManager();
  });

  it('checkObjectives: capture type by ID met when faction owns territory', () => {
    const mission = CAMPAIGNS[0].missions[0]; // tutorial_1
    const state = {
      turnNumber: 1,
      territoriesOwnedBy: (_fid: string) => [{ id: 'contested_territory', name: 'CT' }],
      totalUnitsKilled: 0,
      totalUnitsProduced: 0,
    };
    const results = manager.checkObjectives(mission, state, 'atlantic_alliance');
    const obj = results.find(r => r.objective.id === 'obj1');
    expect(obj?.met).toBe(true);
  });

  it('checkObjectives: survive type met when turnNumber >= target', () => {
    const mission = CAMPAIGNS[1].missions[2]; // europe_3: survive 5 turns
    const state = {
      turnNumber: 5,
      territoriesOwnedBy: () => [{ id: 'france_c', name: 'Paris' }],
      totalUnitsKilled: 0,
      totalUnitsProduced: 0,
    };
    const results = manager.checkObjectives(mission, state, 'atlantic_alliance');
    const obj = results.find(r => r.objective.id === 'obj1'); // 'survive' obj
    expect(obj?.met).toBe(true);
  });

  it('checkObjectives: survive type NOT met when turnNumber < target', () => {
    const mission = CAMPAIGNS[1].missions[2]; // survive 5
    const state = {
      turnNumber: 3,
      territoriesOwnedBy: () => [{ id: 'france_c', name: 'Paris' }],
      totalUnitsKilled: 0,
      totalUnitsProduced: 0,
    };
    const results = manager.checkObjectives(mission, state, 'atlantic_alliance');
    const obj = results.find(r => r.objective.id === 'obj1');
    expect(obj?.met).toBe(false);
  });

  it('checkBonusObjectives: "win in under X turns" met when turnNumber <= target', () => {
    const mission = CAMPAIGNS[0].missions[1]; // tutorial_2: bonus "win in under 5 turns"
    const state = {
      turnNumber: 3,
      territoriesOwnedBy: () => [],
      totalUnitsKilled: 0,
      totalUnitsProduced: 0,
    };
    const completed = manager.checkBonusObjectives(mission, state, 'atlantic_alliance');
    expect(completed).toContain('bonus1');
  });

  it('checkBonusObjectives: "win in under X turns" NOT met when turnNumber > target', () => {
    const mission = CAMPAIGNS[0].missions[1];
    const state = {
      turnNumber: 7, // > 5
      territoriesOwnedBy: () => [],
      totalUnitsKilled: 0,
      totalUnitsProduced: 0,
    };
    const completed = manager.checkBonusObjectives(mission, state, 'atlantic_alliance');
    expect(completed).not.toContain('bonus1');
  });

  it('completeMission advances mission index and stores bonus rewards', () => {
    manager.startCampaign('tutorial_campaign');
    const next = manager.completeMission('tutorial_campaign', ['bonus1']);
    // Next mission should be tutorial_2
    expect(next?.id).toBe('tutorial_2');

    const progress = manager.getProgress('tutorial_campaign')!;
    expect(progress.completedMissions).toContain('tutorial_1');
    // bonus reward: +10 IPCs for bonus1
    expect(progress.bonusesEarned.some(r => r.type === 'ipcs' && r.value === 10)).toBe(true);
  });

  it('isCampaignComplete returns true after all missions done', () => {
    manager.startCampaign('tutorial_campaign');
    manager.completeMission('tutorial_campaign');
    manager.completeMission('tutorial_campaign');
    expect(manager.isCampaignComplete('tutorial_campaign')).toBe(true);
  });

  it('trackUnitsDestroyed and trackUnitsProduced update counters', () => {
    manager.resetCounters();
    manager.trackUnitsDestroyed(5);
    manager.trackUnitsProduced(3);
    // Verify via checkObjectives
    const mission = CAMPAIGNS[0].missions[0];
    const modifiedMission = {
      ...mission,
      objectives: [
        { id: 'x', description: 'Destroy 5', type: 'destroy' as const, target: 5 },
      ],
    };
    const state = { turnNumber: 1, territoriesOwnedBy: () => [], totalUnitsKilled: 0, totalUnitsProduced: 0 };
    const results = manager.checkObjectives(modifiedMission, state, 'atlantic_alliance');
    expect(results[0].met).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EventsSystem
// ─────────────────────────────────────────────────────────────────────────────

describe('EventsSystem', () => {
  it('rollForEvent returns null for a defeated faction', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    state.factionRegistry.get(attackerFactionId)!.isDefeated = true;
    // Always roll "event fires" (random < 0.30)
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(events.rollForEvent(attackerFactionId)).toBeNull();
    vi.restoreAllMocks();
  });

  it('rollForEvent returns null when random roll is above event chance', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    vi.spyOn(Math, 'random').mockReturnValue(0.99); // > 0.30 → no event
    expect(events.rollForEvent(attackerFactionId)).toBeNull();
    vi.restoreAllMocks();
  });

  it('rollForEvent returns an event when random is low enough', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    // First call (< 0.30) triggers event; subsequent calls drive weight selection
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = events.rollForEvent(attackerFactionId);
    expect(result).not.toBeNull();
    vi.restoreAllMocks();
  });

  it('applyEvent ipc_bonus increases faction IPCs', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.ipcs = 20;

    events.applyEvent(
      { id: 'test', name: 'Test', description: '', type: 'positive', icon: '', weight: 1, cooldownTurns: 0,
        effects: [{ type: 'ipc_bonus', value: 10 }] },
      attackerFactionId
    );
    expect(faction.ipcs).toBe(30);
  });

  it('applyEvent ipc_penalty does not reduce IPCs below 0', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.ipcs = 5;

    events.applyEvent(
      { id: 'test', name: 'Test', description: '', type: 'negative', icon: '', weight: 1, cooldownTurns: 0,
        effects: [{ type: 'ipc_penalty', value: 20 }] },
      attackerFactionId
    );
    expect(faction.ipcs).toBe(0);
  });

  it('applyEvent choice event deducts choice cost', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.ipcs = 30;

    events.applyEvent(
      {
        id: 'test', name: 'Test', description: '', type: 'choice', icon: '', weight: 1, cooldownTurns: 0,
        effects: [],
        choices: [{ id: 'c1', text: 'Option', effects: [{ type: 'ipc_bonus', value: 5 }], cost: 8 }],
      },
      attackerFactionId,
      'c1'
    );
    // 30 - 8 (cost) + 5 (bonus) = 27
    expect(faction.ipcs).toBe(27);
  });

  it('applyEvent choice event does nothing when faction cannot afford cost', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    const faction = state.factionRegistry.get(attackerFactionId)!;
    faction.ipcs = 3;

    events.applyEvent(
      {
        id: 'test', name: 'Test', description: '', type: 'choice', icon: '', weight: 1, cooldownTurns: 0,
        effects: [],
        choices: [{ id: 'c1', text: 'Option', effects: [{ type: 'ipc_bonus', value: 100 }], cost: 10 }],
      },
      attackerFactionId,
      'c1'
    );
    expect(faction.ipcs).toBe(3); // unchanged
  });

  it('getEffectBonus accumulates attack_bonus from active effects', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    state.turnNumber = 1;
    events.applyEvent(
      { id: 'test', name: '', description: '', type: 'positive', icon: '', weight: 1, cooldownTurns: 0,
        effects: [{ type: 'attack_bonus', value: 2, duration: 3 }] },
      attackerFactionId
    );

    expect(events.getEffectBonus(attackerFactionId, 'attack_bonus')).toBe(2);
  });

  it('cleanupExpiredEffects removes effects past their expiry turn', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    state.turnNumber = 1;
    events.applyEvent(
      { id: 'test', name: '', description: '', type: 'positive', icon: '', weight: 1, cooldownTurns: 0,
        effects: [{ type: 'defense_bonus', value: 1, duration: 2 }] },
      attackerFactionId
    );

    // Effect expires after turn 3 (turnNumber 1 + duration 2)
    state.turnNumber = 4;
    events.cleanupExpiredEffects();
    expect(events.getEffectBonus(attackerFactionId, 'defense_bonus')).toBe(0);
  });

  it('serialize and restore round-trips correctly', () => {
    const { state, attackerFactionId } = buildCombatState();
    const events = new EventsSystem(state);

    state.turnNumber = 1;
    events.applyEvent(
      { id: 'boom', name: '', description: '', type: 'positive', icon: '', weight: 1, cooldownTurns: 5,
        effects: [{ type: 'attack_bonus', value: 3, duration: 4 }] },
      attackerFactionId
    );

    const data = events.serialize();
    const events2 = new EventsSystem(state);
    events2.restore(data);

    expect(events2.getEffectBonus(attackerFactionId, 'attack_bonus')).toBe(3);
    // eventCooldowns should be preserved (rollForEvent sets them; applyEvent doesn't, so just check structure)
    expect(Array.isArray(data.activeEffects)).toBe(true);
    expect(Array.isArray(data.eventCooldowns)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SaveManager
// ─────────────────────────────────────────────────────────────────────────────

describe('SaveManager', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
    });
  });

  it('getSlots returns 5 empty slots when storage is empty', () => {
    const { state } = buildCombatState();
    const manager = new SaveManager(state);

    const slots = manager.getSlots();
    expect(slots).toHaveLength(5);
    expect(slots.every(s => s.isEmpty)).toBe(true);
  });

  it('saveToSlot returns false for out-of-range slot IDs', () => {
    const { state } = buildCombatState();
    const manager = new SaveManager(state);

    expect(manager.saveToSlot(0)).toBe(false);
    expect(manager.saveToSlot(6)).toBe(false);
  });

  it('saveToSlot persists data and getSlots shows it as non-empty', () => {
    const { state } = buildCombatState();
    state.turnNumber = 7;
    const manager = new SaveManager(state);

    const saved = manager.saveToSlot(2, 'My Save');
    expect(saved).toBe(true);

    const slots = manager.getSlots();
    const slot2 = slots.find(s => s.id === 2)!;
    expect(slot2.isEmpty).toBe(false);
    expect(slot2.name).toBe('My Save');
    expect(slot2.turnNumber).toBe(7);
  });

  it('loadFromSlot returns false when slot is empty', () => {
    const { state } = buildCombatState();
    const manager = new SaveManager(state);

    expect(manager.loadFromSlot(3)).toBe(false);
  });

  it('loadFromSlot restores game state', () => {
    const { state } = buildCombatState();
    state.turnNumber = 5;
    const manager = new SaveManager(state);

    manager.saveToSlot(1, 'Test');
    state.turnNumber = 99; // simulate state change

    const loaded = manager.loadFromSlot(1);
    expect(loaded).toBe(true);
    expect(state.turnNumber).toBe(5);
  });

  it('deleteSlot removes the save and slot appears empty again', () => {
    const { state } = buildCombatState();
    const manager = new SaveManager(state);

    manager.saveToSlot(4, 'ToDelete');
    expect(manager.getSlots().find(s => s.id === 4)!.isEmpty).toBe(false);

    manager.deleteSlot(4);
    expect(manager.getSlots().find(s => s.id === 4)!.isEmpty).toBe(true);
  });

  it('renameSlot updates a save name without changing the saved turn', () => {
    const { state } = buildCombatState();
    state.turnNumber = 8;
    const manager = new SaveManager(state);

    manager.saveToSlot(2, 'Old Name');
    state.turnNumber = 99;

    expect(manager.renameSlot(2, 'New Campaign Name')).toBe(true);
    const slot = manager.getSlots().find(s => s.id === 2)!;
    expect(slot.name).toBe('New Campaign Name');
    expect(slot.turnNumber).toBe(8);
  });

  it('renameSlot rejects empty and missing slots', () => {
    const { state } = buildCombatState();
    const manager = new SaveManager(state);

    expect(manager.renameSlot(2, 'Name')).toBe(false);
    manager.saveToSlot(2, 'Existing');
    expect(manager.renameSlot(2, '   ')).toBe(false);
    expect(manager.getSlots().find(s => s.id === 2)!.name).toBe('Existing');
  });

  it('quickSave and quickLoad use slot 1', () => {
    const { state } = buildCombatState();
    state.turnNumber = 3;
    const manager = new SaveManager(state);

    manager.quickSave();
    state.turnNumber = 0;
    manager.quickLoad();
    expect(state.turnNumber).toBe(3);
  });

  it('autoSave and loadAutoSave persist and restore state', () => {
    const { state } = buildCombatState();
    state.turnNumber = 11;
    const manager = new SaveManager(state);

    expect(manager.hasAutoSave()).toBe(false);
    manager.autoSave();
    expect(manager.hasAutoSave()).toBe(true);

    state.turnNumber = 0;
    manager.loadAutoSave();
    expect(state.turnNumber).toBe(11);
  });

  it('hasAutoSave ignores corrupt auto-save data', () => {
    const { state } = buildCombatState();
    const manager = new SaveManager(state);

    store['grand-strategy-autosave'] = 'not-json';

    expect(manager.hasAutoSave()).toBe(false);
    expect(manager.loadAutoSave()).toBe(false);
  });

  it('loadFromSlot rejects invalid snapshots without changing state', () => {
    const { state } = buildCombatState();
    state.turnNumber = 4;
    const manager = new SaveManager(state);

    store['grand-strategy-save-1'] = JSON.stringify({
      version: '1.0.0',
      slot: 1,
      name: 'Broken',
      timestamp: Date.now(),
      snapshot: { turnNumber: 99 },
    });

    expect(manager.loadFromSlot(1)).toBe(false);
    expect(state.turnNumber).toBe(4);
    expect(manager.getSlots()[0].isEmpty).toBe(true);
  });

  it('formatTimestamp returns "Empty" for a zero timestamp', () => {
    const { state } = buildCombatState();
    const manager = new SaveManager(state);
    expect(manager.formatTimestamp(0)).toBe('Empty');
  });
});
