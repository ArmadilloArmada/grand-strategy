# Ship Readiness Checklist

Use this checklist during the final stabilization pass before cutting a release candidate.

## 1) Build and Automated Validation

- [ ] `npm ci` (or `npm install`) succeeds on a clean workspace
- [ ] `npm run validate:maps` passes
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run --reporter=basic` passes

## 2) Core Gameplay Smoke (Single Player)

- [ ] Start new game on Tutorial map
- [ ] Complete one full turn without UI lockups
- [ ] Build/mobilize units and confirm they deploy correctly
- [ ] Enter combat and resolve at least one battle
- [ ] End turn and verify AI takes its turn

## 3) Active Faction Scope Regression

- [ ] Start 2-faction setup and verify only 2 entries in:
  - [ ] turn order strip
  - [ ] faction panel
  - [ ] victory progress bars
- [ ] Diplomacy targets only include active factions
- [ ] Espionage target list only includes active factions
- [ ] Save/load preserves active faction set exactly

## 4) Multiplayer Lobby/Turn Order

- [ ] Create lobby and select factions
- [ ] Start game and confirm server turn order matches active faction set
- [ ] Advance through at least one full multiplayer round
- [ ] Disconnect/reconnect one player and verify turn flow recovers

## 5) Desktop/Electron Smoke

- [ ] `npm run dev:electron` launches without crash overlay
- [ ] Window resize keeps core HUD controls usable
- [ ] Save + load works in Electron session
- [ ] Exit and relaunch app, then load save again

## 6) Steam Packaging Gate

- [ ] `npm run steam:sync-appid` run with intended AppID
- [ ] `npm run steam:preflight` passes
- [ ] `npm run pack:steam` completes successfully
- [ ] `release/win-unpacked` launches and reaches main menu

## 7) Go / No-Go Criteria

Ship only if all conditions are true:

- [ ] No open P0 defects
- [ ] No open P1 defects without explicit workaround/owner
- [ ] Automated checks all green
- [ ] Manual smoke checks completed
- [ ] Release artifact generated and launch-tested

If any item fails, do not tag release. Fix, re-run affected sections, and re-evaluate.

