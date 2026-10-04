// @vitest-environment node
import FFT from 'fft.js';
import { describe, expect, it } from 'vitest';
import {
  SPECTROGRAM_SPEC,
  binHz,
  computeSpectrogram,
  dbAt,
  frameMagnitudes,
  parseWavPcm16,
} from '@/features/instrument/dsp';
import { readClipBuffer } from './support/clips';

/**
 * STFT and fixed-range quantisation (04-03). Real excerpts are transformed from disk.
 * The sine and the 16-point vector are maths test vectors only: they are never rendered, played
 * or labelled as a recording.
 */

const IND_H1 = 'ind_H1_20220830_120000';
const clip = () => parseWavPcm16(readClipBuffer(IND_H1));

describe('spec constant', () => {
  it('holds the analysis parameters in one place', () => {
    expect(SPECTROGRAM_SPEC).toMatchObject({
      fftSize: 1024,
      hop: 256,
      window: 'hann',
      dbMin: -120,
      dbMax: -50,
      scale: 'magma',
      calibrated: false,
    });
  });
});

describe('fft.js against a naive DFT', () => {
  it('realTransform magnitudes equal a naive DFT on a 16-point vector within 1e-9', () => {
    const n = 16;
    const x = Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + 0.25 * Math.cos(i * 0.4) + (i % 3) - 1);
    const fft = new FFT(n);
    const out = fft.createComplexArray();
    fft.realTransform(out, x);
    fft.completeSpectrum(out);
    for (let k = 0; k <= n / 2; k++) {
      let re = 0;
      let im = 0;
      for (let t = 0; t < n; t++) {
        re += x[t] * Math.cos((2 * Math.PI * k * t) / n);
        im -= x[t] * Math.sin((2 * Math.PI * k * t) / n);
      }
      expect(Math.abs(out[2 * k] - re)).toBeLessThan(1e-9);
      expect(Math.abs(out[2 * k + 1] - im)).toBeLessThan(1e-9);
    }
  });
});

describe('normalisation: dB re full scale', () => {
  it('a full-scale sine at an exact bin centre reads 0 dB within 0.1 dB at that bin', () => {
    const sampleRate = 16000;
    const bin = 64; // 1000 Hz at fftSize 1024
    const hz = (bin * sampleRate) / SPECTROGRAM_SPEC.fftSize;
    const samples = Float32Array.from({ length: 4096 }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sampleRate));
    let checked = 0;
    frameMagnitudes(samples, sampleRate, SPECTROGRAM_SPEC, (_frame, mags) => {
      expect(Math.abs(20 * Math.log10(mags[bin]))).toBeLessThan(0.1);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });
});

describe('computeSpectrogram on the ind_H1 excerpt', () => {
  const wav = clip();
  const matrix = computeSpectrogram(wav.samples, wav.sampleRate);

  it('has floor((480000 - 1024) / 256) + 1 = 1872 frames and 513 bins', () => {
    expect(matrix.frames).toBe(1872);
    expect(matrix.bins).toBe(513);
    expect(matrix.data).toBeInstanceOf(Uint8Array);
    expect(matrix.data.length).toBe(1872 * 513);
    expect(matrix.sampleRate).toBe(16000);
    expect(matrix.fftSize).toBe(1024);
    expect(matrix.hop).toBe(256);
    expect(matrix.hopSeconds).toBeCloseTo(256 / 16000, 12);
    expect(matrix.durationSeconds).toBe(30);
    expect(matrix.dbMin).toBe(-120);
    expect(matrix.dbMax).toBe(-50);
  });

  it('maps bin 0 to 0 Hz and the last bin to Nyquist', () => {
    expect(binHz(matrix, 0)).toBe(0);
    expect(binHz(matrix, 512)).toBe(8000);
    expect(binHz(matrix, 64)).toBe(1000);
  });

  it('is deterministic', () => {
    const again = computeSpectrogram(wav.samples, wav.sampleRate);
    expect(Buffer.from(again.data).equals(Buffer.from(matrix.data))).toBe(true);
  });

  it('dbAt inverts the quantisation to within one step (70 / 255 dB)', () => {
    const step = 70 / 255;
    const mags = new Float64Array(matrix.bins);
    let compared = 0;
    frameMagnitudes(wav.samples, wav.sampleRate, SPECTROGRAM_SPEC, (frame, m) => {
      if (frame % 97 !== 0) return;
      mags.set(m);
      for (let bin = 0; bin < matrix.bins; bin += 11) {
        const exact = Math.min(-50, Math.max(-120, 20 * Math.log10(Math.max(mags[bin], 1e-12))));
        expect(Math.abs(dbAt(matrix, frame, bin) - exact)).toBeLessThanOrEqual(step / 2 + 1e-9);
        compared++;
      }
    });
    expect(compared).toBeGreaterThan(100);
  });

  it('quantises dbMin to 0 and dbMax to 255 (clamped, fixed shared range)', () => {
    const quiet = computeSpectrogram(new Float32Array(2048), 16000); // zeros: far below dbMin
    expect(Math.max(...quiet.data)).toBe(0);
    const loud = computeSpectrogram(
      Float32Array.from({ length: 2048 }, (_, i) => (i % 2 === 0 ? 1 : -1) * 0.999),
      16000,
    ); // Nyquist tone: at or above dbMax in its bin
    expect(Math.max(...loud.data)).toBe(255);
    expect(dbAt(quiet, 0, 0)).toBe(-120);
    expect(dbAt(loud, 0, 512)).toBeCloseTo(-50, 9);
  });

  it('does not auto-scale: a clip scaled by 0.5 reads about 6 dB lower, not the same', () => {
    const half = computeSpectrogram(
      wav.samples.map((s) => s * 0.5),
      wav.sampleRate,
    );
    let sum = 0;
    let count = 0;
    for (let frame = 0; frame < matrix.frames; frame += 40) {
      for (let bin = 20; bin < 400; bin += 17) {
        const full = dbAt(matrix, frame, bin);
        const lower = dbAt(half, frame, bin);
        if (full > -112 && lower > -112) {
          sum += full - lower;
          count++;
        }
      }
    }
    expect(count).toBeGreaterThan(100);
    expect(sum / count).toBeGreaterThan(5.5);
    expect(sum / count).toBeLessThan(6.5);
  });
});
