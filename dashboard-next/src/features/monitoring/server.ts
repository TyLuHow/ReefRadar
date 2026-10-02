import { clientErrorSchema, type ClientErrorPayload } from './schema';
import { scrubMessage, scrubRoute, scrubStack, MAX_DIGEST, MAX_NAME } from './scrub';

/**
 * Server half of the client error reporter (03-12, PLAT-09). Imported only by
 * app/api/client-error/route.ts; it is not exported through the client barrel.
 *
 * A valid report becomes exactly one single-line stderr entry,
 * `client-error {json}`, which Vercel runtime logs capture at error level.
 */

const LOG_PREFIX = 'client-error ';
// U+2028 and U+2029 are legal inside JSON strings, but some log pipelines treat them as line breaks.
const LINE_SEPARATORS = new RegExp('[\\u2028\\u2029]', 'g');

function empty(status: number): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
}

/** Second scrub on the server: never trust that the client ran the first one. */
function scrubPayload(payload: ClientErrorPayload): ClientErrorPayload {
  return {
    v: 1,
    source: payload.source,
    name: scrubMessage(payload.name, MAX_NAME) || 'Error',
    message: scrubMessage(payload.message),
    stack: scrubStack(payload.stack),
    route: scrubRoute(payload.route),
    digest: payload.digest ? scrubMessage(payload.digest, MAX_DIGEST) : null,
    ts: payload.ts,
  };
}

/** One line, always: JSON.stringify escapes newlines; U+2028/2029 are escaped too. */
function logLine(payload: ClientErrorPayload): string {
  const build = process.env.VERCEL_GIT_COMMIT_SHA;
  const json = JSON.stringify({ evt: 'client-error', ...payload, build: build ? build.slice(0, 40) : null });
  return LOG_PREFIX + json.replace(LINE_SEPARATORS, (ch) => '\\u' + ch.charCodeAt(0).toString(16));
}

export async function handleClientErrorPost(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json\s*(;|$)/i.test(contentType)) return empty(415);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await request.text());
  } catch {
    return empty(400);
  }
  const result = clientErrorSchema.safeParse(parsed);
  if (!result.success) return empty(400);

  console.error(logLine(scrubPayload(result.data)));
  return empty(204);
}
