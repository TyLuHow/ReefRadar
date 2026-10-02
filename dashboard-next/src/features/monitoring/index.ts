/**
 * Client error reporting (PLAT-09). Client-safe barrel: the server half
 * (schema, limiter, log line) lives in ./server and is imported only by
 * app/api/client-error/route.ts.
 */
export { reportClientError, CLIENT_ERROR_ENDPOINT } from './report';
export { ClientErrorReporter } from './ClientErrorReporter';
export { buildReport } from './scrub';
export type { ClientErrorReport, ReportContext, ReportSource } from './scrub';
