/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { AbilityPanel } from '../AbilityPanel';
import type { FactionAbility } from '../../engine/FactionAbilities';

const ability: FactionAbility = {
  id: 'marshall_plan',
  factionId: 'atlantic_alliance',
  name: 'Marshall Plan',
  description: 'Spend IPCs to boost the economy.',
  flavorText: 'Rebuild. Reinvest. Dominate.',
  cost: 20,
  cooldownTurns: 6,
  needsTarget: false,
};

function mountPanel(): AbilityPanel {
  document.body.innerHTML = `
    <div id="faction-ability-container" class="hidden">
      <button id="btn-faction-ability" class="hidden"></button>
      <div id="faction-ability-desc"></div>
    </div>
  `;
  return new AbilityPanel();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AbilityPanel', () => {
  it('shows a ready ability as a clear command label', () => {
    const panel = mountPanel();

    panel.update({ visible: true, ability, ready: true, disabled: false });

    const button = document.querySelector<HTMLButtonElement>('#btn-faction-ability');
    expect(document.getElementById('faction-ability-container')?.classList.contains('hidden')).toBe(false);
    expect(button?.classList.contains('hidden')).toBe(false);
    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toBe('Ability: Marshall Plan');
    expect(button?.title).toBe(ability.description);
    expect(document.getElementById('faction-ability-desc')?.textContent).toBe(ability.flavorText);
  });

  it('shows cooldown turns and disables unavailable abilities', () => {
    const panel = mountPanel();

    panel.update({ visible: true, ability, ready: false, turnsLeft: 3 });

    const button = document.querySelector<HTMLButtonElement>('#btn-faction-ability');
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('Ability: Marshall Plan (3t)');
  });

  it('hides the panel when no ability should be shown', () => {
    const panel = mountPanel();

    panel.update({ visible: false });

    expect(document.getElementById('faction-ability-container')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('btn-faction-ability')?.classList.contains('hidden')).toBe(true);
  });
});
