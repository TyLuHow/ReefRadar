/**
 * Stack-consolidation gate (PLAT-02).
 *
 * Fails if the deleted legacy Python dashboard directory (repo-root
 * `dashboard/`) reappears or is referenced again from the build/test config,
 * and (via REMOVED_PACKAGES) if a package that the consolidation removed comes
 * back into package.json, the lockfile or the source tree.
 *
 * Later plans only append names to REMOVED_PACKAGES; the check logic is shared.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD_NEXT_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(DASHBOARD_NEXT_ROOT, '..');
const SRC_ROOT = path.join(DASHBOARD_NEXT_ROOT, 'src');

/** Directory name of the deleted legacy app (built from parts so this file never matches its own scan). */
const LEGACY_DIR = 'dash' + 'board';

/** npm package names removed by the stack consolidation. Append only. */
export const REMOVED_PACKAGES: string[] = [
  '@deck.gl/core',
  '@deck.gl/layers',
  '@deck.gl/react',
  'leaflet',
  'react-leaflet',
  '@types/leaflet',
  'recharts',
  'wavesurfer.js',
];

/** Config files that must not point into the deleted directory. */
const CONFIG_FILES = ['pytest.ini', '.github/workflows/ci.yml', 'scripts/check-citations.mjs'];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * Matches `dashboard/` as a path segment of the deleted directory: not preceded
 * by a word char, hyphen, dot or slash, so `dashboard-next/` and
 * `src/app/dashboard/` do not match.
 */
export function referencesLegacyDir(text: string): string[] {
  const re = new RegExp(`(?<![\\w\\-./])${LEGACY_DIR}/`, 'g');
  const hits: string[] = [];
  text.split(/\r?\n/).forEach((line, idx) => {
    if (re.test(line)) hits.push(`${idx + 1}: ${line.trim().slice(0, 140)}`);
    re.lastIndex = 0;
  });
  return hits;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

/** True when `text` imports or requires the package (exact name or a subpath). */
export function importsPackage(text: string, pkg: string): boolean {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`(?:from\\s+|import\\s*\\(\\s*|require\\s*\\(\\s*|import\\s+)['"]${escaped}(?:/[^'"]*)?['"]`);
  return re.test(text);
}

describe('stack consolidation: removed directory (PLAT-02)', () => {
  it('resolves the repository root correctly (dashboard-next exists there)', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'dashboard-next', 'package.json'))).toBe(true);
  });

  it('the legacy Python dashboard directory does not exist', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, LEGACY_DIR))).toBe(false);
  });

  it('the reference matcher flags the deleted directory but not dashboard-next or app routes', () => {
    expect(referencesLegacyDir(`cd ${LEGACY_DIR}/ && run`)).toHaveLength(1);
    expect(referencesLegacyDir(`path: ${LEGACY_DIR}-next/package-lock.json`)).toEqual([]);
    expect(referencesLegacyDir(`src/app/${LEGACY_DIR}/page.tsx`)).toEqual([]);
  });

  it('no build, test or citation config points into the deleted directory', () => {
    const problems: string[] = [];
    let scanned = 0;
    for (const name of CONFIG_FILES) {
      const full = path.join(REPO_ROOT, name);
      if (!fs.existsSync(full)) continue;
      scanned++;
      for (const hit of referencesLegacyDir(fs.readFileSync(full, 'utf8'))) problems.push(`${name}:${hit}`);
    }
    expect(scanned, 'no config files found to scan').toBeGreaterThan(0);
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });
});

describe('stack consolidation: removed packages (PLAT-02)', () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(DASHBOARD_NEXT_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lock = JSON.parse(fs.readFileSync(path.join(DASHBOARD_NEXT_ROOT, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, unknown>;
  };
  const sourceFiles: string[] = [];
  walk(SRC_ROOT, sourceFiles);

  it('the source scan is non-trivial (guards against an empty scan)', () => {
    expect(sourceFiles.length).toBeGreaterThan(40);
  });

  it('the import matcher recognises import, require and dynamic import forms', () => {
    expect(importsPackage(`import x from 'recharts'`, 'recharts')).toBe(true);
    expect(importsPackage(`import { a } from "@deck.gl/core"`, '@deck.gl/core')).toBe(true);
    expect(importsPackage(`const m = await import('leaflet/dist/leaflet.css')`, 'leaflet')).toBe(true);
    expect(importsPackage(`require('wavesurfer.js')`, 'wavesurfer.js')).toBe(true);
    expect(importsPackage(`import x from 'recharts-extra'`, 'recharts')).toBe(false);
  });

  it.each(REMOVED_PACKAGES.length ? REMOVED_PACKAGES : ['(none yet)'])('%s is absent everywhere', (pkg) => {
    if (pkg === '(none yet)') return;
    expect(pkgJson.dependencies ?? {}, `${pkg} in dependencies`).not.toHaveProperty([pkg]);
    expect(pkgJson.devDependencies ?? {}, `${pkg} in devDependencies`).not.toHaveProperty([pkg]);
    expect(lock.packages ?? {}, `${pkg} in package-lock.json`).not.toHaveProperty([`node_modules/${pkg}`]);
    const importers = sourceFiles.filter((f) => importsPackage(fs.readFileSync(f, 'utf8'), pkg));
    expect(importers.map((f) => path.relative(DASHBOARD_NEXT_ROOT, f))).toEqual([]);
  });
});

describe('stack consolidation: next.config.js (PLAT-02)', () => {
  it('has no transpilePackages key once deck.gl is gone (03-08)', () => {
    const text = fs.readFileSync(path.join(DASHBOARD_NEXT_ROOT, 'next.config.js'), 'utf8');
    // Strip line comments so the explanation of the removal cannot trip the check.
    const code = text.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/transpilePackages/);
  });
});

describe('stack consolidation: Leaflet removal (PLAT-02, 03-10)', () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(DASHBOARD_NEXT_ROOT, 'package.json'), 'utf8')) as {
    overrides?: Record<string, unknown>;
  };

  it('package.json has no overrides entry for react-leaflet', () => {
    expect(pkgJson.overrides ?? {}).not.toHaveProperty(['react-leaflet']);
  });

  it('the legacy src/components/maps directory does not exist', () => {
    expect(fs.existsSync(path.join(SRC_ROOT, 'components', 'maps'))).toBe(false);
  });

  it('globals.css has no Leaflet import or rule and no .custom-marker rule', () => {
    // The legacy rules moved from app/globals.css into styles/legacy.css (04-02); read both.
    const css = ['app/globals.css', 'styles/legacy.css']
      .map((file) => fs.readFileSync(path.join(SRC_ROOT, file), 'utf8'))
      .join('\n');
    expect(css.toLowerCase()).not.toContain('leaflet');
    expect(css).not.toContain('.custom-marker');
  });

  it('the visual suite hides canvases and MapLibre maps only', () => {
    const spec = fs.readFileSync(path.join(DASHBOARD_NEXT_ROOT, 'tests', 'e2e', 'visual.spec.ts'), 'utf8');
    expect(spec).toContain("'canvas, .maplibregl-map { visibility: hidden !important; }'");
    expect(spec.toLowerCase()).not.toContain('leaflet');
  });
});

describe('stack consolidation: one chart engine and used dependencies (PLAT-02, 03-11)', () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(DASHBOARD_NEXT_ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = pkgJson.dependencies ?? {};
  const declared = { ...dependencies, ...(pkgJson.devDependencies ?? {}) };
  const sourceFiles: string[] = [];
  walk(SRC_ROOT, sourceFiles);
  const sourceTexts = sourceFiles.map((f) => fs.readFileSync(f, 'utf8'));

  /** Runtime packages used by the framework itself rather than imported by name from src. */
  const FRAMEWORK_PROVIDED = new Set(['next', 'react', 'react-dom']);
  /** Competing chart libraries: none may be declared. */
  const OTHER_CHART_LIBRARIES = [
    /^recharts$/,
    /^chart\.js$/,
    /^react-chartjs-2$/,
    /^victory(-.*)?$/,
    /^@nivo\//,
    /^@visx\//,
    /^highcharts(-.*)?$/,
    /^apexcharts$/,
  ];

  it('every runtime dependency (other than next, react, react-dom) is imported by a file under src', () => {
    const unused = Object.keys(dependencies)
      .filter((name) => !FRAMEWORK_PROVIDED.has(name))
      .filter((name) => !sourceTexts.some((text) => importsPackage(text, name)));
    expect(unused, `declared but never imported under src: ${unused.join(', ')}`).toEqual([]);
  });

  it('the used-dependency matcher sees static, dynamic, side-effect and subpath imports', () => {
    expect(importsPackage(`import 'maplibre-gl/dist/maplibre-gl.css'`, 'maplibre-gl')).toBe(true);
    expect(importsPackage(`import { Map } from 'react-map-gl/maplibre'`, 'react-map-gl')).toBe(true);
    expect(importsPackage(`const m = await import("@observablehq/plot")`, '@observablehq/plot')).toBe(true);
    expect(importsPackage(`import { format } from 'd3-format'`, 'd3-format')).toBe(true);
    expect(importsPackage(`import x from 'd3-format-extra'`, 'd3-format')).toBe(false);
  });

  it('declares no other chart library', () => {
    const found = Object.keys(declared).filter((name) => OTHER_CHART_LIBRARIES.some((re) => re.test(name)));
    expect(found).toEqual([]);
  });

  it('declares no bare d3 bundle, only the individual d3 modules', () => {
    expect(declared).not.toHaveProperty(['d3']);
  });

  it('Observable Plot and the four d3 modules are pinned exactly', () => {
    expect(dependencies['@observablehq/plot']).toBe('0.6.17');
    expect(dependencies['d3-scale']).toBe('4.0.2');
    expect(dependencies['d3-array']).toBe('3.2.4');
    expect(dependencies['d3-shape']).toBe('3.2.0');
    expect(dependencies['d3-format']).toBe('3.1.2');
  });

  it('only the charts feature module imports Observable Plot', () => {
    const importers = sourceFiles
      .filter((f) => importsPackage(fs.readFileSync(f, 'utf8'), '@observablehq/plot'))
      .map((f) => path.relative(SRC_ROOT, f).split(path.sep).join('/'));
    expect(importers.length).toBeGreaterThan(0);
    for (const file of importers) expect(file.startsWith('features/charts/'), file).toBe(true);
  });
});
