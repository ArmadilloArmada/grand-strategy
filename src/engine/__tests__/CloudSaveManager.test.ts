/**
 * CloudSaveManager tests
 * Tests the provider management and sync logic without hitting IndexedDB or Steam.
 */
import { describe, it, expect, vi } from 'vitest';
import { CloudSaveManager, CloudProvider, CloudSaveMetadata } from '../CloudSaveManager';

// Build a fully controllable stub provider
function makeStubProvider(id: string, available = true, authenticated = false): CloudProvider & {
  uploads: { key: string; data: string }[];
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const uploads: { key: string; data: string }[] = [];

  return {
    id,
    name: `Stub ${id}`,
    icon: '🔧',
    uploads,
    store,
    isAvailable: () => available,
    authenticate: vi.fn(async () => { authenticated = true; return true; }),
    isAuthenticated: () => authenticated,
    upload: vi.fn(async (key: string, data: string) => {
      uploads.push({ key, data });
      store.set(key, data);
      return true;
    }),
    download: vi.fn(async (key: string) => store.get(key) ?? null),
    list: vi.fn(async (): Promise<CloudSaveMetadata[]> => {
      return [...store.keys()].map(k => ({
        id: k,
        name: k,
        turnNumber: 1,
        factionId: '',
        mapId: '',
        savedAt: 1000,
        syncedAt: 1000,
        size: 10,
        checksum: '',
      }));
    }),
    delete: vi.fn(async (key: string) => { store.delete(key); return true; }),
  };
}

describe('CloudSaveManager — provider management', () => {
  it('getProviders returns only available providers', () => {
    const manager = new CloudSaveManager();
    // Clear built-in providers and inject our own
    (manager as any).providers = [
      makeStubProvider('available', true),
      makeStubProvider('unavailable', false),
    ];
    const providers = manager.getProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('available');
  });

  it('setProvider returns false for unknown provider id', async () => {
    const manager = new CloudSaveManager();
    (manager as any).providers = [];
    const result = await manager.setProvider('ghost');
    expect(result).toBe(false);
  });

  it('setProvider returns false for unavailable provider', async () => {
    const manager = new CloudSaveManager();
    (manager as any).providers = [makeStubProvider('unavailable', false)];
    const result = await manager.setProvider('unavailable');
    expect(result).toBe(false);
  });

  it('setProvider activates a valid provider and returns true', async () => {
    const manager = new CloudSaveManager();
    const stub = makeStubProvider('stub_a', true);
    (manager as any).providers = [stub];
    const result = await manager.setProvider('stub_a');
    expect(result).toBe(true);
    expect(manager.getActiveProvider()).toBe(stub);
  });
});

describe('CloudSaveManager — upload / download / delete (no active provider)', () => {
  it('uploadSave returns false when no provider is active', async () => {
    const manager = new CloudSaveManager();
    (manager as any).providers = [];
    (manager as any).activeProvider = null;
    expect(await manager.uploadSave('save1', '{}')).toBe(false);
  });

  it('downloadSave returns null when no provider is active', async () => {
    const manager = new CloudSaveManager();
    (manager as any).activeProvider = null;
    expect(await manager.downloadSave('save1')).toBeNull();
  });

  it('listSaves returns empty array when no provider is active', async () => {
    const manager = new CloudSaveManager();
    (manager as any).activeProvider = null;
    expect(await manager.listSaves()).toHaveLength(0);
  });

  it('deleteSave returns false when no provider is active', async () => {
    const manager = new CloudSaveManager();
    (manager as any).activeProvider = null;
    expect(await manager.deleteSave('save1')).toBe(false);
  });
});

describe('CloudSaveManager — upload / download / delete (with active provider)', () => {
  async function makeActiveManager() {
    const manager = new CloudSaveManager();
    const stub = makeStubProvider('stub', true);
    (manager as any).providers = [stub];
    await manager.setProvider('stub');
    return { manager, stub };
  }

  it('uploadSave delegates to active provider', async () => {
    const { manager, stub } = await makeActiveManager();
    const result = await manager.uploadSave('save1', '{"data":1}');
    expect(result).toBe(true);
    expect(stub.uploads).toHaveLength(1);
    expect(stub.uploads[0].key).toBe('save1');
  });

  it('downloadSave retrieves previously uploaded save', async () => {
    const { manager } = await makeActiveManager();
    await manager.uploadSave('save1', '{"data":42}');
    const data = await manager.downloadSave('save1');
    expect(data).toBe('{"data":42}');
  });

  it('listSaves returns uploaded saves', async () => {
    const { manager } = await makeActiveManager();
    await manager.uploadSave('save1', '{}');
    await manager.uploadSave('save2', '{}');
    const list = await manager.listSaves();
    expect(list.length).toBe(2);
    expect(list.some(s => s.id === 'save1')).toBe(true);
  });

  it('deleteSave removes the save', async () => {
    const { manager } = await makeActiveManager();
    await manager.uploadSave('save1', '{}');
    await manager.deleteSave('save1');
    const data = await manager.downloadSave('save1');
    expect(data).toBeNull();
  });
});

describe('CloudSaveManager — syncWithLocal', () => {
  async function makeActiveManager() {
    const manager = new CloudSaveManager();
    const stub = makeStubProvider('stub', true);
    (manager as any).providers = [stub];
    await manager.setProvider('stub');
    return { manager, stub };
  }

  it('uploads local saves that are not in cloud', async () => {
    const { manager } = await makeActiveManager();
    const localSaves = [{ id: 'new_save', data: '{}', timestamp: 2000 }];
    const result = await manager.syncWithLocal(localSaves);
    expect(result.uploaded).toBe(1);
  });

  it('uploads local save that is newer than cloud version', async () => {
    const { manager, stub } = await makeActiveManager();
    // Pre-populate cloud with an older version
    stub.store.set('save1', '{}');
    // Override list to return syncedAt = 500
    (stub.list as any).mockResolvedValueOnce([{
      id: 'save1', name: 'save1', turnNumber: 1, factionId: '', mapId: '',
      savedAt: 500, syncedAt: 500, size: 2, checksum: '',
    }]);
    const localSaves = [{ id: 'save1', data: '{"v":2}', timestamp: 1000 }];
    const result = await manager.syncWithLocal(localSaves);
    expect(result.uploaded).toBe(1);
  });

  it('flags conflict when cloud save is newer than local', async () => {
    const { manager, stub } = await makeActiveManager();
    stub.store.set('save1', '{}');
    (stub.list as any).mockResolvedValueOnce([{
      id: 'save1', name: 'save1', turnNumber: 1, factionId: '', mapId: '',
      savedAt: 9999, syncedAt: 9999, size: 2, checksum: '',
    }]);
    const localSaves = [{ id: 'save1', data: '{}', timestamp: 500 }];
    const result = await manager.syncWithLocal(localSaves);
    expect(result.conflicts).toContain('save1');
  });

  it('returns zeroes when no active provider', async () => {
    const manager = new CloudSaveManager();
    (manager as any).activeProvider = null;
    const result = await manager.syncWithLocal([{ id: 'x', data: '{}', timestamp: 0 }]);
    expect(result.uploaded).toBe(0);
    expect(result.downloaded).toBe(0);
    expect(result.conflicts).toHaveLength(0);
  });
});

describe('CloudSaveManager — autoSync', () => {
  it('stopAutoSync clears the interval without error', async () => {
    const manager = new CloudSaveManager();
    const stub = makeStubProvider('stub', true);
    (manager as any).providers = [stub];
    await manager.setProvider('stub');
    manager.startAutoSync(60000, () => []);
    expect(() => manager.stopAutoSync()).not.toThrow();
  });
});
