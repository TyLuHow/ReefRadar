/**
 * The /dev/fixtures URL parameters, parsed through closed allowlists (T-04-06-02, T-04-06-03).
 * Everything here is untrusted input.
 *
 *   direction  one of DIRECTIONS, otherwise atlas
 *   reduced    "1" turns reduced motion on, anything else leaves it off
 *   tok        --dir-<name>:#RRGGBB, repeatable, at most MAX_TOKEN_OVERRIDES kept
 *
 * Token values must only ever be applied with style.setProperty; they are never interpolated into
 * markup or CSS text.
 */

export const DIRECTIONS = ['atlas', 'nocturne', 'poster'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const MAX_TOKEN_OVERRIDES = 8;

const TOKEN_NAME = /^--dir-[a-z0-9-]+$/;
const TOKEN_VALUE = /^#[0-9A-Fa-f]{6}$/;

export interface FixtureQuery {
  direction: Direction;
  reduced: boolean;
  tokenOverrides: Array<[string, string]>;
}

function parseDirection(raw: string | null): Direction {
  return DIRECTIONS.find((direction) => direction === raw) ?? 'atlas';
}

function parseTokenOverride(raw: string): [string, string] | null {
  // Split on the first colon only: a value that contains another colon then fails the hex test.
  const colon = raw.indexOf(':');
  if (colon === -1) return null;
  const name = raw.slice(0, colon);
  const value = raw.slice(colon + 1);
  if (!TOKEN_NAME.test(name) || !TOKEN_VALUE.test(value)) return null;
  return [name, value];
}

export function parseFixtureQuery(params: URLSearchParams): FixtureQuery {
  const tokenOverrides: Array<[string, string]> = [];
  for (const raw of params.getAll('tok')) {
    if (tokenOverrides.length >= MAX_TOKEN_OVERRIDES) break;
    const override = parseTokenOverride(raw);
    if (override !== null) tokenOverrides.push(override);
  }
  return {
    direction: parseDirection(params.get('direction')),
    reduced: params.get('reduced') === '1',
    tokenOverrides,
  };
}
