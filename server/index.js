/**
 * Grand Strategy - Multiplayer WebSocket Server
 * Handles lobby management, player sessions, game action relay, and chat.
 * Enforces turn order: only the current-turn player may send game actions.
 *
 * Robustness features:
 *  - Heartbeat ping/pong to detect and cull dead connections
 *  - Per-player rate limiting to prevent message flooding
 *  - Reconnection support: disconnected players can rejoin in-progress games
 *  - Per-turn timeout: auto-advance if a player is AFK too long
 *  - Abandoned lobby cleanup
 */

const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3847;
const wss = new WebSocketServer({ port: PORT });

// ==================== Config ====================

const HEARTBEAT_INTERVAL_MS   = 30_000;  // Send ping every 30 s; connection killed if no pong by next tick
const RATE_LIMIT_WINDOW_MS    = 1_000;   // Sliding window for rate limiting
const RATE_LIMIT_MAX_MESSAGES = 30;      // Max messages per player per window
const TURN_TIMEOUT_MS         = 5 * 60_000; // Auto-advance after 5 min AFK
const LOBBY_IDLE_TIMEOUT_MS   = 30 * 60_000; // Remove waiting lobby after 30 min with no activity

// ==================== State ====================

// players: Map<playerId, { id, ws, name, lobbyId, isAlive, lastMessageAt, messageCount, windowStart }>
const players = new Map();
// lobbies: Map<lobbyId, LobbyInfo>
const lobbies = new Map();

// ==================== Helpers ====================

function send(ws, data) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      console.error('[Server] send error:', err.message);
    }
  }
}

function sendError(ws, message) {
  send(ws, { type: 'error', message });
}

function broadcastToLobby(lobbyId, data, excludePlayerId = null) {
  for (const player of players.values()) {
    if (player.lobbyId === lobbyId && player.id !== excludePlayerId) {
      send(player.ws, data);
    }
  }
}

function broadcastToAll(lobbyId, data) {
  broadcastToLobby(lobbyId, data, null);
}

function getLobbyListItem(lobby) {
  const host = players.get(lobby.hostId);
  return {
    id: lobby.id,
    name: lobby.name,
    host: host?.name ?? lobby.hostName ?? 'Unknown',
    players: lobby.players.length,
    maxPlayers: lobby.maxPlayers,
    mapName: lobby.mapName,
    hasPassword: !!lobby.password,
    status: lobby.status,
  };
}

/**
 * Return the player ID whose turn it currently is, or null if game not started.
 */
function getCurrentTurnPlayerId(lobby) {
  if (lobby.status !== 'playing' || lobby.turnOrder.length === 0) return null;
  const factionId = lobby.turnOrder[lobby.currentFactionIndex];
  const lp = lobby.players.find(p => p.faction === factionId);
  return lp?.id ?? null;
}

/**
 * Rate-limit check. Returns true if the message should be allowed through.
 */
function checkRateLimit(player) {
  const now = Date.now();
  if (now - player.windowStart > RATE_LIMIT_WINDOW_MS) {
    player.windowStart = now;
    player.messageCount = 0;
  }
  player.messageCount++;
  return player.messageCount <= RATE_LIMIT_MAX_MESSAGES;
}

// ==================== Turn timeout ====================

function clearTurnTimeout(lobby) {
  if (lobby.turnTimeoutHandle) {
    clearTimeout(lobby.turnTimeoutHandle);
    lobby.turnTimeoutHandle = null;
  }
}

function resetTurnTimeout(lobby) {
  clearTurnTimeout(lobby);
  if (lobby.status !== 'playing') return;
  lobby.turnTimeoutHandle = setTimeout(() => {
    const playerId = getCurrentTurnPlayerId(lobby);
    console.log(`[Server] Turn timeout in lobby ${lobby.id} — auto-advancing from player ${playerId}`);
    broadcastToAll(lobby.id, {
      type: 'turn_timeout',
      playerId,
      message: 'Turn timed out — auto-advancing',
    });
    advanceTurnInternal(lobby);
  }, TURN_TIMEOUT_MS);
}

// ==================== Lobby idle cleanup ====================

function resetLobbyIdleTimer(lobby) {
  if (lobby.idleTimeoutHandle) clearTimeout(lobby.idleTimeoutHandle);
  if (lobby.status !== 'waiting') return;
  lobby.idleTimeoutHandle = setTimeout(() => {
    if (lobbies.has(lobby.id) && lobby.status === 'waiting') {
      console.log(`[Server] Removing idle lobby ${lobby.id} (${lobby.name})`);
      broadcastToAll(lobby.id, { type: 'lobby_closed', reason: 'Lobby timed out due to inactivity' });
      for (const player of players.values()) {
        if (player.lobbyId === lobby.id) player.lobbyId = null;
      }
      lobbies.delete(lobby.id);
    }
  }, LOBBY_IDLE_TIMEOUT_MS);
}

// ==================== Message Handlers ====================

function handleSetName(player, message) {
  const name = String(message.name ?? 'Player').trim().slice(0, 32) || 'Player';
  player.name = name;

  if (player.lobbyId) {
    const lobby = lobbies.get(player.lobbyId);
    if (lobby) {
      const lp = lobby.players.find(p => p.id === player.id);
      if (lp) lp.name = name;
      if (lobby.hostId === player.id) lobby.hostName = name;
      broadcastToAll(lobby.id, { type: 'lobby_updated', lobby });
    }
  }
}

function handleCreateLobby(player, message) {
  if (player.lobbyId) handleLeaveLobby(player);

  const lobbyId = randomUUID();
  const config = message.config ?? {};
  const lobby = {
    id: lobbyId,
    name: String(message.name ?? `${player.name}'s Game`).trim().slice(0, 64) || `${player.name}'s Game`,
    hostId: player.id,
    hostName: player.name,
    isPublic: config.isPublic !== false,
    hasPassword: !!config.password,
    password: config.password ?? null,
    maxPlayers: Math.min(Math.max(Number(config.maxPlayers) || 6, 2), 8),
    mapName: String(config.mapName ?? 'world'),
    gameConfig: config,
    status: 'waiting',
    currentTurn: 0,
    players: [{ id: player.id, name: player.name, isHost: true, isReady: false, faction: null, connected: true }],
    activeFactionIds: [],
    turnOrder: [],
    currentFactionIndex: 0,
    gameStateVersion: 0,
    actionLog: [],
    turnTimeoutHandle: null,
    idleTimeoutHandle: null,
  };

  lobbies.set(lobbyId, lobby);
  player.lobbyId = lobbyId;
  resetLobbyIdleTimer(lobby);

  send(player.ws, { type: 'lobby_joined', lobby: sanitizeLobby(lobby) });
}

function handleJoinLobby(player, message) {
  const lobby = lobbies.get(message.lobbyId);
  if (!lobby) { sendError(player.ws, 'Lobby not found'); return; }
  if (lobby.password && lobby.password !== message.password) { sendError(player.ws, 'Incorrect password'); return; }

  if (player.lobbyId) handleLeaveLobby(player);

  if (lobby.status === 'playing') {
    // Allow reconnection: check if this player (by name or re-supplied playerId) had a slot
    const prevSlot = lobby.players.find(p => p.id === message.rejoinPlayerId);
    if (prevSlot) {
      // Restore slot to this new connection
      prevSlot.id = player.id;
      prevSlot.connected = true;
      player.lobbyId = lobby.id;
      send(player.ws, { type: 'lobby_rejoined', lobby: sanitizeLobby(lobby) });
      broadcastToLobby(lobby.id, { type: 'player_reconnected', playerId: player.id, playerName: player.name }, player.id);
      // Send full action log so client can replay missed state
      send(player.ws, {
        type: 'sync_state',
        gameStateVersion: lobby.gameStateVersion,
        actionLog: lobby.actionLog,
        currentFactionIndex: lobby.currentFactionIndex,
        currentTurnPlayerId: getCurrentTurnPlayerId(lobby),
      });
      return;
    }
    // Not a reconnect — block spectating mid-game for now
    sendError(player.ws, 'Game already in progress');
    return;
  }

  if (lobby.players.length >= lobby.maxPlayers) { sendError(player.ws, 'Lobby is full'); return; }

  lobby.players.push({ id: player.id, name: player.name, isHost: false, isReady: false, faction: null, connected: true });
  player.lobbyId = lobby.id;
  resetLobbyIdleTimer(lobby);

  send(player.ws, { type: 'lobby_joined', lobby: sanitizeLobby(lobby) });
  broadcastToLobby(lobby.id, { type: 'lobby_updated', lobby: sanitizeLobby(lobby) }, player.id);
}

function handleLeaveLobby(player) {
  if (!player.lobbyId) return;
  const lobby = lobbies.get(player.lobbyId);
  player.lobbyId = null;
  if (!lobby) return;

  if (lobby.status === 'playing') {
    // Mark as disconnected rather than removing — allow reconnection
    const lp = lobby.players.find(p => p.id === player.id);
    if (lp) {
      lp.connected = false;
      broadcastToAll(lobby.id, { type: 'player_disconnected', playerId: player.id, playerName: lp.name });

      // If it was this player's turn, auto-advance so the game doesn't stall
      const currentTurnPlayerId = getCurrentTurnPlayerId(lobby);
      if (currentTurnPlayerId === player.id) {
        clearTurnTimeout(lobby);
        broadcastToAll(lobby.id, { type: 'turn_skipped', reason: 'Player disconnected', playerId: player.id });
        advanceTurnInternal(lobby);
      }
    }
    return;
  }

  lobby.players = lobby.players.filter(p => p.id !== player.id);

  if (lobby.players.length === 0) {
    clearTurnTimeout(lobby);
    if (lobby.idleTimeoutHandle) clearTimeout(lobby.idleTimeoutHandle);
    lobbies.delete(lobby.id);
    return;
  }

  // Transfer host if needed
  if (lobby.hostId === player.id) {
    lobby.hostId = lobby.players[0].id;
    lobby.hostName = lobby.players[0].name;
    lobby.players[0].isHost = true;
  }

  broadcastToAll(lobby.id, { type: 'player_left', lobby: sanitizeLobby(lobby), playerId: player.id });
  resetLobbyIdleTimer(lobby);
}

function handleSetReady(player, message) {
  const lobby = player.lobbyId ? lobbies.get(player.lobbyId) : null;
  if (!lobby) return;
  const lp = lobby.players.find(p => p.id === player.id);
  if (lp) {
    lp.isReady = !!message.ready;
    broadcastToAll(lobby.id, { type: 'lobby_updated', lobby: sanitizeLobby(lobby) });
  }
}

function handleSelectFaction(player, message) {
  const lobby = player.lobbyId ? lobbies.get(player.lobbyId) : null;
  if (!lobby) return;

  const alreadyTaken = lobby.players.some(p => p.id !== player.id && p.faction === message.faction);
  if (alreadyTaken) { sendError(player.ws, 'Faction already taken'); return; }

  const lp = lobby.players.find(p => p.id === player.id);
  if (lp) {
    lp.faction = message.faction ?? null;
    broadcastToAll(lobby.id, { type: 'lobby_updated', lobby: sanitizeLobby(lobby) });
  }
}

function handleStartGame(player) {
  const lobby = player.lobbyId ? lobbies.get(player.lobbyId) : null;
  if (!lobby) return;
  if (lobby.hostId !== player.id) { sendError(player.ws, 'Only the host can start the game'); return; }
  if (lobby.players.length < 2) { sendError(player.ws, 'Need at least 2 players to start'); return; }

  if (lobby.idleTimeoutHandle) { clearTimeout(lobby.idleTimeoutHandle); lobby.idleTimeoutHandle = null; }

  lobby.status = 'playing';
  const selectedFactionIds = lobby.players.map(p => p.faction).filter(Boolean);
  const configuredActive = Array.isArray(lobby.gameConfig?.activeFactionIds)
    ? lobby.gameConfig.activeFactionIds.filter(id => selectedFactionIds.includes(id))
    : [];
  lobby.activeFactionIds = configuredActive.length > 0 ? configuredActive : selectedFactionIds;
  lobby.turnOrder = lobby.activeFactionIds.length > 0
    ? [...lobby.activeFactionIds]
    : lobby.players.map(p => p.faction ?? p.id);
  lobby.currentFactionIndex = 0;
  lobby.gameStateVersion = 0;
  lobby.actionLog = [];

  const msg = {
    type: 'game_started',
    lobby: sanitizeLobby(lobby),
    currentTurnPlayerId: getCurrentTurnPlayerId(lobby),
  };
  broadcastToAll(lobby.id, msg);

  resetTurnTimeout(lobby);
}

function handleListLobbies(player) {
  const list = Array.from(lobbies.values())
    .filter(l => l.isPublic && l.status === 'waiting')
    .map(getLobbyListItem);
  send(player.ws, { type: 'lobby_list', lobbies: list });
}

// Action types that any player may send (not restricted to current-turn player).
// state_verify is read-only: the sender broadcasts their local checksum for
// peers to compare — it never mutates game state on the server.
const BROADCAST_ANY_PLAYER = new Set(['state_verify']);

// All recognised client-to-server action types. Unknown types are rejected.
const KNOWN_ACTION_TYPES = new Set([
  'advance_phase',
  'move_units',
  'purchase_units',
  'research_tech',
  'combat_result',
  'state_verify',
]);

/**
 * Game action: only the player whose turn it is may submit turn-mutating
 * actions. Read-only broadcast actions (state_verify) are allowed from any
 * connected player in the lobby.
 */
function handleGameAction(player, message) {
  const lobby = player.lobbyId ? lobbies.get(player.lobbyId) : null;
  if (!lobby || lobby.status !== 'playing') return;

  // Validate action has expected shape
  if (!message.action || typeof message.action !== 'object') {
    sendError(player.ws, 'Malformed action');
    return;
  }

  const actionType = message.action.type;

  // Reject completely unknown action types
  if (!KNOWN_ACTION_TYPES.has(actionType)) {
    sendError(player.ws, `Unknown action type: ${actionType}`);
    return;
  }

  // Turn-ownership check: skip for broadcast-any-player actions
  if (!BROADCAST_ANY_PLAYER.has(actionType)) {
    const currentTurnPlayerId = getCurrentTurnPlayerId(lobby);
    if (currentTurnPlayerId !== null && player.id !== currentTurnPlayerId) {
      sendError(player.ws, 'Not your turn');
      return;
    }
  }

  lobby.gameStateVersion++;
  const loggedAction = {
    version: lobby.gameStateVersion,
    playerId: player.id,
    factionId: lobby.turnOrder[lobby.currentFactionIndex],
    action: message.action,
    timestamp: Date.now(),
  };
  lobby.actionLog.push(loggedAction);
  if (lobby.actionLog.length > 500) lobby.actionLog.shift();

  // Reset turn timeout on each action (player is active)
  resetTurnTimeout(lobby);

  broadcastToLobby(lobby.id, {
    type: 'game_action',
    action: message.action,
    playerId: player.id,
    version: lobby.gameStateVersion,
  }, player.id);

  send(player.ws, { type: 'action_confirmed', version: lobby.gameStateVersion });
}

/**
 * Advance turn: move to next faction in turn order.
 */
function handleAdvanceTurn(player) {
  const lobby = player.lobbyId ? lobbies.get(player.lobbyId) : null;
  if (!lobby || lobby.status !== 'playing') return;

  const currentTurnPlayerId = getCurrentTurnPlayerId(lobby);
  if (currentTurnPlayerId !== null && player.id !== currentTurnPlayerId) {
    sendError(player.ws, 'Not your turn');
    return;
  }

  advanceTurnInternal(lobby);
}

function advanceTurnInternal(lobby) {
  clearTurnTimeout(lobby);
  lobby.currentFactionIndex = (lobby.currentFactionIndex + 1) % lobby.turnOrder.length;
  const nextPlayerId = getCurrentTurnPlayerId(lobby);

  broadcastToAll(lobby.id, {
    type: 'turn_advanced',
    currentFactionIndex: lobby.currentFactionIndex,
    currentFactionId: lobby.turnOrder[lobby.currentFactionIndex],
    currentTurnPlayerId: nextPlayerId,
  });

  resetTurnTimeout(lobby);
}

/**
 * Sync request: send full action log so a reconnecting player can replay missed actions.
 */
function handleRequestSync(player) {
  const lobby = player.lobbyId ? lobbies.get(player.lobbyId) : null;
  if (!lobby) return;

  send(player.ws, {
    type: 'sync_state',
    gameStateVersion: lobby.gameStateVersion,
    actionLog: lobby.actionLog,
    currentFactionIndex: lobby.currentFactionIndex,
    currentTurnPlayerId: getCurrentTurnPlayerId(lobby),
  });
}

function handleChat(player, message) {
  const lobby = player.lobbyId ? lobbies.get(player.lobbyId) : null;
  if (!lobby) return;
  const text = String(message.message ?? '').trim().slice(0, 500);
  if (!text) return;
  broadcastToAll(lobby.id, {
    type: 'chat',
    playerId: player.id,
    playerName: player.name,
    message: text,
    timestamp: Date.now(),
  });
}

// ==================== Lobby sanitization ====================
// Strip internal server-side fields before sending to clients

function sanitizeLobby(lobby) {
  const { turnTimeoutHandle, idleTimeoutHandle, password, ...safe } = lobby;
  return safe;
}

// ==================== Main dispatch ====================

function handleMessage(player, message) {
  switch (message.type) {
    case 'set_name':       handleSetName(player, message); break;
    case 'create_lobby':   handleCreateLobby(player, message); break;
    case 'join_lobby':     handleJoinLobby(player, message); break;
    case 'leave_lobby':    handleLeaveLobby(player); break;
    case 'set_ready':      handleSetReady(player, message); break;
    case 'select_faction': handleSelectFaction(player, message); break;
    case 'start_game':     handleStartGame(player); break;
    case 'list_lobbies':   handleListLobbies(player); break;
    case 'game_action':    handleGameAction(player, message); break;
    case 'advance_turn':   handleAdvanceTurn(player); break;
    case 'request_sync':   handleRequestSync(player); break;
    case 'chat':           handleChat(player, message); break;
    default:
      break;
  }
}

// ==================== Connection lifecycle ====================

wss.on('connection', (ws) => {
  const playerId = randomUUID();
  const player = {
    id: playerId,
    ws,
    name: 'Player',
    lobbyId: null,
    isAlive: true,
    lastMessageAt: Date.now(),
    messageCount: 0,
    windowStart: Date.now(),
  };
  players.set(playerId, player);

  send(ws, { type: 'connected', playerId });

  ws.on('pong', () => {
    player.isAlive = true;
  });

  ws.on('message', (rawData) => {
    // Reject oversized messages (>64 KB)
    if (rawData.length > 65536) {
      sendError(ws, 'Message too large');
      return;
    }

    if (!checkRateLimit(player)) {
      sendError(ws, 'Rate limit exceeded');
      return;
    }

    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch {
      sendError(ws, 'Invalid JSON');
      return;
    }

    if (typeof message !== 'object' || message === null || typeof message.type !== 'string') {
      sendError(ws, 'Malformed message');
      return;
    }

    player.lastMessageAt = Date.now();
    handleMessage(player, message);
  });

  ws.on('close', () => {
    handleLeaveLobby(player);
    players.delete(playerId);
  });

  ws.on('error', (err) => {
    console.error(`[Server] WebSocket error for ${player.name} (${playerId}):`, err.message);
  });
});

// ==================== Heartbeat ====================
// Periodically ping all clients and terminate those that don't pong back.

const heartbeatInterval = setInterval(() => {
  for (const player of players.values()) {
    if (!player.isAlive) {
      console.log(`[Server] Terminating unresponsive connection: ${player.name} (${player.id})`);
      player.ws.terminate();
      // close handler will fire and clean up
      continue;
    }
    player.isAlive = false;
    try {
      player.ws.ping();
    } catch {
      // ignore errors on dead sockets
    }
  }
}, HEARTBEAT_INTERVAL_MS);

// Schedule a grace period: only mark players as dead after one missed pong
// (they have HEARTBEAT_TIMEOUT_MS to reply before the next heartbeat fires)
// The interval itself acts as the timeout since isAlive is set to false before ping,
// and checked on the *next* interval tick — so the actual timeout is HEARTBEAT_INTERVAL_MS.

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('listening', () => {
  console.log(`[Server] Grand Strategy multiplayer server listening on ws://localhost:${PORT}`);
  console.log(`[Server] Heartbeat: ${HEARTBEAT_INTERVAL_MS / 1000}s | Rate limit: ${RATE_LIMIT_MAX_MESSAGES} msg/${RATE_LIMIT_WINDOW_MS}ms | Turn timeout: ${TURN_TIMEOUT_MS / 60000}min`);
});
