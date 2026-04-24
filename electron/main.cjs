const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow = null;

// Steam integration (optional - will work without Steam)
// Replace 480 with your real Steam App ID once you have one from Steamworks
const STEAM_APP_ID = 480;
let steamworks = null;
try {
  const steamworksJs = require('steamworks.js');
  steamworks = steamworksJs.init(STEAM_APP_ID);
  console.log('Steam integration enabled. User:', steamworks.localplayer.getName());
} catch (e) {
  console.log('Running without Steam integration:', e.message);
}

// Check if running in development
const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Grand Strategy',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#1a4d2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:19123');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from dist folder
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'Game',
      submenu: [
        {
          label: 'New Game',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu-new-game'),
        },
        {
          label: 'Save Game',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu-save-game'),
        },
        {
          label: 'Load Game',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu-load-game'),
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('menu-settings'),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow?.webContents.send('menu-zoom-in'),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow?.webContents.send('menu-zoom-out'),
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.send('menu-zoom-reset'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools', visible: isDev },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'How to Play',
          accelerator: 'F1',
          click: () => mainWindow?.webContents.send('menu-help'),
        },
        { type: 'separator' },
        {
          label: 'About Grand Strategy',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Grand Strategy',
              message: 'Grand Strategy v0.1.0',
              detail: 'A modern turn-based strategy wargame.\n\nInspired by classic grand strategy games like TripleA and Axis & Allies.',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Steam Achievement integration (if available)
function unlockAchievement(achievementId) {
  if (steamworks) {
    try {
      steamworks.achievement.activate(achievementId);
      console.log(`Achievement unlocked: ${achievementId}`);
    } catch (e) {
      console.error('Failed to unlock achievement:', e);
    }
  }
}

// IPC handlers for renderer communication
ipcMain.handle('get-app-path', () => app.getPath('userData'));

ipcMain.handle('unlock-achievement', (event, achievementId) => {
  unlockAchievement(achievementId);
});

ipcMain.handle('is-steam-running', () => {
  return steamworks !== null;
});

ipcMain.handle('get-steam-username', () => {
  if (steamworks) {
    try {
      return steamworks.localplayer.getName();
    } catch (e) {
      return null;
    }
  }
  return null;
});

// Steam Cloud file operations
ipcMain.handle('steam-cloud-write', (event, filename, data) => {
  if (steamworks) {
    try {
      steamworks.cloud.writeFile(filename, data);
      return true;
    } catch (e) {
      console.error('Steam cloud write failed:', e);
    }
  }
  return false;
});

ipcMain.handle('steam-cloud-read', (event, filename) => {
  if (steamworks) {
    try {
      const data = steamworks.cloud.readFile(filename);
      // readFile returns a Buffer; convert to string for JSON save data
      return Buffer.isBuffer(data) ? data.toString('utf8') : data;
    } catch (e) {
      console.error('Steam cloud read failed:', e);
    }
  }
  return null;
});

ipcMain.handle('steam-cloud-list', () => {
  if (steamworks) {
    try {
      return steamworks.cloud.listFiles();
    } catch (e) {
      console.error('Steam cloud list failed:', e);
    }
  }
  return [];
});

ipcMain.handle('steam-cloud-delete', (event, filename) => {
  if (steamworks) {
    try {
      steamworks.cloud.deleteFile(filename);
      return true;
    } catch (e) {
      console.error('Steam cloud delete failed:', e);
    }
  }
  return false;
});

// Steam Rich Presence
ipcMain.handle('set-rich-presence', (event, status, details) => {
  if (steamworks) {
    try {
      steamworks.localplayer.setRichPresence('status', String(status ?? ''));
      if (details && typeof details === 'object') {
        for (const [key, value] of Object.entries(details)) {
          steamworks.localplayer.setRichPresence(key, String(value));
        }
      }
    } catch (e) {
      console.error('Set rich presence failed:', e);
    }
  }
});

// Steam Overlay
ipcMain.handle('open-steam-overlay', (event, dialog) => {
  if (steamworks) {
    try {
      steamworks.overlay.activateOverlay(dialog ?? 'Achievements');
    } catch (e) {
      console.error('Open steam overlay failed:', e);
    }
  }
});

// Save file dialog
ipcMain.handle('show-save-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Game',
    defaultPath: 'savegame.json',
    filters: [{ name: 'Save Files', extensions: ['json'] }],
  });
  return result;
});

// Open file dialog
ipcMain.handle('show-open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Load Game',
    properties: ['openFile'],
    filters: [{ name: 'Save Files', extensions: ['json'] }],
  });
  return result;
});

// ── Mod filesystem integration ─────────────────────────────────────────────

/** Scan the userData/mods/ folder and return all valid mod JSON files */
ipcMain.handle('scan-mods-folder', async () => {
  const modsDir = path.join(app.getPath('userData'), 'mods');
  try {
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }
    const files = fs.readdirSync(modsDir).filter(f => f.endsWith('.json'));
    const mods = [];
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(modsDir, file), 'utf8');
        const parsed = JSON.parse(content);
        if (parsed.manifest && parsed.manifest.id) {
          mods.push({ filename: file, mod: parsed });
        }
      } catch (e) {
        console.warn(`Skipping invalid mod file "${file}":`, e.message);
      }
    }
    return mods;
  } catch (e) {
    console.error('Failed to scan mods folder:', e);
    return [];
  }
});

/** Open a file-picker dialog restricted to .json files and return the chosen file's content */
ipcMain.handle('import-mod-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Mod',
    properties: ['openFile'],
    filters: [{ name: 'Mod Files', extensions: ['json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    const parsed = JSON.parse(content);
    return parsed;
  } catch (e) {
    console.error('Failed to read mod file:', e);
    return null;
  }
});

/** Export a mod to the userData/mods/ folder */
ipcMain.handle('export-mod-file', async (event, modJson) => {
  try {
    const parsed = JSON.parse(modJson);
    const filename = `${parsed.manifest.id}.json`;
    const modsDir = path.join(app.getPath('userData'), 'mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
    fs.writeFileSync(path.join(modsDir, filename), modJson, 'utf8');
    return filename;
  } catch (e) {
    console.error('Failed to export mod:', e);
    return null;
  }
});

/** Delete a mod file from the userData/mods/ folder */
ipcMain.handle('delete-mod-file', async (event, filename) => {
  try {
    const modsDir = path.join(app.getPath('userData'), 'mods');
    const fullPath = path.join(modsDir, filename);
    // Security: ensure the path is inside the mods directory
    if (!fullPath.startsWith(modsDir)) return false;
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Failed to delete mod file:', e);
    return false;
  }
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle second instance (single instance lock)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window if user tries to open another instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Cleanup on quit
app.on('before-quit', () => {
  if (steamworks) {
    // Cleanup Steam if needed
  }
});

console.log('Grand Strategy Electron App Starting...');
console.log('Development mode:', isDev);
