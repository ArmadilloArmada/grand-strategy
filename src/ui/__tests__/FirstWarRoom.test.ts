/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirstWarRoom } from '../FirstWarRoom';

function showWarRoom(overrides: Partial<Parameters<FirstWarRoom['show']>[0]> = {}) {
  const callbacks = {
    focusTerritory: vi.fn(),
    showObjectives: vi.fn(),
    showThreatOverlay: vi.fn(),
  };
  const room = new FirstWarRoom(callbacks);

  room.show({
    factionName: 'Atlantic Alliance',
    capitalName: 'Washington',
    threatName: 'Eastern Front',
    pressureName: 'Quebec',
    mobilizationAdvice: 'Mobilize Washington.',
    coachHeadline: 'Secure the capital',
    coachDetail: 'Start with the factory territory.',
    recommendedTerritoryId: 'washington',
    ...overrides,
  });

  return { callbacks, room };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('FirstWarRoom', () => {
  it('focuses the recommendation and closes the overlay', () => {
    const { callbacks } = showWarRoom();

    document.querySelector<HTMLButtonElement>('#btn-fwr-focus')?.click();

    expect(callbacks.focusTerritory).toHaveBeenCalledWith('washington');
    expect(document.getElementById('first-war-room')).toBeNull();
  });

  it('disables focus when no recommendation target exists', () => {
    const { callbacks } = showWarRoom({ recommendedTerritoryId: undefined });
    const focusButton = document.querySelector<HTMLButtonElement>('#btn-fwr-focus');

    expect(focusButton?.disabled).toBe(true);
    focusButton?.click();

    expect(callbacks.focusTerritory).not.toHaveBeenCalled();
    expect(document.getElementById('first-war-room')).not.toBeNull();
  });

  it('closes after opening objectives so the revealed panel is not blocked', () => {
    const { callbacks } = showWarRoom();

    document.querySelector<HTMLButtonElement>('#btn-fwr-objectives')?.click();

    expect(callbacks.showObjectives).toHaveBeenCalledOnce();
    expect(document.getElementById('first-war-room')).toBeNull();
  });
});
