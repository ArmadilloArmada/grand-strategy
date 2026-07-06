#!/usr/bin/env node
/**
 * Release gate: tests, map validation, production build, checksums.
 * Usage: node scripts/release-preflight.cjs
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npm', ['test', '--', '--run']);
run('npm', ['run', 'validate:maps']);
run('npm', ['run', 'dist']);

const requiredPatterns = [
  /Setup.*\.exe$/i,
  /\.zip$/i,
  /^SHA256SUMS\.txt$/,
  /^VERIFY_DOWNLOAD\.md$/,
];

const artifacts = fs.readdirSync(releaseDir);
const missing = requiredPatterns.filter((pattern) => !artifacts.some((name) => pattern.test(name)));

if (missing.length > 0) {
  console.error('\nRelease preflight failed. Missing artifacts in release/:');
  for (const pattern of missing) {
    console.error(`  - ${pattern}`);
  }
  process.exit(1);
}

console.log('\nRelease preflight passed.');
console.log(`Artifacts ready in ${releaseDir}`);
