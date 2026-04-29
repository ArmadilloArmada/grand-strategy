/**
 * BattleNarrator - Generates flavour text after each battle
 */

export interface NarrativeParams {
  territoryName: string;
  attackerFactionName: string;
  defenderFactionName: string;
  attackerCasualties: number;
  defenderCasualties: number;
  winner: 'attacker' | 'defender' | 'draw' | null;
  attackerCommander?: string;
  defenderCommander?: string;
  turnNumber: number;
  isCapital?: boolean;
  isWinter?: boolean;
}

const ATTACKER_WIN: string[] = [
  '{atk} forces overwhelm the defenders of {ter}, seizing the territory after a brutal assault.',
  'After fierce street fighting, {atk} plants its flag over {ter}. The defenders scattered.',
  'The assault on {ter} is swift and decisive. {atk} suffers losses but the prize is theirs.',
  '{ter} falls. The {def} garrison fought well, but could not hold.',
  'A well-coordinated {atk} offensive shatters the {def} lines at {ter}.',
  'Through smoke and chaos, {atk} troops break through the {def} perimeter at {ter}.',
];

const ATTACKER_WIN_COMMANDER: string[] = [
  'Under {atkCmd}\'s bold leadership, {atk} storms {ter} and routs the {def} garrison.',
  '{atkCmd} personally directs the final push into {ter}. The {def} forces collapse.',
  'With {atkCmd} at the vanguard, {atk} tears through {def} defences at {ter}.',
];

const DEFENDER_WIN: string[] = [
  'The assault on {ter} is repelled. {def} defenders hold the line at tremendous cost.',
  '{atk} waves break against the {def} fortifications at {ter} — the attack fails.',
  'Bitter resistance from {def} troops forces {atk} to retreat from {ter}.',
  '{ter} stands firm. {def} forces refuse to yield despite overwhelming pressure.',
  'The attack on {ter} stalls and collapses. {def} defenders celebrate a hard-won victory.',
  '{atk} advances grind to a halt before {ter}. {def} lines hold.',
];

const DEFENDER_WIN_COMMANDER: string[] = [
  '{defCmd} rallies the garrison and {def} repels the {atk} attack on {ter}.',
  'Under {defCmd}\'s steady command, {def} forces throw back the {atk} assault at {ter}.',
];

const DRAW: string[] = [
  'Both sides suffer terribly at {ter}. No decisive result — the fighting continues.',
  'The battle for {ter} ends in exhaustion. Neither {atk} nor {def} can claim victory.',
  '{ter} becomes a killing ground as {atk} and {def} grind each other to a halt.',
];

const PYRRHIC: string[] = [
  '{atk} takes {ter}, but at a price that may haunt them for the rest of the war.',
  'A costly victory: {atk} wins {ter} but loses more than the territory was worth.',
];

const CAPITAL_WIN: string[] = [
  '{atk} troops storm the {def} capital at {ter}! This may prove decisive.',
  'CAPITAL FALLS: {ter} is in {atk} hands. {def} reels from this catastrophic blow.',
  'The {def} capital at {ter} is overrun. The heart of their empire is lost.',
];

const WINTER: string[] = [
  'Frostbitten {atk} troops push through blizzard conditions to take {ter}.',
  'Despite brutal winter cold, {atk} forces seize {ter} from the {def} defenders.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fill(template: string, p: NarrativeParams): string {
  return template
    .replace(/{ter}/g, p.territoryName)
    .replace(/{atk}/g, p.attackerFactionName)
    .replace(/{def}/g, p.defenderFactionName)
    .replace(/{atkCmd}/g, p.attackerCommander ?? '')
    .replace(/{defCmd}/g, p.defenderCommander ?? '');
}

export function generateBattleNarrative(p: NarrativeParams): string {
  const totalCasualties = p.attackerCasualties + p.defenderCasualties;
  const isPyrrhic = p.winner === 'attacker' && p.attackerCasualties > p.defenderCasualties * 1.5;

  if (p.winner === 'attacker') {
    if (p.isCapital) return fill(pick(CAPITAL_WIN), p);
    if (p.isWinter && Math.random() < 0.4) return fill(pick(WINTER), p);
    if (isPyrrhic && totalCasualties > 4) return fill(pick(PYRRHIC), p);
    if (p.attackerCommander && Math.random() < 0.5) return fill(pick(ATTACKER_WIN_COMMANDER), p);
    return fill(pick(ATTACKER_WIN), p);
  }

  if (p.winner === 'defender') {
    if (p.defenderCommander && Math.random() < 0.5) return fill(pick(DEFENDER_WIN_COMMANDER), p);
    return fill(pick(DEFENDER_WIN), p);
  }

  return fill(pick(DRAW), p);
}
