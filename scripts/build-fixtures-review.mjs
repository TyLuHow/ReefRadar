#!/usr/bin/env node
// scripts/build-fixtures-review.mjs
//
// Owner-facing review page for the /dev/fixtures screenshot baselines (04-23, DS-08).
//
// It reads the committed fixtures baselines (the CI update_snapshots dispatch produces them, see
// plan 04-24) and writes one static page, docs/deploy/phase-4-fixtures-review/index.html: inline
// CSS, no script. Images are NOT copied; the page points at the committed baselines with paths
// relative to the HTML file, so the page and the regression suite always show the same pixels.
//
// File names follow tests/e2e/support/fixture-shots.ts:
//   {slug}-atlas-{width}-fixtures-shots-{platform}.png                whole section, default direction
//   {slug}-{direction}-{width}-fixtures-shots-{platform}.png          whole section, alternate direction
//   {slug}-{state}-{direction}-{width}-fixtures-shots-{platform}.png  one state cell, alternate direction
// The section slug is matched against src/features/fixtures/slugs.ts (longest slug wins), so a
// slug that contains hyphens still groups correctly.
//
// Usage:
//   node scripts/build-fixtures-review.mjs [--snapshots DIR] [--out DIR]
//   node scripts/build-fixtures-review.mjs --check [--snapshots DIR] [--out DIR]
//
// Without PNGs it prints "no fixtures baselines yet" and exits 0 (nothing is written).
// --check writes nothing and exits 1 when a PNG is not referenced by the committed page or a
// reference on the page has no file; it exits 0 otherwise.
//
// Node built-ins only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const SNAPSHOT_REL = 'dashboard-next/tests/e2e/fixtures.spec.ts-snapshots';
const SLUGS_REL = 'dashboard-next/src/features/fixtures/slugs.ts';
const PAGE_DIR_NAME = 'phase-4-fixtures-review';
const DIRECTIONS = ['atlas', 'nocturne', 'poster'];
const DIRECTION_BLURB = {
  atlas: 'Atlas: the default direction, every section at four widths.',
  nocturne: 'Nocturne: dark-first, the spectrogram is the page. Representative set at 1440 and 390 px.',
  poster: 'Poster: colour-blocked and loud. Representative set at 1440 and 390 px.',
};
const FILE_RE = /^(.+)-(\d+)-fixtures-shots-(?:linux|win32|darwin)\.png$/;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    snapshots: path.join(REPO_ROOT, SNAPSHOT_REL),
    out: path.join(REPO_ROOT, 'docs', 'deploy'),
    check: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--snapshots' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined) fail(`${arg} needs a value`);
      opts[arg === '--snapshots' ? 'snapshots' : 'out'] = path.resolve(value);
      i += 1;
    } else fail(`unknown argument ${arg}`);
  }
  return opts;
}

/** The registered section slugs, read from the source of truth; empty when unreadable. */
function readSlugs() {
  const file = path.join(REPO_ROOT, SLUGS_REL);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf-8');
  const list = /FIXTURE_SLUGS[^=]*=\s*\[([^\]]*)\]/.exec(text);
  if (list === null) return [];
  return [...list[1].matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
}

/** Split one baseline file name into its parts, or null when it is not a fixtures baseline. */
export function parseShotName(file, slugs) {
  const match = FILE_RE.exec(file);
  if (match === null) return null;
  const rest = match[1];
  const width = Number(match[2]);
  const direction = DIRECTIONS.find((candidate) => rest.endsWith(`-${candidate}`));
  if (direction === undefined) return null;
  const head = rest.slice(0, rest.length - direction.length - 1);
  // Longest registered slug that is the whole head or a prefix followed by the state.
  const slug = [...slugs]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => head === candidate || head.startsWith(`${candidate}-`));
  if (slug === undefined) return { file, slug: head, state: null, direction, width };
  return { file, slug, state: head === slug ? null : head.slice(slug.length + 1), direction, width };
}

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function listPngs(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .sort();
}

/** Posix-style path from the page directory to a baseline file. */
function imageHref(pageDir, snapshots, file) {
  return path.relative(pageDir, path.join(snapshots, file)).split(path.sep).map(encodeURIComponent).join('/');
}

const STYLE = `
body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#1a1a1a;background:#fff}
header,main{max-width:1500px;margin:0 auto;padding:1.5rem}
nav a{display:inline-block;margin-right:1rem;padding:.5rem 0;color:#0b5394}
h1{margin:0 0 .25rem}
h2{margin:2.5rem 0 .25rem;padding-top:1rem;border-top:3px solid #1a1a1a}
h3{margin:2rem 0 .5rem;font-size:1.05rem}
p.note{margin:.25rem 0 1rem;color:#444}
.row{display:flex;gap:1.5rem;align-items:flex-start;overflow-x:auto;padding-bottom:.75rem}
figure{margin:0;flex:0 0 auto}
figcaption{font:13px/1.4 ui-monospace,monospace;color:#444;margin-bottom:.25rem}
img{display:block;max-width:100%;height:auto;border:1px solid #bbb}
`;

function buildPage(shots, pageDir, snapshots, slugs) {
  const byDirection = new Map(DIRECTIONS.map((direction) => [direction, new Map()]));
  for (const shot of shots) {
    const groups = byDirection.get(shot.direction);
    const key = shot.state === null ? shot.slug : `${shot.slug}/${shot.state}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shot);
  }

  const out = [];
  out.push('<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  out.push('<title>Phase 4 fixtures review</title>', `<style>${STYLE}</style>`, '</head>', '<body>', '<header>');
  out.push('<h1 id="top">Phase 4 fixtures review</h1>');
  out.push(
    '<p class="note">Element screenshots of every <code>/dev/fixtures</code> section, as committed from the CI snapshot dispatch. ' +
      'Each image is the committed regression baseline; this page only arranges them. ' +
      'The token probe map is masked in the screenshots because its GPU raster is not reproducible; its swatches and table are captured.</p>',
  );
  out.push('<nav aria-label="Direction">');
  for (const direction of DIRECTIONS) {
    const count = [...byDirection.get(direction).values()].reduce((sum, list) => sum + list.length, 0);
    out.push(`<a href="#${direction}">${escapeHtml(direction)} (${count})</a>`);
  }
  out.push('</nav>', '</header>', '<main>');

  for (const direction of DIRECTIONS) {
    const groups = byDirection.get(direction);
    out.push(`<section id="${direction}">`, `<h2>${escapeHtml(direction)}</h2>`);
    out.push(`<p class="note">${escapeHtml(DIRECTION_BLURB[direction])} <a href="#top">Back to the top</a></p>`);
    if (groups.size === 0) out.push('<p>No baselines for this direction.</p>');
    // Registered section order (the order of the /dev/fixtures list), then state name.
    const order = (key) => {
      const first = groups.get(key)[0];
      const index = slugs.indexOf(first.slug);
      return index === -1 ? slugs.length : index;
    };
    for (const key of [...groups.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b))) {
      const list = groups.get(key).sort((a, b) => b.width - a.width);
      out.push(`<h3 id="${direction}-${escapeHtml(key.replace('/', '-'))}">${escapeHtml(key)}</h3>`, '<div class="row">');
      for (const shot of list) {
        const alt = `${key}, ${direction}, ${shot.width} px`;
        out.push(
          '<figure>',
          `<figcaption>${shot.width} px</figcaption>`,
          `<img src="${imageHref(pageDir, snapshots, shot.file)}" alt="${escapeHtml(alt)}" loading="lazy">`,
          '</figure>',
        );
      }
      out.push('</div>');
    }
    out.push('</section>');
  }
  out.push('</main>', '</body>', '</html>', '');
  return out.join('\n');
}

/** The file names the committed page references through <img src>, URL-decoded. */
function referencedFiles(html) {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => decodeURIComponent(match[1].split('/').pop()));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pageDir = path.join(opts.out, PAGE_DIR_NAME);
  const pagePath = path.join(pageDir, 'index.html');
  const pngs = listPngs(opts.snapshots);

  if (opts.check) {
    const pageExists = fs.existsSync(pagePath);
    if (pngs.length === 0 && !pageExists) {
      console.log('no fixtures baselines yet; nothing to check');
      return;
    }
    if (!pageExists) fail(`${pngs.length} baseline(s) exist but ${path.relative(REPO_ROOT, pagePath)} does not; run without --check`);
    const referenced = new Set(referencedFiles(fs.readFileSync(pagePath, 'utf-8')));
    const present = new Set(pngs);
    const unreferenced = pngs.filter((name) => !referenced.has(name));
    const dangling = [...referenced].filter((name) => !present.has(name));
    for (const name of unreferenced) console.error(`not referenced by the review page: ${name}`);
    for (const name of dangling) console.error(`referenced but missing: ${name}`);
    if (unreferenced.length > 0 || dangling.length > 0) fail('the review page and the committed baselines differ; re-run without --check');
    console.log(`OK: the review page references all ${pngs.length} baseline(s)`);
    return;
  }

  if (pngs.length === 0) {
    console.log('no fixtures baselines yet');
    return;
  }
  const slugs = readSlugs();
  const shots = [];
  const unparsed = [];
  for (const name of pngs) {
    const shot = parseShotName(name, slugs);
    if (shot === null) unparsed.push(name);
    else shots.push(shot);
  }
  if (unparsed.length > 0) fail(`not a fixtures baseline name: ${unparsed.join(', ')}`);
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(pagePath, buildPage(shots, pageDir, opts.snapshots, slugs), 'utf-8');
  console.log(`wrote ${path.relative(REPO_ROOT, pagePath)} (${shots.length} image(s))`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
