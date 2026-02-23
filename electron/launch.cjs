#!/usr/bin/env node
/**
 * Launcher: removes ELECTRON_RUN_AS_NODE before starting Electron.
 * This variable (set by VS Code/Cursor) forces Electron into plain Node.js mode,
 * which disables all Electron APIs. We must delete it, not just set it to empty/0.
 */
const { spawn } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronBin = require('electron');
const args = process.argv.slice(2);
if (args.length === 0) args.push('.');

const child = spawn(electronBin, args, {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('close', (code) => process.exit(code ?? 0));
