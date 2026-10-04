#!/usr/bin/env node
/**
 * Computed-style fingerprint diff (Phase 4, plan 04-01).
 *
 *   node scripts/style-fingerprint-diff.mjs <beforeDir> <afterDir>
 *
 * Compares the dumps written by tests/e2e/style-fingerprint.spec.ts (and the sites-hover probes).
 * Files are paired by name and elements by path. Each differing computed property is put in a
 * named serialisation-only category or in `unexplained`:
 *
 *   serialisation-radius     both values are 9999px or larger (Tailwind 3 emitted 9999px,
 *                            Tailwind 4 emits calc(infinity * 1px), which computes to ~3.35e7px)
 *   space-side               margin moved between opposite sides with equal size (space-x/space-y
 *                            now select :not(:last-child) margin-end instead of the next sibling's
 *                            margin-start); the element's own box must be unchanged
 *   transform-serialisation  matrix() versus the individual rotate/translate/scale properties with
 *                            the same geometry
 *   sr-only-clip             clip versus clip-path inset(50%) (the screen-reader-only utility)
 *   colour-rounding          same value with each rgba channel within 1/255 and alpha within 0.01
 *
 * Exit status is 1 when any unexplained item exists, a file is missing on either side, or an element
 * count differs.
 */
import fs from 'node:fs';
import path from 'node:path';

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.error('usage: node scripts/style-fingerprint-diff.mjs <beforeDir> <afterDir>');
  process.exit(2);
}

const CATEGORIES = [
  'serialisation-radius',
  'space-side',
  'transform-serialisation',
  'sr-only-clip',
  'colour-rounding',
  'unexplained',
];
const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
const unexplained = [];
const structural = [];

const RGBA = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g;
const BOX_TOLERANCE = 0.05;
const MARGIN_SIDES = ['top', 'right', 'bottom', 'left'];
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function listJson(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

function load(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function numbersPx(value) {
  const found = [...value.matchAll(/(-?[\d.]+(?:e[+-]?\d+)?)px/gi)].map((m) => Number(m[1]));
  return found.length > 0 && found.join('') !== '' ? found : null;
}

function isLargeRadius(a, b) {
  const na = numbersPx(a);
  const nb = numbersPx(b);
  if (!na || !nb) return false;
  return na.every((n) => n >= 9999) && nb.every((n) => n >= 9999);
}

function colourRounding(a, b) {
  if (!a.includes('rgba(') || !b.includes('rgba(')) return false;
  const ta = a.replace(RGBA, '#');
  const tb = b.replace(RGBA, '#');
  if (ta !== tb) return false;
  const ca = [...a.matchAll(RGBA)].map((m) => m.slice(1).map(Number));
  const cb = [...b.matchAll(RGBA)].map((m) => m.slice(1).map(Number));
  if (ca.length !== cb.length) return false;
  return ca.every((x, i) => {
    const y = cb[i];
    return (
      Math.abs(x[0] - y[0]) <= 1 &&
      Math.abs(x[1] - y[1]) <= 1 &&
      Math.abs(x[2] - y[2]) <= 1 &&
      Math.abs(x[3] - y[3]) <= 0.01
    );
  });
}

// ---- 2D transform geometry -------------------------------------------------------------------

const IDENTITY = [1, 0, 0, 1, 0, 0];

function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function parseLength(token) {
  const n = parseFloat(token);
  return Number.isFinite(n) ? n : 0;
}

/** Effective 2D matrix of transform + translate + rotate + scale (CSS order: translate, rotate, scale, transform). */
function effectiveMatrix(get) {
  let m = IDENTITY;
  const translate = get('translate');
  if (translate && translate !== 'none') {
    const [x = '0', y = '0'] = translate.split(/\s+/);
    m = mul(m, [1, 0, 0, 1, parseLength(x), parseLength(y)]);
  }
  const rotate = get('rotate');
  if (rotate && rotate !== 'none') {
    const deg = parseFloat(rotate);
    const rad = (deg * Math.PI) / 180;
    m = mul(m, [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]);
  }
  const scale = get('scale');
  if (scale && scale !== 'none') {
    const [sx = '1', sy] = scale.split(/\s+/);
    m = mul(m, [parseFloat(sx), 0, 0, parseFloat(sy ?? sx), 0, 0]);
  }
  const transform = get('transform');
  const hit = transform && /^matrix\(([^)]*)\)$/.exec(transform);
  if (hit) m = mul(m, hit[1].split(',').map(Number));
  else if (transform && transform !== 'none') return null;
  return m;
}

function matrixEqual(a, b) {
  return a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.01);
}

// ---- comparison ------------------------------------------------------------------------------

function record(category, file, elPath, prop, before, after) {
  counts[category] += 1;
  if (category === 'unexplained') unexplained.push({ file, elPath, prop, before, after });
}

function compareElement(file, before, after, beforeNames, afterNames, bs, as) {
  const elPath = before.path;
  const valueOf = (names, strings, el) => {
    const map = new Map();
    names.forEach((n, i) => map.set(n, strings[el.v[i]]));
    return map;
  };
  const bv = valueOf(beforeNames, bs, before);
  const av = valueOf(afterNames, as, after);

  // Bounding box
  for (let i = 0; i < 4; i++) {
    if (Math.abs(before.box[i] - after.box[i]) > BOX_TOLERANCE) {
      record('unexplained', file, elPath, `box[${['x', 'y', 'width', 'height'][i]}]`, before.box[i], after.box[i]);
    }
  }

  const allNames = new Set([...bv.keys(), ...av.keys()]);
  const diffs = new Map();
  for (const name of allNames) {
    const b = bv.get(name);
    const a = av.get(name);
    if (b !== a) diffs.set(name, { b, a });
  }
  if (diffs.size === 0) return;

  const handled = new Set();
  const boxSame = before.box.every((v, i) => Math.abs(v - after.box[i]) <= BOX_TOLERANCE);

  // transform family
  const tProps = ['transform', 'translate', 'rotate', 'scale'];
  if (tProps.some((p) => diffs.has(p))) {
    const mb = effectiveMatrix((p) => bv.get(p));
    const ma = effectiveMatrix((p) => av.get(p));
    if (matrixEqual(mb, ma)) {
      for (const p of tProps) {
        if (diffs.has(p)) {
          record('transform-serialisation', file, elPath, p, diffs.get(p).b, diffs.get(p).a);
          handled.add(p);
        }
      }
    }
  }

  // sr-only clip
  if (diffs.has('clip') || diffs.has('clip-path')) {
    const cb = bv.get('clip');
    const ca = av.get('clip');
    const pb = bv.get('clip-path');
    const pa = av.get('clip-path');
    const beforeClipped = /^rect\(0px,? 0px,? 0px,? 0px\)$/.test(cb ?? '');
    const afterInset = /^inset\(50%\)$/.test(pa ?? '');
    if (beforeClipped && afterInset && (pb === 'none' || pb === undefined) && (ca === 'auto' || ca === undefined)) {
      for (const p of ['clip', 'clip-path']) {
        if (diffs.has(p)) {
          record('sr-only-clip', file, elPath, p, diffs.get(p).b, diffs.get(p).a);
          handled.add(p);
        }
      }
    }
  }

  // margin side swap
  if (boxSame) {
    for (const side of MARGIN_SIDES) {
      const opp = OPPOSITE[side];
      const p = `margin-${side}`;
      const q = `margin-${opp}`;
      if (!diffs.has(p) || !diffs.has(q) || handled.has(p) || handled.has(q)) continue;
      if (diffs.get(p).b === diffs.get(q).a && diffs.get(q).b === diffs.get(p).a) {
        for (const x of [p, q]) {
          record('space-side', file, elPath, x, diffs.get(x).b, diffs.get(x).a);
          handled.add(x);
        }
      }
    }
    // A single margin that moved to the opposite side while the other side stayed equal.
    for (const side of MARGIN_SIDES) {
      const opp = OPPOSITE[side];
      const p = `margin-${side}`;
      const q = `margin-${opp}`;
      if (handled.has(p) || handled.has(q)) continue;
      const dp = diffs.get(p);
      const dq = diffs.get(q);
      if (dp && dq && dp.b !== '0px' && dp.a === '0px' && dq.b === '0px' && dq.a === dp.b) {
        for (const x of [p, q]) {
          record('space-side', file, elPath, x, diffs.get(x).b, diffs.get(x).a);
          handled.add(x);
        }
      }
    }
  }

  for (const [name, { b, a }] of diffs) {
    if (handled.has(name)) continue;
    if (b === undefined || a === undefined) {
      record('unexplained', file, elPath, name, b ?? '(missing)', a ?? '(missing)');
    } else if (isLargeRadius(b, a)) {
      record('serialisation-radius', file, elPath, name, b, a);
    } else if (colourRounding(b, a)) {
      record('colour-rounding', file, elPath, name, b, a);
    } else {
      record('unexplained', file, elPath, name, b, a);
    }
  }
}

function compareState(file) {
  const b = load(beforeDir, file);
  const a = load(afterDir, file);
  if (b.elements.length !== a.elements.length) {
    structural.push(`${file}: element count ${b.elements.length} (before) vs ${a.elements.length} (after)`);
  }
  const afterByPath = new Map(a.elements.map((el) => [el.path, el]));
  let matched = 0;
  for (const be of b.elements) {
    const ae = afterByPath.get(be.path);
    if (!ae) {
      structural.push(`${file}: element ${be.path} missing after`);
      continue;
    }
    matched += 1;
    compareElement(file, be, ae, b.names, a.names, b.strings, a.strings);
  }
  return { elements: b.elements.length, matched };
}

function compareHover(file) {
  const b = load(beforeDir, file);
  const a = load(afterDir, file);
  if (b.borderTopColor === a.borderTopColor) return;
  if (colourRounding(b.borderTopColor, a.borderTopColor)) {
    record('colour-rounding', file, '(hover)', 'border-top-color', b.borderTopColor, a.borderTopColor);
  } else {
    record('unexplained', file, '(hover)', 'border-top-color', b.borderTopColor, a.borderTopColor);
  }
}

const beforeFiles = listJson(beforeDir);
const afterFiles = listJson(afterDir);
for (const f of beforeFiles) if (!afterFiles.includes(f)) structural.push(`${f}: missing in ${afterDir}`);
for (const f of afterFiles) if (!beforeFiles.includes(f)) structural.push(`${f}: missing in ${beforeDir}`);

let totalElements = 0;
for (const f of beforeFiles) {
  if (!afterFiles.includes(f)) continue;
  if (f.startsWith('sites-hover-')) compareHover(f);
  else totalElements += compareState(f).elements;
}

console.log(`files compared: ${beforeFiles.filter((f) => afterFiles.includes(f)).length}, elements: ${totalElements}`);
for (const c of CATEGORIES) console.log(`  ${c.padEnd(24)} ${counts[c]}`);

for (const s of structural) console.log(`STRUCTURAL: ${s}`);

const shown = unexplained.slice(0, 400);
for (const u of shown) {
  console.log(`UNEXPLAINED ${u.file} ${u.elPath} ${u.prop}\n    before: ${u.before}\n    after:  ${u.after}`);
}
if (unexplained.length > shown.length) console.log(`... and ${unexplained.length - shown.length} more unexplained items`);

process.exit(unexplained.length > 0 || structural.length > 0 ? 1 : 0);
