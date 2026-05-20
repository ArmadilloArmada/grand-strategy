/**
 * ModManager tests
 * Uses localStorage (jsdom) — no Electron API needed for these tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModManager, ModManifest } from '../ModManager';

function makeManifest(id: string, overrides: Partial<ModManifest> = {}): ModManifest {
  return {
    id,
    name: `Mod ${id}`,
    version: '1.0.0',
    author: 'Test',
    description: 'A test mod',
    gameVersion: '1.0.0',
    contents: {},
    ...overrides,
  };
}

function makeManager(): ModManager {
  localStorage.clear();
  return new ModManager();
}

describe('ModManager — loadMod / getMods', () => {
  it('starts with no mods', () => {
    const mm = makeManager();
    expect(mm.getMods()).toHaveLength(0);
  });

  it('loadMod registers a mod and returns true', async () => {
    const mm = makeManager();
    const result = await mm.loadMod(makeManifest('mod_a'));
    expect(result).toBe(true);
    expect(mm.getMods()).toHaveLength(1);
    expect(mm.getMods()[0].manifest.id).toBe('mod_a');
  });

  it('loaded mod is enabled by default', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    expect(mm.getMods()[0].enabled).toBe(true);
  });

  it('getMods returns mods sorted by loadOrder', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    await mm.loadMod(makeManifest('mod_b'));
    const mods = mm.getMods();
    expect(mods[0].loadOrder).toBeLessThanOrEqual(mods[1].loadOrder);
  });
});

describe('ModManager — unloadMod', () => {
  it('unloadMod removes a mod and returns true', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    const result = mm.unloadMod('mod_a');
    expect(result).toBe(true);
    expect(mm.getMods()).toHaveLength(0);
  });

  it('unloadMod returns false for unknown mod id', () => {
    const mm = makeManager();
    expect(mm.unloadMod('nonexistent')).toBe(false);
  });
});

describe('ModManager — setModEnabled / getEnabledMods', () => {
  it('setModEnabled disables a mod', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    mm.setModEnabled('mod_a', false);
    expect(mm.getEnabledMods()).toHaveLength(0);
  });

  it('setModEnabled re-enables a disabled mod', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    mm.setModEnabled('mod_a', false);
    mm.setModEnabled('mod_a', true);
    expect(mm.getEnabledMods()).toHaveLength(1);
  });

  it('setModEnabled returns false for unknown mod', () => {
    const mm = makeManager();
    expect(mm.setModEnabled('ghost', true)).toBe(false);
  });
});

describe('ModManager — setLoadOrder', () => {
  it('setLoadOrder returns true for known mod and persists the change', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    await mm.loadMod(makeManifest('mod_b'));
    const result = mm.setLoadOrder('mod_a', 10);
    expect(result).toBe(true);
    // After reassignment mod_a should have a higher loadOrder than mod_b (which stays at ~0)
    const mods = mm.getMods();
    const orderA = mods.find(m => m.manifest.id === 'mod_a')!.loadOrder;
    const orderB = mods.find(m => m.manifest.id === 'mod_b')!.loadOrder;
    expect(orderB).toBeLessThan(orderA);
  });

  it('setLoadOrder returns false for unknown mod', () => {
    const mm = makeManager();
    expect(mm.setLoadOrder('ghost', 0)).toBe(false);
  });
});

describe('ModManager — getMergedUnits', () => {
  it('returns base units unchanged when no mods loaded', () => {
    const mm = makeManager();
    const base = [{ id: 'infantry', attack: 1 }];
    expect(mm.getMergedUnits(base)).toEqual(base);
  });

  it('overrides base unit when mod provides same id', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    // Inject unit data directly
    const mod = mm.getMods()[0];
    mod.data.units = [{ id: 'infantry', attack: 5 }];

    const base = [{ id: 'infantry', attack: 1 }];
    const merged = mm.getMergedUnits(base);
    expect(merged).toHaveLength(1);
    expect(merged[0].attack).toBe(5);
  });

  it('adds new units from mod', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    const mod = mm.getMods()[0];
    mod.data.units = [{ id: 'superunit', attack: 10 }];

    const base = [{ id: 'infantry', attack: 1 }];
    const merged = mm.getMergedUnits(base);
    expect(merged).toHaveLength(2);
    expect(merged.some((u: any) => u.id === 'superunit')).toBe(true);
  });

  it('disabled mod units are not applied', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    mm.setModEnabled('mod_a', false);
    const mod = mm.getMods()[0];
    mod.data.units = [{ id: 'infantry', attack: 99 }];

    const base = [{ id: 'infantry', attack: 1 }];
    const merged = mm.getMergedUnits(base);
    expect(merged[0].attack).toBe(1);
  });
});

describe('ModManager — getMergedFactions', () => {
  it('overrides existing faction properties', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    mm.getMods()[0].data.factions = [{ id: 'alpha', startingIPCs: 999 }];

    const base = [{ id: 'alpha', startingIPCs: 30 }];
    const merged = mm.getMergedFactions(base);
    expect(merged[0].startingIPCs).toBe(999);
  });
});

describe('ModManager — getMergedMaps', () => {
  it('appends mod maps to base maps', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    mm.getMods()[0].data.maps = [{ id: 'custom_map' }];

    const base = [{ id: 'europe' }];
    const merged = mm.getMergedMaps(base);
    expect(merged).toHaveLength(2);
    expect(merged.some((m: any) => m.id === 'custom_map')).toBe(true);
  });
});

describe('ModManager — checkConflicts', () => {
  it('returns empty array when no conflicts', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    await mm.loadMod(makeManifest('mod_b'));
    expect(mm.checkConflicts()).toHaveLength(0);
  });

  it('detects declared conflicts', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a', { conflicts: ['mod_b'] }));
    await mm.loadMod(makeManifest('mod_b'));
    const conflicts = mm.checkConflicts();
    expect(conflicts.some(c => c.mod1 === 'mod_a' && c.mod2 === 'mod_b')).toBe(true);
  });

  it('detects unit id conflicts between two mods', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    await mm.loadMod(makeManifest('mod_b'));
    mm.getMods()[0].data.units = [{ id: 'superunit' }];
    mm.getMods()[1].data.units = [{ id: 'superunit' }];

    const conflicts = mm.checkConflicts();
    expect(conflicts.some(c => c.reason.includes('superunit'))).toBe(true);
  });
});

describe('ModManager — exportMod', () => {
  it('exports a valid JSON string for a loaded mod', async () => {
    const mm = makeManager();
    await mm.loadMod(makeManifest('mod_a'));
    const json = mm.exportMod('mod_a');
    expect(json).not.toBeNull();
    const parsed = JSON.parse(json!);
    expect(parsed.manifest.id).toBe('mod_a');
  });

  it('returns null for unknown mod id', () => {
    const mm = makeManager();
    expect(mm.exportMod('ghost')).toBeNull();
  });
});

describe('ModManager — installModFromJSON (browser path)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs a mod from JSON string in localStorage context', async () => {
    const mm = makeManager();
    const modData = {
      manifest: makeManifest('installed_mod'),
      data: { units: [], factions: [], maps: [], rules: null },
    };
    const result = await mm.installModFromJSON(JSON.stringify(modData));
    expect(result).toBe(true);
    expect(mm.getMods().some(m => m.manifest.id === 'installed_mod')).toBe(true);
  });

  it('returns false for invalid JSON', async () => {
    const mm = makeManager();
    const result = await mm.installModFromJSON('not-valid-json');
    expect(result).toBe(false);
  });

  it('returns false when manifest is missing', async () => {
    const mm = makeManager();
    const result = await mm.installModFromJSON(JSON.stringify({ noManifest: true }));
    expect(result).toBe(false);
  });
});

describe('ModManager — createModTemplate', () => {
  it('returns a manifest with required fields', () => {
    const mm = makeManager();
    const tmpl = mm.createModTemplate();
    expect(tmpl.id).toBeTruthy();
    expect(tmpl.name).toBeTruthy();
    expect(tmpl.version).toBeTruthy();
    expect(tmpl.contents).toBeDefined();
  });
});
