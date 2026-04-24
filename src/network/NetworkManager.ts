/**
 * NetworkManager - Client-side multiplayer networking
 * Handles WebSocket connection to game server
 */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  faction: string | null;
}

export interface LobbyInfo {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  isPublic: boolean;
  hasPassword: boolean;
  maxPlayers: number;
  mapName: string;
  gameConfig: any;
  status: 'waiting' | 'playing' | 'finished';
  currentTurn: number;
  players: LobbyPlayer[];
  turnOrder?: string[];
  currentFactionIndex?: number;
}

export interface LobbyListItem {
  id: string;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  mapName: string;
  hasPassword: boolean;
}

export interface ChatMessage {
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
}

export type GameAction =
  | { type: 'advance_phase' }
  | { type: 'move_units'; unitTypeId: string; count: number; fromId: string; toId: string; viaTransport?: string }
  | { type: 'purchase_units'; territoryId: string; unitTypeId: string; count: number }
  | { type: 'research_tech'; factionId: string; techId: string }
  | { type: 'combat_result'; fromId: string; toId: string; attackerLosses: Record<string, number>; defenderLosses: Record<string, number>; captured: boolean; newOwner: string | null }
  | { type: 'state_verify'; checksum: number; turnNumber: number; phase: string };

type EventCallback = (data: any) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private playerId: string | null = null;
  private playerName: string = 'Player';
  private status: ConnectionStatus = 'disconnected';
  private currentLobby: LobbyInfo | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  
  constructor(serverUrl: string = (typeof import.meta !== 'undefined' ? (import.meta as unknown as { env?: Record<string, string> }).env?.['VITE_SERVER_URL'] : undefined) ?? 'ws://localhost:8080') {
    this.serverUrl = serverUrl;
  }

  // ==================== Connection ====================
  
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      
      this.status = 'connecting';
      this.emit('status_changed', { status: this.status });
      
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
          console.log('[Network] Connected to server');
          this.status = 'connected';
          this.reconnectAttempts = 0;
          this.emit('status_changed', { status: this.status });
          
          // Send player name
          if (this.playerName) {
            this.send({ type: 'set_name', name: this.playerName });
          }
          
          resolve();
        };
        
        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error('[Network] Invalid message:', e);
          }
        };
        
        this.ws.onclose = () => {
          console.log('[Network] Disconnected from server');
          this.status = 'disconnected';
          this.emit('status_changed', { status: this.status });
          this.handleDisconnect();
        };
        
        this.ws.onerror = (error) => {
          console.error('[Network] WebSocket error:', error);          this.status = 'error';
          this.emit('status_changed', { status: this.status });
          reject(error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentLobby = null;
    this.status = 'disconnected';
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      // Exponential back-off: 2s, 4s, 8s, 16s, 32s
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      this.emit('connection_lost', { attempt: this.reconnectAttempts, maxAttempts: this.maxReconnectAttempts, delayMs: delay });
      setTimeout(() => this.connect().catch(() => {}), delay);
    } else {
      this.emit('connection_failed', { maxAttempts: this.maxReconnectAttempts });
    }
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'connected':
        this.playerId = message.playerId;
        this.emit('connected', message);
        break;
      case 'lobby_joined':
        this.currentLobby = message.lobby;
        this.emit('lobby_joined', message);
        break;
      case 'lobby_updated':
        this.currentLobby = message.lobby;
        this.emit('player_joined', message);
        break;
      case 'player_left':
        this.currentLobby = message.lobby;
        this.emit('player_left', message);
        break;
      case 'lobby_list':
        this.emit('lobby_list', message);
        break;
      case 'game_started':
        this.emit('game_started', message);
        break;
      case 'game_action':
        // state_verify actions are handled locally; other actions are forwarded
        if (message.action?.type === 'state_verify') {
          this.emit('state_verify', message.action);
        } else {
          this.emit('game_action', message.action ?? message);
        }
        break;
      case 'chat':
        this.emit('chat', message);
        break;
      case 'error':
        this.emit('error', message);
        break;
      default:
        this.emit(message.type, message);
    }
  }

  private send(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // ==================== Lobby Actions ====================

  createLobby(name: string, config: any): void {
    this.send({ type: 'create_lobby', name, config });
  }

  joinLobby(lobbyId: string, password?: string): void {
    this.send({ type: 'join_lobby', lobbyId, password });
  }

  leaveLobby(): void {
    this.send({ type: 'leave_lobby' });
    this.currentLobby = null;
  }

  setReady(ready: boolean): void {
    this.send({ type: 'set_ready', ready });
  }

  selectFaction(faction: string): void {
    this.send({ type: 'select_faction', faction });
  }

  startGame(): void {
    this.send({ type: 'start_game' });
  }

  requestLobbyList(): void {
    this.send({ type: 'list_lobbies' });
  }

  sendGameAction(action: GameAction): void {
    this.send({ type: 'game_action', action });
  }

  sendChat(message: string): void {
    this.send({ type: 'chat', message });
  }

  /**
   * Broadcast a state checksum after applying a game action.
   * Other clients compare this against their own checksum to detect desyncs.
   */
  sendStateChecksum(checksum: number, turnNumber: number, phase: string): void {
    this.sendGameAction({ type: 'state_verify', checksum, turnNumber, phase });
  }

  setPlayerName(name: string): void {
    this.playerName = name;
    if (this.status === 'connected') {
      this.send({ type: 'set_name', name });
    }
  }

  // ==================== Getters ====================

  getStatus(): ConnectionStatus { return this.status; }
  getPlayerId(): string | null { return this.playerId; }
  getPlayerName(): string { return this.playerName; }
  getCurrentLobby(): LobbyInfo | null { return this.currentLobby; }
  isConnected(): boolean { return this.status === 'connected'; }
  isHost(): boolean {
    return !!(this.currentLobby && this.playerId && this.currentLobby.hostId === this.playerId);
  }

  // ==================== Events ====================

  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  private emit(event: string, data?: any): void {
    this.eventListeners.get(event)?.forEach(cb => cb(data));
  }
}

export const networkManager = new NetworkManager();
