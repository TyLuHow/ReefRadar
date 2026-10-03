/**
 * Tailwind content coverage (found in the 03-15 review captures).
 *
 * Tailwind 3 only generates the utility classes it finds in the files listed in
 * tailwind.config.js `content`. When the map code moved to src/features/map, that
 * directory was missing from the list, so classes used only there (bottom-4, right-4 on the
 * map legend) were never generated and the legend fell out of the map frame.
 *
 * This test fails when any .ts/.tsx file under src that sets a className lives in a
 * directory the content globs do not cover.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mdx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function contentPrefixes(): string[] {
  const configText = fs.readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf-8');
  const block = /content:\s*\[([\s\S]*?)\]/.exec(configText);
  expect(block, 'tailwind.config.js has a content array').not.toBeNull();
  const globs = [...(block as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  // Every glob is "./<dir>/**/*.{...}": the covered directory is the part before "/**".
  return globs.map((g) => g.replace(/^\.\//, '').replace(/\/\*\*.*$/, ''));
}

describe('tailwind content globs', () => {
  it('cover every source directory that sets a className', () => {
    const prefixes = contentPrefixes();
    const uncovered = walk(SRC)
      .filter((file) => /className\s*=/.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
      .filter((rel) => !prefixes.some((p) => rel === p || rel.startsWith(`${p}/`)));
    expect(uncovered, 'files whose classes Tailwind would never generate').toEqual([]);
  });

  it('lists src/features', () => {
    expect(contentPrefixes()).toContain('src/features');
  });
});
