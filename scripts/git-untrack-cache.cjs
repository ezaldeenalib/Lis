#!/usr/bin/env node
/**
 * Untrack WhatsApp / tooling cache paths from the Git index (paths stay local).
 * Run once after tightening .gitignore then commit.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const REMOVE_FROM_INDEX = [
  '.wwebjs_auth',
  '.wwebjs_cache',
];

console.log('Repository root:', ROOT);

for (const entry of REMOVE_FROM_INDEX) {
  const abs = path.join(ROOT, entry);
  const existsLocally = fs.existsSync(abs);

  const rm = spawnSync('git', ['rm', '-rf', '--cached', entry], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (rm.status === 0) {
    console.log(`Removed from index: ${entry}`);
  } else {
    console.log(`Not tracked (skipped): ${entry}`);
  }
  if (existsLocally) console.log(`  → files still exist on disk`);
}

console.log(`
Next steps:
  git status
  git commit -m "chore(git): stop tracking WhatsApp session/cache dirs"
`);
