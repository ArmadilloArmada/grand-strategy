/**
 * WeatherSystem - Dynamic weather events that modify combat, movement, and supply.
 *
 * Each turn a random weather event may occur. Events are season-weighted so
 * blizzards only happen in winter, storms in autumn/winter, etc.
 * Weather effects layer on top of the existing seasonal winter penalty already
 * present in CombatResolver; the resolver should call getWeatherModifiers()
 * instead of the raw isWinter check going forward.
 */

import { GameState } from './GameState';
import { rng } from './rng';
import { TerrainType } from '../data/Territory';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WeatherCondition =
  | 'clear'
  | 'rain'
  | 'fog'
  | 'storm'
  | 'blizzard'
  | 'heat_wave'
  | 'mud';

export interface WeatherEvent {
  condition: WeatherCondition;
  name: string;
  description: string;
  /** How many turns this event lasts (1-3). */
  duration: number;
  /** Turn the event expires (state.turnNumber + duration). */
  expiresAtTurn: number;
}

export interface WeatherModifiers {
  /** Flat penalty to land unit attack (negative = penalty). */
  landAttackMod: number;
  /** Flat penalty to land unit defense (negative = penalty). */
  landDefenseMod: number;
  /** Flat bonus/penalty to air unit attack. */
  airAttackMod: number;
  /** Whether air units are grounded (cannot attack or be used). */
  airGrounded: boolean;
  /** Movement penalty for land units (subtract from move range, min 1). */
  movementPenalty: number;
  /** Whether supply routes are disrupted (applies out-of-supply penalty to all). */
  supplyDisrupted: boolean;
  /** Extra defense bonus for defenders in certain terrain (from heavy rain/mud etc). */
  terrainDefenseBonus: number;
}

// ── Weather table ─────────────────────────────────────────────────────────────

interface WeatherTemplate {
  condition: WeatherCondition;
  name: string;
  description: string;
  minDuration: number;
  maxDuration: number;
  seasons: Array<'spring' | 'summer' | 'autumn' | 'winter'>;
  weight: number; // relative spawn weight within the season
}

const WEATHER_TEMPLATES: WeatherTemplate[] = [
  {
    condition: 'rain',
    name: 'Heavy Rain',
    description: 'Torrential rain turns roads to mud. Land units move -1 and supply is strained.',
    minDuration: 1, maxDuration: 2,
    seasons: ['spring', 'autumn'],
    weight: 3,
  },
  {
    condition: 'fog',
    name: 'Dense Fog',
    description: 'Thick fog limits visibility. Air units are grounded; all combat at -1 attack.',
    minDuration: 1, maxDuration: 1,
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    weight: 2,
  },
  {
    condition: 'storm',
    name: 'Violent Storm',
    description: 'A violent storm batters the front. Air grounded, land attacks -2, defenders +1 in forests and mountains.',
    minDuration: 1, maxDuration: 2,
    seasons: ['autumn', 'winter'],
    weight: 2,
  },
  {
    condition: 'blizzard',
    name: 'Blizzard',
    description: 'A blizzard halts offensives. Land attack/defense -2, movement -2, supply disrupted.',
    minDuration: 1, maxDuration: 3,
    seasons: ['winter'],
    weight: 3,
  },
  {
    condition: 'heat_wave',
    name: 'Heat Wave',
    description: 'Intense heat exhausts troops in the desert. Land units in desert/plains at -1 attack.',
    minDuration: 1, maxDuration: 2,
    seasons: ['summer'],
    weight: 2,
  },
  {
    condition: 'mud',
    name: 'Spring Thaw & Mud',
    description: 'Snowmelt turns the ground to mud. Movement -1 for all land units.',
    minDuration: 1, maxDuration: 2,
    seasons: ['spring'],
    weight: 2,
  },
  {
    condition: 'clear',
    name: 'Clear Skies',
    description: 'Optimal conditions. No weather penalties.',
    minDuration: 1, maxDuration: 3,
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    weight: 4,
  },
];

// Chance per turn that a new weather event replaces the current one (or clear → event)
const WEATHER_CHANGE_CHANCE = 0.35;

// ── WeatherSystem class ───────────────────────────────────────────────────────

export class WeatherSystem {
  public currentEvent: WeatherEvent;

  constructor(private state: GameState) {
    this.currentEvent = this.makeEvent('clear');
  }

  /** Called once per full round (same place as moraleSystem.tickAll). */
  tick(): void {
    // If current event has expired, or random chance triggers a change, pick new weather
    const expired = this.state.turnNumber > this.currentEvent.expiresAtTurn;
    const randomChange = rng.next() < WEATHER_CHANGE_CHANCE;

    if (expired || randomChange) {
      const previous = this.currentEvent.condition;
      this.currentEvent = this.rollWeather();

      if (this.currentEvent.condition !== previous || expired) {
        this.state.emit('game_event', {
          type: 'weather_change',
          condition: this.currentEvent.condition,
          name: this.currentEvent.name,
          description: this.currentEvent.description,
          expiresAtTurn: this.currentEvent.expiresAtTurn,
        });
      }
    }
  }

  /** Returns a plain-object snapshot for save/load. */
  serialize(): { condition: WeatherCondition; name: string; description: string; duration: number; expiresAtTurn: number } {
    return { ...this.currentEvent };
  }

  restore(data: { condition: WeatherCondition; name: string; description: string; duration: number; expiresAtTurn: number }): void {
    this.currentEvent = { ...data };
  }

  /**
   * Returns the modifiers for the current weather event.
   * terrain is the territory's terrain type — some weather hits certain terrain harder.
   */
  getWeatherModifiers(terrain: TerrainType): WeatherModifiers {
    const mods: WeatherModifiers = {
      landAttackMod: 0,
      landDefenseMod: 0,
      airAttackMod: 0,
      airGrounded: false,
      movementPenalty: 0,
      supplyDisrupted: false,
      terrainDefenseBonus: 0,
    };

    // Base seasonal winter penalty (replaces the old isWinter check)
    if (this.state.currentSeason === 'winter') {
      mods.landAttackMod  -= 1;
      mods.landDefenseMod -= 1;
    }

    switch (this.currentEvent.condition) {
      case 'rain':
        mods.landAttackMod -= 1;
        mods.movementPenalty += 1;
        mods.supplyDisrupted = true;
        // Rain benefits defenders in forest/jungle (mud slows attackers)
        if (terrain === 'forest' || terrain === 'jungle') mods.terrainDefenseBonus += 1;
        break;

      case 'fog':
        mods.landAttackMod  -= 1;
        mods.airAttackMod   -= 1;
        mods.airGrounded     = true;
        break;

      case 'storm':
        mods.landAttackMod  -= 2;
        mods.airGrounded     = true;
        // Storm gives mountain/forest defenders extra cover
        if (terrain === 'mountain' || terrain === 'forest') mods.terrainDefenseBonus += 1;
        break;

      case 'blizzard':
        mods.landAttackMod  -= 2;
        mods.landDefenseMod -= 2;
        mods.movementPenalty += 2;
        mods.supplyDisrupted = true;
        mods.airGrounded     = true;
        // Blizzard doesn't stack with the basic winter penalty (it already includes it)
        mods.landAttackMod  += 1; // net: -2 total from blizzard, not -3
        mods.landDefenseMod += 1;
        break;

      case 'heat_wave':
        // Only hits desert/plains — other terrain provides some shelter
        if (terrain === 'desert' || terrain === 'plains') {
          mods.landAttackMod -= 1;
        }
        break;

      case 'mud':
        mods.movementPenalty += 1;
        break;

      case 'clear':
        // No modifiers
        break;
    }

    return mods;
  }

  /** Summary string for HUD display. */
  getDisplayString(): string {
    const c = this.currentEvent;
    const remaining = Math.max(0, c.expiresAtTurn - this.state.turnNumber + 1);
    return `${c.name} (${remaining} turn${remaining !== 1 ? 's' : ''} remaining)`;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private rollWeather(): WeatherEvent {
    const season = this.state.currentSeason;
    const eligible = WEATHER_TEMPLATES.filter(t => t.seasons.includes(season));
    const totalWeight = eligible.reduce((s, t) => s + t.weight, 0);

    let roll = rng.next() * totalWeight;
    let chosen = eligible[eligible.length - 1];
    for (const t of eligible) {
      roll -= t.weight;
      if (roll <= 0) { chosen = t; break; }
    }

    return this.makeEventFromTemplate(chosen);
  }

  private makeEventFromTemplate(template: WeatherTemplate): WeatherEvent {
    const duration = template.minDuration +
      Math.floor(rng.next() * (template.maxDuration - template.minDuration + 1));
    return {
      condition: template.condition,
      name: template.name,
      description: template.description,
      duration,
      expiresAtTurn: this.state.turnNumber + duration - 1,
    };
  }

  private makeEvent(condition: WeatherCondition): WeatherEvent {
    const template = WEATHER_TEMPLATES.find(t => t.condition === condition)!;
    return this.makeEventFromTemplate(template);
  }
}
