/**
 * Multiplayer lobby smoke — starts the WS server, runs a 2-player lobby,
 * verifies turn order matches selected factions, advances one round, and
 * checks disconnect/reconnect recovery.
 */

const { spawn } = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 3847);
const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server', 'index.js');

function fail(message) {
  console.error(`[smoke:multiplayer] FAILED: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function connectClient(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const client = {
      name,
      ws,
      playerId: null,
      lobby: null,
      lastGameStarted: null,
      lastTurn: null,
      lastSync: null,
      errors: [],
    };

    const timer = setTimeout(() => reject(new Error(`${name} connect timeout`)), 8000);

    ws.on('open', () => {});
    ws.on('error', err => reject(err));
    ws.on('message', raw => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      switch (msg.type) {
        case 'connected':
          client.playerId = msg.playerId;
          clearTimeout(timer);
          resolve(client);
          break;
        case 'lobby_joined':
        case 'lobby_rejoined':
        case 'lobby_updated':
          client.lobby = msg.lobby;
          break;
        case 'game_started':
          client.lastGameStarted = msg;
          client.lobby = msg.lobby;
          break;
        case 'turn_advanced':
        case 'turn_skipped':
          client.lastTurn = msg;
          break;
        case 'sync_state':
          client.lastSync = msg;
          break;
        case 'error':
          client.errors.push(String(msg.message ?? 'error'));
          break;
        default:
          break;
      }
    });
  });
}

function send(client, payload) {
  client.ws.send(JSON.stringify(payload));
}

async function waitFor(predicate, label, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await wait(50);
  }
  fail(`Timed out waiting for ${label}`);
}

async function main() {
  const server = spawn(process.execPath, [SERVER], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;
  server.stdout.on('data', chunk => {
    const text = String(chunk);
    if (text.includes('listening')) serverReady = true;
  });
  server.stderr.on('data', chunk => process.stderr.write(chunk));

  const cleanup = () => {
    try {
      server.kill();
    } catch {
      // ignore
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(1);
  });

  const bootDeadline = Date.now() + 8000;
  while (!serverReady && Date.now() < bootDeadline) {
    await wait(50);
  }
  assert(serverReady, 'server did not become ready');

  const host = await connectClient('Host');
  const guest = await connectClient('Guest');

  send(host, { type: 'set_name', name: 'Host' });
  send(guest, { type: 'set_name', name: 'Guest' });
  await wait(100);

  send(host, {
    type: 'create_lobby',
    name: 'Ship Smoke Lobby',
    config: { mapName: 'tutorial', maxPlayers: 2, isPublic: true },
  });
  await waitFor(() => host.lobby?.id, 'host lobby');

  send(guest, { type: 'join_lobby', lobbyId: host.lobby.id });
  await waitFor(() => guest.lobby?.players?.length === 2, 'guest join');

  send(host, { type: 'select_faction', faction: 'atlantic_alliance' });
  send(guest, { type: 'select_faction', faction: 'eastern_bloc' });
  send(host, { type: 'set_ready', ready: true });
  send(guest, { type: 'set_ready', ready: true });
  await waitFor(
    () => host.lobby?.players?.every(p => p.faction && p.isReady),
    'faction select + ready',
  );

  send(host, { type: 'start_game' });
  await waitFor(() => host.lastGameStarted && guest.lastGameStarted, 'game_started');

  const turnOrder = host.lastGameStarted.lobby.turnOrder;
  assert(
    JSON.stringify(turnOrder) === JSON.stringify(['atlantic_alliance', 'eastern_bloc']),
    `turnOrder mismatch: ${JSON.stringify(turnOrder)}`,
  );
  assert(
    host.lastGameStarted.currentTurnPlayerId === host.playerId,
    'host should own first turn',
  );

  send(host, { type: 'advance_turn' });
  await waitFor(() => guest.lastTurn?.currentFactionId === 'eastern_bloc', 'turn advance');
  assert(guest.lastTurn.currentTurnPlayerId === guest.playerId, 'guest should own second turn');

  const guestId = guest.playerId;
  guest.ws.close();
  await waitFor(
    () => host.lastTurn?.type === 'turn_skipped' || host.lastTurn?.currentFactionId === 'atlantic_alliance',
    'disconnect auto-advance',
    6000,
  );

  const rejoin = await connectClient('GuestRejoin');
  send(rejoin, { type: 'set_name', name: 'Guest' });
  await wait(50);
  send(rejoin, { type: 'join_lobby', lobbyId: host.lobby.id, rejoinPlayerId: guestId });
  await waitFor(() => rejoin.lastSync || rejoin.lobby?.status === 'playing', 'rejoin sync');

  host.ws.close();
  rejoin.ws.close();
  cleanup();

  console.log('[smoke:multiplayer] OK — lobby, turn order, advance, disconnect/reconnect');
  process.exit(0);
}

main().catch(err => {
  fail(err instanceof Error ? err.message : String(err));
});
