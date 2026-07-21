/**
 * WebSocket multiplayer client — connects to server/index.js (Horizon 4).
 */

export type MultiplayerConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LobbySummary {
  id: string;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  mapName: string;
  hasPassword: boolean;
  status: string;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  faction: string | null;
  connected: boolean;
}

export interface LobbyState {
  id: string;
  name: string;
  hostId: string;
  hostName?: string;
  status: string;
  players: LobbyPlayer[];
  mapName?: string;
  maxPlayers?: number;
}

export type MultiplayerClientListener = (event: string, data: unknown) => void;

const DEFAULT_WS_URL = 'ws://localhost:3847';

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private playerId: string | null = null;
  private lobby: LobbyState | null = null;
  private state: MultiplayerConnectionState = 'disconnected';
  private listeners = new Set<MultiplayerClientListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(private url = DEFAULT_WS_URL) {}

  get connectionState(): MultiplayerConnectionState {
    return this.state;
  }

  get localPlayerId(): string | null {
    return this.playerId;
  }

  get currentLobby(): LobbyState | null {
    return this.lobby;
  }

  on(listener: MultiplayerClientListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: string, data: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch (err) {
        console.warn('[MultiplayerClient] listener error', err);
      }
    }
  }

  private setState(next: MultiplayerConnectionState): void {
    this.state = next;
    this.emit('connection', { state: next });
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.intentionalClose = false;
    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.setState('error');
      this.emit('error', { message: err instanceof Error ? err.message : String(err) });
      return;
    }

    this.ws.onopen = () => {
      this.setState('connected');
    };

    this.ws.onmessage = (ev) => {
      let message: { type?: string; [key: string]: unknown };
      try {
        message = JSON.parse(String(ev.data));
      } catch {
        this.emit('error', { message: 'Invalid server message' });
        return;
      }
      this.handleMessage(message);
    };

    this.ws.onerror = () => {
      this.setState('error');
      this.emit('error', { message: 'WebSocket connection failed' });
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (!this.intentionalClose) {
        this.setState('disconnected');
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.lobby = null;
    this.setState('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionalClose) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose) this.connect();
    }, 3000);
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', { message: 'Not connected to server' });
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private handleMessage(message: { type?: string; [key: string]: unknown }): void {
    const type = message.type;
    if (!type) return;

    switch (type) {
      case 'connected':
        this.playerId = String(message.playerId ?? '');
        this.emit('connected', { playerId: this.playerId });
        break;
      case 'lobby_joined':
      case 'lobby_rejoined':
      case 'lobby_updated':
        this.lobby = message.lobby as LobbyState;
        this.emit('lobby', { lobby: this.lobby });
        break;
      case 'lobby_list':
        this.emit('lobby_list', { lobbies: message.lobbies as LobbySummary[] });
        break;
      case 'game_started':
        this.emit('game_started', message);
        break;
      case 'error':
        this.emit('error', { message: String(message.message ?? 'Server error') });
        break;
      case 'chat':
      case 'player_disconnected':
      case 'player_reconnected':
      case 'turn_advanced':
      case 'sync_state':
        this.emit(type, message);
        break;
      default:
        this.emit(type, message);
    }
  }

  setName(name: string): void {
    this.send({ type: 'set_name', name });
  }

  listLobbies(): void {
    this.send({ type: 'list_lobbies' });
  }

  createLobby(name: string, config: Record<string, unknown> = {}): void {
    this.send({ type: 'create_lobby', name, config });
  }

  joinLobby(lobbyId: string, password?: string): void {
    this.send({ type: 'join_lobby', lobbyId, password });
  }

  leaveLobby(): void {
    this.send({ type: 'leave_lobby' });
    this.lobby = null;
  }

  setReady(ready: boolean): void {
    this.send({ type: 'set_ready', ready });
  }

  selectFaction(factionId: string): void {
    this.send({ type: 'select_faction', factionId });
  }

  startGame(): void {
    this.send({ type: 'start_game' });
  }

  sendChat(text: string): void {
    this.send({ type: 'chat', text });
  }

  advanceTurn(): void {
    this.send({ type: 'advance_turn' });
  }

  sendGameAction(action: Record<string, unknown>): void {
    this.send({ type: 'game_action', action });
  }
}

export const multiplayerClient = new MultiplayerClient();
