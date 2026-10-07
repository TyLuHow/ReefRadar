// @vitest-environment node
/**
 * Production guard for the dev-fixtures flag (04 review A-WR-06). `/dev/fixtures` must never ship
 * without the flag, and a Vercel production build with NEXT_PUBLIC_DEV_FIXTURES=1 must fail loudly in
 * next.config.js instead of shipping the route. Previews and local builds may still set it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';

const CONFIG = path.resolve(__dirname, '../../next.config.js');
const KEYS = ['NEXT_PUBLIC_DEV_FIXTURES', 'VERCEL_ENV'] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function loadConfig(env: Partial<Record<(typeof KEYS)[number], string>>): { env?: Record<string, string> } {
  for (const key of KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  delete require.cache[CONFIG];
  return require(CONFIG);
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  delete require.cache[CONFIG];
});

describe('next.config.js dev-fixtures production guard', () => {
  it('throws for a Vercel production build with NEXT_PUBLIC_DEV_FIXTURES=1', () => {
    expect(() => loadConfig({ NEXT_PUBLIC_DEV_FIXTURES: '1', VERCEL_ENV: 'production' })).toThrow(
      /NEXT_PUBLIC_DEV_FIXTURES=1 must not be set for a production build/,
    );
  });

  it('allows the flag on a Vercel preview and in a local or CI build', () => {
    expect(loadConfig({ NEXT_PUBLIC_DEV_FIXTURES: '1', VERCEL_ENV: 'preview' }).env?.NEXT_PUBLIC_DEV_FIXTURES).toBe('1');
    expect(loadConfig({ NEXT_PUBLIC_DEV_FIXTURES: '1' }).env?.NEXT_PUBLIC_DEV_FIXTURES).toBe('1');
  });

  it('builds a Vercel production deployment without the flag, defining it as 0', () => {
    expect(loadConfig({ VERCEL_ENV: 'production' }).env?.NEXT_PUBLIC_DEV_FIXTURES).toBe('0');
    expect(loadConfig({ NEXT_PUBLIC_DEV_FIXTURES: '0', VERCEL_ENV: 'production' }).env?.NEXT_PUBLIC_DEV_FIXTURES).toBe('0');
  });
});
