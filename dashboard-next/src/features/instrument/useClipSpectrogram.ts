'use client';

import { useEffect, useState } from 'react';
import { computeSpectrogram, parseWavPcm16, type SpectrogramMatrix } from './dsp';

/**
 * Clip loader for the spectrogram wells (DS-03, 04-13). Fetches a committed same-origin WAV,
 * parses it (PCM16, no resampling) and computes the fixed-range spectrogram, once per URL: the
 * result is cached in a module Map, so several wells and the audio engine share one transform.
 *
 * Only paths under /audio/ are fetched (T-04-13-02). They come from the committed audio manifest;
 * anything else (another origin, a protocol-relative URL, a `..` segment, a query) is refused
 * before any request is made.
 *
 * `buffer` is the raw file for the audio engine (plan 04-14). decodeAudioData detaches the buffer
 * it is given, so a consumer must pass `buffer.slice(0)` and leave this one intact.
 */

export interface LoadedClip {
  matrix: SpectrogramMatrix;
  /** Mono samples in [-1, 1), as parsed (not resampled). */
  samples: Float32Array;
  sampleRate: number;
  /** The file's bytes, untouched. */
  buffer: ArrayBuffer;
}

export type ClipSpectrogramState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; matrix: SpectrogramMatrix; samples: Float32Array; sampleRate: number; buffer: ArrayBuffer; error?: undefined }
  | { status: 'error'; error: Error };

/** Convenience shape of the hook result: every field optional except `status`. */
export type ClipSpectrogram = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  matrix?: SpectrogramMatrix;
  samples?: Float32Array;
  sampleRate?: number;
  buffer?: ArrayBuffer;
  error?: Error;
};

const CLIP_PATH = /^\/audio\/[A-Za-z0-9._/-]+\.wav$/;

/** True for a same-origin `/audio/...wav` path with no `..` segment, query or fragment. */
export function isClipPath(urlPath: string): boolean {
  return urlPath.startsWith('/audio/') && CLIP_PATH.test(urlPath) && !urlPath.slice(1).split('/').some((segment) => segment === '..' || segment === '');
}

const loaded = new Map<string, LoadedClip>();
const inFlight = new Map<string, Promise<LoadedClip>>();

/** Empties the per-URL cache (tests). */
export function clearClipCache(): void {
  loaded.clear();
  inFlight.clear();
}

async function fetchAndTransform(urlPath: string): Promise<LoadedClip> {
  const response = await fetch(urlPath);
  if (!response.ok) throw new Error(`The recording could not be loaded (HTTP ${response.status}).`);
  const buffer = await response.arrayBuffer();
  const wav = parseWavPcm16(buffer);
  const matrix = computeSpectrogram(wav.samples, wav.sampleRate);
  return { matrix, samples: wav.samples, sampleRate: wav.sampleRate, buffer };
}

/** Loads (or returns the cached) clip for a path under /audio/. A failure is not cached. */
export function loadClip(urlPath: string): Promise<LoadedClip> {
  if (!isClipPath(urlPath)) return Promise.reject(new Error('Only /audio/ recordings can be loaded.'));
  const cached = loaded.get(urlPath);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(urlPath);
  if (pending) return pending;

  const promise = fetchAndTransform(urlPath).then(
    (clip) => {
      loaded.set(urlPath, clip);
      inFlight.delete(urlPath);
      return clip;
    },
    (error: unknown) => {
      inFlight.delete(urlPath);
      throw error instanceof Error ? error : new Error('The recording could not be loaded.');
    },
  );
  inFlight.set(urlPath, promise);
  return promise;
}

function stateFor(urlPath: string | null): ClipSpectrogramState {
  if (urlPath === null) return { status: 'idle' };
  const clip = loaded.get(urlPath);
  return clip ? { status: 'ready', ...clip } : { status: 'loading' };
}

/**
 * The clip at `urlPath` as a spectrogram matrix, or idle for null. The first render reads the cache,
 * so a clip another well already loaded is ready immediately; otherwise it is loading until the one
 * shared fetch and transform finish.
 */
export function useClipSpectrogram(urlPath: string | null): ClipSpectrogram {
  const [state, setState] = useState<{ urlPath: string | null; value: ClipSpectrogramState }>(() => ({ urlPath, value: stateFor(urlPath) }));
  const current = state.urlPath === urlPath ? state.value : stateFor(urlPath);

  useEffect(() => {
    if (urlPath === null) return;
    let cancelled = false;
    loadClip(urlPath).then(
      (clip) => {
        if (!cancelled) setState({ urlPath, value: { status: 'ready', ...clip } });
      },
      (error: unknown) => {
        if (!cancelled) setState({ urlPath, value: { status: 'error', error: error instanceof Error ? error : new Error('The recording could not be loaded.') } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [urlPath]);

  return current;
}
