import { createRateLimiter } from './rate-limit';
import { clientErrorSchema, type ClientErrorPayload } from './schema';
import { scrubMessage, scrubRoute, scrubStack, MAX_DIGEST, MAX_NAME } from './scrub';

const MAX_BODY_BYTES = 4096;

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

/** Per-instance bucket: 30 reports a minute. Best effort on serverless (each warm instance has its own). */
const limiter = createRateLimiter({ capacity: 30, refillPerMinute: 30 });

/** A present Origin must name the host the request was sent to; "null" and unparseable values fail. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  let host = request.headers.get('host');
  if (!host) {
    try {
      host = new URL(request.url).host;
    } catch {
      return false;
    }
  }
  return originHost.toLowerCase() === host.toLowerCase();
}

type BodyResult = { ok: true; text: string } | { ok: false };

/** Reads at most MAX_BODY_BYTES; stops pulling the stream as soon as the cap is passed. */
async function readCappedBody(request: Request): Promise<BodyResult> {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) return { ok: false };
  if (request.body === null) return { ok: true, text: '' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}

/**
 * Check order: Origin (403), content type (415), size (413), JSON and strict
 * schema (400), rate limit (429), then scrub, log one line, 204. Rejections
 * carry an empty body; nothing from the request is echoed back.
 */
export async function handleClientErrorPost(request: Request): Promise<Response> {
  try {
    if (!isSameOrigin(request)) return empty(403);

    const contentType = request.headers.get('content-type') ?? '';
    if (!/^application\/json\s*(;|$)/i.test(contentType)) return empty(415);

    const body = await readCappedBody(request);
    if (!body.ok) return empty(413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      return empty(400);
    }
    const result = clientErrorSchema.safeParse(parsed);
    if (!result.success) return empty(400);

    // Spent only on well-formed reports, so a stream of garbage cannot starve real ones.
    if (!limiter.tryTake()) return empty(429);

    console.error(logLine(scrubPayload(result.data)));
    return empty(204);
  } catch {
    // Never surface or log request-derived text from an unexpected failure.
    return empty(500);
  }
}
