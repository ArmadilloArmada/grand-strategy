/**
 * Writes steam/steam_appid.txt from the AppID in steam/app_build.vdf
 * so the packaged exe matches SteamPipe config without manual copy/paste.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const vdfPath = path.join(root, 'steam', 'app_build.vdf');
const outPath = path.join(root, 'steam', 'steam_appid.txt');

const vdf = fs.readFileSync(vdfPath, 'utf8');
const m = vdf.match(/"AppID"\s+"([^"]+)"/);
if (!m) {
  console.error('[steam-sync-appid] Could not find AppID in steam/app_build.vdf');
  process.exit(1);
}
const appId = m[1].trim();
if (!/^[1-9][0-9]*$/.test(appId)) {
  console.error(`[steam-sync-appid] Invalid AppID in VDF: "${appId}"`);
  process.exit(1);
}

fs.writeFileSync(outPath, `${appId}\n`, 'utf8');
console.log(`[steam-sync-appid] Wrote ${outPath} (${appId})`);
