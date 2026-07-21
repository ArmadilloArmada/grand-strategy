/**
 * Multiplayer lobby UI — wires CSS in main.css to server/index.js (Horizon 4).
 */

import { multiplayerClient, type LobbySummary, type LobbyState } from '../net/MultiplayerClient';

export interface MultiplayerUICallbacks {
  onStartOnlineGame?(lobby: LobbyState): void;
}

export class MultiplayerUI {
  private modal: HTMLElement | null = null;
  private view: 'browse' | 'lobby' = 'browse';
  private lobbies: LobbySummary[] = [];

  constructor(private callbacks: MultiplayerUICallbacks = {}) {}

  show(): void {
    this.ensureModal();
    this.modal?.classList.remove('hidden');
    multiplayerClient.connect();
    this.render();
    multiplayerClient.listLobbies();
  }

  hide(): void {
    this.modal?.classList.add('hidden');
  }

  private ensureModal(): void {
    if (this.modal) return;

    const el = document.createElement('div');
    el.id = 'mp-modal';
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-content mp-container">
        <div class="mp-header">
          <h2>🌐 Online Multiplayer</h2>
          <span id="mp-status" class="mp-status mp-status-disconnected">Disconnected</span>
          <button id="mp-close" class="modal-close" aria-label="Close">✕</button>
        </div>
        <div id="mp-body" class="mp-content"></div>
      </div>
    `;
    document.body.appendChild(el);
    this.modal = el;

    el.querySelector('#mp-close')?.addEventListener('click', () => this.hide());

    multiplayerClient.on((event, data) => {
      if (event === 'connection') {
        const state = (data as { state: string }).state;
        const badge = document.getElementById('mp-status');
        if (badge) {
          badge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
          badge.className = `mp-status mp-status-${state}`;
        }
      }
      if (event === 'lobby_list') {
        this.lobbies = (data as { lobbies: LobbySummary[] }).lobbies ?? [];
        if (this.view === 'browse') this.renderBrowse();
      }
      if (event === 'lobby') {
        this.view = 'lobby';
        this.renderLobby((data as { lobby: LobbyState }).lobby);
      }
      if (event === 'game_started') {
        const lobby = multiplayerClient.currentLobby;
        if (lobby) this.callbacks.onStartOnlineGame?.(lobby);
        this.hide();
      }
      if (event === 'error') {
        const msg = (data as { message: string }).message;
        const body = document.getElementById('mp-body');
        if (body && this.view === 'browse') {
          const err = document.createElement('p');
          err.className = 'mp-error';
          err.textContent = msg;
          body.prepend(err);
        }
      }
    });
  }

  private render(): void {
    if (this.view === 'lobby' && multiplayerClient.currentLobby) {
      this.renderLobby(multiplayerClient.currentLobby);
    } else {
      this.renderBrowse();
    }
  }

  private renderBrowse(): void {
    const body = document.getElementById('mp-body');
    if (!body) return;
    this.view = 'browse';

    body.innerHTML = `
      <div class="mp-form-group">
        <label for="mp-player-name">Display Name</label>
        <input id="mp-player-name" type="text" maxlength="32" placeholder="Commander" value="Player" />
      </div>
      <div class="mp-form-group">
        <label for="mp-lobby-name">New Lobby Name</label>
        <input id="mp-lobby-name" type="text" maxlength="64" placeholder="My Grand Strategy Game" />
      </div>
      <div class="mp-lobby-actions">
        <button id="mp-create" class="mp-btn primary">Create Lobby</button>
        <button id="mp-refresh" class="mp-btn">Refresh List</button>
      </div>
      <h4 style="margin:1.25rem 0 0.5rem;color:var(--gold-bright);">Public Lobbies</h4>
      <div id="mp-lobby-list" class="mp-lobby-list"></div>
      <p class="modal-hint" style="margin-top:1rem;">Start the server with <code>node server/index.js</code> on port 3847.</p>
    `;

    body.querySelector('#mp-create')?.addEventListener('click', () => {
      const nameInput = body.querySelector<HTMLInputElement>('#mp-lobby-name');
      const playerInput = body.querySelector<HTMLInputElement>('#mp-player-name');
      const playerName = playerInput?.value.trim() || 'Player';
      multiplayerClient.setName(playerName);
      multiplayerClient.createLobby(nameInput?.value.trim() || `${playerName}'s Game`, {
        mapName: 'world',
        maxPlayers: 4,
        isPublic: true,
      });
    });

    body.querySelector('#mp-refresh')?.addEventListener('click', () => {
      multiplayerClient.listLobbies();
    });

    this.renderLobbyList();
  }

  private renderLobbyList(): void {
    const list = document.getElementById('mp-lobby-list');
    if (!list) return;

    if (this.lobbies.length === 0) {
      list.innerHTML = '<p class="modal-hint">No open lobbies — create one above.</p>';
      return;
    }

    list.innerHTML = this.lobbies.map(lobby => `
      <div class="mp-lobby-item" data-lobby-id="${lobby.id}">
        <div class="mp-lobby-info">
          <div class="mp-lobby-name">${lobby.name}</div>
          <div class="mp-lobby-host">Host: ${lobby.host}</div>
          <div class="mp-lobby-details">${lobby.players}/${lobby.maxPlayers} · ${lobby.mapName}${lobby.hasPassword ? ' · 🔒' : ''}</div>
        </div>
        <button class="mp-btn join-btn">Join</button>
      </div>
    `).join('');

    list.querySelectorAll('.mp-lobby-item').forEach(item => {
      const lobbyId = item.getAttribute('data-lobby-id');
      item.querySelector('.join-btn')?.addEventListener('click', () => {
        if (lobbyId) multiplayerClient.joinLobby(lobbyId);
      });
    });
  }

  private renderLobby(lobby: LobbyState): void {
    const body = document.getElementById('mp-body');
    if (!body) return;

    const localId = multiplayerClient.localPlayerId;
    const isHost = lobby.hostId === localId;

    body.innerHTML = `
      <div class="mp-lobby">
        <div class="mp-lobby-header">
          <h3>${lobby.name}</h3>
          <span class="mp-lobby-code">${lobby.id.slice(0, 8)}</span>
        </div>
        <div class="mp-lobby-players">
          <h4>Players</h4>
          <ul class="mp-player-list">
            ${lobby.players.map(p => `
              <li class="mp-player-row ${p.isReady ? 'ready' : ''}">
                <span>${p.name}${p.isHost ? ' (Host)' : ''}</span>
                <span>${p.faction ?? '—'} ${p.isReady ? '✓' : ''}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        <div class="mp-lobby-actions">
          <button id="mp-ready" class="mp-btn">${lobby.players.find(p => p.id === localId)?.isReady ? 'Not Ready' : 'Ready'}</button>
          ${isHost ? '<button id="mp-start" class="mp-btn primary">Start Game</button>' : ''}
          <button id="mp-leave" class="mp-btn danger">Leave</button>
        </div>
      </div>
    `;

    body.querySelector('#mp-ready')?.addEventListener('click', () => {
      const me = lobby.players.find(p => p.id === localId);
      multiplayerClient.setReady(!me?.isReady);
    });

    body.querySelector('#mp-start')?.addEventListener('click', () => {
      multiplayerClient.startGame();
    });

    body.querySelector('#mp-leave')?.addEventListener('click', () => {
      multiplayerClient.leaveLobby();
      this.view = 'browse';
      this.renderBrowse();
      multiplayerClient.listLobbies();
    });
  }
}
