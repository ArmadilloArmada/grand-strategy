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
  ensurePathExists('steam/steam_appid.txt', 'steam_appid.txt (must match AppID; copied next to exe)');

  const appIdFile = readText('steam/steam_appid.txt').trim().split(/\r?\n/)[0]?.trim();
  ensurePositiveNumeric(appIdFile, 'steam_appid.txt (first line)');
  if (appIdFile !== appId) {
    throw new Error(
      `steam/steam_appid.txt (${appIdFile}) must match AppID in steam/app_build.vdf (${appId}).`
    );
  }

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
