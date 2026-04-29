/**
 * ReplayManager tests
 */
import { describe, it, expect } from 'vitest';
import { ReplayManager, Replay } from '../ReplayManager';

function makeManager(): ReplayManager {
  localStorage.clear();
  return new ReplayManager();
}

function makeReplay(actionCount = 3): Replay {
  const actions = Array.from({ length: actionCount }, (_, i) => ({
    turn: i + 1,
    phase: 'combat',
    factionId: 'alpha',
    timestamp: i * 100,
    action: { type: 'move' as const, data: { from: 'a', to: 'b' } },
  }));
  return {
    metadata: {
      id: `replay_test_${Date.now()}`,
      name: 'Test Replay',
      mapId: 'europe',
      factions: ['alpha', 'beta'],
      winner: 'alpha',
      turns: actionCount,
      duration: 1000,
      createdAt: Date.now(),
      actionCount,
    },
    initialState: '{}',
    actions,
  };
}

describe('ReplayManager — recording', () => {
  it('isCurrentlyRecording is false by default', () => {
    const rm = makeManager();
    expect(rm.isCurrentlyRecording()).toBe(false);
  });

  it('isCurrentlyRecording is true after startRecording', () => {
    const rm = makeManager();
    rm.startRecording('{}', 'europe', ['alpha', 'beta']);
    expect(rm.isCurrentlyRecording()).toBe(true);
  });

  it('recordAction adds actions during recording', () => {
    const rm = makeManager();
    rm.startRecording('{}', 'europe', ['alpha', 'beta']);
    rm.recordAction(1, 'combat', 'alpha', 'move', { from: 'a', to: 'b' });
    rm.recordAction(1, 'combat', 'alpha', 'attack', { from: 'a', to: 'b' });
    const replay = rm.stopRecording('alpha');
    expect(replay!.actions).toHaveLength(2);
    expect(replay!.metadata.actionCount).toBe(2);
  });

  it('recordAction does nothing when not recording', () => {
    const rm = makeManager();
    rm.recordAction(1, 'combat', 'alpha', 'move', {});
    // No replay to check, but should not throw
    expect(rm.isCurrentlyRecording()).toBe(false);
  });

  it('stopRecording sets winner on metadata', () => {
    const rm = makeManager();
    rm.startRecording('{}', 'europe', ['alpha', 'beta']);
    const replay = rm.stopRecording('alpha');
    expect(replay!.metadata.winner).toBe('alpha');
  });

  it('stopRecording returns null when not recording', () => {
    const rm = makeManager();
    expect(rm.stopRecording('alpha')).toBeNull();
  });

  it('stopRecording sets isRecording to false', () => {
    const rm = makeManager();
    rm.startRecording('{}', 'europe', ['alpha']);
    rm.stopRecording();
    expect(rm.isCurrentlyRecording()).toBe(false);
  });
});

describe('ReplayManager — storage', () => {
  it('stopRecording saves replay to localStorage', () => {
    const rm = makeManager();
    rm.startRecording('{}', 'europe', ['alpha']);
    const replay = rm.stopRecording('alpha');
    const stored = rm.getStoredReplays();
    expect(stored.some(r => r.metadata.id === replay!.metadata.id)).toBe(true);
  });

  it('loadReplay retrieves a replay by id', () => {
    const rm = makeManager();
    rm.startRecording('{}', 'europe', ['alpha']);
    const replay = rm.stopRecording('alpha');
    const loaded = rm.loadReplay(replay!.metadata.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.metadata.id).toBe(replay!.metadata.id);
  });

  it('loadReplay returns null for unknown id', () => {
    const rm = makeManager();
    expect(rm.loadReplay('ghost_id')).toBeNull();
  });

  it('deleteReplay removes it from storage', () => {
    const rm = makeManager();
    rm.startRecording('{}', 'europe', ['alpha']);
    const replay = rm.stopRecording('alpha');
    rm.deleteReplay(replay!.metadata.id);
    expect(rm.loadReplay(replay!.metadata.id)).toBeNull();
  });

  it('only keeps the most recent 10 replays', () => {
    const rm = makeManager();
    for (let i = 0; i < 12; i++) {
      rm.startRecording('{}', 'europe', ['alpha']);
      rm.stopRecording('alpha');
    }
    expect(rm.getStoredReplays().length).toBeLessThanOrEqual(10);
  });
});

describe('ReplayManager — playback: stepForward / stepBack', () => {
  it('hasPlayback is false before startPlayback', () => {
    const rm = makeManager();
    expect(rm.hasPlayback()).toBe(false);
  });

  it('hasPlayback is true after startPlayback', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay());
    expect(rm.hasPlayback()).toBe(true);
  });

  it('getTotalSteps returns action count', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(5));
    expect(rm.getTotalSteps()).toBe(5);
  });

  it('getCurrentStep starts at 0', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    expect(rm.getCurrentStep()).toBe(0);
  });

  it('stepForward advances the index and returns the action', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    const action = rm.stepForward();
    expect(action).not.toBeNull();
    expect(rm.getCurrentStep()).toBe(1);
  });

  it('stepForward returns null at end of replay', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(2));
    rm.stepForward(); // step 1
    rm.stepForward(); // step 2
    const result = rm.stepForward(); // past end
    expect(result).toBeNull();
  });

  it('stepBack decrements the index', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    rm.stepForward();
    rm.stepForward();
    rm.stepBack();
    expect(rm.getCurrentStep()).toBe(1);
  });

  it('stepBack returns false at index 0', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    expect(rm.stepBack()).toBe(false);
  });
});

describe('ReplayManager — seekTo', () => {
  it('seekTo jumps directly to the specified index', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(5));
    rm.seekTo(3);
    expect(rm.getCurrentStep()).toBe(3);
  });

  it('seekTo clamps to [0, totalSteps]', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    rm.seekTo(-5);
    expect(rm.getCurrentStep()).toBe(0);
    rm.seekTo(100);
    expect(rm.getCurrentStep()).toBe(3);
  });
});

describe('ReplayManager — getActionsToCurrentStep', () => {
  it('returns empty array before any steps', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    expect(rm.getActionsToCurrentStep()).toHaveLength(0);
  });

  it('returns actions up to current index after stepping', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(5));
    rm.stepForward();
    rm.stepForward();
    const actions = rm.getActionsToCurrentStep();
    expect(actions).toHaveLength(2);
  });
});

describe('ReplayManager — listeners', () => {
  it('onStep fires when stepForward is called', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    const received: number[] = [];
    rm.onStep((_action, index) => received.push(index));
    rm.stepForward();
    expect(received).toContain(0);
  });

  it('onPlaybackEnd fires when replay is exhausted', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(1));
    let ended = false;
    rm.onPlaybackEnd(() => { ended = true; });
    rm.stepForward();
    expect(ended).toBe(true);
  });

  it('onStep unsubscribe works', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    const received: number[] = [];
    const unsub = rm.onStep((_action, index) => received.push(index));
    unsub();
    rm.stepForward();
    expect(received).toHaveLength(0);
  });
});

describe('ReplayManager — stopPlayback', () => {
  it('stopPlayback unloads the replay', () => {
    const rm = makeManager();
    rm.startPlayback(makeReplay(3));
    rm.stopPlayback();
    expect(rm.hasPlayback()).toBe(false);
    expect(rm.getCurrentStep()).toBe(0);
  });
});

describe('ReplayManager — getPlaybackMetadata', () => {
  it('returns null when no replay loaded', () => {
    const rm = makeManager();
    expect(rm.getPlaybackMetadata()).toBeNull();
  });

  it('returns metadata when replay is loaded', () => {
    const rm = makeManager();
    const replay = makeReplay(2);
    rm.startPlayback(replay);
    expect(rm.getPlaybackMetadata()!.id).toBe(replay.metadata.id);
  });
});
