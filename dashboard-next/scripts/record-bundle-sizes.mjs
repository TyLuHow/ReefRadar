#!/usr/bin/env node
// Records a pre-truth / post-patch bundle-size baseline (D-20).
//
// Reads .next/app-build-manifest.json (written by `next build`), sums the
// raw and gzip (zlib level 9) byte size of each app route's unique JS files,
// and appends an entry to tests/baseline/bundle-sizes.json. Node built-ins
// only — no new dependency for a one-off measurement script.
//
// Usage: node scripts/record-bundle-sizes.mjs --label "pre-truth (next 14.2.5)"

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function getArg(name) {
  const idx = process.argv.indexOf(name);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const label = getArg('--label');
if (!label) {
  console.error('Usage: node scripts/record-bundle-sizes.mjs --label "<label>"');
  process.exit(1);
}

const manifestPath = path.join(projectRoot, '.next', 'app-build-manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath} — run \`npm run build\` first.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

function fileBytes(relFile) {
  const abs = path.join(projectRoot, '.next', relFile);
  const buf = readFileSync(abs);
  return { raw_bytes: buf.length, gzip_bytes: gzipSync(buf, { level: 9 }).length };
}

// Route entries are the "/.../page" keys (actual renderable routes); "/layout"
// entries describe shared layouts, not routes, so they're excluded from the
// per-route table (their JS is already pulled in via each page's own file list).
const routes = {};
for (const [key, files] of Object.entries(manifest.pages || {})) {
  if (!key.endsWith('/page')) continue;
  const routePath = key === '/page' ? '/' : key.slice(0, -'/page'.length);

  const uniqueJsFiles = Array.from(new Set(files || [])).filter((f) => f.endsWith('.js'));
  let rawTotal = 0;
  let gzipTotal = 0;
  const jsFiles = [];
  for (const f of uniqueJsFiles) {
    try {
      const { raw_bytes, gzip_bytes } = fileBytes(f);
      rawTotal += raw_bytes;
      gzipTotal += gzip_bytes;
      jsFiles.push(f);
    } catch {
      // Referenced in the manifest but not found on disk — skip rather than fail the whole run.
    }
  }
  routes[routePath] = { js_files: jsFiles, raw_bytes: rawTotal, gzip_bytes: gzipTotal };
}

let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse HEAD', { cwd: projectRoot }).toString().trim();
} catch {
  // Not fatal — record "unknown" rather than fail the measurement.
}

const nextPkg = JSON.parse(
  readFileSync(path.join(projectRoot, 'node_modules', 'next', 'package.json'), 'utf-8')
);

const entry = {
  label,
  captured_at: new Date().toISOString(),
  git_sha: gitSha,
  next_version: nextPkg.version,
  node_version: process.version,
  routes,
};

const outPath = path.join(projectRoot, 'tests', 'baseline', 'bundle-sizes.json');
let data = { entries: [] };
if (existsSync(outPath)) {
  try {
    data = JSON.parse(readFileSync(outPath, 'utf-8'));
  } catch {
    data = { entries: [] };
  }
}
if (!Array.isArray(data.entries)) data.entries = [];
data.entries.push(entry);
writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

console.log(
  `Recorded bundle-size entry "${label}" (next ${entry.next_version}, ${Object.keys(routes).length} routes) -> ${outPath}`
);
