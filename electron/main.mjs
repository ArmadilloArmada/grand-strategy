import electronPkg from 'electron';
const { app, BrowserWindow, Menu, ipcMain, dialog } = electronPkg;
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

// Keep a global reference of the window object
let mainWindow = null;

// Steam integration (optional - will work without Steam)
let steamworks = null;
try {
  // Try to load steamworks - will fail gracefully if not installed
  // Install with: npm install steamworks.js
  // steamworks = require('steamworks.js');
  // steamworks.init(YOUR_STEAM_APP_ID);
  console.log('Steam integration disabled (install steamworks.js for Steam features)');
} catch (e) {
  console.log('Running without Steam integration');
}

// Check if running in development
const isDev = !app.isPackaged;

// Dev server URL (set via ELECTRON_START_URL env var or fallback to default port)
const DEV_URL = process.env.ELECTRON_START_URL ?? 'http://localhost:5175';

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
    mainWindow.loadURL(DEV_URL);
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
console.log('Dev server URL:', isDev ? DEV_URL : '(production)');
