/**
 * DS-07 gate (part A): the always-on ambient layer is gone.
 *
 * Fails if a removed module reappears under src, or if any file under src
 * imports one. Plan 03-07 extends this gate with the store, the CSS tokens and
 * the slider.
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
];

/** Import specifier tails that must not be imported anywhere under src. */
const REMOVED_SPECIFIER_TAILS = [
  'BackgroundCanvas',
  'useBackgroundCanvas',
  'useVitality',
  'color-engine',
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

  it('providers.tsx has no next/dynamic and keeps the query defaults', () => {
    const text = fs.readFileSync(path.join(SRC_ROOT, 'app/providers.tsx'), 'utf8');
    expect(text).not.toMatch(/next\/dynamic/);
    expect(text).toMatch(/staleTime:\s*60\s*\*\s*1000/);
    expect(text).toMatch(/refetchOnWindowFocus:\s*false/);
    expect(text).toMatch(/QueryClientProvider/);
  });
});
