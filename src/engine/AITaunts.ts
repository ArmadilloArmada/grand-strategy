/**
 * AITaunts - Faction-specific flavor text for AI actions
 */

import { rng } from './rng';

type TauntContext = 'attack' | 'defend_win' | 'victory' | 'diplomacy_propose' | 'diplomacy_decline' | 'low_on_ipcs' | 'nuclear_threat';

const TAUNTS: Record<string, Record<TauntContext, string[]>> = {
  eastern_coalition: {
    attack: [
      'The Eastern Coalition advances. Resistance is futile.',
      'Our armies move like the tide — unstoppable.',
      'Mother Russia does not ask. She takes.',
      'You cannot hold that ground. We will prove it.',
    ],
    defend_win: [
      'The Coalition does not yield. Not now, not ever.',
      'You broke yourselves against our lines. Good.',
      'Defenders of the Motherland have repelled your advance.',
      'We have defended every inch. Come again.',
    ],
    victory: [
      'The Eastern Coalition stands triumphant. History has been written.',
      'From the steppes to the horizon — all is ours.',
      'The Bear does not kneel.',
    ],
    diplomacy_propose: [
      'A temporary arrangement... advantageous for both parties.',
      'An alliance of convenience. Do not mistake it for trust.',
      'We propose terms. Consider them carefully.',
    ],
    diplomacy_decline: [
      'Your terms are unacceptable. Do not waste our time again.',
      'We decline. Prepare for the consequences.',
      'The Coalition negotiates from strength only.',
    ],
    low_on_ipcs: [
      'Resources stretch thin, but the will of the Coalition does not.',
      'We have fought with less. We will endure.',
    ],
    nuclear_threat: [
      'Our nuclear program is not a bluff. Tread carefully.',
      'We have the capability. Consider whether you wish to test it.',
    ],
  },

  atlantic_alliance: {
    attack: [
      'Freedom isn\'t free — and we\'re cashing in.',
      'The Alliance moves to liberate another territory.',
      'Democracy has a military division. Say hello.',
      'Outgunned? Never. Outspent? Impossible.',
    ],
    defend_win: [
      'The Alliance holds. As always.',
      'You\'ll have to do better than that.',
      'Our resolve is not something you can bomb into submission.',
      'Allied forces repel the assault. Try again.',
    ],
    victory: [
      'Liberty prevails. It always does.',
      'The Alliance has carried the day. Congratulations to our brave forces.',
      'Another chapter in the history of freedom.',
    ],
    diplomacy_propose: [
      'We believe mutual interests align here. Let\'s talk.',
      'The Alliance extends a hand. We hope you\'ll shake it.',
      'A formal arrangement could benefit us both.',
    ],
    diplomacy_decline: [
      'Unfortunate. The Alliance prefers diplomacy, but we have other options.',
      'We note your refusal. We will act accordingly.',
      'Your loss. Literally.',
    ],
    low_on_ipcs: [
      'Even the mightiest economy has lean quarters.',
      'We\'re reallocating budget priorities. Don\'t celebrate yet.',
    ],
    nuclear_threat: [
      'Our deterrent is ready. Let\'s hope it stays deterrent.',
      'The button exists. We\'d rather not push it.',
    ],
  },

  pacific_union: {
    attack: [
      'Strike fast. Strike now. Strike deep.',
      'The Union moves like lightning across the Pacific.',
      'Our forces are already there before you realized we left.',
      'Speed is our doctrine. Paralysis is your fate.',
    ],
    defend_win: [
      'You cannot hold what you have never understood.',
      'The Union does not break. It bends — then strikes back.',
      'Repelled. Perhaps rethink your approach.',
      'Every island, every atoll — defended.',
    ],
    victory: [
      'The Pacific belongs to the Union. As it should.',
      'Swift victory — the only kind worth having.',
      'From the rising sun to the horizon, all is ours.',
    ],
    diplomacy_propose: [
      'The Union values strategic partnership. Are you interested?',
      'We propose terms that suit both our interests.',
      'An alliance of equals. Consider it.',
    ],
    diplomacy_decline: [
      'Very well. We operate better alone anyway.',
      'Your refusal noted. Adjusting strategy accordingly.',
      'No matter. The Union adapts.',
    ],
    low_on_ipcs: [
      'Lean times require bold moves.',
      'We have never needed wealth to move fast.',
    ],
    nuclear_threat: [
      'Island Hopping was just the beginning of our reach.',
      'Do not mistake our silence for weakness.',
    ],
  },

  southern_federation: {
    attack: [
      'The jungle is our ally. You are in our territory now.',
      'Every hill, every river — we know it. You do not.',
      'Guerrillas do not announce themselves. That is the point.',
      'We fight on our terms. Always.',
    ],
    defend_win: [
      'You cannot win a war against a people who refuse to lose.',
      'Repelled again. You are learning the wrong lessons.',
      'The Federation bleeds but does not fall.',
      'Go home. This is not your land.',
    ],
    victory: [
      'The underdog wins. Remember this day.',
      'We fought from nothing. Now we have everything.',
      'The South rises — and does not fall again.',
    ],
    diplomacy_propose: [
      'We offer what we have — a fierce and loyal ally.',
      'The Federation does not forget its friends.',
      'A partnership built on necessity. The best kind.',
    ],
    diplomacy_decline: [
      'Your loss. We survive alone if we must.',
      'Noted. We adapt.',
      'Fine. More territory for us.',
    ],
    low_on_ipcs: [
      'We have always fought poor. It sharpens you.',
      'Resources matter less than will.',
    ],
    nuclear_threat: [
      'Even the humble can reach great heights — or great destruction.',
      'Do not count us out. We are full of surprises.',
    ],
  },
};

const GENERIC: Record<TauntContext, string[]> = {
  attack:            ['Forces are advancing.', 'The offensive begins.'],
  defend_win:        ['Assault repelled.', 'Defences hold.'],
  victory:           ['Victory achieved.', 'The war is won.'],
  diplomacy_propose: ['A proposal is on the table.', 'Diplomatic terms offered.'],
  diplomacy_decline: ['Proposal declined.', 'No agreement reached.'],
  low_on_ipcs:       ['Resources are stretched.', 'Economy under pressure.'],
  nuclear_threat:    ['Nuclear program advances.', 'The ultimate weapon nears readiness.'],
};

function pick(arr: string[]): string {
  return arr[Math.floor(rng.next() * arr.length)];
}

export function getAITaunt(factionId: string, context: TauntContext): string {
  const pool = TAUNTS[factionId]?.[context] ?? GENERIC[context];
  return pick(pool);
}
