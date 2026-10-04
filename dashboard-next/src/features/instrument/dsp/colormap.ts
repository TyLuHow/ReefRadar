/**
 * The magma colour scale as a 256-step lookup table, and the image builder that paints a
 * spectrogram matrix with it (DS-03).
 *
 * Source and licence: the magma colour map was designed by Nathaniel J. Smith and
 * Stefan van der Walt for matplotlib and released under CC0 (public domain dedication).
 * It is used here as packaged in d3-scale-chromatic (ISC licence, Mike Bostock / Observable),
 * sampled once at 256 points. The ramp is perceptually uniform and prints legibly in greyscale.
 */
import { interpolateMagma } from 'd3-scale-chromatic';
import type { SpectrogramMatrix } from './stft';

const LEVELS = 256;

/** Parses the colour string d3-scale-chromatic returns: `#rrggbb` (magma) or `rgb(r, g, b)`. */
function parseColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  const channels = color.match(/\d+(?:\.\d+)?/g);
  if (channels && channels.length >= 3) return [Number(channels[0]), Number(channels[1]), Number(channels[2])];
  return null;
}

function buildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(LEVELS * 4);
  for (let i = 0; i < LEVELS; i++) {
    const color = interpolateMagma(i / (LEVELS - 1));
    const rgb = parseColor(color);
    if (!rgb) throw new Error(`Unexpected magma colour string "${color}" at step ${i}`);
    lut[i * 4] = Math.round(rgb[0]);
    lut[i * 4 + 1] = Math.round(rgb[1]);
    lut[i * 4 + 2] = Math.round(rgb[2]);
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

/** 256 x RGBA, built once. Index = quantised level (0 = dbMin, 255 = dbMax). */
export const MAGMA_LUT: Uint8ClampedArray = buildLut();

/** `rgb(r, g, b)` for a quantised level, for DOM colourbars. Out-of-range levels clamp to the ends. */
export function lutColor(level: number): string {
  const i = Math.min(LEVELS - 1, Math.max(0, Math.round(level)));
  return `rgb(${MAGMA_LUT[i * 4]}, ${MAGMA_LUT[i * 4 + 1]}, ${MAGMA_LUT[i * 4 + 2]})`;
}

/**
 * RGBA pixels for a spectrogram: width = frames, height = bins, time left to right, and low
 * frequencies at the bottom (bin 0 is the last row).
 */
export function matrixToImageData(
  matrix: SpectrogramMatrix,
  lut: Uint8ClampedArray = MAGMA_LUT,
): { width: number; height: number; data: Uint8ClampedArray } {
  const { frames, bins } = matrix;
  const data = new Uint8ClampedArray(frames * bins * 4);
  for (let frame = 0; frame < frames; frame++) {
    const column = frame * bins;
    for (let bin = 0; bin < bins; bin++) {
      const row = bins - 1 - bin;
      const src = matrix.data[column + bin] * 4;
      const dst = (row * frames + frame) * 4;
      data[dst] = lut[src];
      data[dst + 1] = lut[src + 1];
      data[dst + 2] = lut[src + 2];
      data[dst + 3] = lut[src + 3];
    }
  }
  return { width: frames, height: bins, data };
}
