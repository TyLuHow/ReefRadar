// scripts/copy-maplibre-worker.mjs (Node built-ins only)
//
// maplibre-gl 6 is ESM-only and ships its web worker as two sibling files that a
// bundler does not emit on its own under Next/Turbopack. Copy both from the
// installed package into public/maplibre/ so the worker URL always matches the
// installed version. Wired as "predev" and "prebuild"; public/maplibre/ is gitignored.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const dist = new URL('../node_modules/maplibre-gl/dist/', import.meta.url);
const out = new URL('../public/maplibre/', import.meta.url);
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

for (const f of FILES) {
  if (!existsSync(new URL(f, dist))) {
    console.error(`copy-maplibre-worker: missing ${f} in node_modules/maplibre-gl/dist (is maplibre-gl 6 installed?)`);
    process.exit(1);
  }
}

mkdirSync(out, { recursive: true });
for (const f of FILES) copyFileSync(new URL(f, dist), new URL(f, out));
console.log(`copy-maplibre-worker: copied ${FILES.join(', ')} to public/maplibre/`);
