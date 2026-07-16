import { describe, expect, it } from 'vitest';
import { buildSaveSlotsHtml } from '../saveSlotsView';
import type { SaveSlot } from '../SaveManager';

const emptySlot = (id: number): SaveSlot => ({ id, name: `Slot ${id}`, timestamp: 0, turnNumber: 0, currentFaction: '', isEmpty: true });
const filledSlot = (id: number): SaveSlot => ({ id, name: 'My Save', timestamp: 111, turnNumber: 4, currentFaction: 'player', isEmpty: false });

const fname = (id: string) => (id === 'player' ? 'Atlantic Alliance' : id);
const fts = () => 'Today 10:00';

describe('buildSaveSlotsHtml', () => {
  it('renders an empty slot with a Save button in save mode', () => {
    const html = buildSaveSlotsHtml([emptySlot(1)], 'save', fname, fts);
    expect(html).toContain('Empty Slot 1');
    expect(html).toContain('No save data');
    expect(html).toContain('btn-slot-save');
    expect(html).not.toContain('btn-slot-load');
  });

  it('renders a filled slot with details and load/rename/delete in load mode', () => {
    const html = buildSaveSlotsHtml([filledSlot(2)], 'load', fname, fts);
    expect(html).toContain('My Save');
    expect(html).toContain('Turn 4 • Atlantic Alliance • Today 10:00');
    expect(html).toContain('btn-slot-load');
    expect(html).toContain('btn-slot-rename');
    expect(html).toContain('btn-slot-delete');
  });

  it('does not offer load on an empty slot in load mode', () => {
    const html = buildSaveSlotsHtml([emptySlot(3)], 'load', fname, fts);
    expect(html).not.toContain('btn-slot-load');
    expect(html).not.toContain('btn-slot-rename');
  });

  it('escapes save names', () => {
    const html = buildSaveSlotsHtml([{ ...filledSlot(1), name: '<x>' }], 'save', fname, fts);
    expect(html).toContain('&lt;x&gt;');
  });
});
