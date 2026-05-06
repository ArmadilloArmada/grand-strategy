const fs = require('fs');
const path = require('path');

function readText(relPath) {
  const full = path.resolve(__dirname, '..', relPath);
  return fs.readFileSync(full, 'utf8');
}

function extractQuotedValue(content, key) {
  const re = new RegExp(`"${key}"\\s+"([^"]+)"`);
  const match = content.match(re);
  return match ? match[1] : null;
}

function ensurePositiveNumeric(value, name) {
  if (!value || !/^[1-9][0-9]+$/.test(value)) {
    throw new Error(`${name} is missing or invalid: "${value ?? ''}"`);
  }
}

function ensureNotPlaceholder(value, placeholder, name) {
  if (value === placeholder) {
    throw new Error(`${name} is still placeholder ${placeholder}. Replace with your real Steamworks ID.`);
  }
}

function ensurePathExists(relPath, name) {
  const full = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(full)) throw new Error(`${name} not found: ${relPath}`);
}

function main() {
  const appBuild = readText('steam/app_build.vdf');
  const depotBuild = readText('steam/depot_build_win.vdf');

  const appId = extractQuotedValue(appBuild, 'AppID');
  const depotId = extractQuotedValue(depotBuild, 'DepotID');
  ensurePositiveNumeric(appId, 'AppID');
  ensurePositiveNumeric(depotId, 'DepotID');
  ensureNotPlaceholder(appId, '480', 'AppID');
  ensureNotPlaceholder(depotId, '481', 'DepotID');

  ensurePathExists('electron-builder-steam.json', 'Steam builder config');
  ensurePathExists('steam/app_build.vdf', 'Steam app build VDF');
  ensurePathExists('steam/depot_build_win.vdf', 'Steam depot build VDF');

  console.log('Steam preflight OK');
  console.log(`- AppID: ${appId}`);
  console.log(`- DepotID: ${depotId}`);
}

try {
  main();
} catch (err) {
  console.error('[steam-preflight] FAILED');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
