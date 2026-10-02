// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guard (plan 02-13, owner decision 2026-10-02): the contract client must never
 * trigger a CORS preflight.
 *
 * The contract CDN relays OPTIONS to its S3 origin, which has no bucket CORS, so a
 * preflight is answered 403 and a browser would block the request. Plain GETs with
 * no author-set request header are never preflighted, and the CDN answers them with
 * Access-Control-Allow-Origin * (proved live by contract-cdn-cors-live.spec.ts).
 * Anything in the contract module that adds a request header, a non-GET method, a
 * body or a mode change would silently break that. This test fails if it appears.
 */

const CONTRACT_DIR = resolve(__dirname, '../../src/features/contract');

/** Constructs that make a fetch non-simple or let a caller set request headers. */
const FORBIDDEN: Array<{ rule: string; pattern: RegExp }> = [
  { rule: 'headers option or Headers object', pattern: /\bheaders\s*[:=(]|\bnew\s+Headers\b|\bHeaders\s*\(/i },
  { rule: 'setRequestHeader', pattern: /setRequestHeader/ },
  { rule: 'XMLHttpRequest', pattern: /XMLHttpRequest/ },
  { rule: 'Request object', pattern: /\bnew\s+Request\b/ },
  { rule: 'sendBeacon', pattern: /sendBeacon/ },
];

/** The only keys a contract fetch may pass: credentials 'omit', and a cache mode. */
const ALLOWED_OPTION_KEYS = new Set(['credentials', 'cache']);

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
    } else if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1;
      current += ch;
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim());
}

/** The argument lists of every fetch( call in the source. */
export function fetchCalls(source: string): string[][] {
  const calls: string[][] = [];
  const pattern = /(?<![\w.])fetch\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    let depth = 1;
    let quote: string | null = null;
    let index = match.index + match[0].length;
    const start = index;
    for (; index < source.length && depth > 0; index += 1) {
      const ch = source[index];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      } else if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    calls.push(splitTopLevel(source.slice(start, index - 1)));
  }
  return calls;
}

/** Everything in a source file that could make a contract request non-simple. */
export function preflightRisks(rawSource: string): string[] {
  const source = stripComments(rawSource);
  const risks: string[] = [];
  for (const { rule, pattern } of FORBIDDEN) {
    if (pattern.test(source)) risks.push(rule);
  }
  for (const args of fetchCalls(source)) {
    if (args.length > 2) risks.push('fetch with more than two arguments');
    const options = args[1];
    if (options === undefined) continue;
    const body = options.replace(/^\{|\}$/g, '');
    if (!options.startsWith('{') || /[.]{3}/.test(body)) {
      risks.push('fetch options are not a literal object');
      continue;
    }
    for (const entry of splitTopLevel(body)) {
      const key = entry.split(':')[0]?.trim().replace(/['"]/g, '');
      if (key && !ALLOWED_OPTION_KEYS.has(key)) risks.push(`fetch option "${key}"`);
    }
  }
  return risks;
}

function contractSources(): Array<{ name: string; source: string }> {
  return readdirSync(CONTRACT_DIR)
    .filter((name) => /\.(ts|tsx)$/.test(name))
    .map((name) => ({ name, source: readFileSync(join(CONTRACT_DIR, name), 'utf-8') }));
}

describe('the contract client never triggers a CORS preflight', () => {
  it('scans the real contract module and finds the fetch call it guards', () => {
    const sources = contractSources();
    expect(sources.map((s) => s.name)).toContain('client.ts');
    const calls = sources.flatMap((s) => fetchCalls(stripComments(s.source)));
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it('has no custom request header, method, body or mode in any contract file', () => {
    for (const { name, source } of contractSources()) {
      expect({ file: name, risks: preflightRisks(source) }).toEqual({ file: name, risks: [] });
    }
  });

  it('only ever fetches with { credentials: "omit" }', () => {
    const calls = contractSources().flatMap((s) => fetchCalls(stripComments(s.source)));
    for (const args of calls) {
      expect(args).toHaveLength(2);
      expect(args[1].replace(/\s+/g, ' ')).toBe("{ credentials: 'omit' }");
    }
  });

  describe('the guard itself catches what it is meant to catch', () => {
    const base = "export const go = (url: string) => fetch(url, { credentials: 'omit' });";

    it('accepts the current shape', () => {
      expect(preflightRisks(base)).toEqual([]);
    });

    it('accepts a comment that mentions headers', () => {
      expect(preflightRisks(`// no headers here\n/* headers: {} */\n${base}`)).toEqual([]);
    });

    it.each([
      ["fetch(url, { credentials: 'omit', headers: { 'X-Reefradar': '1' } })", 'headers option or Headers object'],
      ["fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' } })", 'headers option or Headers object'],
      ["fetch(url, { credentials: 'omit', mode: 'cors' })", 'fetch option "mode"'],
      ["fetch(url, { credentials: 'omit', method: 'POST' })", 'fetch option "method"'],
      ["fetch(url, { credentials: 'omit', body: 'x' })", 'fetch option "body"'],
      ["fetch(new Request(url, init))", 'Request object'],
      ["fetch(url, init)", 'fetch options are not a literal object'],
      ["fetch(url, { ...base, credentials: 'omit' })", 'fetch options are not a literal object'],
      ["fetch(url, { credentials: 'omit', signalx: 1 })", 'fetch option "signalx"'],
      ["const h = new Headers(); fetch(url, { credentials: 'omit' })", 'headers option or Headers object'],
    ])('rejects %s', (snippet, rule) => {
      expect(preflightRisks(`export const go = (url: string) => ${snippet};`)).toContain(rule);
    });
  });
});
