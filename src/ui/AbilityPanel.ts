import type { FactionAbility } from '../engine/FactionAbilities';

export interface AbilityPanelData {
  visible: boolean;
  ability?: FactionAbility;
  ready?: boolean;
  turnsLeft?: number;
  disabled?: boolean;
}

export class AbilityPanel {
  update(data: AbilityPanelData): void {
    const button = document.getElementById('btn-faction-ability') as HTMLButtonElement | null;
    const description = document.getElementById('faction-ability-desc');
    const container = document.getElementById('faction-ability-container');
    if (!button) return;

    if (!data.visible || !data.ability) {
      button.classList.add('hidden');
      container?.classList.add('hidden');
      return;
    }

    const ready = data.ready ?? false;
    const turnsLeft = data.turnsLeft ?? 0;
    button.classList.remove('hidden');
    container?.classList.remove('hidden');
    button.disabled = data.disabled ?? !ready;
    button.title = data.ability.description;
    button.textContent = ready
      ? `Ability: ${data.ability.name}`
      : `Ability: ${data.ability.name} (${turnsLeft}t)`;
    if (description) {
      description.textContent = data.ability.flavorText || data.ability.description;
    }
  }
}
