// Compiles src/app/globals.css (the single Tailwind entry) with the same PostCSS pipeline Next uses.
// Usage: node scripts/compile-css.mjs [--normalize] [--out <file>]
//   --normalize  collapse runs of whitespace to one space so two outputs can be compared
//   --out <file> write the CSS to a file instead of stdout
// Used to prove that moving the legacy CSS into src/styles/legacy.css leaves the compiled legacy CSS identical.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src', 'app', 'globals.css');

const args = process.argv.slice(2);
const normalize = args.includes('--normalize');
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : null;
if (outIndex >= 0 && !out) {
  console.error('compile-css: --out needs a file path');
  process.exit(2);
}

const source = readFileSync(entry, 'utf8');
const result = await postcss([tailwindcss()]).process(source, { from: entry });
let css = result.css;
if (normalize) css = css.replace(/\s+/g, ' ').trim() + '\n';

if (out) writeFileSync(path.resolve(out), css);
else process.stdout.write(css);
