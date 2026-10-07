/**
 * The instrument's DSP core (DS-03, 04-03): pure functions, no DOM. Application code imports
 * from '@/features/instrument/dsp' only. Nothing under src/features may import '@/components'.
 */
export { DB_TICKS, SPECTROGRAM_SPEC } from './spec';
export type { SpectrogramSpec } from './spec';
export { MAX_SAMPLE_RATE_HZ, MIN_SAMPLE_RATE_HZ, WavFormatError, parseWavPcm16 } from './wav';
export type { ParsedWav } from './wav';
export { binHz, computeSpectrogram, dbAt, frameCount, frameMagnitudes } from './stft';
export type { SpectrogramMatrix } from './stft';
export { MAGMA_LUT, lutColor, matrixToImageData } from './colormap';
export { bandMeanDb, rmsDbfs, windowLevelsDb } from './levels';
