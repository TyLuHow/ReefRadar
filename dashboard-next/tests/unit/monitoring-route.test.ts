// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '@/features/monitoring/rate-limit';

// Every string below is fake: example.com hosts, made-up signatures.

const URL = 'http://localhost/api/client-error/';
// U+2028 and U+2029 built from code points so the source stays plain ASCII.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const LINE_BREAKS = new RegExp(`[\\n\\r${LS}${PS}]`);

function report(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    source: 'window-error',
    name: 'Error',
    message: 'boom',
    stack: 'Error: boom\n    at f (<anonymous>:1:1)',
    route: '/about/',
    digest: null,
    ts: 1_790_000_000_000,
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'localhost', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function freshPost(): Promise<(request: Request) => Promise<Response>> {
  vi.resetModules();
  const route = await import('@/app/api/client-error/route');
  return route.POST;
}

describe('POST /api/client-error/', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('is a dynamic Node route', async () => {
    const route = await import('@/app/api/client-error/route');
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.runtime).toBe('nodejs');
  });

  it('answers 204 for a valid report and logs exactly one single line', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc1234def5678');
    const POST = await freshPost();
    const response = await POST(post(report()));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = errorSpy.mock.calls[0] as [string];
    expect(typeof line).toBe('string');
    expect(line.startsWith('client-error ')).toBe(true);
    expect(line).not.toMatch(LINE_BREAKS);
    const logged = JSON.parse(line.slice('client-error '.length));
    expect(logged.evt).toBe('client-error');
    expect(logged.message).toBe('boom');
    expect(logged.route).toBe('/about/');
    expect(logged.build).toBe('abc1234def5678');
    expect(Object.keys(logged).sort()).toEqual(
      ['build', 'digest', 'evt', 'message', 'name', 'route', 'source', 'stack', 'ts', 'v'].sort()
    );
  });

  it('logs build null when VERCEL_GIT_COMMIT_SHA is absent', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    const POST = await freshPost();
    await POST(post(report()));
    const [line] = errorSpy.mock.calls[0] as [string];
    expect(JSON.parse(line.slice('client-error '.length)).build).toBeNull();
  });

  it('accepts a content type with a charset parameter', async () => {
    const POST = await freshPost();
    const response = await POST(post(report(), { 'content-type': 'application/json; charset=utf-8' }));
    expect(response.status).toBe(204);
  });

  it('rejects a non-JSON content type with 415 and logs nothing', async () => {
    const POST = await freshPost();
    const response = await POST(post(JSON.stringify(report()), { 'content-type': 'text/plain' }));
    expect(response.status).toBe(415);
    expect(await response.text()).toBe('');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects a 5000 byte body with 413', async () => {
    const POST = await freshPost();
    const response = await POST(post(report({ message: 'x'.repeat(5000) })));
    expect(response.status).toBe(413);
    expect(await response.text()).toBe('');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared content-length with 413 without reading the body', async () => {
    const POST = await freshPost();
    const response = await POST(post(report(), { 'content-length': '999999' }));
    expect(response.status).toBe(413);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects a streamed body over the cap with 413', async () => {
    const POST = await freshPost();
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 8) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const request = new Request(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('accepts a body just under the cap', async () => {
    const POST = await freshPost();
    // 8 stack lines of 200 characters is the largest legitimate report and is far below 4 KB.
    const stack = Array.from({ length: 8 }, () => 'y'.repeat(200)).join('\n');
    const response = await POST(post(report({ stack })));
    expect(response.status).toBe(204);
  });

  it('rejects an Origin whose host differs from Host with 403', async () => {
    const POST = await freshPost();
    const response = await POST(post(report(), { origin: 'https://evil.example', host: 'localhost' }));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects an opaque Origin with 403 and accepts a matching one', async () => {
    const POST = await freshPost();
    expect((await POST(post(report(), { origin: 'null' }))).status).toBe(403);
    expect((await POST(post(report(), { origin: 'http://localhost' }))).status).toBe(204);
  });

  it('rejects an unknown field with 400', async () => {
    const POST = await freshPost();
    const response = await POST(post(report({ userAgent: 'Mozilla/5.0 fake' })));
    expect(response.status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON, a wrong version, a bad source and a route with a query with 400', async () => {
    const POST = await freshPost();
    expect((await POST(post('{not json'))).status).toBe(400);
    expect((await POST(post(report({ v: 2 })))).status).toBe(400);
    expect((await POST(post(report({ source: 'other' })))).status).toBe(400);
    expect((await POST(post(report({ route: '/about/?q=visitor@example.com' })))).status).toBe(400);
    expect((await POST(post(report({ message: 'x'.repeat(301) })))).status).toBe(400);
    expect((await POST(post([]))).status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('scrubs a raw URL, email and token again before logging (server second pass)', async () => {
    const POST = await freshPost();
    const forged = report({
      name: 'Error visitor@example.com',
      message:
        'probe https://reef-bucket.s3.amazonaws.com/a.wav?X-Amz-Signature=abc123def456 visitor@example.com A1b2C3d4E5f6G7h8I9j0K1l2M3n4',
      stack: 'Error: x\n    at f (https://example.com/_next/a.js?v=1:1:2)',
      route: '/sites/A1b2C3d4E5f6G7h8I9j0K1l2M3n4',
      digest: 'visitor@example.com',
    });
    const response = await POST(post(forged));
    expect(response.status).toBe(204);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = errorSpy.mock.calls[0] as [string];
    for (const forbidden of ['amazonaws', 'X-Amz', 'abc123def456', 'example.com', 'visitor@', 'A1b2C3d4', '?v=1', '://']) {
      expect(line).not.toContain(forbidden);
    }
    const logged = JSON.parse(line.slice('client-error '.length));
    expect(logged.message).toBe('probe [url] [email] [token]');
    expect(logged.route).toBe('/sites/[token]');
    expect(logged.digest).toBe('[email]');
  });

  it('keeps a forged multi-line message on one log line', async () => {
    const POST = await freshPost();
    const message = ['line one', 'client-error {"evt":"forged"}', 'line three' + LS + 'more'].join('\n');
    await POST(post(report({ message })));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = errorSpy.mock.calls[0] as [string];
    expect(line).not.toMatch(LINE_BREAKS);
    // The forged text stays inside the message string of the one real entry; it cannot start a second entry.
    const logged = JSON.parse(line.slice('client-error '.length));
    expect(logged.evt).toBe('client-error');
    expect(logged.message).toContain('forged');
    expect(logged.message).not.toMatch(LINE_BREAKS);
  });

  it('answers 429 for the 31st request within a minute from a fresh module', async () => {
    const POST = await freshPost();
    for (let i = 0; i < 30; i++) {
      expect((await POST(post(report({ message: `m${i}` })))).status).toBe(204);
    }
    const limited = await POST(post(report()));
    expect(limited.status).toBe(429);
    expect(await limited.text()).toBe('');
    expect(errorSpy).toHaveBeenCalledTimes(30);

    // A fresh module (new instance) starts with a full bucket again.
    const fresh = await freshPost();
    expect((await fresh(post(report()))).status).toBe(204);
  });

  it('does not spend rate-limit tokens on rejected requests', async () => {
    const POST = await freshPost();
    for (let i = 0; i < 40; i++) await POST(post('{not json'));
    expect((await POST(post(report()))).status).toBe(204);
  });
});

describe('createRateLimiter', () => {
  it('allows capacity requests, denies the next and refills over time', () => {
    let now = 1_000_000;
    const limiter = createRateLimiter({ capacity: 3, refillPerMinute: 6, now: () => now });
    expect([limiter.tryTake(), limiter.tryTake(), limiter.tryTake()]).toEqual([true, true, true]);
    expect(limiter.tryTake()).toBe(false);

    now += 10_000; // 6 per minute is one token every 10 s
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake()).toBe(false);

    now += 60 * 60_000; // an hour later the bucket is full again, never above capacity
    expect([limiter.tryTake(), limiter.tryTake(), limiter.tryTake(), limiter.tryTake()]).toEqual([true, true, true, false]);
  });

  it('tolerates a clock that moves backwards', () => {
    let now = 5_000_000;
    const limiter = createRateLimiter({ capacity: 1, refillPerMinute: 60, now: () => now });
    expect(limiter.tryTake()).toBe(true);
    now -= 120_000;
    expect(limiter.tryTake()).toBe(false);
  });
});
