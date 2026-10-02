// @vitest-environment node
/**
 * PLAT-10 (CAP-10): the vercel.json security headers are preserved.
 *
 * Vercel applies these from vercel.json at the edge; `next start` does not, so the only
 * place to guard them in CI is the config file itself. The test reads the committed file
 * and asserts the exact values (T-03-01-02).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface HeaderEntry {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf-8')) as {
  headers?: HeaderEntry[];
  installCommand?: string;
};

describe('vercel.json security headers (CAP-10)', () => {
  it('applies exactly the three security headers to source /(.*)', () => {
    const entry = vercelConfig.headers?.find((h) => h.source === '/(.*)');
    expect(entry).toBeDefined();

    const byName = Object.fromEntries((entry?.headers ?? []).map((h) => [h.key, h.value]));
    // Exact values for the three required headers; extra headers (for example a later CSP)
    // may be added, but none of these may be dropped or weakened.
    expect(byName).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    // No duplicate header names hiding behind the map.
    const names = (entry?.headers ?? []).map((h) => h.key);
    expect(new Set(names).size).toBe(names.length);
  });

  it('installs with npm ci (reproducible installs)', () => {
    expect(vercelConfig.installCommand).toBe('npm ci');
  });
});
