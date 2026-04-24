# Grand Strategy

A modern turn-based grand strategy wargame inspired by TripleA, built with TypeScript, Vite, and Electron.

## Features

- **Turn-based combat** with dice mechanics, critical hits, veteran bonuses, and combined arms
- **4 playable factions** — Atlantic Alliance, Pacific Union, Middle Eastern Coalition, Eurasian Dominion — each with unique abilities
- **5 unit eras** — WWI, WWII, Cold War, Modern, and Full — with 9+ unit types per era
- **6 turn styles** — Classic, Quick, Spectator, Action-by-Action, Civilization, and Chess modes
- **Technology tree** with 20+ researchable technologies
- **Diplomacy system** — war declarations, non-aggression pacts, alliances, and trade deals
- **Espionage** — intel gathering, factory sabotage, tech theft
- **Nuclear system** with readiness tracking and strike mechanics
- **Strategic events** — 30+ random events with player choices
- **Morale/war weariness** system affecting combat effectiveness
- **AI opponents** with 5 personality types (Balanced, Aggressive, Economic, Adaptive, Turtle) and multiple difficulty levels
- **Multiplayer** via WebSocket server with lobby management and reconnection support
- **Campaign mode** — 4 campaigns (Tutorial, European Liberation, Pacific Storm, World at War)
- **Achievements** system with unlock conditions
- **Replay system** to record and replay games
- **Map editor** for creating custom scenarios
- **Mod support** — custom units, factions, and maps via JSON
- **Cloud saves** with Steam Cloud support
- **Steam integration** via Steamworks.js

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm

### Install

```bash
npm install
cd server && npm install && cd ..
```

### Run (browser)

```bash
npm run dev
```

Open [http://localhost:19123](http://localhost:19123) in your browser.

### Run (Electron desktop app)

```bash
npm run dev:electron
```

### Run with multiplayer server

```bash
npm run dev:multiplayer
```

The game client connects to `ws://localhost:8080` by default.

## Building

```bash
# Web build
npm run build

# Desktop (Windows installer + portable)
npm run dist

# macOS
npm run dist:mac

# Linux
npm run dist:linux

# All platforms
npm run dist:all
```

Built files go to the `release/` directory.

## Running Tests

```bash
npm test
```

## Project Structure

```
grand-strategy/
├── src/
│   ├── main.ts              # Game entry point
│   ├── engine/              # Core game logic
│   │   ├── GameState.ts     # Central state + event bus
│   │   ├── TurnManager.ts   # Turn/phase flow
│   │   ├── CombatResolver.ts
│   │   ├── MovementValidator.ts
│   │   ├── AIController.ts
│   │   ├── ProductionManager.ts
│   │   ├── TechnologyManager.ts
│   │   ├── DiplomacyManager.ts
│   │   ├── EspionageSystem.ts
│   │   ├── NuclearSystem.ts
│   │   ├── EventsSystem.ts
│   │   ├── MoraleSystem.ts
│   │   ├── CampaignManager.ts
│   │   ├── AchievementManager.ts
│   │   └── ...
│   ├── ui/                  # UI controllers
│   │   ├── HUD.ts           # Main UI orchestrator
│   │   ├── CombatUI.ts
│   │   ├── ProductionUI.ts
│   │   ├── DiplomacyUI.ts
│   │   ├── TechUI.ts
│   │   └── ...
│   ├── renderer/
│   │   └── MapRenderer.ts   # HTML5 Canvas map rendering
│   ├── network/
│   │   └── NetworkManager.ts # WebSocket client
│   ├── audio/
│   │   └── SoundManager.ts  # Web Audio API procedural sounds
│   ├── data/                # Data models
│   └── loaders/             # Asset loaders
├── server/
│   └── index.js             # Multiplayer WebSocket server
├── electron/
│   ├── main.cjs             # Electron main process
│   └── preload.cjs          # IPC bridge
└── assets/
    ├── maps/                # Map JSON files
    ├── units/               # Unit definition JSON files
    └── factions/            # Faction JSON files
```

## Maps

| Map | Description |
|-----|-------------|
| Tutorial | Small 4-territory learning map |
| Europe | Western & Eastern Front theaters |
| Pacific | Island-hopping Pacific theater |
| Americas | North and South America |
| Africa | African theater |
| Eastern Front | Focused Eastern European campaign |
| World | Full global map |

## Multiplayer

Start the server:

```bash
npm run server
```

The server runs on port `8080`. Players connect by entering the host's IP in the game's multiplayer lobby screen.

## Modding

Mods are JSON packages with a manifest and data. Install a mod by going to **Settings → Mods → Install from File** and selecting a `.json` mod file.

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
