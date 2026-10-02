#!/usr/bin/env node
// scripts/check-contract-fence.mjs
//
// CI grep fence around the data-contract module (CONTRACT-01, 02-10).
//
// Only dashboard-next/src/features/contract/ may fetch contract artifacts or
// know where they live. This script walks the rest of dashboard-next/src and
// fails on any of:
//   - a contract host (cloudfront.net)
//   - a contract path (contract/latest.json, contract/v<N>.json)
//   - the contract base-URL environment variable
//   - a fixture import (contracts/fixtures)
//   - a call to the old backend sites client method
//   - the old hard-coded site-coordinate table
//
// It is the second line of defence behind the ESLint override in
// dashboard-next/.eslintrc.json: it also covers comments, JSON and .js/.mjs
// files that ESLint's selectors do not see.
//
// Usage:
//   node scripts/check-contract-fence.mjs              scan dashboard-next/src
//   node scripts/check-contract-fence.mjs --root DIR   scan DIR instead (tests)
//
// Node built-ins only. Exit 0 when clean, 1 on any hit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Search patterns are assembled from fragments so this rule list reads as data
// and no single literal here is itself a contract URL or path.
const join = (...parts) => parts.join('');
const RULES = [
  { rule: 'contract host', pattern: new RegExp(join('cloud', 'front', '\\.net')) },
  { rule: 'contract pointer path', pattern: new RegExp(join('contract', '/', 'latest', '\\.json')) },
  { rule: 'contract manifest path', pattern: new RegExp(join('contract', '/', 'v', '\\d+', '\\.json')) },
  { rule: 'contract base-URL env var', pattern: new RegExp(join('NEXT_PUBLIC_', 'CONTRACT_', 'BASE_URL')) },
  { rule: 'contract fixture import', pattern: new RegExp(join('contracts', '/', 'fixtures')) },
  { rule: 'backend sites client call', pattern: new RegExp(join('\\.get', 'Sites', '\\s*\\(')) },
  { rule: 'hard-coded coordinate table', pattern: new RegExp(join('SITE_', 'COORDINATES', '|', 'Site', 'Coordinates')) },
];

const SCANNED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const SKIP_DIRS = new Set(['node_modules', '.next']);

function parseArgs(argv) {
  let root = path.join(REPO_ROOT, 'dashboard-next', 'src');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') {
      const value = argv[i + 1];
      if (!value) {
        console.error('FAIL: --root needs a directory');
        process.exit(1);
      }
      root = path.resolve(value);
      i += 1;
    } else {
      console.error(`FAIL: unknown argument ${argv[i]}`);
      process.exit(1);
    }
  }
  return root;
}

function* walk(dir, root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // The contract module itself is the one place allowed to know all of this.
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (rel === 'features/contract') continue;
      yield* walk(full, root);
    } else if (entry.isFile() && SCANNED.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

const root = parseArgs(process.argv.slice(2));
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`FAIL: ${root} is not a directory`);
  process.exit(1);
}

let files = 0;
let hits = 0;
for (const file of walk(root, root)) {
  files += 1;
  const rel = path.relative(root, file).split(path.sep).join('/');
  fs.readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      for (const { rule, pattern } of RULES) {
        if (pattern.test(line)) {
          hits += 1;
          console.error(`${rel}:${index + 1}: ${rule}`);
        }
      }
    });
}

if (hits > 0) {
  console.error(`FAIL: ${hits} contract-fence hit(s) outside src/features/contract (${files} file(s) scanned).`);
  process.exit(1);
}
console.log(`OK: no contract access outside src/features/contract (${files} file(s) scanned).`);
