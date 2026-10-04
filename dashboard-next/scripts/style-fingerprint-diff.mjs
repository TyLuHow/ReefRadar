#!/usr/bin/env node
/**
 * Computed-style fingerprint diff (Phase 4, plan 04-01).
 *
 *   node scripts/style-fingerprint-diff.mjs <beforeDir> <afterDir> [--limit N]
 *
 * Compares the dumps written by tests/e2e/style-fingerprint.spec.ts (and the sites-hover probes).
 * Files are paired by name and elements by path. Every element's bounding box must match to 0.05 px.
 * Each differing computed property is put in a named, explained category or in `unexplained`:
 *
 *   serialisation-radius     both values are 9999px or larger (Tailwind 3 emitted 9999px,
 *                            Tailwind 4 emits calc(infinity * 1px), which computes to ~3.35e7px)
 *   space-side               margin moved between sides by space-x/space-y (v3 put margin-start on every
 *                            later sibling, v4 puts margin-end on every non-last sibling). Accepted only
 *                            when, over the parent's children, the sum of left+right (and of top+bottom)
 *                            margins is unchanged; element boxes are checked separately
 *   transform-serialisation  matrix() versus the individual rotate/translate/scale properties with
 *                            the same geometry (percentages resolved against the element's own box)
 *   sr-only-clip             clip versus clip-path inset(50%) (the screen-reader-only utility)
 *   colour-rounding          same value with each rgba channel within 1/255 and alpha within 0.01
 *   gradient-serialisation   same gradient once the explicit 0% and 100% stop positions are dropped
 *   shadow-serialisation     same box-shadow once zero-size and fully transparent layers are dropped
 *                            (v4 rings add empty offset and inset layers)
 *   transition-list          transition-property of the transition-colors / transition-transform utilities
 *                            gained only outline-color, --tw-gradient-* and the individual translate, scale
 *                            and rotate properties (the v4 utility definitions)
 *   tw-internal-variable     a --tw-* custom property, or a Tailwind 4 theme token that only exists after
 *                            the upgrade (--color-*, --text-*, --font-*, ...). Tailwind's own plumbing;
 *                            what it feeds is compared through the real properties, all still checked.
 *
 * Exit status is 1 when any unexplained item exists, a file is missing on either side, or an element
 * count differs.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const limitFlag = args.indexOf('--limit');
const LIMIT = limitFlag >= 0 ? Number(args.splice(limitFlag, 2)[1]) : 60;
const [beforeDir, afterDir] = args;
if (!beforeDir || !afterDir) {
  console.error('usage: node scripts/style-fingerprint-diff.mjs <beforeDir> <afterDir> [--limit N]');
  process.exit(2);
}

const CATEGORIES = [
  'serialisation-radius',
  'space-side',
  'transform-serialisation',
  'sr-only-clip',
  'colour-rounding',
  'gradient-serialisation',
  'shadow-serialisation',
  'transition-list',
  'tw-internal-variable',
  'unexplained',
];
const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
const unexplained = [];
const structural = [];

const RGBA = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g;
// Tailwind 4 declares its theme tokens as custom properties on :root (--color-*, --text-*, ...), so every
// element inherits them and they appear only in the after dump. Project variables (--glass-*, --text-primary,
// --font-inter, ...) exist on both sides and are compared normally.
const TW_THEME_VARIABLE =
  /^--(color|text|font|font-weight|radius|container|tracking|leading|ease|animate|default|spacing|shadow|inset-shadow|drop-shadow|text-shadow|blur|backdrop-blur|perspective|aspect|breakpoint)(-|$)/;
const BOX_TOLERANCE = 0.05;
const MARGIN_PROP = /^margin-/;

function listJson(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

function load(dir, file) {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function numbersPx(value) {
  const found = [...value.matchAll(/(-?[\d.]+(?:e[+-]?\d+)?)px/gi)].map((m) => Number(m[1]));
  return found.length > 0 ? found : null;
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

function gradientSerialisation(a, b) {
  if (!a.includes('gradient(') || !b.includes('gradient(')) return false;
  const strip = (v) => v.replace(/ 0%(,|\))/g, '$1').replace(/ 100%\)/g, ')');
  return strip(a) === strip(b);
}

/** Visible layers of a box-shadow list (colours are already rgba(r,g,b,a) after normalisation). */
function visibleShadowLayers(value) {
  if (value === 'none') return [];
  const layers = [...value.matchAll(/(rgba\([^)]*\))((?: -?[\d.]+(?:px)?){2,4})( inset)?/g)];
  if (layers.length === 0) return null;
  return layers
    .filter((m) => {
      const alpha = Number(/rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(m[1])[1]);
      const lengths = m[2].trim().split(' ').map((n) => parseFloat(n));
      return alpha > 0 && lengths.some((n) => n !== 0);
    })
    .map((m) => `${m[1]}${m[2]}${m[3] ?? ''}`);
}

function shadowSerialisation(a, b) {
  const la = visibleShadowLayers(a);
  const lb = visibleShadowLayers(b);
  return la !== null && lb !== null && la.join('|') === lb.join('|');
}

// What the v4 transition-colors / transition-transform utilities list beyond v3: outline-color, --tw-gradient-* and
// the individual transform properties (v4 emits translate, scale and rotate separately from transform).
const TRANSITION_EXTRAS = new Set(['outline-color', 'translate', 'scale', 'rotate']);

function transitionList(a, b) {
  const la = a.split(', ');
  const lb = b.split(', ');
  const extras = lb.filter((x) => !la.includes(x));
  const kept = la.every((x) => lb.includes(x));
  return kept && extras.length > 0 && extras.every((x) => TRANSITION_EXTRAS.has(x) || x.startsWith('--tw-gradient-'));
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

function parseLength(token, reference) {
  const n = parseFloat(token);
  if (!Number.isFinite(n)) return 0;
  return token.endsWith('%') ? (n / 100) * reference : n;
}

/** Effective 2D matrix of translate, rotate, scale, then transform (CSS order). */
function effectiveMatrix(get, box) {
  let m = IDENTITY;
  const translate = get('translate');
  if (translate && translate !== 'none') {
    const [x = '0', y = '0'] = translate.split(/\s+/);
    m = mul(m, [1, 0, 0, 1, parseLength(x, box[2]), parseLength(y, box[3])]);
  }
  const rotate = get('rotate');
  if (rotate && rotate !== 'none') {
    const rad = (parseFloat(rotate) * Math.PI) / 180;
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
  return Boolean(a && b) && a.every((v, i) => Math.abs(v - b[i]) < 0.01);
}

// ---- comparison ------------------------------------------------------------------------------

function record(category, file, elPath, prop, before, after) {
  counts[category] += 1;
  if (category === 'unexplained') unexplained.push({ file, elPath, prop, before, after });
}

function valueMap(names, strings, el) {
  const map = new Map();
  names.forEach((n, i) => map.set(n, strings[el.v[i]]));
  return map;
}

/** Margin differences are judged per parent after all elements of a state are compared. */
let pendingMargins = [];

function compareElement(file, before, after, beforeNames, afterNames, beforeStrings, afterStrings) {
  const elPath = before.path;
  const bv = valueMap(beforeNames, beforeStrings, before);
  const av = valueMap(afterNames, afterStrings, after);

  for (let i = 0; i < 4; i++) {
    if (Math.abs(before.box[i] - after.box[i]) > BOX_TOLERANCE) {
      record('unexplained', file, elPath, `box[${['x', 'y', 'width', 'height'][i]}]`, before.box[i], after.box[i]);
    }
  }

  if ((before.t ?? '') !== (after.t ?? '')) {
    record('unexplained', file, elPath, 'text', before.t, after.t);
  }

  const diffs = new Map();
  for (const name of new Set([...bv.keys(), ...av.keys()])) {
    const b = bv.get(name);
    const a = av.get(name);
    if (b !== a) diffs.set(name, { b, a });
  }
  if (diffs.size === 0) return;

  const handled = new Set();

  // transform family
  const tProps = ['transform', 'translate', 'rotate', 'scale'];
  if (tProps.some((p) => diffs.has(p))) {
    const mb = effectiveMatrix((p) => bv.get(p), before.box);
    const ma = effectiveMatrix((p) => av.get(p), after.box);
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
    const beforeClipped = /^rect\(0px,? 0px,? 0px,? 0px\)$/.test(bv.get('clip') ?? '');
    const afterInset = /^inset\(50%\)$/.test(av.get('clip-path') ?? '');
    const pb = bv.get('clip-path');
    const ca = av.get('clip');
    if (beforeClipped && afterInset && (pb === 'none' || pb === undefined) && (ca === 'auto' || ca === undefined)) {
      for (const p of ['clip', 'clip-path']) {
        if (diffs.has(p)) {
          record('sr-only-clip', file, elPath, p, diffs.get(p).b, diffs.get(p).a);
          handled.add(p);
        }
      }
    }
  }

  for (const [name, { b, a }] of diffs) {
    if (handled.has(name)) continue;
    if (name.startsWith('--tw-') || (b === undefined && TW_THEME_VARIABLE.test(name))) {
      record('tw-internal-variable', file, elPath, name, b ?? '(missing)', a ?? '(missing)');
    } else if (b === undefined || a === undefined) {
      record('unexplained', file, elPath, name, b ?? '(missing)', a ?? '(missing)');
    } else if (MARGIN_PROP.test(name)) {
      pendingMargins.push({ file, elPath, prop: name, before: b, after: a });
    } else if (isLargeRadius(b, a)) {
      record('serialisation-radius', file, elPath, name, b, a);
    } else if (colourRounding(b, a)) {
      record('colour-rounding', file, elPath, name, b, a);
    } else if (name === 'background-image' && gradientSerialisation(b, a)) {
      record('gradient-serialisation', file, elPath, name, b, a);
    } else if (name === 'box-shadow' && shadowSerialisation(b, a)) {
      record('shadow-serialisation', file, elPath, name, b, a);
    } else if (name === 'transition-property' && transitionList(b, a)) {
      record('transition-list', file, elPath, name, b, a);
    } else {
      record('unexplained', file, elPath, name, b, a);
    }
  }
}

function parentOf(elPath) {
  const i = elPath.lastIndexOf('>');
  return i < 0 ? '' : elPath.slice(0, i);
}

function px(el, names, strings, prop) {
  const i = names.indexOf(prop);
  return i < 0 ? 0 : parseFloat(strings[el.v[i]]) || 0;
}

/** Space-side: judged per parent; the margins summed along each axis over all children must be unchanged. */
function resolveMargins(beforeDump, afterDump, afterByPath) {
  const conserved = new Map();
  for (const parent of new Set(pendingMargins.map((m) => parentOf(m.elPath)))) {
    const children = beforeDump.elements.filter((e) => parentOf(e.path) === parent);
    let ok = true;
    for (const sides of [
      ['margin-left', 'margin-right'],
      ['margin-top', 'margin-bottom'],
    ]) {
      let before = 0;
      let after = 0;
      for (const child of children) {
        const twin = afterByPath.get(child.path);
        if (!twin) continue;
        for (const side of sides) {
          before += px(child, beforeDump.names, beforeDump.strings, side);
          after += px(twin, afterDump.names, afterDump.strings, side);
        }
      }
      if (Math.abs(before - after) > 0.05) ok = false;
    }
    conserved.set(parent, ok);
  }
  for (const m of pendingMargins) {
    record(conserved.get(parentOf(m.elPath)) ? 'space-side' : 'unexplained', m.file, m.elPath, m.prop, m.before, m.after);
  }
  pendingMargins = [];
}

function compareState(file) {
  const b = load(beforeDir, file);
  const a = load(afterDir, file);
  if (b.elements.length !== a.elements.length) {
    structural.push(`${file}: element count ${b.elements.length} (before) vs ${a.elements.length} (after)`);
  }
  const afterByPath = new Map(a.elements.map((el) => [el.path, el]));
  pendingMargins = [];
  for (const be of b.elements) {
    const ae = afterByPath.get(be.path);
    if (!ae) {
      structural.push(`${file}: element ${be.path} missing after`);
      continue;
    }
    compareElement(file, be, ae, b.names, a.names, b.strings, a.strings);
  }
  resolveMargins(b, a, afterByPath);
  return b.elements.length;
}

function compareHover(file) {
  const b = load(beforeDir, file);
  const a = load(afterDir, file);
  if (b.borderTopColor === a.borderTopColor && b.raw === a.raw) return;
  if (b.borderTopColor === a.borderTopColor || colourRounding(b.borderTopColor, a.borderTopColor)) {
    record('colour-rounding', file, '(hover)', 'border-top-color', b.raw ?? b.borderTopColor, a.raw ?? a.borderTopColor);
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
  else totalElements += compareState(f);
}

console.log(`files compared: ${beforeFiles.filter((f) => afterFiles.includes(f)).length}, elements: ${totalElements}`);
for (const c of CATEGORIES) console.log(`  ${c.padEnd(24)} ${counts[c]}`);

for (const s of structural) console.log(`STRUCTURAL: ${s}`);

const byProp = new Map();
for (const u of unexplained) byProp.set(u.prop, (byProp.get(u.prop) ?? 0) + 1);
if (byProp.size > 0) {
  console.log('unexplained by property:');
  for (const [prop, n] of [...byProp].sort((x, y) => y[1] - x[1]).slice(0, 40)) console.log(`  ${prop.padEnd(36)} ${n}`);
}

const shown = unexplained.slice(0, LIMIT);
for (const u of shown) {
  console.log(`UNEXPLAINED ${u.file} ${u.elPath} ${u.prop}\n    before: ${u.before}\n    after:  ${u.after}`);
}
if (unexplained.length > shown.length) console.log(`... and ${unexplained.length - shown.length} more unexplained items`);

process.exit(unexplained.length > 0 || structural.length > 0 ? 1 : 0);
