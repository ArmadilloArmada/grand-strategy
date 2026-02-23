/**
 * Scenario - Premade game setups (map + victory + turn limit)
 */

import { MapData } from '../loaders/MapLoader';
import { VictoryType } from './GameConfig';

export interface ScenarioData {
  id: string;
  name: string;
  description: string;
  map: MapData;
  victoryType: VictoryType;
  turnLimit: number;
  capitalsToWin?: number;
  territoriesPercent?: number;
  economicTarget?: number;
  humanFactions?: string[]; // Default human player(s)
}

export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  victoryType: VictoryType;
  turnLimit: number;
}