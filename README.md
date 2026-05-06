# Grand Strategy

A modern turn-based grand strategy wargame inspired by TripleA, built with TypeScript, Vite, and Electron.

## Features

- **Turn-based combat** with dice mechanics, critical hits, veteran bonuses, and combined arms
- **4 playable factions**: Atlantic Alliance, Pacific Union, Middle Eastern Coalition, Eurasian Dominion, each with unique abilities
- **5 unit eras**: WWI, WWII, Cold War, Modern, and Full, with 9+ unit types per era
- **6 turn styles**: Classic, Quick, Spectator, Action-by-Action, Civilization, and Chess modes
- **Technology tree** with 20+ researchable technologies
- **Diplomacy system**: war declarations, non-aggression pacts, alliances, and trade deals
- **Espionage**: intel gathering, factory sabotage, and tech theft
- **Nuclear system** with readiness tracking and strike mechanics
- **Strategic events**: 30+ random events with player choices
- **Morale/war weariness** system affecting combat effectiveness
- **AI opponents** with 5 personality types and multiple difficulty levels
- **Hot Seat mode** for local turn-based play on one machine
- **Campaign mode** with Tutorial, European Liberation, Pacific Storm, and World at War campaigns
- **Achievements** system with unlock conditions
- **Replay system** to record and replay games
- **Map editor** for creating custom scenarios
- **Mod support** for custom units, factions, maps, and rules via JSON
- **Cloud saves** with Steam Cloud support when running in the Steam/Electron environment
- **Steam integration** via Steamworks.js

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm

### Install

```bash
npm install
```

### Run in Browser

```bash
npm run dev
```

Open [http://localhost:19123](http://localhost:19123) in your browser.

### Recommended First Game Preset

For the smoothest first 10-minute experience:

- **Map:** `Tutorial`
- **Turn Style:** `Quick`
- **Era:** `WWII`
- **AI Difficulty:** `Normal`
- **Advice panels:** leave enabled (`Phase Guidance`, `Strategic Advisor`, `Turn Recap`)

This preset gives clear objective flow and faster turns while still showing the full move/attack/mobilize loop.

### Run as Desktop App

```bash
npm run dev:electron
```

## Building

```bash
# Web build
npm run build

# Desktop, Windows installer and portable app
npm run dist

# macOS
npm run dist:mac

# Linux
npm run dist:linux

# All platforms
npm run dist:all
```

Built files go to the `release/` directory.

### Optional Strict Map Topology Mode

To disable runtime map auto-repair and fail fast on map topology problems, run with:

```bash
VITE_STRICT_MAP_TOPOLOGY=1 npm run dev
```

Use this for release-candidate verification to ensure authored map data is valid without repair fallbacks.

### Signing / Notarization (CI)

The manual packaging workflow supports both unsigned and signed builds:

- Unsigned (default): unpacked artifacts for smoke testing
- Signed: installer/notarized builds when secrets are configured

Configure repository secrets before enabling signed runs:

- `CSC_LINK`, `CSC_KEY_PASSWORD`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS notarization)

### Release Smoke Checklist (Manual)

Run before tagging a release candidate:

1. `npm test -- --run`
2. `npm run validate:maps`
3. `npm run build`
4. Launch `npm run dev` and verify:
   - Main menu opens and starts a new game.
   - HQ panel and top hub remain visible at common laptop sizes.
   - Factory Hub opens, scrolls, and confirms orders.
   - End Phase / End Turn flow works through at least one full turn.
5. Launch `npm run dev:electron` and verify:
   - App boots without crash screen.
   - Window resize still keeps core controls usable.
   - Save and load both succeed.

### Steam Release Preflight

Before a Steam upload, run:

```bash
npm run steam:preflight
```

This fails fast if:

- Steam `AppID` is still the `480` placeholder.
- Steam `DepotID` is still the `481` placeholder.
- Required Steam build config files are missing.

Upload flow:

1. Set real IDs in:
   - `steam/app_build.vdf`
   - `steam/depot_build_win.vdf`
2. Build unpacked Steam payload:
   - `npm run pack:steam`
3. Upload via SteamCMD helper:
   - `scripts/steam-upload.bat`

## Running Tests

```bash
npm test
```

## Performance Baseline

See [`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md) for telemetry setup, collection protocol, and target thresholds (`renderFrameMs`, `aiPhaseMs`, `aiTurnMs`).

## Project Structure

```text
grand-strategy/
|-- src/
|   |-- main.ts              # Entry point (bootstraps app)
|   |-- app/bootstrap.ts     # DOM-ready bootstrap and crash handling
|   |-- engine/              # Core game logic
|   |   |-- GameState.ts     # Central state and event bus
|   |   |-- TurnManager.ts   # Turn and phase flow
|   |   |-- CombatResolver.ts
|   |   |-- MovementValidator.ts
|   |   |-- AIController.ts
|   |   |-- ProductionManager.ts
|   |   |-- TechnologyManager.ts
|   |   |-- DiplomacyManager.ts
|   |   |-- EspionageSystem.ts
|   |   |-- NuclearSystem.ts
|   |   |-- EventsSystem.ts
|   |   |-- MoraleSystem.ts
|   |   |-- CampaignManager.ts
|   |   |-- AchievementManager.ts
|   |   `-- ...
|   |-- ui/                  # UI controllers
|   |   |-- HUD.ts           # Main UI orchestrator
|   |   |-- CombatUI.ts
|   |   |-- ProductionUI.ts
|   |   |-- DiplomacyUI.ts
|   |   |-- TechUI.ts
|   |   `-- ...
|   |-- renderer/
|   |   `-- MapRenderer.ts   # HTML5 Canvas map rendering
|   |-- audio/
|   |   `-- SoundManager.ts  # Web Audio API procedural sounds
|   |-- data/                # Data models
|   `-- loaders/             # Asset loaders
|-- electron/
|   |-- main.cjs             # Electron main process
|   `-- preload.cjs          # IPC bridge
`-- assets/
    |-- maps/                # Map JSON files
    |-- units/               # Unit definition JSON files
    `-- factions/            # Faction JSON files
```

## Maps

| Map | Description |
|-----|-------------|
| Tutorial | Small 4-territory learning map |
| Europe | Western and Eastern Front theaters |
| Pacific | Island-hopping Pacific theater |
| Americas | North and South America |
| Africa | African theater |
| Eastern Front | Focused Eastern European campaign |
| World | Full global map |

## Modding

Mods are JSON packages with a manifest and data. Install a mod by going to **Settings -> Mods -> Install from File** and selecting a `.json` mod file.

A mod file has this structure:

```json
{
  "manifest": {
    "id": "my_mod",
    "name": "My Mod",
    "version": "1.0.0",
    "author": "Your Name",
    "description": "...",
    "gameVersion": "0.1.0",
    "contents": {}
  },
  "data": {
    "units": [],
    "factions": [],
    "maps": [],
    "rules": null
  }
}
```

## License

MIT
