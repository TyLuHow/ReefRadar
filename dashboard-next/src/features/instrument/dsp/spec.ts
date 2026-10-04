/**
 * The analysis parameters behind every spectrogram and level in the instrument (DS-03).
 *
 * One constant, printed verbatim by captions, so a reader can reproduce any picture:
 * 1024-point periodic Hann window, hop 256 (75 % overlap), magnitudes in dB re full scale of the
 * file, quantised onto one fixed range shared by every clip. Nothing auto-scales per clip, so two
 * wells side by side are comparable by eye. The scale is uncalibrated: the recorders' hydrophone
 * sensitivity is not known here, so these are not sound pressure levels.
 */
export const SPECTROGRAM_SPEC = {
  fftSize: 1024,
  hop: 256,
  window: 'hann',
  dbMin: -120,
  dbMax: -50,
  scale: 'magma',
  reference: 'full scale of the file',
  calibrated: false,
} as const;

export type SpectrogramSpec = typeof SPECTROGRAM_SPEC;

/** Colourbar tick values in dB re full scale: the range ends plus the 20 dB steps between. */
export const DB_TICKS = [-120, -100, -80, -60, -50] as const;
