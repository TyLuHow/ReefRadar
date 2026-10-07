#!/usr/bin/env node
// scripts/check-dev-fixtures-excluded.mjs
//
// CI proof that a production build (built WITHOUT NEXT_PUBLIC_DEV_FIXTURES=1) contains none of
// the dev-only design-system fixtures (DS-08, T-04-06-01).
//
// Two checks, both against the existing dashboard-next/.next output:
//   1. No text file under .next/static or .next/server contains DEV_FIXTURES_MARKER, the unique
//      string that only the fixtures module renders (read from
//      dashboard-next/src/features/fixtures/marker.ts).
//   2. `next start -p 3107` answers HTTP 404 for /dev/fixtures/ and /dev/fixtures/tokens/.
//
// Run it right after the flag-less `npm run build`:
//   cd dashboard-next && npm run build && node ../scripts/check-dev-fixtures-excluded.mjs
//
// Usage:
//   node scripts/check-dev-fixtures-excluded.mjs               both checks
//   node scripts/check-dev-fixtures-excluded.mjs --no-server   marker scan only
//
// Node built-ins only. Exit 0 when clean, 1 on any failure.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DASHBOARD = path.join(REPO_ROOT, 'dashboard-next');
const MARKER_FILE = path.join(DASHBOARD, 'src', 'features', 'fixtures', 'marker.ts');
const NEXT_DIR = path.join(DASHBOARD, '.next');
const SCAN_DIRS = [path.join(NEXT_DIR, 'static'), path.join(NEXT_DIR, 'server')];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.json', '.rsc', '.txt', '.body', '.meta']);
const PORT = 3107;
const ROUTES = ['/dev/fixtures/', '/dev/fixtures/tokens/'];
const STARTUP_TIMEOUT_MS = 60_000;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function readMarker() {
  if (!fs.existsSync(MARKER_FILE)) fail(`${path.relative(REPO_ROOT, MARKER_FILE)} not found`);
  const match = fs
    .readFileSync(MARKER_FILE, 'utf-8')
    .match(/export\s+const\s+DEV_FIXTURES_MARKER\s*=\s*(['"`])([^'"`\n]+)\1/);
  if (!match) fail(`could not read DEV_FIXTURES_MARKER from ${path.relative(REPO_ROOT, MARKER_FILE)}`);
  return match[2];
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

function scanForMarker(marker) {
  const hits = [];
  let scanned = 0;
  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
      scanned += 1;
      if (fs.readFileSync(file, 'utf-8').includes(marker)) hits.push(path.relative(DASHBOARD, file));
    }
  }
  return { hits, scanned };
}

function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

// Throws (never exits) so that checkRoutes can stop the server it started before it fails.
async function waitForServer(child, exited) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited.value) throw new Error(`next start exited early (code ${child.exitCode})`);
    if (exited.error) throw new Error(`next start could not be spawned: ${exited.error.message}`);
    try {
      // Any HTTP answer, whatever the status, means the server is up.
      await fetch(`http://127.0.0.1:${PORT}/`, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`next start did not answer on port ${PORT} within ${STARTUP_TIMEOUT_MS / 1000} s`);
}

// A server already answering on the port (a stale run, another build) would be probed instead of
// the one this script starts, which could give a false pass or a false fail.
async function assertPortFree() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/`, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
  } catch {
    return;
  }
  fail(`something already answers on port ${PORT}: stop it first (a leftover next start from an earlier run?)`);
}

async function checkRoutes() {
  const nextBin = path.join(DASHBOARD, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextBin)) fail('dashboard-next/node_modules/next is missing (run npm ci)');
  await assertPortFree();

  // Run next's own entry point with this node binary: no shell, no .cmd shim, one process to kill.
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: DASHBOARD,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  const exited = { value: false, error: null };
  child.on('exit', () => {
    exited.value = true;
  });
  child.on('error', (error) => {
    exited.error = error;
  });
  let log = '';
  child.stdout?.on('data', (chunk) => (log += chunk));
  child.stderr?.on('data', (chunk) => (log += chunk));

  // The server is stopped on every path: normal end, a thrown error, and Ctrl+C or a termination
  // signal. fail() calls process.exit, which skips `finally`, so nothing inside the try may call it.
  const stop = () => killTree(child);
  const onSignal = (signal) => {
    stop();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  process.once('exit', stop);

  const statuses = [];
  let failure = null;
  try {
    await waitForServer(child, exited);
    for (const route of ROUTES) {
      const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      statuses.push([route, response.status]);
    }
  } catch (error) {
    failure = error;
  } finally {
    stop();
  }
  if (failure) {
    console.error(log);
    fail(`could not check routes: ${failure instanceof Error ? failure.message : String(failure)}`);
  }
  return statuses;
}

const args = process.argv.slice(2);
const noServer = args.includes('--no-server');
for (const arg of args) if (arg !== '--no-server') fail(`unknown argument ${arg}`);

if (!fs.existsSync(NEXT_DIR)) fail('dashboard-next/.next not found: run npm run build (without NEXT_PUBLIC_DEV_FIXTURES) first');

const marker = readMarker();
const { hits, scanned } = scanForMarker(marker);
if (scanned === 0) fail('scanned 0 files under .next/static and .next/server: is this a production build?');
if (hits.length > 0) {
  for (const file of hits) console.error(`  fixture marker found in ${file}`);
  fail(`${hits.length} file(s) in a flag-less build contain the dev fixtures marker. Was NEXT_PUBLIC_DEV_FIXTURES=1 set for this build?`);
}
console.log(`OK: fixtures marker absent from ${scanned} built file(s).`);

if (!noServer) {
  const statuses = await checkRoutes();
  const wrong = statuses.filter(([, status]) => status !== 404);
  for (const [route, status] of statuses) console.log(`  ${route} -> HTTP ${status}`);
  if (wrong.length > 0) {
    fail(`expected HTTP 404 for ${wrong.map(([route, status]) => `${route} (got ${status})`).join(', ')}`);
  }
  console.log(`OK: ${statuses.length} dev fixtures routes answer 404.`);
}
