/**
 * Short-time Fourier transform and fixed-range dB quantisation (DS-03). Pure functions, no DOM,
 * so the same code can move into a Worker later.
 *
 * Magnitudes are normalised by 2 / sum(window) so a full-scale sine centred on a bin reads 0 dB:
 * the unit is dB re full scale of the file (uncalibrated; not sound pressure). Each cell is then
 * clamped to [dbMin, dbMax] and quantised to 0..255 on that one range. The range is fixed and
 * shared by every clip: nothing is scaled per clip.
 */
import FFT from 'fft.js';
import { SPECTROGRAM_SPEC, type SpectrogramSpec } from './spec';

/** Floor applied before the logarithm so silence is finite (-240 dB), never -Infinity. */
const MAGNITUDE_FLOOR = 1e-12;

export type SpectrogramMatrix = {
  frames: number;
  bins: number;
  sampleRate: number;
  fftSize: number;
  hop: number;
  hopSeconds: number;
  durationSeconds: number;
  dbMin: number;
  dbMax: number;
  /** Frame-major, `data[frame * bins + bin]`, bin 0 = 0 Hz, level 0..255 on [dbMin, dbMax]. */
  data: Uint8Array;
};

/** Periodic Hann window (the form whose overlapped copies sum to a constant). */
function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let n = 0; n < size; n++) w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / size);
  return w;
}

export function frameCount(sampleCount: number, spec: Pick<SpectrogramSpec, 'fftSize' | 'hop'>): number {
  return sampleCount < spec.fftSize ? 0 : Math.floor((sampleCount - spec.fftSize) / spec.hop) + 1;
}

/**
 * Calls `onFrame(frame, magnitudes)` once per frame (no padding) with fftSize / 2 + 1 linear
 * magnitudes normalised so a full-scale bin-centred sine is 1. The array is reused between
 * calls: copy it if it must outlive the callback.
 */
export function frameMagnitudes(
  samples: ArrayLike<number>,
  _sampleRate: number,
  spec: Pick<SpectrogramSpec, 'fftSize' | 'hop'>,
  onFrame: (frame: number, magnitudes: Float64Array) => void,
): void {
  const { fftSize, hop } = spec;
  const frames = frameCount(samples.length, spec);
  if (frames === 0) return;

  const window = hannWindow(fftSize);
  let windowSum = 0;
  for (let n = 0; n < fftSize; n++) windowSum += window[n];
  const scale = 2 / windowSum;

  const fft = new FFT(fftSize);
  const spectrum = fft.createComplexArray();
  const input = new Array<number>(fftSize).fill(0);
  const bins = fftSize / 2 + 1;
  const magnitudes = new Float64Array(bins);

  for (let frame = 0; frame < frames; frame++) {
    const start = frame * hop;
    for (let n = 0; n < fftSize; n++) input[n] = samples[start + n] * window[n];
    fft.realTransform(spectrum, input);
    for (let k = 0; k < bins; k++) {
      const re = spectrum[2 * k];
      const im = spectrum[2 * k + 1];
      magnitudes[k] = Math.sqrt(re * re + im * im) * scale;
    }
    onFrame(frame, magnitudes);
  }
}

export function computeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  spec: SpectrogramSpec = SPECTROGRAM_SPEC,
): SpectrogramMatrix {
  const { fftSize, hop, dbMin, dbMax } = spec;
  const frames = frameCount(samples.length, spec);
  const bins = fftSize / 2 + 1;
  const data = new Uint8Array(frames * bins);
  const range = dbMax - dbMin;

  frameMagnitudes(samples, sampleRate, spec, (frame, magnitudes) => {
    const row = frame * bins;
    for (let k = 0; k < bins; k++) {
      const db = 20 * Math.log10(Math.max(magnitudes[k], MAGNITUDE_FLOOR));
      const clamped = Math.min(dbMax, Math.max(dbMin, db));
      data[row + k] = Math.round((255 * (clamped - dbMin)) / range);
    }
  });

  return {
    frames,
    bins,
    sampleRate,
    fftSize,
    hop,
    hopSeconds: hop / sampleRate,
    durationSeconds: samples.length / sampleRate,
    dbMin,
    dbMax,
    data,
  };
}

/** The level in dB re full scale of a cell, recovered from its quantised value (within one step). */
export function dbAt(matrix: SpectrogramMatrix, frame: number, bin: number): number {
  const level = matrix.data[frame * matrix.bins + bin];
  return matrix.dbMin + (level * (matrix.dbMax - matrix.dbMin)) / 255;
}

/** Centre frequency of a bin in Hz. */
export function binHz(matrix: SpectrogramMatrix, bin: number): number {
  return (bin * matrix.sampleRate) / matrix.fftSize;
}
