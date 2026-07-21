# Ship Readiness Checklist

Use this checklist during the final stabilization pass before cutting a release candidate.

## 1) Build and Automated Validation

- [x] `npm ci` (or `npm install`) succeeds on a clean workspace
- [x] `npm run validate:maps` passes
- [x] `npm run build` passes
- [x] `npx tsc --noEmit` passes
- [x] `npx vitest run --reporter=basic` passes _(837 tests)_
- [x] `npm run test:e2e` passes (golden path + tutorial turn/combat + campaign mission 1 + save/load)
- [x] `npm run test:e2e:ship` passes (mobilize + active-faction scope + save/load active set + multiplayer lobby UI)
- [x] `npm run test:e2e:perf` passes
- [x] `npm run smoke:electron` structural check passes _(launch smoke needs `npm run pack`)_

## 2) Core Gameplay Smoke (Single Player)

- [x] Start new game on Tutorial map _(automated via Playwright `__gsE2E`)_
- [x] Complete one full turn without UI lockups _(E2E: capture + End Turn + AI cycle)_
- [x] Build/mobilize units and confirm they deploy correctly _(E2E ship-smoke: mobilize capital)_
- [x] Enter combat and resolve at least one battle _(E2E combat smoke)_
- [x] End turn and verify AI takes its turn _(E2E turn cycle)_
- [x] Complete Basic Training mission 1 and confirm debrief _(E2E campaign smoke)_

## 3) Active Faction Scope Regression

- [x] Start 2-faction setup and verify only 2 entries in:
  - [x] turn order strip
  - [x] faction panel
  - [x] victory progress bars
- [x] Diplomacy targets only include active factions _(E2E ship-smoke + unit tests)_
- [x] Espionage target list only includes active factions _(E2E ship-smoke + unit tests)_
- [x] Save/load preserves active faction set exactly _(E2E ship-smoke + unit tests)_

## 4) Multiplayer Lobby/Turn Order

- [x] Create lobby and select factions _(automated: `npm run smoke:multiplayer`)_
- [x] Start game and confirm server turn order matches active faction set _(smoke:multiplayer)_
- [x] Advance through at least one full multiplayer round _(smoke:multiplayer)_
- [x] Disconnect/reconnect one player and verify turn flow recovers _(smoke:multiplayer)_
- [x] Manual UI pass in browser Multiplayer lobby _(automated: `e2e/multiplayer-ui.spec.ts`)_

## 5) Desktop/Electron Smoke

- [x] Electron structural smoke (`dist` + `electron/main.cjs`) via `npm run smoke:electron`
- [x] `npm run pack` then launch smoke reaches main menu _(CDP check in `smoke:electron`)_
- [x] Window resize keeps core HUD controls usable _(`npm run test:e2e:electron`)_
- [x] Save + load works in Electron session _(`npm run test:e2e:electron`)_
- [x] Exit and relaunch app, then load save again _(`npm run test:e2e:electron`)_

## 6) Steam Packaging Gate

- [x] `npm run steam:sync-appid` run with intended AppID _(currently placeholder `480` / Spacewar — replace before store upload)_
- [x] `npm run steam:preflight:structure` passes _(full preflight requires real AppID)_
- [x] `npm run pack:steam` completes successfully _(unsigned local pack; signing disabled without cert)_
- [x] `release/win-unpacked` launches and reaches main menu _(includes `steam_appid.txt`; verified via `smoke:electron`)_

## 7) Go / No-Go Criteria

Ship only if all conditions are true:

- [x] No open P0 defects _(no open GitHub issues at last check)_
- [x] No open P1 defects without explicit workaround/owner _(no open GitHub issues at last check)_
- [x] Automated checks all green _(unit + maps + build + e2e golden/ship/perf + electron structural/launch + electron desktop + multiplayer smoke/UI)_
- [x] Manual smoke checks completed _(Electron interactive covered by `test:e2e:electron` + CDP launch smoke)_
- [x] Release artifact generated and launch-tested _(`release/win-unpacked` via `pack` / `pack:steam`)_

### Still required before Steam store upload

- Replace placeholder AppID `480` / DepotID `481` with real Steamworks IDs, then re-run `steam:sync-appid` + `steam:preflight` (non-structure)
- Optional: signed installer via `npm run dist` / Release workflow with `CSC_LINK` (see `docs/CODE_SIGNING.md`)

If any item fails, do not tag release. Fix, re-run affected sections, and re-evaluate.
