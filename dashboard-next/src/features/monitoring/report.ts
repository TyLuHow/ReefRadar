import { buildReport, type ReportContext } from './scrub';

/**
 * Client reporter (03-12, PLAT-09). Silent and best effort: it adds no UI, never
 * tells the visitor anything, and never throws.
 *
 * The path keeps its trailing slash on purpose: with trailingSlash true the
 * slash-less path answers 308 and a POST would be redirected.
 */
export const CLIENT_ERROR_ENDPOINT = '/api/client-error/';

export function reportClientError(error: unknown, context: ReportContext): void {
  try {
    const report = buildReport(error, context);
    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => {});
  } catch {
    // swallowed: reporting must never become a second error
  }
}
