#!/usr/bin/env node
// scripts/check-feature-fence.mjs
//
// CI grep fence between feature modules and the legacy component tree (PLAT-03, 03-05).
//
// New code lives in dashboard-next/src/features/**. Nothing under src/features may
// import the legacy component tree. This script walks <root>/features and fails on
// any import, export-from, dynamic import() or require() whose specifier is
//   - the alias  @/components  or  @/components/...
//   - a relative path that resolves into <root>/components/
//
// A feature's own ./components/X (resolves inside src/features/...), @/lib/*,
// @/types and the contract barrel stay allowed. app/ and the legacy components
// themselves may still import @/components: only <root>/features is scanned.
//
// It is the second line of defence behind the ESLint blocks in
// dashboard-next/eslint.config.mjs: ESLint's no-restricted-imports only sees the
// alias in static imports, so relative paths and require() are covered here.
//
// Usage:
//   node scripts/check-feature-fence.mjs              scan dashboard-next/src
//   node scripts/check-feature-fence.mjs --root DIR   scan DIR instead (tests)
//
// Node built-ins only. Exit 0 when clean, 1 on any hit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SCANNED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);
const SKIP_DIRS = new Set(['node_modules', '.next']);

// Each pattern captures the module specifier in group 2 (group 1 is the opening quote).
const SPECIFIER_PATTERNS = [
  // import x from '...', import type { x } from '...', export * from '...', export { x } from '...'
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"`])([^'"`\n]+)\1/g,
  // import '...'  (side-effect import)
  /\bimport\s*(['"])([^'"\n]+)\1/g,
  // import('...')
  /\bimport\s*\(\s*(['"`])([^'"`\n]+)\1/g,
  // require('...')
  /\brequire\s*\(\s*(['"`])([^'"`\n]+)\1/g,
];

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

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile() && SCANNED.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

// Blank comments (keeping newlines so line numbers survive) so a commented-out
// import or a doc comment that quotes one is not a hit.
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (_m, indent) => indent);
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isLegacySpecifier(specifier, file, componentsDir) {
  if (/^@\/components(\/|$)/.test(specifier)) return true;
  if (specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')) {
    return isInside(path.resolve(path.dirname(file), specifier), componentsDir);
  }
  return false;
}

const root = parseArgs(process.argv.slice(2));
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`FAIL: ${root} is not a directory`);
  process.exit(1);
}

const featuresDir = path.join(root, 'features');
const componentsDir = path.join(root, 'components');

let files = 0;
let hits = 0;
if (fs.existsSync(featuresDir) && fs.statSync(featuresDir).isDirectory()) {
  for (const file of walk(featuresDir)) {
    files += 1;
    const rel = path.relative(root, file).split(path.sep).join('/');
    const source = blankComments(fs.readFileSync(file, 'utf-8'));
    const seen = new Set();
    for (const base of SPECIFIER_PATTERNS) {
      const pattern = new RegExp(base.source, base.flags);
      for (const match of source.matchAll(pattern)) {
        if (!isLegacySpecifier(match[2], file, componentsDir)) continue;
        // Position of the specifier itself, so multi-line imports report the `from` line.
        const offset = match.index + match[0].lastIndexOf(match[2]);
        const line = source.slice(0, offset).split('\n').length;
        const key = `${line}:${match[2]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits += 1;
        console.error(`${rel}:${line}: legacy component import`);
      }
    }
  }
}

if (hits > 0) {
  console.error(`FAIL: ${hits} hit(s) importing the legacy component tree from src/features (${files} file(s) scanned).`);
  process.exit(1);
}
console.log(`OK: no legacy component imports in src/features (${files} file(s) scanned).`);
