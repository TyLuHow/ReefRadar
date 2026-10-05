'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTokens } from '@/features/ui';
import { backingStoreSize } from './playhead';

/**
 * Waveform (DS-03, 04-13): the min/max envelope of a real clip in a dark well. One 1 px vertical
 * line per device-pixel column from that column's lowest to its highest sample, in the direction's
 * `well-ink` token (read through the token bridge, never a raw colour).
 *
 * The vertical range is one fixed value for every clip, `WAVEFORM_RANGE` of full scale, so two
 * waveforms side by side are comparable by eye and nothing is scaled per clip. Real hydrophone
 * excerpts sit far below full scale (RMS between about -67 and -47 dB re full scale), so most of the
 * picture is a thin line with the occasional peak; a peak beyond the range is cut off in the picture.
 * Levels are relative to the file's full scale and uncalibrated.
 */

/** Half the vertical extent of the well, as a fraction of full scale (0.25 is -12 dB re full scale). */
export const WAVEFORM_RANGE = 0.25;

/**
 * Per-column minimum and maximum of `samples` for `columns` columns. Every column covers at least
 * one sample (with fewer samples than columns, neighbouring columns repeat a sample), and an empty
 * clip is all zeros.
 */
export function waveformEnvelope(samples: Float32Array, columns: number): { min: Float32Array; max: Float32Array } {
  const count = Math.max(0, Math.floor(columns));
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  const total = samples.length;
  if (total === 0) return { min, max };
  for (let c = 0; c < count; c++) {
    const start = Math.min(total - 1, Math.floor((c * total) / count));
    const end = Math.min(total, Math.max(start + 1, Math.floor(((c + 1) * total) / count)));
    let low = samples[start];
    let high = samples[start];
    for (let i = start + 1; i < end; i++) {
      const value = samples[i];
      if (value < low) low = value;
      if (value > high) high = value;
    }
    min[c] = low;
    max[c] = high;
  }
  return { min, max };
}

export interface WaveformProps {
  /** Mono samples in [-1, 1) of a real recording. */
  samples: Float32Array;
  sampleRate: number;
  /** Plain-text metadata description (duration, rate, RMS level from the manifest); never health, species or behaviour. */
  description: string;
  /** Well height in CSS pixels. */
  height?: number;
  className?: string;
}

const CAPTION = `Waveform of the whole clip. The vertical range is fixed at ±${WAVEFORM_RANGE} of full scale for every clip, and a peak beyond it is cut off in the picture. Levels are relative, not calibrated.`;

function formatDuration(seconds: number): string {
  return String(Number(seconds.toFixed(1)));
}

export function Waveform({ samples, sampleRate, description, height = 120, className }: WaveformProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const { tokens } = useTokens(wrapperRef);
  const summaryId = useId();
  const captionId = useId();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const size = sizeRef.current;
    if (!canvas || !size || !tokens) return;
    const store = backingStoreSize(size.width, size.height, window.devicePixelRatio);
    if (canvas.width !== store.width) canvas.width = store.width;
    if (canvas.height !== store.height) canvas.height = store.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setUnsupported(true);
      return;
    }
    const { width, height: h } = store;
    ctx.clearRect(0, 0, width, h);
    ctx.fillStyle = tokens['well-rule'];
    ctx.fillRect(0, Math.floor(h / 2), width, 1);
    ctx.fillStyle = tokens['well-ink'];
    const { min, max } = waveformEnvelope(samples, width);
    for (let column = 0; column < width; column++) {
      const low = Math.max(-1, Math.min(1, min[column] / WAVEFORM_RANGE));
      const high = Math.max(-1, Math.min(1, max[column] / WAVEFORM_RANGE));
      const top = Math.round(((1 - high) / 2) * h);
      const bottom = Math.round(((1 - low) / 2) * h);
      ctx.fillRect(column, top, 1, Math.max(1, bottom - top));
    }
    setReady(true);
  }, [samples, tokens]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot) return;
    const measure = (width: number, h: number) => {
      if (width <= 0 || h <= 0) return;
      sizeRef.current = { width, height: h };
      draw();
    };
    if (typeof ResizeObserver === 'undefined') {
      const rect = plot.getBoundingClientRect();
      measure(rect.width, rect.height);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) measure(rect.width, rect.height);
    });
    observer.observe(plot);
    return () => observer.disconnect();
  }, [draw]);

  if (unsupported) {
    return (
      <div role="status" data-waveform-state="unsupported" className={className}>
        <div className="flex flex-col justify-center gap-1 rounded-surface bg-well p-4" style={{ height: `${height}px` }}>
          <p className="text-small text-well-ink">This browser cannot draw the waveform.</p>
        </div>
      </div>
    );
  }

  const duration = samples.length / sampleRate;
  const khz = Number((sampleRate / 1000).toFixed(3));

  return (
    <div
      data-waveform=""
      data-ready={ready ? 'true' : 'false'}
      role="img"
      aria-label={`Waveform, ${formatDuration(duration)} seconds at ${khz} kHz`}
      aria-describedby={`${summaryId} ${captionId}`}
      ref={wrapperRef}
      className={className}
    >
      <div className="rounded-surface bg-well" style={{ height: `${height}px` }}>
        <div ref={plotRef} className="relative h-full w-full overflow-hidden rounded-surface">
          <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
        </div>
      </div>
      <p id={summaryId} className="sr-only">
        {description}
      </p>
      <p id={captionId} className="mt-2 text-small text-muted">
        {CAPTION}
      </p>
    </div>
  );
}
