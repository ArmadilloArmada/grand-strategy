     1→const { contextBridge, ipcRenderer } = require('electron');
     2→
     3→// Expose protected APIs to the renderer process
     4→contextBridge.exposeInMainWorld('electronAPI', {
     5→  // App info
     6→  getAppPath: () => ipcRenderer.invoke('get-app-path'),
     7→  
     8→  // Steam integration
     9→  isSteamRunning: () => ipcRenderer.invoke('is-steam-running'),
    10→  getSteamUsername: () => ipcRenderer.invoke('get-steam-username'),
    11→  unlockAchievement: (id) => ipcRenderer.invoke('unlock-achievement', id),
    12→  
    13→  // File dialogs
    14→  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
    15→  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
    16→  
    17→  // Menu event listeners
    18→  onMenuNewGame: (callback) => ipcRenderer.on('menu-new-game', callback),
    19→  onMenuSaveGame: (callback) => ipcRenderer.on('menu-save-game', callback),
    20→  onMenuLoadGame: (callback) => ipcRenderer.on('menu-load-game', callback),
    21→  onMenuSettings: (callback) => ipcRenderer.on('menu-settings', callback),
    22→  onMenuHelp: (callback) => ipcRenderer.on('menu-help', callback),
    23→  onMenuZoomIn: (callback) => ipcRenderer.on('menu-zoom-in', callback),
    24→  onMenuZoomOut: (callback) => ipcRenderer.on('menu-zoom-out', callback),
    25→  onMenuZoomReset: (callback) => ipcRenderer.on('menu-zoom-reset', callback),
    26→  
    27→  // Remove listeners
    28→  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
    29→});
    30→
    31→// Expose platform info
    32→contextBridge.exposeInMainWorld('platform', {
    33→  isElectron: true,
    34→  isWindows: process.platform === 'win32',
    35→  isMac: process.platform === 'darwin',
    36→  isLinux: process.platform === 'linux',
    37→});
    38→
    39→console.log('Preload script loaded');
    40→