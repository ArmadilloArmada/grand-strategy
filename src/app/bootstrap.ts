export interface BootstrapGame {
  init: () => Promise<void>;
}

/**
 * App bootstrap wrapper so entrypoints can stay thin and focused.
 */
export function bootstrapGame(createGame: () => BootstrapGame): void {
  document.addEventListener('DOMContentLoaded', async () => {
    const game = createGame();
    try {
      await game.init();
      (window as any).game = game;
    } catch (error) {
      console.error('Game failed to initialize:', error);
      const crash = document.getElementById('crash-screen');
      const detail = document.getElementById('crash-detail');
      if (crash && detail) {
        crash.style.display = 'flex';
        detail.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
      }
    }
  });
}
