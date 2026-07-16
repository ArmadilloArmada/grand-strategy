/**
 * Static inner HTML for the "save current game?" confirmation modal shown when
 * leaving a game in progress. Extracted from main; caller wires the buttons
 * (#btn-save-and-continue, #btn-discard-game, #btn-cancel-leave).
 */
export function buildSaveConfirmModalHtml(): string {
  return `
      <div class="modal-content" style="text-align: center; max-width: 400px;">
        <h2>💾 Save Current Game?</h2>
        <p style="margin: 1rem 0; color: #aaa;">
          You have a game in progress. Starting fresh will not load your autosave; it stays available from the Resume tab until another autosave replaces it.
        </p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1.5rem;">
          <button id="btn-save-and-continue" class="primary" style="padding: 0.8rem;">
            💾 Save and Continue
          </button>
          <button id="btn-discard-game" style="padding: 0.8rem; background: #dc2626;">
            🗑️ Don't Save
          </button>
          <button id="btn-cancel-leave" style="padding: 0.8rem;">
            ↩️ Cancel
          </button>
        </div>
      </div>
    `;
}
