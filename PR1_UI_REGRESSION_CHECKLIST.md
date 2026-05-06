# PR-1 UI Delta Stabilization Checklist

Use this checklist after the Top Hub/Factory Hub redesign changes.

## 1) Top Hub Layout

- [ ] `#turn-info` is centered and visible at game start.
- [ ] `#action-buttons` is visible directly below the ribbon.
- [ ] Left/center/right ribbon sections do not overlap at 100%, 125%, and 150% display scaling.
- [ ] `#turn-number`, phase label, and turn order dots remain readable.
- [ ] `#context-helper-text` remains visible in the action bar center area.

## 2) Panel Spacing and Stacking

- [ ] `#hq-panel` and `#war-room-panel` start below the top hub.
- [ ] Opening Factory Hub adds body class `fh-open`.
- [ ] With `fh-open`, HQ/War Room bottom offsets increase and panels are not covered by tray.
- [ ] Closing Factory Hub removes `fh-open` and panels return to normal position.

## 3) Factory Hub Behavior

- [ ] Open tray from build flow and verify header, tabs, and budget bar render correctly.
- [ ] `+` and `-` buttons update budget and order state.
- [ ] `Max` button buys the maximum affordable amount for that unit.
- [ ] `Optimize` fills queue without exceeding IPC budget.
- [ ] `Clear` empties queue and resets budget usage.
- [ ] `Confirm Orders` succeeds with valid queue and closes tray.
- [ ] `Close` cancels/clears queue and closes tray.

## 4) Build / Mobilization Flow

- [ ] Build phase remains playable with the new tray-centric flow.
- [ ] Territory selection and build actions are consistent (no dead-end click path).
- [ ] No duplicate modals/trays open when repeatedly clicking build controls.

## 5) Drag Behavior

- [ ] `turn-info`, `action-buttons`, and `resources` stay anchored (not draggable).
- [ ] `faction-panel` drag handle works via `#faction-panel-header`.
- [ ] `zoom-controls`/`help-button` drag behavior still works as intended.
- [ ] Minimap placement inside HQ panel remains stable.

## 6) Smoke Validation Commands

- [ ] `npm run build` passes.
- [ ] `npm test -- --run src/ui/__tests__/` passes.

