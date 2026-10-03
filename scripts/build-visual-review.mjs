#!/usr/bin/env node
// scripts/build-visual-review.mjs
//
// Owner-facing before/after review page for the Phase 3 visual baseline change
// (03-14, PLAT-01 criterion 1, DS-07 criterion 3, UI-SPEC "Visual Baseline Review
// and Acceptance Protocol").
//
// It compares the committed Linux visual baselines at a "before" ref with the
// current baseline directory by sha256 and writes:
//
//   <out>/PHASE-3-VISUAL-REVIEW.md           one row per state and width:
//                                            status, cause, owner decision
//   <out>/phase-3-visual-review/index.html   static page (inline CSS, no script):
//                                            before and after side by side, plus a
//                                            difference view (CSS mix-blend-mode)
//   <out>/phase-3-visual-review/{before,after}/  copies of changed images only
//
// Optional unhidden review captures (tests/e2e/review.spec.ts output, one directory
// per tree, each with PNGs and meta.json) add a "Map and canvas changes" section.
//
// Usage:
//   node scripts/build-visual-review.mjs [options]
//     --before-ref SHA      read the before baselines with git show at SHA
//                           (default b780b15c8d32da2f9e2d2a0047ebdd04904b5e61)
//     --before-dir DIR      read the before baselines from DIR instead of git
//     --after-dir DIR       after baselines (default the committed snapshot directory)
//     --causes FILE         JSON object: state name (or "state-width") -> one-line cause
//     --review-before DIR   unhidden captures of the before tree
//     --review-after DIR    unhidden captures of the head tree
//     --out DIR             output directory (default docs/deploy)
//     --run-url URL         the dispatch run that produced the new baselines
//     --repo DIR            repository to read --before-ref from (default this repo)
//     --check               write nothing; exit 0 only when the committed markdown
//                           lists the same rows and statuses and every row that is
//                           not identical has a cause
//
// Exit 1 when a row that is not identical has no cause (nothing is written), when
// --check finds a mismatch, or on any bad argument. Owner decisions and the
// "Owner sign-off" section of an existing markdown are preserved on re-run.
//
// Node built-ins only.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_BEFORE_REF = 'b780b15c8d32da2f9e2d2a0047ebdd04904b5e61';
const SNAPSHOT_REL = 'dashboard-next/tests/e2e/visual.spec.ts-snapshots';
const MD_NAME = 'PHASE-3-VISUAL-REVIEW.md';
const PAGE_DIR_NAME = 'phase-3-visual-review';
const SNAP_RE = /^(.+)-(\d+)-visual-linux\.png$/;
const DECISIONS = new Set(['pending', 'accepted', 'rejected']);
const NO_RUN_URL = '(not recorded: re-run with --run-url)';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = {
    beforeRef: DEFAULT_BEFORE_REF,
    beforeDir: null,
    afterDir: path.join(REPO_ROOT, SNAPSHOT_REL),
    causes: null,
    reviewBefore: null,
    reviewAfter: null,
    out: path.join(REPO_ROOT, 'docs', 'deploy'),
    runUrl: null,
    repo: REPO_ROOT,
    check: false,
  };
  const valued = {
    '--before-ref': 'beforeRef',
    '--before-dir': 'beforeDir',
    '--after-dir': 'afterDir',
    '--causes': 'causes',
    '--review-before': 'reviewBefore',
    '--review-after': 'reviewAfter',
    '--out': 'out',
    '--run-url': 'runUrl',
    '--repo': 'repo',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      opts.check = true;
    } else if (Object.hasOwn(valued, arg)) {
      const value = argv[i + 1];
      if (value === undefined) fail(`${arg} needs a value`);
      opts[valued[arg]] = value;
      i += 1;
    } else {
      fail(`unknown argument ${arg}`);
    }
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z._/-]*$/.test(opts.beforeRef)) {
    fail(`--before-ref ${JSON.stringify(opts.beforeRef)} is not a plain ref name or SHA`);
  }
  for (const key of ['beforeDir', 'afterDir', 'reviewBefore', 'reviewAfter', 'out', 'repo']) {
    if (opts[key] !== null) opts[key] = path.resolve(opts[key]);
  }
  if ((opts.reviewBefore === null) !== (opts.reviewAfter === null)) {
    // One side alone is allowed (the other tree simply has no capture), but say so.
    console.error('NOTE: only one of --review-before / --review-after given; the other side lists as missing.');
  }
  return opts;
}

// ------------------------------------------------------------- image sources

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function readDirPngs(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`${dir} is not a directory`);
  const files = new Map();
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.toLowerCase().endsWith('.png')) files.set(name, fs.readFileSync(path.join(dir, name)));
  }
  return files;
}

function git(repo, args) {
  try {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'buffer',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString().trim() : String(error.message);
    return fail(`git ${args.join(' ')} failed: ${stderr}`);
  }
}

function readGitPngs(repo, ref) {
  const listing = git(repo, ['ls-tree', '--name-only', `${ref}:${SNAPSHOT_REL}`]).toString('utf-8');
  const files = new Map();
  for (const name of listing.split(/\r?\n/).filter(Boolean).sort()) {
    if (name.toLowerCase().endsWith('.png')) {
      files.set(name, git(repo, ['show', `${ref}:${SNAPSHOT_REL}/${name}`]));
    }
  }
  if (files.size === 0) fail(`no PNG baselines found at ${ref}:${SNAPSHOT_REL}`);
  return files;
}

// ------------------------------------------------------------------- compare

function buildRows(beforeFiles, afterFiles) {
  const keys = new Map(); // "state|width" -> { state, width, beforeName, afterName }
  const note = (files, side) => {
    for (const name of files.keys()) {
      const m = SNAP_RE.exec(name);
      if (!m) continue;
      const key = `${m[1]}|${m[2]}`;
      const entry = keys.get(key) ?? { state: m[1], width: Number(m[2]) };
      entry[side] = name;
      keys.set(key, entry);
    }
  };
  note(beforeFiles, 'beforeName');
  note(afterFiles, 'afterName');

  const rows = [...keys.values()].map((entry) => {
    let status;
    if (entry.beforeName && entry.afterName) {
      status =
        sha256(beforeFiles.get(entry.beforeName)) === sha256(afterFiles.get(entry.afterName))
          ? 'identical'
          : 'changed';
    } else {
      status = entry.afterName ? 'added' : 'missing';
    }
    return { ...entry, status };
  });
  rows.sort((a, b) => (a.state < b.state ? -1 : a.state > b.state ? 1 : b.width - a.width));
  return rows;
}

function loadCauses(file) {
  if (!file) return {};
  if (!fs.existsSync(file)) fail(`causes file ${file} does not exist`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    return fail(`causes file ${file} is not valid JSON: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('causes file must be a JSON object keyed by state name');
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.trim() === '') fail(`cause for ${key} must be a non-empty string`);
  }
  return parsed;
}

function causeFor(causes, row) {
  const specific = causes[`${row.state}-${row.width}`];
  const general = causes[row.state];
  const value = typeof specific === 'string' ? specific : general;
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : null;
}

function unexplained(rows, causes) {
  return rows.filter((row) => row.status !== 'identical' && causeFor(causes, row) === null);
}

// ---------------------------------------------------------- review captures

function readCaptureDir(dir) {
  const result = { files: new Map(), meta: new Map() };
  if (dir === null) return result;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail(`${dir} is not a directory`);
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.toLowerCase().endsWith('.png')) {
      result.files.set(name.slice(0, -4), fs.readFileSync(path.join(dir, name)));
    }
  }
  const metaFile = path.join(dir, 'meta.json');
  if (fs.existsSync(metaFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.pages) ? parsed.pages : [];
      for (const item of list) {
        if (item && typeof item.state === 'string') result.meta.set(item.state, item);
      }
    } catch {
      // A malformed meta.json only loses the annotations; the images still list.
    }
  }
  return result;
}

function describeMeta(meta, hasImage) {
  if (!hasImage) return 'no capture';
  if (!meta) return 'captured (no meta)';
  const engines = Array.isArray(meta.engines) && meta.engines.length > 0 ? meta.engines.join('+') : 'no map';
  const webgl = meta.webgl2 === true ? 'WebGL2' : meta.webgl2 === false ? 'no WebGL2' : 'WebGL2 unknown';
  return `${engines}, ${webgl}`;
}

function buildCaptures(reviewBefore, reviewAfter) {
  const names = [...new Set([...reviewBefore.files.keys(), ...reviewAfter.files.keys()])].sort();
  return names.map((name) => {
    const hasBefore = reviewBefore.files.has(name);
    const hasAfter = reviewAfter.files.has(name);
    return {
      name,
      hasBefore,
      hasAfter,
      beforeNote: describeMeta(reviewBefore.meta.get(name), hasBefore),
      afterNote: describeMeta(reviewAfter.meta.get(name), hasAfter),
    };
  });
}

// ------------------------------------------------------- existing markdown

const mdEscape = (text) => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function parseExisting(mdPath) {
  const parsed = {
    exists: false,
    rows: new Map(), // "state|width" -> { status, decision }
    captureDecisions: new Map(), // name -> decision
    signoff: null,
    runUrl: null,
  };
  if (!fs.existsSync(mdPath)) return parsed;
  parsed.exists = true;
  const text = fs.readFileSync(mdPath, 'utf-8');

  const runUrl = /^- CI run: (.+)$/m.exec(text);
  if (runUrl && runUrl[1] !== NO_RUN_URL) parsed.runUrl = runUrl[1].trim();

  const signoff = /^## Owner sign-off\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (signoff) parsed.signoff = signoff[1].trim();

  const captureStart = text.indexOf('## Map and canvas changes');
  const tableText = captureStart === -1 ? text : text.slice(0, captureStart);
  for (const line of tableText.split(/\r?\n/)) {
    const m = /^\| (\S+) \| (\d+) \| (identical|changed|added|missing) \| .* \| (pending|accepted|rejected|n\/a) \|$/.exec(line);
    if (m) parsed.rows.set(`${m[1]}|${m[2]}`, { status: m[3], decision: m[4] });
  }
  if (captureStart !== -1) {
    const captureText = text.slice(captureStart).split(/^## Owner sign-off/m)[0];
    for (const line of captureText.split(/\r?\n/)) {
      const m = /^\| (\S+) \| .* \| (pending|accepted|rejected) \|$/.exec(line);
      if (m && m[1] !== 'Capture') parsed.captureDecisions.set(m[1], m[2]);
    }
  }
  return parsed;
}

// ------------------------------------------------------------------ markdown

function renderMarkdown({ opts, beforeLabel, afterLabel, rows, causes, captures, existing, date }) {
  const lines = [];
  lines.push('# Phase 3 visual baseline review');
  lines.push('');
  lines.push(`- Before: ${beforeLabel}`);
  lines.push(`- After: ${afterLabel}`);
  lines.push(`- Generated: ${date}`);
  lines.push(`- CI run: ${opts.runUrl ?? existing.runUrl ?? NO_RUN_URL}`);
  lines.push('');
  const changed = rows.filter((r) => r.status !== 'identical').length;
  lines.push(`${rows.length} states and widths compared by sha256; ${changed} not identical.`);
  lines.push('Decision values: pending, accepted, rejected (identical rows need none).');
  lines.push('');
  lines.push('| State | Width | Status | Cause | Owner decision |');
  lines.push('|---|---|---|---|---|');
  for (const row of rows) {
    const cause = row.status === 'identical' ? '-' : mdEscape(causeFor(causes, row));
    lines.push(`| ${row.state} | ${row.width} | ${row.status} | ${cause} | ${decisionFor(row, existing)} |`);
  }
  lines.push('');

  if (captures.length > 0) {
    lines.push('## Map and canvas changes');
    lines.push('');
    lines.push(
      'Review-only captures at 1440 px with canvases and maps visible (tiles mocked with a transparent PNG). ' +
        'The gating baselines hide canvases and maps, so these are what show the map port and the vitality removal.'
    );
    lines.push('');
    lines.push('| Capture | Before | After | Owner decision |');
    lines.push('|---|---|---|---|');
    for (const c of captures) {
      const prior = existing.captureDecisions.get(c.name);
      const decision = prior && DECISIONS.has(prior) ? prior : 'pending';
      lines.push(`| ${c.name} | ${mdEscape(c.beforeNote)} | ${mdEscape(c.afterNote)} | ${decision} |`);
    }
    lines.push('');
  }

  lines.push('## Owner sign-off');
  lines.push('');
  lines.push(existing.signoff && existing.signoff.length > 0 ? existing.signoff : 'Pending: no owner decision recorded yet.');
  lines.push('');
  return lines.join('\n');
}

function decisionFor(row, existing) {
  if (row.status === 'identical') return 'n/a';
  const prior = existing.rows.get(`${row.state}|${row.width}`);
  // A decision only carries over while the row is still the same kind of change.
  if (prior && prior.status === row.status && DECISIONS.has(prior.decision)) return prior.decision;
  return 'pending';
}

// ---------------------------------------------------------------------- html

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const CSS = `
:root { color-scheme: dark; }
body { margin: 0; padding: 24px; background: #0a1020; color: #e8e2d4; font: 15px/1.5 system-ui, sans-serif; }
h1, h2, h3 { font-weight: 400; }
a { color: #d9a066; }
table { border-collapse: collapse; width: 100%; margin: 16px 0 32px; }
th, td { border: 1px solid #2b3550; padding: 6px 10px; text-align: left; vertical-align: top; }
.item { border: 1px solid #2b3550; border-radius: 8px; padding: 12px 16px; margin: 0 0 24px; }
.meta { color: #a8a090; margin: 0 0 8px; }
.pair { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.pair figure { flex: 1 1 320px; margin: 0; min-width: 0; }
.pair figcaption, .diff figcaption { color: #a8a090; margin: 4px 0; }
img { display: block; max-width: 100%; height: auto; }
.none { padding: 24px; border: 1px dashed #2b3550; color: #a8a090; }
.toggle { margin: 8px 0; }
.diff { display: none; margin-top: 8px; }
input.show-diff:checked ~ .diff { display: block; }
.stack { position: relative; isolation: isolate; background: #000; }
.stack img.top { position: absolute; top: 0; left: 0; width: 100%; height: 100%; mix-blend-mode: difference; }
.empty { color: #a8a090; }
`.trim();

function figure(caption, src) {
  if (!src) return `<figure><figcaption>${escapeHtml(caption)}</figcaption><div class="none">no image</div></figure>`;
  return `<figure><figcaption>${escapeHtml(caption)}</figcaption><img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" loading="lazy"></figure>`;
}

function renderItem(index, title, metaLines, beforeSrc, afterSrc) {
  const id = `diff-${index}`;
  const stack =
    beforeSrc && afterSrc
      ? `<div class="diff"><figcaption>Difference: after drawn over before with mix-blend-mode: difference; black means no change.</figcaption>` +
        `<div class="stack"><img src="${escapeHtml(beforeSrc)}" alt="before"><img class="top" src="${escapeHtml(afterSrc)}" alt="after"></div></div>`
      : '';
  const toggle = stack
    ? `<div class="toggle"><input class="show-diff" type="checkbox" id="${id}"><label for="${id}"> Show difference</label>`
    : '<div class="toggle">';
  return (
    `<section class="item"><h3>${escapeHtml(title)}</h3>` +
    metaLines.map((m) => `<p class="meta">${escapeHtml(m)}</p>`).join('') +
    `${toggle}` +
    `<div class="pair">${figure('Before', beforeSrc)}${figure('After', afterSrc)}</div>` +
    `${stack}</div></section>`
  );
}

function renderHtml({ beforeLabel, afterLabel, runUrl, rows, causes, existing, captures, date }) {
  const body = [];
  body.push('<h1>Phase 3 visual baseline review</h1>');
  body.push(
    `<p class="meta">Before: ${escapeHtml(beforeLabel)}<br>After: ${escapeHtml(afterLabel)}<br>` +
      `Generated: ${escapeHtml(date)}<br>CI run: ${escapeHtml(runUrl)}</p>`
  );

  body.push('<h2>States and widths</h2>');
  body.push('<table><thead><tr><th>State</th><th>Width</th><th>Status</th><th>Cause</th><th>Owner decision</th></tr></thead><tbody>');
  for (const row of rows) {
    const cause = row.status === 'identical' ? '-' : causeFor(causes, row);
    body.push(
      `<tr><td>${escapeHtml(row.state)}</td><td>${row.width}</td><td>${escapeHtml(row.status)}</td>` +
        `<td>${escapeHtml(cause)}</td><td>${escapeHtml(decisionFor(row, existing))}</td></tr>`
    );
  }
  body.push('</tbody></table>');

  let index = 0;
  const changedRows = rows.filter((r) => r.status !== 'identical');
  body.push('<h2>Changed states</h2>');
  if (changedRows.length === 0) body.push('<p class="empty">No state changed.</p>');
  for (const row of changedRows) {
    body.push(
      renderItem(
        (index += 1),
        `${row.state} at ${row.width}px (${row.status})`,
        [`Cause: ${causeFor(causes, row)}`, `Owner decision: ${decisionFor(row, existing)}`],
        row.beforeName ? `before/${row.beforeName}` : null,
        row.afterName ? `after/${row.afterName}` : null
      )
    );
  }

  if (captures.length > 0) {
    body.push('<h2>Map and canvas changes</h2>');
    body.push('<p class="meta">Unhidden 1440 px captures, tiles mocked. Not gating and not committed as baselines.</p>');
    for (const c of captures) {
      const prior = existing.captureDecisions.get(c.name);
      const decision = prior && DECISIONS.has(prior) ? prior : 'pending';
      body.push(
        renderItem(
          (index += 1),
          c.name,
          [`Before: ${c.beforeNote}`, `After: ${c.afterNote}`, `Owner decision: ${decision}`],
          c.hasBefore ? `before/review-${c.name}.png` : null,
          c.hasAfter ? `after/review-${c.name}.png` : null
        )
      );
    }
  }

  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Phase 3 visual baseline review</title>' +
    `<style>${CSS}</style></head><body>\n${body.join('\n')}\n</body></html>\n`
  );
}

// ---------------------------------------------------------------------- main

function relForLabel(p) {
  const rel = path.relative(REPO_ROOT, p).split(path.sep).join('/');
  return rel.startsWith('..') ? '(a directory outside the repository)' : rel;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const causes = loadCauses(opts.causes);

  const beforeFiles = opts.beforeDir ? readDirPngs(opts.beforeDir) : readGitPngs(opts.repo, opts.beforeRef);
  const afterFiles = readDirPngs(opts.afterDir);
  const rows = buildRows(beforeFiles, afterFiles);
  if (rows.length === 0) fail('no baseline images matched <state>-<width>-visual-linux.png');

  const mdPath = path.join(opts.out, MD_NAME);
  const existing = parseExisting(mdPath);

  const missing = unexplained(rows, causes);
  if (opts.check) {
    const problems = [];
    if (!existing.exists) problems.push(`${mdPath} does not exist`);
    const computed = new Map(rows.map((r) => [`${r.state}|${r.width}`, r.status]));
    for (const [key, status] of computed) {
      const prior = existing.rows.get(key);
      const [state, width] = key.split('|');
      if (!prior) problems.push(`${state} @ ${width}: computed ${status}, not listed in the review`);
      else if (prior.status !== status) problems.push(`${state} @ ${width}: review says ${prior.status}, computed ${status}`);
    }
    for (const key of existing.rows.keys()) {
      if (!computed.has(key)) {
        const [state, width] = key.split('|');
        problems.push(`${state} @ ${width}: listed in the review but no longer compared`);
      }
    }
    for (const row of missing) problems.push(`${row.state} @ ${row.width}: ${row.status} with no cause in the causes file`);
    if (problems.length > 0) {
      for (const p of problems) console.error(p);
      fail(`review check found ${problems.length} problem(s)`);
    }
    console.log(`OK: ${rows.length} rows match the committed review; every non-identical row has a cause.`);
    return;
  }

  if (missing.length > 0) {
    for (const row of missing) console.error(`${row.state} @ ${row.width}: ${row.status} with no cause in the causes file`);
    fail(`${missing.length} row(s) not identical and unexplained; add a one-line cause per state to the causes file`);
  }

  const reviewBefore = readCaptureDir(opts.reviewBefore);
  const reviewAfter = readCaptureDir(opts.reviewAfter);
  const captures = buildCaptures(reviewBefore, reviewAfter);

  const beforeLabel = opts.beforeDir
    ? `${relForLabel(opts.beforeDir)} (directory)`
    : `${opts.beforeRef} (committed Linux baselines read with git show)`;
  const afterLabel = `${relForLabel(opts.afterDir)} (current)`;
  const date = new Date().toISOString().slice(0, 10);
  const runUrl = opts.runUrl ?? existing.runUrl ?? NO_RUN_URL;

  // Images: only for rows that are not identical, and for every capture.
  const pageDir = path.join(opts.out, PAGE_DIR_NAME);
  fs.mkdirSync(opts.out, { recursive: true });
  for (const side of ['before', 'after']) {
    fs.rmSync(path.join(pageDir, side), { recursive: true, force: true });
    fs.mkdirSync(path.join(pageDir, side), { recursive: true });
  }
  for (const row of rows.filter((r) => r.status !== 'identical')) {
    if (row.beforeName) fs.writeFileSync(path.join(pageDir, 'before', row.beforeName), beforeFiles.get(row.beforeName));
    if (row.afterName) fs.writeFileSync(path.join(pageDir, 'after', row.afterName), afterFiles.get(row.afterName));
  }
  for (const c of captures) {
    if (c.hasBefore) fs.writeFileSync(path.join(pageDir, 'before', `review-${c.name}.png`), reviewBefore.files.get(c.name));
    if (c.hasAfter) fs.writeFileSync(path.join(pageDir, 'after', `review-${c.name}.png`), reviewAfter.files.get(c.name));
  }

  const ctx = { opts, beforeLabel, afterLabel, runUrl, rows, causes, captures, existing, date };
  fs.writeFileSync(mdPath, renderMarkdown(ctx));
  fs.writeFileSync(path.join(pageDir, 'index.html'), renderHtml(ctx));

  const notIdentical = rows.filter((r) => r.status !== 'identical').length;
  console.log(
    `OK: wrote ${path.relative(REPO_ROOT, mdPath) || mdPath} and ${PAGE_DIR_NAME}/index.html ` +
      `(${rows.length} rows, ${notIdentical} not identical, ${captures.length} capture(s)).`
  );
}

main();
