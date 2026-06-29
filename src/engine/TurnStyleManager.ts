/**
 * TurnStyleManager - Handles different game turn styles
 */

import { TurnStyle } from "./GameConfig";

export type SimplifiedPhase = "build" | "move" | "attack" | "end";
export type ClassicPhase =
  | "purchase"
  | "combat_move"
  | "combat"
  | "noncombat_move"
  | "production"
  | "collect_income";

/**
 * Get the phases for a given turn style
 */
export function getPhasesForStyle(style: TurnStyle): string[] {
  switch (style) {
    case "classic":
    case "spectator":
    case "action":
      // Classic 6-phase system
      return [
        "purchase",
        "combat_move",
        "combat",
        "noncombat_move",
        "production",
        "collect_income",
      ];

    case "quick":
      // One command phase (mobilize + move + attack), then end turn
      return ["play", "end"];

    case "civilization":
      // Civ-style: units move OR attack
      return ["build", "orders", "resolve", "end"];

    case "chess":
      // Chess-style: one action then opponent goes
      return ["action"];

    case "move_for_move":
      // Freeform: build anytime, alternating moves, end turn to collect
      return ["play"];

    default:
      return [
        "purchase",
        "combat_move",
        "combat",
        "noncombat_move",
        "production",
        "collect_income",
      ];
  }
}

/**
 * Get display name for a phase
 */
export function getPhaseDisplayName(phase: string, _style: TurnStyle): string {
  const names: Record<string, string> = {
    // Classic phases
    purchase: "⚔️ Mobilize Forces",
    combat_move: "⚔️ Combat Movement",
    combat: "🎲 Resolve Combat",
    noncombat_move: "🚶 Non-Combat Movement",
    production: "⚔️ Mobilize Forces",
    collect_income: "💵 Collect Income",

    // Quick phases
    build: "⚔️ Mobilize Forces",
    move: "🚶 Move Units",
    attack: "⚔️ Attack Enemies",
    play: "⚔️ Command Forces",
    end: "💵 End Turn & Collect",

    // Civ phases
    orders: "📋 Give Orders (Move or Attack)",
    resolve: "🎲 Resolve All Actions",

    // Chess phase
    action: "♟️ Your Action",
  };

  return names[phase] || phase;
}

/**
 * Check if AI should pause after their turn
 */
export function shouldPauseAfterAI(style: TurnStyle): boolean {
  return style === "spectator";
}

/**
 * Check if we should pause after each action
 */
export function shouldPauseAfterAction(style: TurnStyle): boolean {
  return style === "action";
}

/**
 * Check if this is a one-action-per-turn style
 */
export function isOneActionPerTurn(style: TurnStyle): boolean {
  return style === "chess";
}

/**
 * Check if units can only move OR attack (not both)
 */
export function isMoveOrAttackOnly(style: TurnStyle): boolean {
  return style === "civilization";
}

/** Alternating single-move segment during the shared move phase */
export function isMoveForMoveStyle(style: TurnStyle): boolean {
  return style === "move_for_move";
}

/**
 * Get phase tips for players
 */
export function getPhaseTip(phase: string, style: TurnStyle): string {
  if (style === "quick") {
    switch (phase) {
      case "play":
        return "Mobilize (🏭), move units, and attack enemies — then End Turn";
      case "build":
        return "Click territories to mobilize defenders";
      case "move":
        return "Move your units to any adjacent territory";
      case "attack":
        return "Click enemy territories to attack them";
      case "end":
        return "Collect income from your territories";
    }
  }

  if (style === "civilization") {
    switch (phase) {
      case "build":
        return "Click territories to mobilize defenders";
      case "orders":
        return "Each unit can MOVE or ATTACK (not both!)";
      case "resolve":
        return "All attacks resolve simultaneously";
      case "end":
        return "Turn complete - collect income";
    }
  }

  if (style === "chess") {
    return "Make ONE action: move a unit OR attack with a unit";
  }

  if (style === "move_for_move") {
    return "Build anytime (🏭), move or attack one stack at a time, then End Turn";
  }

  // Classic tips
  switch (phase) {
    case "purchase":
      return "Click territories to mobilize defenders";
    case "combat_move":
      return "Attack enemies or move toward the front — artillery bombards without advancing";
    case "combat":
      return "Roll dice to resolve battles";
    case "noncombat_move":
      return "Reposition your remaining units";
    case "production":
      return "Click territories to mobilize more defenders";
    case "collect_income":
      return "Gain IPCs from your territories";
  }

  return "";
}