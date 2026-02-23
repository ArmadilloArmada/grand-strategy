/**
 * MultiplayerUI - UI for multiplayer lobby and game sync
 */

import { NetworkManager, networkManager, LobbyInfo, LobbyListItem, ChatMessage } from './NetworkManager';

export class MultiplayerUI {
  private network: NetworkManager;
  private container: HTMLElement | null = null;
  private chatMessages: ChatMessage[] = [];
  
  constructor(network: NetworkManager = networkManager) {
    this.network = network;
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    this.network.on('status_changed', (data) => this.onStatusChanged(data.status));
    this.network.on('connected', () => this.onConnected());
    this.network.on('lobby_joined', (data) => this.showLobby(data.lobby));
    this.network.on('lobby_list', (data) => this.showLobbyList(data.lobbies));
    this.network.on('player_joined', (data) => this.updateLobbyPlayers(data.lobby));
    this.network.on('player_left', (data) => this.updateLobbyPlayers(data.lobby));
    this.network.on('faction_selected', (data) => this.updateLobbyPlayers(data.lobby));
    this.network.on('player_ready', (data) => this.updateLobbyPlayers(data.lobby));
    this.network.on('game_started', (data) => this.onGameStarted(data));
    this.network.on('chat', (data) => this.onChatMessage(data));
    this.network.on('error', (data) => this.showError(data.message));
  }
  
  // ==================== UI Creation ====================
  
  show(container: HTMLElement): void {
    this.container = container;
    this.renderMainMenu();
  }
  
  hide(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.container = null;
  }
  
  private renderMainMenu(): void {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div class="mp-container">
        <div class="mp-header">
          <h2>Multiplayer</h2>
          <span class="mp-status" id="mp-status">Disconnected</span>
        </div>
        
        <div class="mp-content" id="mp-content">
          <div class="mp-connect-section">
            <div class="mp-form-group">
              <label>Server Address</label>
              <input type="text" id="mp-server-url" value="ws://localhost:8080" />
            </div>
            <div class="mp-form-group">
              <label>Player Name</label>
              <input type="text" id="mp-player-name" value="${this.network.getPlayerName()}" maxlength="32" />
            </div>
            <button class="mp-btn mp-btn-primary" id="mp-connect-btn">Connect</button>
          </div>
        </div>
        
        <div class="mp-actions" id="mp-actions" style="display: none;">
          <button class="mp-btn mp-btn-primary" id="mp-create-btn">Create Lobby</button>
          <button class="mp-btn mp-btn-secondary" id="mp-browse-btn">Browse Lobbies</button>
          <button class="mp-btn mp-btn-secondary" id="mp-join-btn">Join by Code</button>
          <button class="mp-btn mp-btn-danger" id="mp-disconnect-btn">Disconnect</button>
        </div>
      </div>
    `;
    
    // Event listeners
    document.getElementById('mp-connect-btn')?.addEventListener('click', () => this.onConnect());
    document.getElementById('mp-create-btn')?.addEventListener('click', () => this.showCreateLobby());
    document.getElementById('mp-browse-btn')?.addEventListener('click', () => this.browsLobbies());
    document.getElementById('mp-join-btn')?.addEventListener('click', () => this.showJoinByCode());
    document.getElementById('mp-disconnect-btn')?.addEventListener('click', () => this.onDisconnect());
    
    // Update status
    this.updateStatusDisplay(this.network.getStatus());
  }
  
  private renderCreateLobbyForm(): void {
    const content = document.getElementById('mp-content');
    if (!content) return;
    
    content.innerHTML = `
      <div class="mp-form">
        <h3>Create Lobby</h3>
        <div class="mp-form-group">
          <label>Lobby Name</label>
          <input type="text" id="create-lobby-name" value="${this.network.getPlayerName()}'s Game" maxlength="64" />
        </div>
        <div class="mp-form-group">          <label>Max Players</label>
          <select id="create-max-players">
            <option value="2">2 Players</option>
            <option value="3">3 Players</option>
            <option value="4" selected>4 Players</option>
            <option value="6">6 Players</option>
          </select>
        </div>
        <div class="mp-form-group">
          <label><input type="checkbox" id="create-public" checked /> Public Lobby</label>
        </div>
        <div class="mp-form-actions">
          <button class="mp-btn mp-btn-primary" id="create-submit-btn">Create</button>
          <button class="mp-btn mp-btn-secondary" id="create-cancel-btn">Cancel</button>
        </div>
      </div>
    `;

    document.getElementById('create-submit-btn')?.addEventListener('click', () => {
      const name = (document.getElementById('create-lobby-name') as HTMLInputElement).value.trim() || "My Game";
      const maxPlayers = parseInt((document.getElementById('create-max-players') as HTMLSelectElement).value);
      const isPublic = (document.getElementById('create-public') as HTMLInputElement).checked;
      this.network.createLobby(name, { maxPlayers, isPublic });
    });
    document.getElementById('create-cancel-btn')?.addEventListener('click', () => this.renderMainMenu());
  }

  private showCreateLobby(): void {
    this.renderCreateLobbyForm();
  }

  private browsLobbies(): void {
    this.network.requestLobbyList();
  }

  private showJoinByCode(): void {
    const content = document.getElementById('mp-content');
    if (!content) return;
    content.innerHTML = `
      <div class="mp-form">
        <h3>Join by Code</h3>
        <div class="mp-form-group">
          <input type="text" id="join-code" placeholder="Lobby Code" maxlength="32" />
        </div>
        <div class="mp-form-actions">
          <button class="mp-btn mp-btn-primary" id="join-code-btn">Join</button>
          <button class="mp-btn mp-btn-secondary" id="join-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
    document.getElementById('join-code-btn')?.addEventListener('click', () => {
      const code = (document.getElementById('join-code') as HTMLInputElement).value.trim();
      if (code) this.network.joinLobby(code);
    });
    document.getElementById('join-cancel-btn')?.addEventListener('click', () => this.renderMainMenu());
  }

  private showLobbyList(lobbies: LobbyListItem[]): void {
    const content = document.getElementById('mp-content');
    if (!content) return;
    content.innerHTML = `
      <div class="mp-lobby-list">
        <h3>Available Lobbies</h3>
        ${lobbies.length === 0 ? '<p class="mp-empty">No lobbies available</p>' :
          lobbies.map(l => `
            <div class="mp-lobby-item" data-id="${l.id}">
              <span class="lobby-name">${l.name}</span>
              <span class="lobby-host">${l.host}</span>
              <span class="lobby-players">${l.players}/${l.maxPlayers}</span>
              <button class="mp-btn mp-btn-small" onclick="document.dispatchEvent(new CustomEvent('mp-join',{detail:'${l.id}'}))">Join</button>
            </div>
          `).join('')}
        <button class="mp-btn mp-btn-secondary" id="lobby-list-back">Back</button>
        <button class="mp-btn mp-btn-secondary" id="lobby-list-refresh">Refresh</button>
      </div>
    `;
    document.getElementById('lobby-list-back')?.addEventListener('click', () => this.renderMainMenu());
    document.getElementById('lobby-list-refresh')?.addEventListener('click', () => this.network.requestLobbyList());
    document.addEventListener('mp-join', (e: any) => this.network.joinLobby(e.detail), { once: true });
  }

  showLobby(lobby: LobbyInfo): void {
    const content = document.getElementById('mp-content');
    if (!content) return;
    this.updateLobbyPlayers(lobby);
  }

  updateLobbyPlayers(lobby: LobbyInfo): void {
    const content = document.getElementById('mp-content');
    if (!content) return;
    content.innerHTML = `
      <div class="mp-lobby">
        <h3>${lobby.name}</h3>
        <div class="mp-player-list">
          ${lobby.players.map(p => `
            <div class="mp-player ${p.isReady ? 'ready' : ''}">
              <span>${p.name}${p.isHost ? ' 👑' : ''}</span>
              <span>${p.faction ?? 'No faction'}</span>
              <span>${p.isReady ? '✅' : '⏳'}</span>
            </div>
          `).join('')}
        </div>
        <div class="mp-lobby-actions">
          ${this.network.isHost() ? '<button class="mp-btn mp-btn-primary" id="start-game-btn">Start Game</button>' : ''}
          <button class="mp-btn mp-btn-secondary" id="toggle-ready-btn">Ready</button>
          <button class="mp-btn mp-btn-danger" id="leave-lobby-btn">Leave</button>
        </div>
      </div>
    `;
    document.getElementById('start-game-btn')?.addEventListener('click', () => this.network.startGame());
    document.getElementById('toggle-ready-btn')?.addEventListener('click', () => this.network.setReady(true));
    document.getElementById('leave-lobby-btn')?.addEventListener('click', () => {
      this.network.leaveLobby();
      this.renderMainMenu();
    });
  }

  private onConnect(): void {
    const name = (document.getElementById('mp-player-name') as HTMLInputElement)?.value?.trim();
    if (name) this.network.setPlayerName(name);
    this.network.connect().catch(e => this.showError(String(e)));
  }

  private onDisconnect(): void {
    this.network.disconnect();
    this.renderMainMenu();
  }

  private onConnected(): void {
    document.getElementById('mp-actions')?.style.setProperty('display', 'flex');
  }

  private onStatusChanged(status: string): void {
    this.updateStatusDisplay(status as any);
  }

  private updateStatusDisplay(status: string): void {
    const el = document.getElementById('mp-status');
    if (!el) return;
    const labels: Record<string, string> = {
      disconnected: 'Disconnected',
      connecting: 'Connecting...',
      connected: 'Connected',
      error: 'Error',
    };
    el.textContent = labels[status] ?? status;
    el.className = `mp-status mp-status-${status}`;
  }

  private onGameStarted(data: any): void {
    this.hide();
    document.dispatchEvent(new CustomEvent('mp-game-start', { detail: data }));
  }

  private onChatMessage(data: ChatMessage): void {
    this.chatMessages.push(data);
    const chatEl = document.getElementById('mp-chat-messages');
    if (chatEl) {
      chatEl.innerHTML += `<div class="chat-msg"><b>${data.playerName}:</b> ${data.message}</div>`;
      chatEl.scrollTop = chatEl.scrollHeight;
    }
  }

  showError(message: string): void {
    const existing = document.getElementById('mp-error');
    if (existing) existing.remove();
    const err = document.createElement('div');
    err.id = 'mp-error';
    err.className = 'mp-error';
    err.textContent = message;
    this.container?.appendChild(err);
    setTimeout(() => err.remove(), 5000);
  }
}

export const multiplayerUI = new MultiplayerUI();
