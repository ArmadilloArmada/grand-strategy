/**
 * AIActivityFeed - routes AI turn actions into the unified battle log.
 */

import { battleLog } from './BattleLog';

class AIActivityFeed {
  private currentTurn: number = 1;

  setTurn(turn: number): void {
    this.currentTurn = turn;
  }

  add(factionName: string, factionColor: string, message: string, action?: string): void {
    const cleanMessage = message.startsWith(factionName)
      ? message.slice(factionName.length).trim()
      : message;
    battleLog.addAI(this.currentTurn, factionName, factionColor, cleanMessage, this.getActionLabel(action));
  }

  hideBanner(): void {
    document.getElementById('ai-activity-banner')?.classList.remove('visible');
  }

  clear(): void {
    // Battle log manages its own history; nothing to clear here
  }

  private getActionLabel(action?: string): string | undefined {
    switch (action) {
      case 'attack':    return 'planned attack';
      case 'capture':   return 'battle result';
      case 'battle':    return 'battle result';
      case 'mobilize':  return 'mobilization';
      case 'phase':     return undefined;
      default:          return undefined;
    }
  }
}

export const aiActivityFeed = new AIActivityFeed();
