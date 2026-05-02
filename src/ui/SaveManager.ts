/**
 * SaveManager - Handle multiple save slots
 */

import { GameState, GameStateSnapshot } from '../engine/GameState';

export interface SaveSlot {
  id: number;
  name: string;
  timestamp: number;
  turnNumber: number;
  currentFaction: string;
  isEmpty: boolean;
}

export interface SaveData {
  version: string;
  slot: number;
  name: string;
  timestamp: number;
  snapshot: GameStateSnapshot;
}

const SAVE_VERSION = '1.0.0';
const MAX_SLOTS = 5;

export class SaveManager {
  private state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  /**
   * Get all save slots
   */
  getSlots(): SaveSlot[] {
    const slots: SaveSlot[] = [];
    
    for (let i = 1; i <= MAX_SLOTS; i++) {
      const key = `grand-strategy-save-${i}`;
      const data = localStorage.getItem(key);
      
      if (data) {
        try {
          const parsed = this.parseSaveData(data);
          if (!parsed) throw new Error('Invalid save data');
          slots.push({
            id: i,
            name: parsed.name || `Save ${i}`,
            timestamp: parsed.timestamp,
            turnNumber: parsed.snapshot.turnNumber,
            currentFaction: parsed.snapshot.currentFactionId,
            isEmpty: false,
          });
        } catch {
          slots.push({
            id: i,
            name: `Slot ${i}`,
            timestamp: 0,
            turnNumber: 0,
            currentFaction: '',
            isEmpty: true,
          });
        }
      } else {
        slots.push({
          id: i,
          name: `Slot ${i}`,
          timestamp: 0,
          turnNumber: 0,
          currentFaction: '',
          isEmpty: true,
        });
      }
    }
    
    return slots;
  }

  /**
   * Save game to a slot
   */
  saveToSlot(slotId: number, name?: string): boolean {
    if (slotId < 1 || slotId > MAX_SLOTS) return false;

    try {
      const existing = this.getSaveData(slotId);
      const snapshot = this.state.createSnapshot();
      const saveData: SaveData = {
        version: SAVE_VERSION,
        slot: slotId,
        name: name?.trim() || existing?.name || `Save ${slotId}`,
        timestamp: Date.now(),
        snapshot,
      };

      const key = `grand-strategy-save-${slotId}`;
      localStorage.setItem(key, JSON.stringify(saveData));
      
      return true;
    } catch (e) {
      console.error('Failed to save:', e);
      return false;
    }
  }

  /**
   * Rename a save slot without changing its snapshot or timestamp
   */
  renameSlot(slotId: number, name: string): boolean {
    if (slotId < 1 || slotId > MAX_SLOTS) return false;
    const trimmed = name.trim();
    if (!trimmed) return false;

    try {
      const saveData = this.getSaveData(slotId);
      if (!saveData) return false;

      saveData.name = trimmed.slice(0, 48);
      const key = `grand-strategy-save-${slotId}`;
      localStorage.setItem(key, JSON.stringify(saveData));
      return true;
    } catch (e) {
      console.error('Failed to rename save:', e);
      return false;
    }
  }

  /**
   * Load game from a slot
   */
  loadFromSlot(slotId: number): boolean {
    if (slotId < 1 || slotId > MAX_SLOTS) return false;

    try {
      const key = `grand-strategy-save-${slotId}`;
      const data = localStorage.getItem(key);
      
      if (!data) {
        return false;
      }

      const saveData = this.parseSaveData(data);
      if (!saveData) return false;
      
      // Version check (for future compatibility)
      if (saveData.version !== SAVE_VERSION) {
        console.warn('Save version mismatch, attempting to load anyway');
      }

      this.state.restoreFromSnapshot(saveData.snapshot);
      
      return true;
    } catch (e) {
      console.error('Failed to load:', e);
      return false;
    }
  }

  /**
   * Delete a save slot
   */
  deleteSlot(slotId: number): boolean {
    if (slotId < 1 || slotId > MAX_SLOTS) return false;

    try {
      const key = `grand-strategy-save-${slotId}`;
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.error('Failed to delete:', e);
      return false;
    }
  }

  /**
   * Quick save (to slot 1)
   */
  quickSave(): boolean {
    return this.saveToSlot(1, 'Quick Save');
  }

  /**
   * Quick load (from slot 1)
   */
  quickLoad(): boolean {
    return this.loadFromSlot(1);
  }

  /**
   * Auto save (to special auto slot)
   */
  autoSave(): boolean {
    try {
      const snapshot = this.state.createSnapshot();
      const saveData: SaveData = {
        version: SAVE_VERSION,
        slot: 0,
        name: 'Auto Save',
        timestamp: Date.now(),
        snapshot,
      };

      localStorage.setItem('grand-strategy-autosave', JSON.stringify(saveData));
      return true;
    } catch (e) {
      console.error('Auto save failed:', e);
      return false;
    }
  }

  /**
   * Load auto save
   */
  loadAutoSave(): boolean {
    try {
      const data = localStorage.getItem('grand-strategy-autosave');
      if (!data) return false;

      const saveData = this.parseSaveData(data);
      if (!saveData) return false;
      this.state.restoreFromSnapshot(saveData.snapshot);
      return true;
    } catch (e) {
      console.error('Failed to load auto save:', e);
      return false;
    }
  }

  /**
   * Check if auto save exists
   */
  hasAutoSave(): boolean {
    const data = localStorage.getItem('grand-strategy-autosave');
    return data !== null && this.parseSaveData(data) !== null;
  }

  /**
   * Export a save slot to a JSON file download
   */
  exportToFile(slotId: number): boolean {
    const key = slotId === 0 ? 'grand-strategy-autosave' : `grand-strategy-save-${slotId}`;
    const data = localStorage.getItem(key);
    if (!data) return false;
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const parsed = JSON.parse(data) as SaveData;
      a.href = url;
      a.download = `grand-strategy-${parsed.name.replace(/\s+/g, '-').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Import a save from a JSON file into a slot
   */
  importFromFile(slotId: number): Promise<boolean> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve(false); return; }
        try {
          const text = await file.text();
          const parsed = this.parseSaveData(text);
          if (!parsed) { resolve(false); return; }
          const saveData: SaveData = {
            version: parsed.version ?? SAVE_VERSION,
            slot: slotId,
            name: parsed.name ?? `Imported Save ${slotId}`,
            timestamp: Date.now(),
            snapshot: parsed.snapshot,
          };
          const key = `grand-strategy-save-${slotId}`;
          localStorage.setItem(key, JSON.stringify(saveData));
          resolve(true);
        } catch {
          resolve(false);
        }
      };
      input.click();
    });
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp: number): string {
    if (!timestamp) return 'Empty';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const dayLabel = isToday
      ? 'Today'
      : date.toDateString() === yesterday.toDateString()
        ? 'Yesterday'
        : date.toLocaleDateString();
    return dayLabel + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  private getSaveData(slotId: number): SaveData | null {
    const key = `grand-strategy-save-${slotId}`;
    const data = localStorage.getItem(key);
    return data ? this.parseSaveData(data) : null;
  }

  private parseSaveData(raw: string): SaveData | null {
    try {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (!this.isValidSnapshot(parsed.snapshot)) return null;

      return {
        version: typeof parsed.version === 'string' ? parsed.version : SAVE_VERSION,
        slot: typeof parsed.slot === 'number' ? parsed.slot : 0,
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Imported Save',
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
        snapshot: parsed.snapshot,
      };
    } catch {
      return null;
    }
  }

  private isValidSnapshot(snapshot: unknown): snapshot is GameStateSnapshot {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const s = snapshot as Partial<GameStateSnapshot>;
    return typeof s.turnNumber === 'number' &&
      typeof s.currentFactionId === 'string' &&
      typeof s.currentPhase === 'string' &&
      Array.isArray(s.territories) &&
      Array.isArray(s.factions) &&
      Array.isArray(s.pendingMoves) &&
      Array.isArray(s.purchaseOrders);
  }
}
