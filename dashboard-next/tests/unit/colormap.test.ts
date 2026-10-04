// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MAGMA_LUT, computeSpectrogram, lutColor, matrixToImageData, parseWavPcm16 } from '@/features/instrument/dsp';
import type { SpectrogramMatrix } from '@/features/instrument/dsp';
import { readClipBuffer } from './support/clips';

/**
 * Magma lookup table and image builder (04-03). The matrices below are hand-made 3 x 4 grids of
 * quantised levels (placement tests); they are never rendered as a recording.
 */

function rgba(index: number): [number, number, number, number] {
  return [MAGMA_LUT[index * 4], MAGMA_LUT[index * 4 + 1], MAGMA_LUT[index * 4 + 2], MAGMA_LUT[index * 4 + 3]];
}

function hex(value: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

describe('MAGMA_LUT', () => {
  it('is a Uint8ClampedArray of 256 RGBA entries (1024 values)', () => {
    expect(MAGMA_LUT).toBeInstanceOf(Uint8ClampedArray);
    expect(MAGMA_LUT.length).toBe(1024);
  });

  it('starts at (0, 0, 4) and ends at (252, 253, 191), fully opaque', () => {
    expect(rgba(0)).toEqual([0, 0, 4, 255]);
    expect(rgba(255)).toEqual([252, 253, 191, 255]);
  });

  it.each([
    [0.25, '#51127C'],
    [0.5, '#B73779'],
    [0.75, '#FB8861'],
  ])('is within 2 per channel of the magma reference at t = %s', (t, reference) => {
    const got = rgba(Math.round(t * 255));
    const want = hex(reference);
    for (let c = 0; c < 3; c++) expect(Math.abs(got[c] - want[c]), `channel ${c}`).toBeLessThanOrEqual(2);
  });

  it('is monotonic in luminance (perceptually ordered, dark to light)', () => {
    let previous = -1;
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = rgba(i);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      expect(luminance).toBeGreaterThanOrEqual(previous - 1);
      previous = luminance;
    }
  });

  it('lutColor gives the rgb() string for a level and clamps out-of-range levels', () => {
    expect(lutColor(0)).toBe('rgb(0, 0, 4)');
    expect(lutColor(255)).toBe('rgb(252, 253, 191)');
    expect(lutColor(-5)).toBe(lutColor(0));
    expect(lutColor(999)).toBe(lutColor(255));
  });

  it('credits the CC0 source next to the code', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/features/instrument/dsp/colormap.ts'),
      'utf8',
    );
    expect(source).toContain('CC0');
    expect(source).toContain('Nathaniel J. Smith');
    expect(source).toContain('Stefan van der Walt');
  });
});

describe('matrixToImageData', () => {
  // 3 frames x 4 bins, level = frame * 10 + bin so every cell is identifiable.
  const frames = 3;
  const bins = 4;
  const data = new Uint8Array(frames * bins);
  for (let f = 0; f < frames; f++) for (let b = 0; b < bins; b++) data[f * bins + b] = f * 10 + b;
  const matrix: SpectrogramMatrix = {
    frames,
    bins,
    sampleRate: 16000,
    fftSize: 6,
    hop: 3,
    hopSeconds: 3 / 16000,
    durationSeconds: 0,
    dbMin: -120,
    dbMax: -50,
    data,
  };
  const image = matrixToImageData(matrix);

  it('is frames wide and bins tall', () => {
    expect(image.width).toBe(frames);
    expect(image.height).toBe(bins);
    expect(image.data).toBeInstanceOf(Uint8ClampedArray);
    expect(image.data.length).toBe(frames * bins * 4);
  });

  it('puts bin 0 (0 Hz) on the bottom row and frame 0 in the left column', () => {
    const pixel = (x: number, y: number) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
    expect(pixel(0, bins - 1)).toEqual(rgba(0)); // frame 0, bin 0
    expect(pixel(0, 0)).toEqual(rgba(3)); // frame 0, top bin
    expect(pixel(2, bins - 1)).toEqual(rgba(20)); // last frame, bin 0
    expect(pixel(2, 0)).toEqual(rgba(23)); // last frame, top bin
    expect(pixel(1, bins - 2)).toEqual(rgba(11)); // frame 1, bin 1
  });

  it('accepts a different lookup table', () => {
    const flat = new Uint8ClampedArray(1024).fill(7);
    const custom = matrixToImageData(matrix, flat);
    expect(Array.from(custom.data.slice(0, 4))).toEqual([7, 7, 7, 7]);
  });

  it('builds a full-size image from a real excerpt', () => {
    const wav = parseWavPcm16(readClipBuffer('ind_H1_20220830_120000'));
    const real = matrixToImageData(computeSpectrogram(wav.samples, wav.sampleRate));
    expect(real.width).toBe(1872);
    expect(real.height).toBe(513);
    expect(real.data.length).toBe(1872 * 513 * 4);
  });
});
