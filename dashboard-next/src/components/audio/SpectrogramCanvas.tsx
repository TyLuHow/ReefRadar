'use client';

import { useRef, useEffect, useCallback } from 'react';

interface SpectrogramProps {
  analyser: AnalyserNode | null;
  width?: number;
  height?: number;
  colorPalette?: 'ocean' | 'thermal' | 'grayscale';
  showFrequencyLabels?: boolean;
  className?: string;
}

/** Map a normalised dB value (0-1) to an [r,g,b] triple. */
function mapColor(
  value: number,
  palette: 'ocean' | 'thermal' | 'grayscale',
): [number, number, number] {
  const v = Math.max(0, Math.min(1, value));

  if (palette === 'grayscale') {
    const c = Math.floor(v * 255);
    return [c, c, c];
  }

  // Shared 5-stop colour ramp
  //   ocean:   dark-blue -> blue -> cyan -> yellow -> red
  //   thermal: dark-blue -> cyan -> yellow -> orange -> red
  type Stop = { pos: number; r: number; g: number; b: number };

  const ramps: Record<'ocean' | 'thermal', Stop[]> = {
    ocean: [
      { pos: 0.0, r: 10, g: 10, b: 46 },
      { pos: 0.25, r: 26, g: 58, b: 138 },
      { pos: 0.5, r: 0, g: 229, b: 255 },
      { pos: 0.75, r: 255, g: 215, b: 0 },
      { pos: 1.0, r: 255, g: 107, b: 107 },
    ],
    thermal: [
      { pos: 0.0, r: 10, g: 10, b: 46 },
      { pos: 0.25, r: 0, g: 229, b: 255 },
      { pos: 0.5, r: 255, g: 215, b: 0 },
      { pos: 0.75, r: 255, g: 140, b: 0 },
      { pos: 1.0, r: 255, g: 107, b: 107 },
    ],
  };

  const stops = ramps[palette];

  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i].pos && v <= stops[i + 1].pos) {
      const t = (v - stops[i].pos) / (stops[i + 1].pos - stops[i].pos);
      return [
        Math.round(stops[i].r + t * (stops[i + 1].r - stops[i].r)),
        Math.round(stops[i].g + t * (stops[i + 1].g - stops[i].g)),
        Math.round(stops[i].b + t * (stops[i + 1].b - stops[i].b)),
      ];
    }
  }

  const last = stops[stops.length - 1];
  return [last.r, last.g, last.b];
}

const FREQ_LABELS = [100, 500, 1000, 2000, 4000, 8000, 16000];

export function SpectrogramCanvas({
  analyser,
  width: propWidth,
  height = 200,
  colorPalette = 'ocean',
  showFrequencyLabels = true,
  className,
}: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const waterfallRef = useRef<ImageData | null>(null);

  const resolvedWidth = propWidth ?? 600;

  // We track the actual rendered width to handle resize
  const renderedWidthRef = useRef(resolvedWidth);

  // Handle ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container || propWidth !== undefined) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w > 0) {
          renderedWidthRef.current = w;
          const canvas = canvasRef.current;
          if (canvas && canvas.width !== w) {
            canvas.width = w;
            // Reset waterfall when resized
            waterfallRef.current = null;
          }
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [propWidth]);

  // Set initial canvas width from prop
  useEffect(() => {
    if (propWidth !== undefined) {
      renderedWidthRef.current = propWidth;
    }
  }, [propWidth]);

  // Main render loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;

    const bufLen = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufLen);
    analyser.getFloatFrequencyData(dataArray);

    const minDb = analyser.minDecibels;
    const maxDb = analyser.maxDecibels;
    const dbRange = maxDb - minDb;

    // Shift existing waterfall image one pixel left
    const existingImage = waterfallRef.current;
    if (existingImage && existingImage.width === cw && existingImage.height === ch) {
      // Draw shifted
      ctx.putImageData(existingImage, -1, 0);
    }

    // Draw new column on the right edge
    const nyquist = (analyser.context?.sampleRate ?? 44100) / 2;
    const columnImage = ctx.createImageData(1, ch);

    for (let y = 0; y < ch; y++) {
      // y=0 is top = high frequency, y=ch-1 is bottom = low frequency
      const freqFrac = 1 - y / ch;

      // Log-scale mapping: map freqFrac (0..1 linear) to log frequency
      const minLogFreq = Math.log10(20);
      const maxLogFreq = Math.log10(nyquist);
      const logFreq = minLogFreq + freqFrac * (maxLogFreq - minLogFreq);
      const freq = Math.pow(10, logFreq);

      // Find the corresponding FFT bin
      const binIndex = Math.round((freq / nyquist) * (bufLen - 1));
      const clampedBin = Math.max(0, Math.min(bufLen - 1, binIndex));

      const db = dataArray[clampedBin];
      const normalised = Math.max(0, Math.min(1, (db - minDb) / dbRange));
      const [r, g, b] = mapColor(normalised, colorPalette);

      const pixelIndex = y * 4;
      columnImage.data[pixelIndex] = r;
      columnImage.data[pixelIndex + 1] = g;
      columnImage.data[pixelIndex + 2] = b;
      columnImage.data[pixelIndex + 3] = 255;
    }

    // Place the column at the rightmost pixel
    ctx.putImageData(columnImage, cw - 1, 0);

    // Cache the full canvas for the next shift
    waterfallRef.current = ctx.getImageData(0, 0, cw, ch);

    animFrameRef.current = requestAnimationFrame(draw);
  }, [analyser, colorPalette]);

  // Start / stop the loop when analyser changes
  useEffect(() => {
    if (analyser) {
      animFrameRef.current = requestAnimationFrame(draw);
    }

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [analyser, draw]);

  // Clear waterfall when analyser disconnects
  useEffect(() => {
    if (!analyser) {
      waterfallRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [analyser]);

  const labelWidth = showFrequencyLabels ? 50 : 0;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', display: 'flex' }}
    >
      {showFrequencyLabels && (
        <div
          style={{
            width: labelWidth,
            height,
            position: 'relative',
            flexShrink: 0,
            fontSize: 10,
            color: '#6b8aad',
            userSelect: 'none',
          }}
        >
          {FREQ_LABELS.map((freq) => {
            const nyquist =
              (analyser?.context?.sampleRate ?? 44100) / 2;
            const minLog = Math.log10(20);
            const maxLog = Math.log10(nyquist);
            const freqLog = Math.log10(Math.min(freq, nyquist));
            const frac = (freqLog - minLog) / (maxLog - minLog);
            const top = (1 - frac) * height;

            if (frac < 0 || frac > 1) return null;

            const label =
              freq >= 1000 ? `${freq / 1000}k` : `${freq}`;

            return (
              <span
                key={freq}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: top - 6,
                  lineHeight: '12px',
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={propWidth ?? renderedWidthRef.current}
        height={height}
        style={{
          flex: 1,
          borderRadius: 4,
          background: '#0a0a2e',
        }}
      />
    </div>
  );
}
