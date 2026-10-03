import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportClientError, resetReporterForTests } from '@/features/monitoring/report';

// All strings are fake.

function errorWithFrame(name: string, message: string, frame: string): Error {
  const error = new Error(message);
  error.name = name;
  error.stack = `${name}: ${message}\n    at ${frame} (<anonymous>:1:1)\n    at other (<anonymous>:2:2)`;
  return error;
}

describe('reportClientError', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
    resetReporterForTests();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });

  const post = (index = 0) => {
    const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
    return { url, init, body: JSON.parse(init.body as string) as Record<string, unknown> };
  };

  it('posts to exactly /api/client-error/ with keepalive and a JSON content type', () => {
    reportClientError(errorWithFrame('TypeError', 'boom', 'a'), { source: 'window-error', route: '/about/' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = post();
    expect(url).toBe('/api/client-error/');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(body.name).toBe('TypeError');
    expect(body.route).toBe('/about/');
  });

  it('sends five reports at most per page load', () => {
    for (let i = 0; i < 6; i++) {
      reportClientError(errorWithFrame(`Error${i}`, `boom ${i}`, `fn${i}`), { source: 'window-error', route: '/' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('does not spend the cap on ignored or de-duplicated reports', () => {
    const same = errorWithFrame('Error', 'same', 'dup');
    for (let i = 0; i < 20; i++) reportClientError(same, { source: 'window-error', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) {
      reportClientError(errorWithFrame(`Other${i}`, 'x', `fn${i}`), { source: 'window-error', route: '/' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('de-duplicates the same name and first frame within 60 s and reports again after', () => {
    const make = () => errorWithFrame('Error', 'boom', 'dup');
    reportClientError(make(), { source: 'window-error', route: '/' });
    reportClientError(make(), { source: 'window-error', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(59_000);
    reportClientError(make(), { source: 'window-error', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_000); // 61 s since the first report
    reportClientError(make(), { source: 'window-error', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps errors with the same name but a different first frame apart', () => {
    reportClientError(errorWithFrame('Error', 'a', 'one'), { source: 'window-error', route: '/' });
    reportClientError(errorWithFrame('Error', 'a', 'two'), { source: 'window-error', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps unrelated errors apart when their first frame is only a minified name with no location', () => {
    const bare = (message: string) => {
      const error = new TypeError(message);
      error.stack = `TypeError: ${message}\n    at e ([url]\n    at t ([url]`;
      return error;
    };
    reportClientError(bare("Cannot read properties of undefined (reading 'x')"), { source: 'window-error', route: '/' });
    reportClientError(bare("Cannot read properties of null (reading 'y')"), { source: 'window-error', route: '/' });
    reportClientError(bare("Cannot read properties of undefined (reading 'x')"), { source: 'window-error', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps string rejections with different text apart', () => {
    reportClientError('first reason', { source: 'unhandledrejection', route: '/' });
    reportClientError('second reason', { source: 'unhandledrejection', route: '/' });
    reportClientError('first reason', { source: 'unhandledrejection', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ignores ResizeObserver loop noise and the bare cross-origin Script error.', () => {
    reportClientError(new Error('ResizeObserver loop completed with undelivered notifications.'), { source: 'window-error', route: '/' });
    reportClientError(new Error('ResizeObserver loop limit exceeded'), { source: 'window-error', route: '/' });
    reportClientError({ name: 'Error', message: 'Script error.' }, { source: 'window-error', route: '/' });
    expect(fetchMock).not.toHaveBeenCalled();
    // A real message that merely contains the words is still reported.
    reportClientError(new Error('Parse failed: Script error. in module'), { source: 'window-error', route: '/' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('posts a non-Error rejection as UnhandledRejection with a scrubbed string message', () => {
    reportClientError('failed for visitor@example.com', { source: 'unhandledrejection', route: '/' });
    const { body } = post();
    expect(body.name).toBe('UnhandledRejection');
    expect(body.message).toBe('failed for [email]');
    expect(body.source).toBe('unhandledrejection');
  });

  it('scrubs before sending', () => {
    reportClientError(
      new Error('probe https://reef-bucket.s3.amazonaws.com/a.wav?X-Amz-Signature=abc123def456 visitor@example.com'),
      { source: 'window-error', route: '/sites/?q=1' }
    );
    const raw = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string;
    for (const forbidden of ['amazonaws', 'X-Amz', 'abc123def456', 'example.com', 'visitor@', '?q=1']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('never throws when fetch rejects and logs at most one console.error per page load', async () => {
    fetchMock.mockRejectedValue(new TypeError('network down'));
    for (let i = 0; i < 4; i++) {
      expect(() =>
        reportClientError(errorWithFrame(`E${i}`, 'm', `f${i}`), { source: 'window-error', route: '/' })
      ).not.toThrow();
    }
    await vi.runAllTimersAsync();
    expect(errorSpy.mock.calls.length).toBeLessThanOrEqual(1);
    // The failure line carries no request-derived text.
    for (const call of errorSpy.mock.calls) expect(String(call[0])).not.toContain('network down');
  });

  it('never throws when fetch throws synchronously or is missing', () => {
    fetchMock.mockImplementation(() => {
      throw new Error('sync failure');
    });
    expect(() => reportClientError(new Error('a'), { source: 'window-error', route: '/' })).not.toThrow();
    vi.stubGlobal('fetch', undefined);
    expect(() => reportClientError(new Error('b'), { source: 'window-error', route: '/other' })).not.toThrow();
    expect(errorSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('shows nothing to the visitor: no alert, no DOM change', () => {
    const before = document.body.innerHTML;
    reportClientError(new Error('quiet'), { source: 'window-error', route: '/' });
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelector('[role="alert"], [role="status"]')).toBeNull();
  });
});
