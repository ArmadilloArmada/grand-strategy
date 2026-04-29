/**
 * Per-map faction definitions.
 * Maps that use different faction IDs than world-factions.json,
 * or that need different capital territory IDs, declare their factions here.
 */

import type { FactionData } from './Faction';

// Shared bonus templates from the world factions — reused by geographic variants
const ATLANTIC_BONUSES = { ipcPerFactory: 1, navalAttackBonus: 1, researchSpeedBonus: 0.25, incomeMultiplierBonus: 0.1 };
const EASTERN_BONUSES  = { infantryDefenseBonus: 1, counterIntelBonus: 0.3 };
const PACIFIC_BONUSES  = { movementBonus: 1, navalAttackBonus: 1 };
const SOUTHERN_BONUSES = { unitCostDiscount: 1, incomeMultiplierBonus: 0.05 };

// ── European Theater ─────────────────────────────────────────────────────────
export const EUROPE_FACTIONS: FactionData[] = [
  { id: 'atlantic_alliance', name: 'Atlantic Alliance', color: '#4a90d9', colorLight: '#7eb3eb', capital: 'england',   startingIPCs: 30, turnOrder: 1, isPlayable: true, allies: [], bonuses: ATLANTIC_BONUSES, playstyle: 'Industrial Powerhouse',  description: 'Strong economy and production. Excels at building and sustaining large armies.' },
  { id: 'eastern_coalition', name: 'Eastern Coalition', color: '#e85d75', colorLight: '#f08090', capital: 'russia_c', startingIPCs: 40, turnOrder: 2, isPlayable: true, allies: [], bonuses: EASTERN_BONUSES,  playstyle: 'Defensive Juggernaut',   description: 'Masters of defense. Infantry hold the line while armor counterattacks.' },
  { id: 'southern_federation',name:'Southern Federation',color:'#f5a623', colorLight:'#ffc857', capital: 'italy_s',   startingIPCs: 25, turnOrder: 3, isPlayable: true, allies: [], bonuses: SOUTHERN_BONUSES, playstyle: 'Guerrilla Warfare',      description: 'Resourceful and adaptable. Cheaper units and terrain advantages.' },
  { id: 'pacific_union',      name: 'Pacific Union',      color: '#00a896', colorLight: '#2dd4bf', capital: 'turkey_e', startingIPCs: 25, turnOrder: 4, isPlayable: true, allies: [], bonuses: PACIFIC_BONUSES,  playstyle: 'Rapid Expansion',        description: 'Swift and mobile forces. Strike fast, capture quickly, consolidate.' },
];

// ── Pacific Ring ─────────────────────────────────────────────────────────────
export const PACIFIC_FACTIONS: FactionData[] = [
  { id: 'pacific_union',       name: 'Pacific Union',       color: '#00a896', colorLight: '#2dd4bf', capital: 'honshu_s', startingIPCs: 40, turnOrder: 1, isPlayable: true, allies: [], bonuses: PACIFIC_BONUSES,  playstyle: 'Rapid Expansion',      description: 'Swift and mobile forces. Strike fast, capture quickly, consolidate.' },
  { id: 'eastern_coalition',   name: 'Eastern Coalition',   color: '#e85d75', colorLight: '#f08090', capital: 'china_n',  startingIPCs: 40, turnOrder: 2, isPlayable: true, allies: [], bonuses: EASTERN_BONUSES,  playstyle: 'Defensive Juggernaut', description: 'Masters of defense. Infantry hold the line while armor counterattacks.' },
  { id: 'southern_federation', name: 'Southern Federation', color: '#f5a623', colorLight: '#ffc857', capital: 'india_n',  startingIPCs: 30, turnOrder: 3, isPlayable: true, allies: [], bonuses: SOUTHERN_BONUSES, playstyle: 'Guerrilla Warfare',    description: 'Resourceful and adaptable. Cheaper units and terrain advantages.' },
  { id: 'atlantic_alliance',   name: 'Atlantic Alliance',   color: '#4a90d9', colorLight: '#7eb3eb', capital: 'aust_e',   startingIPCs: 25, turnOrder: 4, isPlayable: true, allies: [], bonuses: ATLANTIC_BONUSES, playstyle: 'Industrial Powerhouse', description: 'Strong economy and production. Excels at building and sustaining large armies.' },
];

// ── Western Hemisphere ───────────────────────────────────────────────────────
export const AMERICAS_FACTIONS: FactionData[] = [
  { id: 'atlantic_alliance',   name: 'Atlantic Alliance',   color: '#4a90d9', colorLight: '#7eb3eb', capital: 'quebec',   startingIPCs: 35, turnOrder: 1, isPlayable: true, allies: [], bonuses: ATLANTIC_BONUSES, playstyle: 'Industrial Powerhouse', description: 'Strong economy and production. Excels at building and sustaining large armies.' },
  { id: 'southern_federation', name: 'Southern Federation', color: '#f5a623', colorLight: '#ffc857', capital: 'brazil_s', startingIPCs: 30, turnOrder: 2, isPlayable: true, allies: [], bonuses: SOUTHERN_BONUSES, playstyle: 'Guerrilla Warfare',     description: 'Resourceful and adaptable. Cheaper units and terrain advantages.' },
];

// ── African Campaign ──────────────────────────────────────────────────────────
export const AFRICA_FACTIONS: FactionData[] = [
  { id: 'axis_africa',    name: 'Axis Forces',    color: '#6b4e1e', colorLight: '#a0763e', capital: 'morocco', startingIPCs: 30, turnOrder: 1, isPlayable: true, allies: [],           bonuses: { armorAttackBonus: 1 },              playstyle: 'Blitzkrieg', description: 'Aggressive armored spearheads driving deep into enemy territory.' },
  { id: 'allies_africa',  name: 'Allied Forces',  color: '#2d7d46', colorLight: '#4caf6e', capital: 'egypt',   startingIPCs: 40, turnOrder: 2, isPlayable: true, allies: ['free_africa'], bonuses: { navalAttackBonus: 1, researchSpeedBonus: 0.2 }, playstyle: 'Combined Arms', description: 'Industrial might and naval supremacy. Outlast and overwhelm.' },
  { id: 'vichy_africa',   name: 'Vichy Colonies', color: '#8b8b00', colorLight: '#b5b530', capital: 'senegal', startingIPCs: 20, turnOrder: 3, isPlayable: true, allies: [],           bonuses: { unitCostDiscount: 1 },              playstyle: 'Holdout',    description: 'Hold what remains with limited resources and opportunistic strikes.' },
  { id: 'free_africa',    name: 'Free Africa',    color: '#c0392b', colorLight: '#e74c3c', capital: 'drc',     startingIPCs: 20, turnOrder: 4, isPlayable: true, allies: ['allies_africa'], bonuses: { infantryDefenseBonus: 1 },       playstyle: 'Resistance', description: 'Fight back from the shadows. Guerrilla tactics and resilient defense.' },
];

// ── Eastern Front ─────────────────────────────────────────────────────────────
export const EASTERN_FRONT_FACTIONS: FactionData[] = [
  { id: 'axis',            name: 'Axis Powers',     color: '#5a4a1e', colorLight: '#8a7040', capital: 'germany_n', startingIPCs: 50, turnOrder: 1, isPlayable: true, allies: [],  bonuses: { armorAttackBonus: 1, movementBonus: 1 }, playstyle: 'Blitzkrieg',       description: 'Fast-moving armored columns. Strike before the enemy can respond.' },
  { id: 'soviets',         name: 'Soviet Union',    color: '#8b1a1a', colorLight: '#c0392b', capital: 'moscow',    startingIPCs: 45, turnOrder: 2, isPlayable: true, allies: ['western_allies'], bonuses: { infantryDefenseBonus: 1, incomeMultiplierBonus: 0.1 }, playstyle: 'Deep Defense', description: 'Trade space for time. Absorb punishment and crush the enemy in winter.' },
  { id: 'western_allies',  name: 'Western Allies',  color: '#1a5276', colorLight: '#2980b9', capital: 'india_n',   startingIPCs: 30, turnOrder: 3, isPlayable: true, allies: ['soviets'], bonuses: { navalAttackBonus: 1, researchSpeedBonus: 0.15 }, playstyle: 'Support Role', description: 'Naval and air supremacy. Supply the front and open a second front.' },
];

// ── Skirmish 2v2 ──────────────────────────────────────────────────────────────
export const SKIRMISH_FACTIONS: FactionData[] = [
  { id: 'red_faction',  name: 'Red Command',  color: '#c0392b', colorLight: '#e74c3c', capital: 'red_cap',  startingIPCs: 20, turnOrder: 1, isPlayable: true, allies: [], bonuses: { armorAttackBonus: 1 },        playstyle: 'Aggressive', description: 'Strike hard and fast. Offense is the best defense.' },
  { id: 'blue_faction', name: 'Blue Command', color: '#1a5276', colorLight: '#2980b9', capital: 'blue_cap', startingIPCs: 20, turnOrder: 2, isPlayable: true, allies: [], bonuses: { infantryDefenseBonus: 1 }, playstyle: 'Defensive',  description: 'Hold the line. Let the enemy exhaust themselves on your defenses.' },
];

// ── Mediterranean Theater ─────────────────────────────────────────────────────
export const MEDITERRANEAN_FACTIONS: FactionData[] = [
  { id: 'med_nord',     name: 'Northern Powers',   color: '#4a90d9', colorLight: '#7eb3eb', capital: 'mn_cap', startingIPCs: 30, turnOrder: 1, isPlayable: true, allies: [], bonuses: { ipcPerFactory: 1, navalAttackBonus: 1 },             playstyle: 'Industrial Navy',    description: 'Factory wealth fuels a powerful fleet. Control the sea, control the trade.' },
  { id: 'med_orient',   name: 'Eastern Empire',    color: '#e85d75', colorLight: '#f08090', capital: 'mo_cap', startingIPCs: 30, turnOrder: 2, isPlayable: true, allies: [], bonuses: { infantryDefenseBonus: 1, counterIntelBonus: 0.3 },    playstyle: 'Fortress East',      description: 'Ancient fortifications and veteran infantry hold every inch of ground.' },
  { id: 'med_hispania', name: 'Western League',    color: '#f5a623', colorLight: '#ffc857', capital: 'mh_cap', startingIPCs: 25, turnOrder: 3, isPlayable: true, allies: [], bonuses: { movementBonus: 1, unitCostDiscount: 1 },              playstyle: 'Mobile Skirmishers', description: 'Fast, cheap forces that strike from unexpected angles.' },
  { id: 'med_sahara',   name: 'Desert Coalition',  color: '#00a896', colorLight: '#2dd4bf', capital: 'mk_cap', startingIPCs: 25, turnOrder: 4, isPlayable: true, allies: [], bonuses: { infantryDefenseBonus: 1, incomeMultiplierBonus: 0.1 }, playstyle: 'Desert Warriors',    description: 'Hardy fighters on contested sands. Outproduce the enemy over a long war.' },
];

// ── Arctic Circle ─────────────────────────────────────────────────────────────
export const ARCTIC_FACTIONS: FactionData[] = [
  { id: 'arc_polar', name: 'Polar Dominion', color: '#5bc8f5', colorLight: '#93dff9', capital: 'pn_cap', startingIPCs: 25, turnOrder: 1, isPlayable: true, allies: [], bonuses: { infantryDefenseBonus: 1, movementBonus: 1 },            playstyle: 'Arctic Raiders',   description: 'Born in the ice. Infantry move freely and dig in where others would freeze.' },
  { id: 'arc_east',  name: 'Eastern Reach',  color: '#e85d75', colorLight: '#f08090', capital: 'ae_cap', startingIPCs: 25, turnOrder: 2, isPlayable: true, allies: [], bonuses: { armorAttackBonus: 1, counterIntelBonus: 0.25 },         playstyle: 'Steel Advance',    description: 'Armored columns backed by deep intelligence networks push across the tundra.' },
  { id: 'arc_south', name: 'Southern League', color: '#2d7d46', colorLight: '#4caf6e', capital: 'sl_cap', startingIPCs: 35, turnOrder: 3, isPlayable: true, allies: [], bonuses: { ipcPerFactory: 1, incomeMultiplierBonus: 0.1 },        playstyle: 'Economic Giant',   description: 'Vast territories and factories grind out units. Wealth wins the long game.' },
];

// ── Island Chains (Archipelago) ───────────────────────────────────────────────
export const ARCHIPELAGO_FACTIONS: FactionData[] = [
  { id: 'isle_n', name: 'Northern Isles', color: '#4a90d9', colorLight: '#7eb3eb', capital: 'in_cap', startingIPCs: 28, turnOrder: 1, isPlayable: true, allies: [], bonuses: { navalAttackBonus: 1, ipcPerFactory: 1 },              playstyle: 'Naval Supremacy',  description: 'Powerful warships backed by island industry. Rule the waves, rule the world.' },
  { id: 'isle_e', name: 'Eastern Isles',  color: '#e85d75', colorLight: '#f08090', capital: 'ie_cap', startingIPCs: 28, turnOrder: 2, isPlayable: true, allies: [], bonuses: { navalAttackBonus: 1, movementBonus: 1 },             playstyle: 'Swift Raider',     description: 'Fast fleets strike and withdraw before the enemy can react.' },
  { id: 'isle_w', name: 'Western Isles',  color: '#f5a623', colorLight: '#ffc857', capital: 'iw_cap', startingIPCs: 24, turnOrder: 3, isPlayable: true, allies: [], bonuses: { infantryDefenseBonus: 1, unitCostDiscount: 1 },      playstyle: 'Island Fortress',  description: 'Cheap defenders packed into natural chokepoints make every landing costly.' },
  { id: 'isle_s', name: 'Southern Isles', color: '#2d7d46', colorLight: '#4caf6e', capital: 'is_cap', startingIPCs: 24, turnOrder: 4, isPlayable: true, allies: [], bonuses: { researchSpeedBonus: 0.3, incomeMultiplierBonus: 0.1 }, playstyle: 'Tech Ascendancy', description: 'Invest in research. Better units at every tier make the difference.' },
];
