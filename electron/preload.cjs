const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // Steam core
  isSteamRunning: () => ipcRenderer.invoke('is-steam-running'),
  getSteamUsername: () => ipcRenderer.invoke('get-steam-username'),
  unlockAchievement: (id) => ipcRenderer.invoke('unlock-achievement', id),

  // Steam Cloud saves
  steamCloudWrite: (filename, data) => ipcRenderer.invoke('steam-cloud-write', filename, data),
  steamCloudRead: (filename) => ipcRenderer.invoke('steam-cloud-read', filename),
  steamCloudList: () => ipcRenderer.invoke('steam-cloud-list'),
  steamCloudDelete: (filename) => ipcRenderer.invoke('steam-cloud-delete', filename),

  // Steam Rich Presence & Overlay
  setRichPresence: (status, details) => ipcRenderer.invoke('set-rich-presence', status, details),
  openSteamOverlay: (dialog) => ipcRenderer.invoke('open-steam-overlay', dialog),

  // File dialogs
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),

  // Mod filesystem
  scanModsFolder: () => ipcRenderer.invoke('scan-mods-folder'),
  importModFile: () => ipcRenderer.invoke('import-mod-file'),
  exportModFile: (modJson) => ipcRenderer.invoke('export-mod-file', modJson),
  deleteModFile: (filename) => ipcRenderer.invoke('delete-mod-file', filename),

  // Menu event listeners
  onMenuNewGame: (callback) => ipcRenderer.on('menu-new-game', callback),
  onMenuSaveGame: (callback) => ipcRenderer.on('menu-save-game', callback),
  onMenuLoadGame: (callback) => ipcRenderer.on('menu-load-game', callback),
  onMenuSettings: (callback) => ipcRenderer.on('menu-settings', callback),
  onMenuHelp: (callback) => ipcRenderer.on('menu-help', callback),
  onMenuZoomIn: (callback) => ipcRenderer.on('menu-zoom-in', callback),
  onMenuZoomOut: (callback) => ipcRenderer.on('menu-zoom-out', callback),
  onMenuZoomReset: (callback) => ipcRenderer.on('menu-zoom-reset', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

// Expose platform info
contextBridge.exposeInMainWorld('platform', {
  isElectron: true,
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
});

console.log('Preload script loaded');
