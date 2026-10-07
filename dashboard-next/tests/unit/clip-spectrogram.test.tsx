/**
 * The clip loader behind every spectrogram well (04-13, DS-03, T-04-13-02): it fetches a committed
 * same-origin /audio/ WAV, parses and transforms it once per URL, and keeps the raw bytes for the
 * audio engine. Real excerpts only: the bytes served by the stubbed fetch are the committed ind_H1 file.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClipCache, isClipPath, loadClip, useClipSpectrogram } from '@/features/instrument/useClipSpectrogram';
import { SPECTROGRAM_SPEC } from '@/features/instrument';
import { WavFormatError } from '@/features/instrument/dsp';
import { getExcerpt } from '@/lib/audio-manifest';
import { readClipBuffer } from './support/clips';

const EXCERPT = getExcerpt('ind_H1_20220830_120000');

function okResponse(): Response {
  const buffer = readClipBuffer('ind_H1_20220830_120000');
  return { ok: true, status: 200, arrayBuffer: async () => buffer.slice(0) } as unknown as Response;
}

beforeEach(() => {
  clearClipCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isClipPath', () => {
  it('accepts a committed excerpt path', () => {
    expect(isClipPath(EXCERPT.url_path)).toBe(true);
    expect(isClipPath('/audio/marrs/ind_H1_20220830_120000.wav')).toBe(true);
  });

  it('refuses anything that is not a same-origin /audio/ wav path', () => {
    for (const bad of [
      '',
      'audio/marrs/a.wav',
      '/other/a.wav',
      'https://example.org/audio/a.wav',
      '//example.org/audio/a.wav',
      '/audio/../secret.wav',
      '/audio/a.wav?x=1',
      '/audio/a.wav#frag',
      '/audio/a.mp3',
      '/audio/a b.wav',
      '/audio\\a.wav',
    ]) {
      expect(isClipPath(bad), bad).toBe(false);
    }
  });
});

describe('loadClip', () => {
  it('fetches, parses and transforms a real excerpt, and keeps the raw bytes', async () => {
    const fetchMock = vi.fn(async (_url: string) => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const clip = await loadClip(EXCERPT.url_path);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(EXCERPT.url_path);
    expect(clip.sampleRate).toBe(EXCERPT.sample_rate_hz);
    expect(clip.samples.length).toBe(EXCERPT.sample_rate_hz * EXCERPT.duration_s);
    expect(clip.matrix.fftSize).toBe(SPECTROGRAM_SPEC.fftSize);
    expect(clip.matrix.dbMin).toBe(SPECTROGRAM_SPEC.dbMin);
    expect(clip.matrix.dbMax).toBe(SPECTROGRAM_SPEC.dbMax);
    expect(clip.matrix.durationSeconds).toBeCloseTo(EXCERPT.duration_s, 6);
    expect(clip.buffer.byteLength).toBe(EXCERPT.bytes);
  });

  it('shares one transform between callers of the same URL, concurrent or later', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([loadClip(EXCERPT.url_path), loadClip(EXCERPT.url_path)]);
    const c = await loadClip(EXCERPT.url_path);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('rejects a path outside /audio/ without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadClip('https://example.org/audio/a.wav')).rejects.toThrow(/\/audio\//);
    await expect(loadClip('/api/secret.wav')).rejects.toThrow(/\/audio\//);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects on a failed response and does not cache the failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) })
      .mockImplementation(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadClip(EXCERPT.url_path)).rejects.toThrow(/404/);
    const clip = await loadClip(EXCERPT.url_path);
    expect(clip.sampleRate).toBe(16000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects on bytes that are not a WAV', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(64) }) as unknown as Response),
    );
    await expect(loadClip(EXCERPT.url_path)).rejects.toThrow();
  });
});

/** A malformed-header fixture: a valid PCM16 header over `frames` mono frames of silence, no real audio. */
function wavWithFrames(frames: number, sampleRate = 16000): Response {
  const dataBytes = frames * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  return { ok: true, status: 200, arrayBuffer: async () => buffer } as unknown as Response;
}

describe('a recording too short to analyse (B WR-02)', () => {
  it.each([0, 1, SPECTROGRAM_SPEC.fftSize - 1])('rejects %i samples with a WavFormatError and caches nothing', async (frames) => {
    vi.stubGlobal('fetch', vi.fn(async () => wavWithFrames(frames)));
    await expect(loadClip(EXCERPT.url_path)).rejects.toBeInstanceOf(WavFormatError);
    await expect(loadClip(EXCERPT.url_path)).rejects.toThrow(/too short/);
  });

  it('accepts exactly one analysis window', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => wavWithFrames(SPECTROGRAM_SPEC.fftSize)));
    const clip = await loadClip(EXCERPT.url_path);
    expect(clip.matrix.frames).toBe(1);
  });

  it('rejects an out-of-range sample rate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => wavWithFrames(4096, 4_294_967_295)));
    await expect(loadClip(EXCERPT.url_path)).rejects.toBeInstanceOf(WavFormatError);
  });

  it('puts the hook in the error state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => wavWithFrames(0)));
    const { result } = renderHook(() => useClipSpectrogram(EXCERPT.url_path));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.matrix).toBeUndefined();
    expect(result.current.error?.message).toMatch(/too short/);
  });
});

describe('useClipSpectrogram', () => {
  it('is idle without a path', () => {
    const { result } = renderHook(() => useClipSpectrogram(null));
    expect(result.current.status).toBe('idle');
    expect(result.current.matrix).toBeUndefined();
  });

  it('goes loading then ready with the matrix, samples, rate and bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
    const { result } = renderHook(() => useClipSpectrogram(EXCERPT.url_path));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.matrix?.sampleRate).toBe(16000);
    expect(result.current.samples?.length).toBe(480000);
    expect(result.current.sampleRate).toBe(16000);
    expect(result.current.buffer?.byteLength).toBe(EXCERPT.bytes);
    expect(result.current.error).toBeUndefined();
  });

  it('reports an error for a refused path and for a failed fetch', async () => {
    const refused = renderHook(() => useClipSpectrogram('https://example.org/audio/a.wav'));
    await waitFor(() => expect(refused.result.current.status).toBe('error'));
    expect(refused.result.current.error).toBeInstanceOf(Error);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) })));
    const failed = renderHook(() => useClipSpectrogram(EXCERPT.url_path));
    await waitFor(() => expect(failed.result.current.status).toBe('error'));
  });
});
