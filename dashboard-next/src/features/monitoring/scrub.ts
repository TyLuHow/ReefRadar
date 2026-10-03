/**
 * Shared client/server scrubber for error reports (03-12, PLAT-09).
 *
 * Pure and isomorphic: the browser scrubs before it sends, and the route handler
 * runs the very same functions again before it logs, so a forged payload cannot
 * put a URL, an address or a token into the Vercel log. Every function is
 * idempotent (scrub(scrub(x)) === scrub(x)).
 */

export const REPORT_SOURCES = ['window-error', 'unhandledrejection', 'error-boundary', 'global-error'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const MAX_NAME = 100;
export const MAX_MESSAGE = 300;
export const MAX_STACK_LINES = 8;
export const MAX_STACK_LINE = 200;
export const MAX_ROUTE = 200;
export const MAX_DIGEST = 100;
/** Input is cut to this before any regular expression runs, bounding the work on hostile input. */
const MAX_SCRUB_INPUT = 4_000;

export interface ClientErrorReport {
  v: 1;
  source: ReportSource;
  name: string;
  message: string;
  stack: string;
  route: string;
  digest: string | null;
  ts: number;
}

export interface ReportContext {
  source: ReportSource;
  /** location.pathname only. Defaults to the current pathname in the browser, '/' elsewhere. */
  route?: string;
  digest?: string | null;
}

// Absolute URLs of any scheme that can carry a credential or a file name.
const URL_PATTERN = /\b(?:https?|wss?|ftp|file|blob|data):\S+/gi;
// X-Amz-*=value pairs that survive outside a URL, with the separator that introduced them.
const AMZ_PATTERN = /[?&]?X-Amz-[A-Za-z0-9-]+=[^&\s]*/gi;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const WHITESPACE_RUN_PATTERN = /\S+/g;
const FILE_EXTENSION_TAIL_PATTERN = /\S[.][A-Za-z0-9]{1,5}$/;
const TOKEN_PATTERN = /[A-Za-z0-9_-]{24,}/g;

/** True when the characters just before `queryAt` look like `name.ext` (bounded look-behind, O(1)). */
function endsWithFileExtension(token: string, queryAt: number): boolean {
  return FILE_EXTENSION_TAIL_PATTERN.test(token.slice(Math.max(0, queryAt - 7), queryAt));
}

/**
 * Path-like tokens (containing a slash, or ending in a file extension) lose ?query and #fragment.
 *
 * One linear pass over whitespace-separated tokens, each scanned left to right once. This
 * replaces two backtracking regular expressions that were cubic and quadratic on a long
 * run of slashes or dots (CR-01). The cut is at the first `?` or `#` that qualifies, so a
 * second query later in the same token cannot survive either.
 */
function stripPathQueries(text: string): string {
  return text.replace(WHITESPACE_RUN_PATTERN, (token) => {
    const hasSlash = token.includes('/');
    for (let i = 0; i < token.length; i += 1) {
      const ch = token[i];
      if ((ch === '?' || ch === '#') && (hasSlash || endsWithFileExtension(token, i))) {
        return token.slice(0, i);
      }
    }
    return token;
  });
}

/** Replace anything that could identify a visitor, a file or a credential. Not truncated. */
export function scrubText(input: string): string {
  return stripPathQueries(
    input
      .slice(0, MAX_SCRUB_INPUT)
      .replace(URL_PATTERN, '[url]')
      .replace(AMZ_PATTERN, '')
      .replace(EMAIL_PATTERN, '[email]'),
  ).replace(TOKEN_PATTERN, '[token]');
}

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** A single-line, scrubbed string of at most `max` characters (default 300). */
export function scrubMessage(input: string, max: number = MAX_MESSAGE): string {
  return cut(scrubText(input).replace(/\s+/g, ' ').trim(), max);
}

/** At most 8 scrubbed lines, each at most 200 characters, joined with \n. */
export function scrubStack(input: string): string {
  return scrubText(input)
    .split(/\r?\n/)
    .slice(0, MAX_STACK_LINES)
    .map((line) => cut(line.replace(/[\t\r]/g, ' ').trimEnd(), MAX_STACK_LINE))
    .join('\n');
}

/** A pathname only: no query, no fragment, scrubbed, at most 200 characters. */
export function scrubRoute(input: string): string {
  const pathOnly = input.split(/[?#]/, 1)[0] ?? '';
  return cut(scrubText(pathOnly).replace(/\s+/g, ''), MAX_ROUTE) || '/';
}

function currentPathname(): string {
  return typeof location !== 'undefined' && typeof location.pathname === 'string' ? location.pathname : '/';
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object' || typeof value === 'function') {
    try {
      const json = JSON.stringify(value);
      if (typeof json === 'string') return json;
    } catch {
      // fall through to the plain conversion
    }
  }
  try {
    return String(value);
  } catch {
    return 'unserializable value';
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * The only way a report is built. Returns exactly the eight schema fields: no user
 * agent, cookies, storage, query string or file names, whatever the error carries.
 */
export function buildReport(error: unknown, context: ReportContext): ClientErrorReport {
  let name: string;
  let message: string;
  let stack = '';
  const record = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null;
  const errorMessage = record ? stringField(record.message) : null;
  if (errorMessage !== null) {
    name = stringField(record?.name) || 'Error';
    message = errorMessage;
    stack = stringField(record?.stack) ?? '';
  } else {
    name = context.source === 'unhandledrejection' ? 'UnhandledRejection' : 'NonError';
    message = describeValue(error);
  }

  const digest = context.digest ?? (record ? stringField(record.digest) : null);

  return {
    v: 1,
    source: context.source,
    name: scrubMessage(name, MAX_NAME) || 'Error',
    message: scrubMessage(message),
    stack: scrubStack(stack),
    route: scrubRoute(context.route ?? currentPathname()),
    digest: digest ? scrubMessage(digest, MAX_DIGEST) : null,
    ts: Date.now(),
  };
}
