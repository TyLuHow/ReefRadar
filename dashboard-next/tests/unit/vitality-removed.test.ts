/**
 * DS-07 gate (part A): the always-on ambient layer is gone.
 *
 * Fails if a removed module reappears under src, or if any file under src
 * imports one. Also covers the store, the audio-visual bridge, the --reef-*
 * custom properties and Tailwind colours, and the static crossfader slider.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DASHBOARD_NEXT_ROOT = path.resolve(__dirname, '../..');
const SRC_ROOT = path.join(DASHBOARD_NEXT_ROOT, 'src');

/** Files (relative to src) that must not exist. Append only. */
const REMOVED_FILES = [
  'components/BackgroundCanvas.tsx',
  'hooks/useBackgroundCanvas.ts',
  'hooks/useVitality.ts',
  'lib/color-engine.ts',
  'components/spectrogram/SpectrogramCanvas.tsx',
  'components/spectrogram/useSpectrogramAnimation.ts',
  'components/dev/VitalityDebugPanel.tsx',
  'stores/vitality-store.ts',
  'hooks/useAudioVisualBridge.ts',
];

/** Import specifier tails that must not be imported anywhere under src. */
const REMOVED_SPECIFIER_TAILS = [
  'BackgroundCanvas',
  'useBackgroundCanvas',
  'useVitality',
  'color-engine',
  'useSpectrogramAnimation',
  'components/spectrogram/SpectrogramCanvas',
  'VitalityDebugPanel',
  'vitality-store',
  'useAudioVisualBridge',
];

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const SPECIFIER_RE =
  /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

export function removedImports(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(SPECIFIER_RE)) {
    const spec = m[2];
    const clean = spec.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
    for (const tail of REMOVED_SPECIFIER_TAILS) {
      if (clean === tail || clean.endsWith('/' + tail)) hits.push(spec);
    }
  }
  return hits;
}

describe('DS-07 ambient layer removed', () => {
  it.each(REMOVED_FILES)('src/%s does not exist', (rel) => {
    expect(fs.existsSync(path.join(SRC_ROOT, rel))).toBe(false);
  });

  it('no file under src imports a removed module', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const hits = removedImports(fs.readFileSync(file, 'utf8'));
      for (const h of hits) offenders.push(`${path.relative(SRC_ROOT, file)}: ${h}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the import scanner flags removed specifiers and ignores real ones', () => {
    expect(removedImports(`import { useVitality } from '@/hooks/useVitality';`)).toHaveLength(1);
    expect(removedImports(`const X = dynamic(() => import('@/components/BackgroundCanvas'));`)).toHaveLength(1);
    expect(removedImports(`import { x } from '@/lib/color-engine';`)).toHaveLength(1);
    expect(removedImports(`import { SpectrogramCanvas } from '@/components/audio/SpectrogramCanvas';`)).toEqual([]);
    expect(removedImports(`import { BANDS } from '@/components/spectrogram';`)).toEqual([]);
  });

  it('no file under src imports the dev components directory', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const text = fs.readFileSync(file, 'utf8');
      if (/from\s+['"]@\/components\/dev(\/|['"])/.test(text)) offenders.push(path.relative(SRC_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('components/spectrogram exports exactly the frequency-band table', () => {
    const text = fs.readFileSync(path.join(SRC_ROOT, 'components/spectrogram/index.ts'), 'utf8');
    const names = [...text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)]
      .flatMap((m) => m[1].split(','))
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
    expect(names).toEqual(['ALL_BANDS', 'BANDS', 'BAND_IDS', 'BandConfig', 'BandId'].sort());
    expect(text).not.toMatch(/export\s+default|export\s+\*/);
    expect(fs.existsSync(path.join(SRC_ROOT, 'components/spectrogram/FrequencyBands.ts'))).toBe(true);
  });

  it('the real analysis spectrogram component still exists', () => {
    expect(fs.existsSync(path.join(SRC_ROOT, 'components/audio/SpectrogramCanvas.tsx'))).toBe(true);
  });

  it('providers.tsx has no next/dynamic and keeps the query defaults', () => {
    const text = fs.readFileSync(path.join(SRC_ROOT, 'app/providers.tsx'), 'utf8');
    expect(text).not.toMatch(/next\/dynamic/);
    expect(text).toMatch(/staleTime:\s*60\s*\*\s*1000/);
    expect(text).toMatch(/refetchOnWindowFocus:\s*false/);
    expect(text).toMatch(/QueryClientProvider/);
  });
});

const REEF_TOKEN_NAMES = ['primary', 'accent', 'secondary', 'highlight', 'bg', 'surface', 'glow', 'text'];
// --reef-NAME custom properties and reef-NAME Tailwind colour classes/keys (e.g. text-reef-glow,
// 'reef-bg'). Anchored on the eight names so LoadingReef's reef-pulse is unaffected.
const REEF_TOKEN_RE = new RegExp(`reef-(?:${REEF_TOKEN_NAMES.join('|')})(?![A-Za-z0-9_])`);

function readCss(): string {
  return fs.readFileSync(path.join(SRC_ROOT, 'app/globals.css'), 'utf8');
}

function crossfaderRules(css: string): string {
  const start = css.indexOf('input[type=range].crossfader-slider');
  return start === -1 ? '' : css.slice(start);
}

describe('DS-07 store, bridge, tokens and slider removed', () => {
  it('no file under src mentions the removed ambient system by name', () => {
    const offenders: string[] = [];
    const scanned = [...walk(SRC_ROOT), path.join(SRC_ROOT, 'app/globals.css')];
    for (const file of scanned) {
      if (/vitality/i.test(fs.readFileSync(file, 'utf8'))) offenders.push(path.relative(SRC_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('no src file or globals.css defines or uses a --reef-NAME token or reef-NAME colour', () => {
    const offenders: string[] = [];
    const scanned = [...walk(SRC_ROOT), path.join(SRC_ROOT, 'app/globals.css')];
    for (const file of scanned) {
      if (REEF_TOKEN_RE.test(fs.readFileSync(file, 'utf8'))) {
        offenders.push(path.relative(DASHBOARD_NEXT_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the token scanner flags the eight names and ignores reef-pulse', () => {
    expect(REEF_TOKEN_RE.test('--reef-glow: hsla(1,2%,3%,0.2);')).toBe(true);
    expect(REEF_TOKEN_RE.test("'reef-text': 'var(--reef-text)'")).toBe(true);
    expect(REEF_TOKEN_RE.test('className="bg-reef-surface"')).toBe(true);
    expect(REEF_TOKEN_RE.test('animation: reef-pulse 2s ease-in-out')).toBe(false);
  });

  it('globals.css has no thumb-pulse keyframes and no gradient inside the crossfader rules', () => {
    const css = readCss();
    expect(css).not.toMatch(/thumb-pulse/);
    expect(crossfaderRules(css)).not.toMatch(/linear-gradient/);
  });

  it('the .crossfader-slider rules are static and keep touch-action none', () => {
    const rules = crossfaderRules(readCss());
    expect(rules).toContain('#6b6560');
    expect(rules).toContain('#cd853f');
    expect(rules).toContain('20px');
    expect(rules).toContain('6px');
    expect(rules).toMatch(/touch-action:\s*none/);
    expect(rules).not.toMatch(/box-shadow|animation/);
    expect(rules).toContain('::-webkit-slider-thumb');
    expect(rules).toContain('::-moz-range-thumb');
    expect(rules).toContain('::-webkit-slider-runnable-track');
    expect(rules).toContain('::-moz-range-track');
  });

  it('LoadingReef keeps its own reef-pulse animation', () => {
    const text = fs.readFileSync(path.join(SRC_ROOT, 'components/ui/LoadingReef.tsx'), 'utf8');
    expect(text).toContain('reef-pulse');
  });

  it('the remaining analysis spectrogram reads no client store', () => {
    const text = fs.readFileSync(path.join(SRC_ROOT, 'components/audio/SpectrogramCanvas.tsx'), 'utf8');
    expect(text).not.toMatch(/@\/stores/);
  });
});
