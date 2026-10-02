// ReefRadar API Client

import {
  HealthResponse,
  UploadResponse,
  AnalyzeResponse,
  AnalysisResult,
  StatusResponse,
  StageInfo,
  ApiError,
  SamplesResponse,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod';

/** Error raised by fetch() itself or a non-ok response, carrying the HTTP status (D-15). */
type HttpError = Error & { status?: number };

// D-15: fixed label for preprocessing (the API's own progress text for this
// stage is a generic "Processing audio file" -- this is more specific about
// what is actually happening); classifying always uses the API's own
// progress text (it carries the real segment count); complete is unused by
// pollAnalysis (it resolves before calling onStage for that stage).
const STAGE_LABELS: Record<string, string> = {
  preprocessing: 'Preparing audio: decoding, resampling to 32 kHz and cutting 5-second segments',
  complete: 'Complete',
};

/**
 * Error thrown by pollAnalysis on a failed analysis or a timeout/not-found
 * condition. Carries everything the UI needs to show an actionable error
 * (D-15): the API's own message and suggestion, the stage it failed at, and
 * the request id for support (read from /visualize's error payload -- the
 * /status error does not carry it).
 */
export class AnalysisError extends Error {
  code?: string;
  stage?: string;
  suggestion?: string;
  requestId?: string;

  constructor(
    message: string,
    options: { code?: string; stage?: string; suggestion?: string; requestId?: string } = {}
  ) {
    super(message);
    this.name = 'AnalysisError';
    this.code = options.code;
    this.stage = options.stage;
    this.suggestion = options.suggestion;
    this.requestId = options.requestId;
  }
}

export interface PollAnalysisOptions {
  /** Called whenever /status reports a new processing stage (preprocessing, classifying). */
  onStage?: (info: StageInfo) => void;
  /** Aborts polling; pollAnalysis rejects promptly with an AbortError. */
  signal?: AbortSignal;
  /** Hard ceiling on total wait time before rejecting with a timeout AnalysisError. Default 180000ms. */
  maxWaitMs?: number;
}

/** Max consecutive transient failures (5xx/429/network) tolerated while polling. */
const MAX_CONSECUTIVE_TRANSIENT_ERRORS = 5;

/**
 * A failure worth retrying while polling: API Gateway 5xx/429 (the DEPLOY-LOG
 * shows 502/503/504 under the concurrency limit) or a network-level fetch
 * failure (a TypeError with no HTTP status). A 1-second blip must not kill a
 * multi-minute analysis the user already waited for (REVIEW WR-13).
 */
function isTransientError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const status = (err as HttpError | undefined)?.status;
  return status !== undefined && (status === 429 || status >= 500);
}

function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException && err.name === 'AbortError';
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      // Parse defensively: a gateway 502/503/504 returns an HTML or empty body,
      // which must surface as an HTTP error with a status (retryable), not as a
      // status-less SyntaxError.
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const error = (data ?? {}) as ApiError;
        const httpError: HttpError = new Error(
          error.error?.message || `HTTP ${response.status}: ${response.statusText}`
        );
        httpError.status = response.status;
        throw httpError;
      }

      if (data === null) {
        const httpError: HttpError = new Error('The API returned an unreadable response');
        httpError.status = response.status;
        throw httpError;
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('An unexpected error occurred');
    }
  }

  // Health check
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // Get gallery samples + stories
  // recovered from the deployed bundle (module 92800) on 2026-10-01 per D-02 —
  // this method already exists in the live deployed api.ts; git's api.ts did not have it.
  async getSamples(): Promise<SamplesResponse> {
    return this.request<SamplesResponse>('/samples');
  }

  // Upload audio file
  async uploadAudio(file: File): Promise<UploadResponse> {
    const arrayBuffer = await file.arrayBuffer();

    return this.request<UploadResponse>('/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
        // HTTP header values must be ISO-8859-1: encode so non-Latin1 file names
        // (e.g. Japanese/Chinese) do not throw before the request is sent. The
        // router decodes and sanitises it.
        'X-Filename': encodeURIComponent(file.name),
      },
      body: arrayBuffer,
    });
  }

  // Start analysis (with optional coordinates for region detection)
  async startAnalysis(
    uploadId: string,
    latitude?: number,
    longitude?: number
  ): Promise<AnalyzeResponse> {
    const payload: Record<string, unknown> = { upload_id: uploadId };
    if (latitude !== undefined) payload.latitude = latitude;
    if (longitude !== undefined) payload.longitude = longitude;

    return this.request<AnalyzeResponse>('/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  // Get processing status
  async getStatus(analysisId: string): Promise<StatusResponse> {
    return this.request<StatusResponse>(`/status/${analysisId}`);
  }

  // Get analysis results (poll this endpoint)
  async getAnalysisResult(analysisId: string): Promise<AnalysisResult> {
    return this.request<AnalysisResult>(`/visualize/${analysisId}`);
  }

  /**
   * Poll GET /status/{id} until the analysis completes or fails (D-15).
   *
   * Reports the real pipeline stage via onStage as it progresses (no
   * invented percentages); on completion, calls GET /visualize/{id}
   * exactly once and resolves with that result; on failure, throws an
   * AnalysisError carrying the API's own message/suggestion/request id.
   */
  async pollAnalysis(
    analysisId: string,
    options: PollAnalysisOptions = {}
  ): Promise<AnalysisResult> {
    const { onStage, signal, maxWaitMs = 180000 } = options;
    const startedAt = Date.now();
    let delayMs = 2000;
    let consecutive404s = 0;
    let consecutiveTransient = 0;

    const wait = (ms: number): Promise<void> =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(abortError());
          },
          { once: true }
        );
      });

    while (true) {
      if (signal?.aborted) throw abortError();

      if (Date.now() - startedAt > maxWaitMs) {
        throw new AnalysisError('Analysis timed out', {
          code: 'TIMEOUT',
          suggestion: 'The analysis is taking longer than expected. Please try again.',
        });
      }

      let status: StatusResponse;
      try {
        status = await this.getStatus(analysisId);
        consecutive404s = 0;
        consecutiveTransient = 0;
      } catch (err) {
        if (isAbortError(err)) throw err;
        const httpStatus = (err as HttpError).status;
        if (isTransientError(err)) {
          consecutiveTransient++;
          if (consecutiveTransient > MAX_CONSECUTIVE_TRANSIENT_ERRORS) throw err;
          await wait(delayMs);
          delayMs = Math.min(delayMs * 1.5, 8000);
          continue;
        }
        if (httpStatus === 404) {
          consecutive404s++;
          if (consecutive404s > 5) {
            throw new AnalysisError('Analysis not found', {
              code: 'ANALYSIS_NOT_FOUND',
              suggestion: 'Please try starting a new analysis.',
            });
          }
          await wait(delayMs);
          delayMs = Math.min(delayMs * 1.5, 8000);
          continue;
        }
        throw err;
      }

      if (status.status === 'complete' || status.stage === 'complete') {
        // The analysis is done: do not lose it to a transient blip on the
        // result fetch -- retry a few times before giving up.
        for (let attempt = 0; ; attempt++) {
          try {
            return await this.getAnalysisResult(analysisId);
          } catch (err) {
            if (isAbortError(err) || !isTransientError(err) || attempt >= 3) throw err;
            await wait(delayMs);
          }
        }
      }

      if (status.status === 'failed') {
        let requestId: string | undefined;
        let message = status.error?.message ?? 'Analysis failed';
        let suggestion = status.error?.suggestion;
        let code = status.error?.code;
        try {
          const viz = await this.getAnalysisResult(analysisId);
          if (viz.error && typeof viz.error === 'object') {
            requestId = viz.error.request_id;
            message = viz.error.message ?? message;
            suggestion = suggestion ?? viz.error.suggestion;
            code = code ?? viz.error.code;
          }
        } catch {
          // /visualize unavailable -- fall back to /status's fields only.
        }
        throw new AnalysisError(message, { code, stage: status.stage, suggestion, requestId });
      }

      // processing: preprocessing or classifying
      if (onStage) {
        const label =
          status.stage === 'classifying'
            ? status.progress || 'Classifying audio segments'
            : STAGE_LABELS[status.stage] || status.progress || status.stage;
        onStage({ stage: status.stage, label, progress: status.progress });
      }

      await wait(delayMs);
      delayMs = Math.min(delayMs * 1.5, 8000);
    }
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing or custom instances
export { ApiClient };
