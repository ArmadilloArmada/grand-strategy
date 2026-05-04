const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow = null;

// Steam integration is optional; App ID 480 is Spacewar, useful only for dev smoke tests.
// Set STEAM_APP_ID to the real Steamworks App ID for release builds.
const STEAM_APP_ID = Number(process.env.STEAM_APP_ID ?? 480);
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
  // Handle renderer crash - offer reload before quitting
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Renderer] Process gone:', details.reason);
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      title: 'Grand Strategy - Renderer Crashed',
      message: 'The game renderer stopped unexpectedly.',
      detail: `Reason: ${details.reason}`,
      buttons: ['Reload Game', 'Quit'],
      defaultId: 0,
    });
    if (choice === 0) mainWindow.reload();
    else app.quit();
  });

  // Handle renderer hang
  mainWindow.webContents.on('unresponsive', () => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Grand Strategy - Not Responding',
      message: 'The game is not responding.',
      buttons: ['Wait', 'Reload', 'Quit'],
      defaultId: 0,
    });
    if (choice === 1) mainWindow.reload();
    else if (choice === 2) app.quit();
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
            const pkg = require('../package.json');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Grand Strategy',
              message: `Grand Strategy v${pkg.version}`,
              detail: [
                'A modern turn-based strategy wargame.',
                '',
                'Developed by ArmadilloArmada',
                '',
                'Built with Electron, Vite, and TypeScript.',
                'Inspired by TripleA and Axis & Allies.',
                '',
                'Third-party libraries:',
                '  Electron - Vite - TypeScript',
                '  steamworks.js - Vitest',
              ].join('\n'),
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

// Mod filesystem integration

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
    // Sanitize id so it can't escape the mods directory via path traversal
    const safeId = String(parsed.manifest.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeId}.json`;
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
    const modsDir = path.resolve(path.join(app.getPath('userData'), 'mods'));
    const fullPath = path.resolve(path.join(modsDir, filename));
    // Guard against path traversal (e.g. "../evil" resolving outside modsDir)
    if (!fullPath.startsWith(modsDir + path.sep)) return false;
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

// Steam Workshop

ipcMain.handle('get-workshop-items', (_event, query, tags) => {
  if (!steamworks) return [];
  try {
    const ugc = steamworks.ugc ?? steamworks.workshop;
    if (!ugc) return [];
    return ugc.getItems?.({ query, tags }) ?? [];
  } catch (e) {
    console.error('get-workshop-items failed:', e);
    return [];
  }
});

ipcMain.handle('subscribe-workshop-item', (_event, itemId) => {
  if (!steamworks) return false;
  try {
    const ugc = steamworks.ugc ?? steamworks.workshop;
    if (!ugc) return false;
    ugc.subscribeItem?.(BigInt(itemId));
    return true;
  } catch (e) {
    console.error('subscribe-workshop-item failed:', e);
    return false;
  }
});

ipcMain.handle('unsubscribe-workshop-item', (_event, itemId) => {
  if (!steamworks) return false;
  try {
    const ugc = steamworks.ugc ?? steamworks.workshop;
    if (!ugc) return false;
    ugc.unsubscribeItem?.(BigInt(itemId));
    return true;
  } catch (e) {
    console.error('unsubscribe-workshop-item failed:', e);
    return false;
  }
});

ipcMain.handle('workshop-publish', async (_event, { title, description, tags, contentPath, previewPath }) => {
  if (!steamworks) return { success: false, error: 'Steam not available' };
  try {
    const ugc = steamworks.ugc ?? steamworks.workshop;
    if (!ugc) return { success: false, error: 'UGC API not available in this build' };
    // createItem is async in steamworks.js and returns published file metadata.
    const createResult = await ugc.createItem?.(STEAM_APP_ID, 0 /* k_EWorkshopFileTypeCommunity */);
    if (!createResult) return { success: false, error: 'createItem not supported' };

    const handle = ugc.startItemUpdate?.(STEAM_APP_ID, createResult.publishedFileId);
    if (handle == null) return { success: false, error: 'startItemUpdate not supported' };

    ugc.setItemTitle?.(handle, String(title).slice(0, 128));
    ugc.setItemDescription?.(handle, String(description).slice(0, 8000));
    if (Array.isArray(tags) && tags.length) ugc.setItemTags?.(handle, tags.map(String));
    if (contentPath) ugc.setItemContent?.(handle, contentPath);
    if (previewPath) ugc.setItemPreview?.(handle, previewPath);

    const submitResult = await ugc.submitItemUpdate?.(handle, 'Initial upload');
    if (!submitResult) return { success: false, error: 'submitItemUpdate not supported' };

    const ok = submitResult.result === 1; // k_EResultOK
    return { success: ok, itemId: String(createResult.publishedFileId), needsLegalAgreement: createResult.userNeedsToAcceptWorkshopLegalAgreement };
  } catch (e) {
    console.error('workshop-publish failed:', e);
    return { success: false, error: e.message ?? String(e) };
  }
});

ipcMain.handle('workshop-update', async (_event, { itemId, title, description, tags, contentPath, previewPath, changeNote }) => {
  if (!steamworks) return { success: false, error: 'Steam not available' };
  try {
    const ugc = steamworks.ugc ?? steamworks.workshop;
    if (!ugc) return { success: false, error: 'UGC API not available in this build' };

    const handle = ugc.startItemUpdate?.(STEAM_APP_ID, BigInt(itemId));
    if (handle == null) return { success: false, error: 'startItemUpdate not supported' };

    if (title != null)       ugc.setItemTitle?.(handle, String(title).slice(0, 128));
    if (description != null) ugc.setItemDescription?.(handle, String(description).slice(0, 8000));
    if (Array.isArray(tags) && tags.length) ugc.setItemTags?.(handle, tags.map(String));
    if (contentPath != null) ugc.setItemContent?.(handle, contentPath);
    if (previewPath != null) ugc.setItemPreview?.(handle, previewPath);

    const submitResult = await ugc.submitItemUpdate?.(handle, changeNote ?? 'Update');
    if (!submitResult) return { success: false, error: 'submitItemUpdate not supported' };

    return { success: submitResult.result === 1, needsLegalAgreement: submitResult.userNeedsToAcceptWorkshopLegalAgreement };
  } catch (e) {
    console.error('workshop-update failed:', e);
    return { success: false, error: e.message ?? String(e) };
  }
});

// Crash and error handling

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err);
  try {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Grand Strategy - Fatal Error',
      message: 'An unexpected error caused the game to crash.',
      detail: err.stack ?? err.message,
      buttons: ['OK'],
    });
  } catch (_) {}
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled promise rejection:', reason);
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
