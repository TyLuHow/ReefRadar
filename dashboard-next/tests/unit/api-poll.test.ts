import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, AnalysisError } from '@/lib/api';

/**
 * pollAnalysis tests (01-16, D-15).
 *
 * Mocks global fetch directly -- pollAnalysis drives GET /status/{id} (and,
 * on completion/failure, GET /visualize/{id}) with backoff between polls,
 * so these tests run under fake timers and flush the backoff by advancing
 * them rather than waiting in real time.
 */

/** A gateway-style error response whose body is not JSON (HTML / empty). */
function nonJsonResponse(status: number): Response {
  return {
    ok: false,
    status,
    statusText: 'Bad Gateway',
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  } as unknown as Response;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    json: async () => body,
  } as Response;
}

describe('ApiClient.pollAnalysis', () => {
  let client: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new ApiClient('https://api.test');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Runs `promise` to completion, advancing fake timers to flush backoff waits. */
  async function flush<T>(promise: Promise<T>): Promise<T> {
    let settled = false;
    promise.then(
      () => (settled = true),
      () => (settled = true)
    );
    for (let i = 0; i < 25 && !settled; i++) {
      await vi.advanceTimersByTimeAsync(8000);
    }
    return promise;
  }

  it('polls /status through real stages and resolves with a single /visualize call', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ analysis_id: 'a1', stage: 'preprocessing', status: 'processing', progress: 'Processing audio file' })
      )
      .mockResolvedValueOnce(
        jsonResponse({ analysis_id: 'a1', stage: 'classifying', status: 'processing', progress: 'Classifying 4 audio segments' })
      )
      .mockResolvedValueOnce(jsonResponse({ analysis_id: 'a1', stage: 'complete', status: 'complete' }))
      .mockResolvedValueOnce(
        jsonResponse({
          analysis_id: 'a1',
          status: 'complete',
          classification: { label: 'healthy', confidence: 0.9, probabilities: { healthy: 0.9 } },
        })
      );

    const stages: string[] = [];
    const result = await flush(client.pollAnalysis('a1', { onStage: (info) => stages.push(info.stage) }));

    expect(stages).toEqual(['preprocessing', 'classifying']);
    expect(result.status).toBe('complete');
    const visualizeCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/visualize/'));
    expect(visualizeCalls).toHaveLength(1);
  });

  it('reports the fixed preprocessing label and the API classifying progress text', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ analysis_id: 'a1', stage: 'preprocessing', status: 'processing', progress: 'Processing audio file' })
      )
      .mockResolvedValueOnce(
        jsonResponse({ analysis_id: 'a1', stage: 'classifying', status: 'processing', progress: 'Classifying 4 audio segments' })
      )
      .mockResolvedValueOnce(jsonResponse({ analysis_id: 'a1', stage: 'complete', status: 'complete' }))
      .mockResolvedValueOnce(jsonResponse({ analysis_id: 'a1', status: 'complete' }));

    const labels: string[] = [];
    await flush(client.pollAnalysis('a1', { onStage: (info) => labels.push(info.label) }));

    expect(labels[0]).toMatch(/Preparing audio/);
    expect(labels[1]).toBe('Classifying 4 audio segments');
  });

  it('throws an AnalysisError with code, stage, message, suggestion and request_id on failure', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          analysis_id: 'a1',
          stage: 'classifying',
          status: 'failed',
          error: { code: 'CLASSIFY_FAILED', message: 'Model inference failed', suggestion: 'Please retry' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          analysis_id: 'a1',
          status: 'failed',
          error: {
            code: 'CLASSIFY_FAILED',
            message: 'Model inference failed',
            suggestion: 'Please retry',
            request_id: 'req-123',
          },
        })
      );

    await expect(flush(client.pollAnalysis('a1'))).rejects.toMatchObject({
      name: 'AnalysisError',
      code: 'CLASSIFY_FAILED',
      stage: 'classifying',
      message: 'Model inference failed',
      suggestion: 'Please retry',
      requestId: 'req-123',
    });
  });

  it('retries up to 5 consecutive 404s then throws an AnalysisError', async () => {
    for (let i = 0; i < 6; i++) {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: { code: 'ANALYSIS_NOT_FOUND', message: 'No analysis found' } }, 404)
      );
    }

    await expect(flush(client.pollAnalysis('missing'))).rejects.toBeInstanceOf(AnalysisError);
    const statusCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/status/'));
    expect(statusCalls).toHaveLength(6);
  });

  it('rejects promptly with an AbortError when the signal is aborted', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ analysis_id: 'a1', stage: 'preprocessing', status: 'processing', progress: 'Processing audio file' })
    );
    const controller = new AbortController();
    const promise = client.pollAnalysis('a1', { signal: controller.signal });
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
  });

  it('rejects with a timeout AnalysisError when maxWaitMs is exceeded', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ analysis_id: 'a1', stage: 'preprocessing', status: 'processing', progress: 'Processing audio file' })
    );

    await expect(flush(client.pollAnalysis('a1', { maxWaitMs: 1000 }))).rejects.toMatchObject({
      name: 'AnalysisError',
      code: 'TIMEOUT',
    });
  });

  it('survives a transient 503 (non-JSON body) and a network error while polling', async () => {
    fetchMock
      .mockResolvedValueOnce(nonJsonResponse(503))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ analysis_id: 'a1', stage: 'complete', status: 'complete' }))
      .mockResolvedValueOnce(jsonResponse({ analysis_id: 'a1', status: 'complete' }));

    const result = await flush(client.pollAnalysis('a1'));
    expect(result.status).toBe('complete');
  });

  it('gives up after more than 5 consecutive transient failures', async () => {
    fetchMock.mockResolvedValue(nonJsonResponse(502));
    await expect(flush(client.pollAnalysis('a1'))).rejects.toMatchObject({ status: 502 });
    const statusCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/status/'));
    expect(statusCalls).toHaveLength(6);
  });

  it('retries the result fetch after completion on a transient error', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ analysis_id: 'a1', stage: 'complete', status: 'complete' }))
      .mockResolvedValueOnce(nonJsonResponse(504))
      .mockResolvedValueOnce(jsonResponse({ analysis_id: 'a1', status: 'complete' }));
    const result = await flush(client.pollAnalysis('a1'));
    expect(result.status).toBe('complete');
  });
});

describe('ApiClient.uploadAudio', () => {
  it('percent-encodes non-Latin1 file names so the header cannot throw', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ upload_id: 'u1', status: 'uploaded' }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new ApiClient('https://api.test');
    const file = { name: '珊瑚礁 – 録音.wav', arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;

    await client.uploadAudio(file);

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-Filename']).toBe(encodeURIComponent('珊瑚礁 – 録音.wav'));
    expect(/^[ -~]*$/.test(headers['X-Filename'])).toBe(true);
  });
});
