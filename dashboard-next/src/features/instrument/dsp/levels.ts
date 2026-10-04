/**
 * Level helpers (DS-03). All values are dB re full scale of the file and uncalibrated: they are
 * not sound pressure levels. Pure functions, no DOM.
 */
import { SPECTROGRAM_SPEC, type SpectrogramSpec } from './spec';
import { frameMagnitudes } from './stft';

/** Floors applied before the logarithm so silence is finite, never -Infinity. */
const AMPLITUDE_FLOOR = 1e-12;
const POWER_FLOOR = 1e-24;

function rmsOf(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

/** Whole-clip RMS in dB re full scale: 20 log10 of the RMS of samples in [-1, 1). */
export function rmsDbfs(samples: Float32Array): number {
  if (samples.length === 0) return 20 * Math.log10(AMPLITUDE_FLOOR);
  return 20 * Math.log10(Math.max(rmsOf(samples, 0, samples.length), AMPLITUDE_FLOOR));
}

/** RMS dBFS of each full window (default 5 s); a trailing partial window is dropped. */
export function windowLevelsDb(samples: Float32Array, sampleRate: number, windowSeconds = 5): number[] {
  const windowSamples = Math.round(windowSeconds * sampleRate);
  if (windowSamples < 1) throw new RangeError('windowSeconds is shorter than one sample');
  const levels: number[] = [];
  for (let start = 0; start + windowSamples <= samples.length; start += windowSamples) {
    levels.push(20 * Math.log10(Math.max(rmsOf(samples, start, start + windowSamples), AMPLITUDE_FLOOR)));
  }
  return levels;
}

/**
 * Mean power inside [lowHz, highHz) over every frame and bin of the band, in dB re full scale
 * (10 log10 of the mean of squared magnitudes, normalised exactly like the spectrogram). A band
 * whose upper edge reaches Nyquist includes the Nyquist bin. Throws when no bin falls in the band.
 */
export function bandMeanDb(
  samples: Float32Array,
  sampleRate: number,
  lowHz: number,
  highHz: number,
  spec: SpectrogramSpec = SPECTROGRAM_SPEC,
): number {
  const bins = spec.fftSize / 2 + 1;
  const nyquist = sampleRate / 2;
  const binWidth = sampleRate / spec.fftSize;
  const inBand: number[] = [];
  for (let bin = 0; bin < bins; bin++) {
    const hz = bin * binWidth;
    if (hz >= lowHz && (hz < highHz || (highHz >= nyquist && bin === bins - 1))) inBand.push(bin);
  }
  if (inBand.length === 0) throw new RangeError(`No frequency bin lies in ${lowHz}-${highHz} Hz`);

  let total = 0;
  let frames = 0;
  frameMagnitudes(samples, sampleRate, spec, (_frame, magnitudes) => {
    for (const bin of inBand) total += magnitudes[bin] * magnitudes[bin];
    frames++;
  });
  if (frames === 0) throw new RangeError('The clip is shorter than one analysis frame');
  return 10 * Math.log10(Math.max(total / (frames * inBand.length), POWER_FLOOR));
}
