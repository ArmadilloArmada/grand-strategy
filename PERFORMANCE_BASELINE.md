# Performance Baseline

This baseline uses the built-in telemetry enabled by setting:

```bash
localStorage.setItem('gs-perf', '1')
```

Reload after enabling.

## Metrics Captured

- `renderFrameMs` (MapRenderer frame render time)
- `captureLoopFrameMs` (continuous animation loop frame time)
- `aiPhaseMs` (single AI phase processing time)
- `aiTurnMs` (full AI turn time)

Telemetry now tracks rolling `p95`, `avg`, `max`, and `samples` for each metric in `window.__gsPerf`.

## Collection Protocol

1. Start a standard game: `Map: grid`, `Era: WWII`, `Turn Style: quick`, AI difficulty `medium`.
2. Play through 5 full turns with normal interactions (move, attack, mobilize, end turn).
3. In DevTools, run:
   ```js
   window.__gsPerf
   ```
4. Record the resulting buckets for each metric.

## Baseline Targets

- `renderFrameMs`: p95 <= 16ms (60fps target), max <= 33ms
- `captureLoopFrameMs`: p95 <= 12ms
- `aiPhaseMs`: p95 <= 350ms
- `aiTurnMs`: p95 <= 2200ms

## Current Hotspot Mitigation

To avoid runaway telemetry growth during long sessions, perf buckets now keep a bounded rolling sample window (latest 120 samples) while still reporting p95/avg/max.
