# AGENTS.md

## Cursor Cloud specific instructions

Grand Strategy is a browser-based, turn-based strategy game built with TypeScript + Vite. It runs entirely client-side (HTML5 Canvas + `localStorage`) with **no database and no backend required** for normal development. Commands below are already documented in `README.md` / `package.json`; this section only calls out cloud-specific caveats.

### Services
- **Game client (the product) — required.** Dev server: `npm run dev` → http://localhost:19123 (Vite, `strictPort`, so the port is fixed). This is all you need to play/test single-player, AI, campaigns, hot-seat, and the map editor (`/map-editor.html`).
- **Multiplayer WebSocket server — optional / standalone.** `cd server && npm start` (port 8080, override with `PORT`). It is NOT wired into the current client build (the client only has local "Hot Seat" multiplayer), so it is not needed to test the game end-to-end.
- **Electron desktop shell — optional.** `npm run dev:electron`. Only needed for desktop-specific features; not needed for gameplay logic and unlikely to be useful in a headless cloud VM.

### Lint / test / build
- No ESLint/Prettier is configured — `tsc` (run as part of `npm run build`) is the static gate.
- Unit tests (Vitest, jsdom): `npm test -- --run` (837 tests, all passing).
- Map data validation: `npm run validate:maps`.
- Build: `npm run build` (`tsc && vite build`).
- Combined release gate: `npm run release:check`.
- E2E (Playwright, Chromium): `npm run test:e2e`. Playwright auto-starts its own Vite server on `127.0.0.1:19123`, so stop any manually-started `npm run dev` first, or it will reuse it.

### Known caveats
- One e2e test, `Tutorial smoke › opens tactical battle from attack preview` (`e2e/golden-path.spec.ts`), fails on a clean checkout because `#btn-play-tactical` stays hidden. This is a pre-existing app/test issue, not an environment problem — the other 7 golden-path tests pass.
- `.env` is optional; the single `VITE_SERVER_URL` var in `.env.example` is not referenced by current client code. No secrets are required for development.
