import { buildReport, type ClientErrorReport, type ReportContext } from './scrub';

/**
 * Client reporter (03-12, PLAT-09). Silent and best effort: it adds no UI, never
 * tells the visitor anything, and never throws.
 *
 * Bounds: at most 5 reports per page load, the same name plus first stack frame
 * is sent once per 60 s, and two kinds of browser noise are ignored.
 *
 * The path keeps its trailing slash on purpose: with trailingSlash true the
 * slash-less path answers 308 and a POST would be redirected.
 */
export const CLIENT_ERROR_ENDPOINT = '/api/client-error/';

const MAX_REPORTS_PER_PAGE_LOAD = 5;
const DEDUPE_WINDOW_MS = 60_000;

let sent = 0;
const lastSentAt = new Map<string, number>();
let failureLogged = false;

/** Test-only: a page load starts with a clean slate. */
export function resetReporterForTests(): void {
  sent = 0;
  lastSentAt.clear();
  failureLogged = false;
}

/** Browser noise that says nothing a developer can act on. */
function isNoise(report: ClientErrorReport): boolean {
  const message = report.message.trim();
  return message.startsWith('ResizeObserver loop') || message === 'Script error.' || message === 'Script error';
}

/** Name plus first stack frame; with no frame (a string rejection) the message stands in for it. */
function fingerprint(report: ClientErrorReport): string {
  const frame =
    report.stack.split('\n').find((line, index) => index > 0 && /^\s*at\s|@/.test(line)) ?? report.message;
  return `${report.name}|${frame.trim()}`;
}

function logFailureOnce(): void {
  if (failureLogged) return;
  failureLogged = true;
  console.error('Client error reporting is unavailable.');
}

export function reportClientError(error: unknown, context: ReportContext): void {
  try {
    const report = buildReport(error, context);
    if (isNoise(report)) return;

    const now = Date.now();
    const key = fingerprint(report);
    const previous = lastSentAt.get(key);
    if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return;
    if (sent >= MAX_REPORTS_PER_PAGE_LOAD) return;

    sent += 1;
    lastSentAt.set(key, now);
    fetch(CLIENT_ERROR_ENDPOINT, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(logFailureOnce);
  } catch {
    // swallowed: reporting must never become a second error
    logFailureOnce();
  }
}
