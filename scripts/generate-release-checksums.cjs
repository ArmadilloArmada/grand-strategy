#!/usr/bin/env node
/**
 * Write SHA-256 checksums and a download verification guide for release artifacts.
 * Usage: node scripts/generate-release-checksums.cjs
 * Env:   RELEASE_DIR (default: release)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const pkg = require('../package.json');
const releaseDir = path.resolve(process.env.RELEASE_DIR || path.join(__dirname, '..', 'release'));
const artifactPattern = /\.(exe|zip|dmg|AppImage|deb|blockmap|yml)$/i;
const checksumExclude = new Set(['builder-debug.yml', 'SHA256SUMS.txt', 'VERIFY_DOWNLOAD.md']);

if (!fs.existsSync(releaseDir)) {
  console.error(`No release directory found: ${releaseDir}`);
  console.error('Run npm run dist first.');
  process.exit(1);
}

const files = fs.readdirSync(releaseDir)
  .filter((name) => artifactPattern.test(name) && !checksumExclude.has(name))
  .sort();

if (files.length === 0) {
  console.error(`No release artifacts found in ${releaseDir}.`);
  process.exit(1);
}

const lines = files.map((name) => {
  const filePath = path.join(releaseDir, name);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  return `${hash}  ${name}`;
});

const checksumsPath = path.join(releaseDir, 'SHA256SUMS.txt');
fs.writeFileSync(checksumsPath, `${lines.join('\n')}\n`, 'utf8');

const installer = files.find((name) => /Setup.*\.exe$/i.test(name));
const zip = files.find((name) => /\.zip$/i.test(name));
const signed = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK || process.env.CSC_LINK_SHA1);

const verifyLines = [
  '# Grand Strategy — Download Verification',
  '',
  `Version: ${pkg.version}`,
  `Publisher: ArmadilloArmada`,
  `Signed: ${signed ? 'yes (Authenticode)' : 'no — Windows SmartScreen may warn until a code-signing certificate is added'}`,
  '',
  '## Recommended download',
  '',
  installer
    ? `1. **Installer (recommended):** \`${installer}\``
    : '1. Installer not found in this build.',
  zip
    ? `2. **ZIP (no installer):** \`${zip}\` — extract and run \`Grand Strategy.exe\``
    : '',
  '## Verify SHA-256 (Windows PowerShell)',
  '',
  '```powershell',
  'cd <folder containing the download>',
  ...files.map((name) => `certutil -hashfile "${name}" SHA256`),
  '```',
  '',
  'Compare the output to:',
  '',
  '```',
  ...lines,
  '```',
  '',
  '## Why browsers may warn',
  '',
  '- Unsigned Windows executables are often flagged by Chrome Safe Browsing and SmartScreen.',
  '- Download from **GitHub Releases** on this repository when possible (trusted host).',
  '- Prefer the **installer** or **ZIP** over legacy portable `.exe` builds.',
  '- A purchased code-signing certificate removes most warnings after reputation builds.',
  '',
  '## Report a false positive',
  '',
  '- Google Safe Browsing: https://safebrowsing.google.com/safebrowsing/report_general/',
  '- VirusTotal (for vendor review): https://www.virustotal.com/',
  '',
].filter(Boolean);

const verifyPath = path.join(releaseDir, 'VERIFY_DOWNLOAD.md');
fs.writeFileSync(verifyPath, `${verifyLines.join('\n')}\n`, 'utf8');

console.log(`Wrote ${checksumsPath}`);
console.log(`Wrote ${verifyPath}`);
for (const line of lines) {
  console.log(line);
}
