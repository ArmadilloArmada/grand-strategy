import { describe, it, expect, beforeEach } from 'vitest';
import { TechnologyManager, TECHNOLOGIES } from '../TechnologyManager';
import { GameState } from '../GameState';

const FACTION = 'test_faction';

function makeTM(): TechnologyManager {
  const state = new GameState();
  return new TechnologyManager(state);
}

describe('TechnologyManager', () => {
  let tm: TechnologyManager;

  beforeEach(() => {
    tm = makeTM();
  });

  // ── hasTech ────────────────────────────────────────────────────────────

  it('returns false for tech not yet researched', () => {
    expect(tm.hasTech(FACTION, 'improved_infantry')).toBe(false);
  });

  it('returns true after tech is fully researched', () => {
    tm.startResearch(FACTION, 'improved_infantry');
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.advanceResearch(FACTION, tech.cost);
    expect(tm.hasTech(FACTION, 'improved_infantry')).toBe(true);
  });

  // ── startResearch ──────────────────────────────────────────────────────

  it('returns false for an unknown tech id', () => {
    expect(tm.startResearch(FACTION, 'does_not_exist')).toBe(false);
  });

  it('returns false if prerequisite is not met', () => {
    // 'elite_training' requires 'improved_infantry'
    expect(tm.startResearch(FACTION, 'elite_training')).toBe(false);
  });

  it('returns true when prerequisites are satisfied', () => {
    // Complete improved_infantry first
    tm.startResearch(FACTION, 'improved_infantry');
    tm.advanceResearch(FACTION, TECHNOLOGIES.find(t => t.id === 'improved_infantry')!.cost);
    // Now elite_training should be startable
    expect(tm.startResearch(FACTION, 'elite_training')).toBe(true);
  });

  it('returns false if tech is already researched', () => {
    const cost = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!.cost;
    tm.startResearch(FACTION, 'improved_infantry');
    tm.advanceResearch(FACTION, cost);
    expect(tm.startResearch(FACTION, 'improved_infantry')).toBe(false);
  });

  it('sets currentResearch after successful start', () => {
    tm.startResearch(FACTION, 'improved_infantry');
    expect(tm.getCurrentResearch(FACTION)).toBe('improved_infantry');
  });

  // ── advanceResearch ────────────────────────────────────────────────────

  it('returns null while progress is below cost', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, tech.id);
    const result = tm.advanceResearch(FACTION, tech.cost - 1);
    expect(result).toBeNull();
    expect(tm.hasTech(FACTION, tech.id)).toBe(false);
  });

  it('returns the tech id when research completes', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, tech.id);
    const result = tm.advanceResearch(FACTION, tech.cost);
    expect(result).toBe(tech.id);
  });

  it('clears currentResearch after completion', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, tech.id);
    tm.advanceResearch(FACTION, tech.cost);
    expect(tm.getCurrentResearch(FACTION)).toBeNull();
  });

  it('returns null when no research is in progress', () => {
    expect(tm.advanceResearch(FACTION, 10)).toBeNull();
  });

  it('allows multiple points to be added in separate advances', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'industrialization')!;
    tm.startResearch(FACTION, tech.id);
    // Add half the cost, check not done
    tm.advanceResearch(FACTION, Math.floor(tech.cost / 2));
    expect(tm.hasTech(FACTION, tech.id)).toBe(false);
    // Add the rest
    const done = tm.advanceResearch(FACTION, tech.cost);
    expect(done).toBe(tech.id);
  });

  // ── getAvailable ───────────────────────────────────────────────────────

  it('includes all techs without prerequisites by default', () => {
    const available = tm.getAvailable(FACTION);
    const noPrereqs = TECHNOLOGIES.filter(t => !t.prerequisites || t.prerequisites.length === 0);
    for (const t of noPrereqs) {
      expect(available.some(a => a.id === t.id)).toBe(true);
    }
  });

  it('excludes already researched tech', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, tech.id);
    tm.advanceResearch(FACTION, tech.cost);
    expect(tm.getAvailable(FACTION).some(a => a.id === tech.id)).toBe(false);
  });

  it('unlocks dependent tech once prerequisite is met', () => {
    // Before: elite_training not available
    expect(tm.getAvailable(FACTION).some(a => a.id === 'elite_training')).toBe(false);
    // Complete prerequisite
    const prereqTech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, prereqTech.id);
    tm.advanceResearch(FACTION, prereqTech.cost);
    // After: elite_training should be available
    expect(tm.getAvailable(FACTION).some(a => a.id === 'elite_training')).toBe(true);
  });

  // ── getTechEffect ──────────────────────────────────────────────────────

  it('returns zero bonuses when nothing is researched', () => {
    const effect = tm.getTechEffect(FACTION);
    expect(effect.attackBonus).toBe(0);
    expect(effect.defenseBonus).toBe(0);
    expect(effect.incomeBonus).toBe(0);
  });

  it('accumulates defenseBonus from improved_infantry', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, tech.id);
    tm.advanceResearch(FACTION, tech.cost);
    expect(tm.getTechEffect(FACTION).defenseBonus).toBe(tech.effect.defenseBonus ?? 0);
  });

  it('accumulates incomeBonus from industrialization', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'industrialization')!;
    tm.startResearch(FACTION, tech.id);
    tm.advanceResearch(FACTION, tech.cost);
    expect(tm.getTechEffect(FACTION).incomeBonus).toBeCloseTo(tech.effect.incomeBonus ?? 0);
  });

  it('stacks bonuses across multiple researched techs', () => {
    // Research improved_infantry (defenseBonus) + industrialization (incomeBonus)
    const inf = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, inf.id);
    tm.advanceResearch(FACTION, inf.cost);

    const ind = TECHNOLOGIES.find(t => t.id === 'industrialization')!;
    tm.startResearch(FACTION, ind.id);
    tm.advanceResearch(FACTION, ind.cost);

    const effect = tm.getTechEffect(FACTION);
    expect(effect.defenseBonus).toBe(inf.effect.defenseBonus ?? 0);
    expect(effect.incomeBonus).toBeCloseTo(ind.effect.incomeBonus ?? 0);
  });

  // ── getResearched ──────────────────────────────────────────────────────

  it('getResearched returns empty set initially', () => {
    expect(tm.getResearched(FACTION).size).toBe(0);
  });

  it('getResearched contains completed tech', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, tech.id);
    tm.advanceResearch(FACTION, tech.cost);
    expect(tm.getResearched(FACTION).has(tech.id)).toBe(true);
  });

  // ── serialize / deserialize ────────────────────────────────────────────

  it('serialize captures current research state', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch(FACTION, tech.id);
    tm.advanceResearch(FACTION, tech.cost - 1); // not yet complete
    const serialized = tm.serialize(FACTION) as any;
    expect(serialized.currentResearch).toBe(tech.id);
    expect(serialized.researchProgress).toBe(tech.cost - 1);
    expect(serialized.researched).toEqual([]);
  });

  it('deserialize restores researched set and in-progress research', () => {
    const data = {
      researched: ['improved_infantry', 'industrialization'],
      currentResearch: 'elite_training',
      researchProgress: 7,
    };
    tm.deserialize(FACTION, data);
    expect(tm.hasTech(FACTION, 'improved_infantry')).toBe(true);
    expect(tm.hasTech(FACTION, 'industrialization')).toBe(true);
    expect(tm.getCurrentResearch(FACTION)).toBe('elite_training');
  });

  // ── Multiple factions are isolated ────────────────────────────────────

  it('research for one faction does not affect another', () => {
    const tech = TECHNOLOGIES.find(t => t.id === 'improved_infantry')!;
    tm.startResearch('faction_a', tech.id);
    tm.advanceResearch('faction_a', tech.cost);
    expect(tm.hasTech('faction_a', tech.id)).toBe(true);
    expect(tm.hasTech('faction_b', tech.id)).toBe(false);
  });
});
