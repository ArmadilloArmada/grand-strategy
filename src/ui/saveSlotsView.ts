/**
 * Builds the save/load slot list HTML. Pure: faction-name resolution and
 * timestamp formatting are passed in, and the caller wires up event listeners.
 */

import type { SaveSlot } from './SaveManager';
import { escapeHtml } from './htmlEscape';

export function buildSaveSlotsHtml(
  slots: SaveSlot[],
  mode: 'save' | 'load',
  getFactionName: (factionId: string) => string,
  formatTimestamp: (timestamp: number) => string,
): string {
  let html = '';

  for (const slot of slots) {
    const isEmpty = slot.isEmpty;
    const factionName = slot.currentFaction ? getFactionName(slot.currentFaction) : '';

    html += `
        <div class="save-slot ${isEmpty ? 'empty' : ''}" data-slot="${slot.id}">
          <div class="save-slot-info">
            <div class="save-slot-name">${isEmpty ? `Empty Slot ${slot.id}` : escapeHtml(slot.name)}</div>
            <div class="save-slot-details">
              ${isEmpty
                ? 'No save data'
                : `Turn ${slot.turnNumber} • ${factionName} • ${formatTimestamp(slot.timestamp)}`
              }
            </div>
          </div>
          <div class="save-slot-actions">
            ${mode === 'save'
              ? `<button class="btn-slot-save primary" data-slot="${slot.id}">Save</button>`
              : isEmpty
                ? ''
                : `<button class="btn-slot-load primary" data-slot="${slot.id}">Load</button>`
            }
            ${!isEmpty ? `<button class="btn-slot-rename" data-slot="${slot.id}">Rename</button>` : ''}
            ${!isEmpty ? `<button class="btn-slot-delete danger" data-slot="${slot.id}">🗑️</button>` : ''}
          </div>
        </div>
      `;
  }

  return html;
}
