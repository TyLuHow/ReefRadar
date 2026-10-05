import type { SpectrogramMatrix } from './dsp';

/**
 * The arithmetic behind CompareRow and CompareDeck (DS-05, 04-16). Pure functions, no DOM.
 *
 * Fair comparison (UI-SPEC "CompareRow and CompareDeck", T-04-16-01, T-04-16-02):
 * - Level matching never boosts. The target is the quietest clip's manifest RMS, so every gain is
 *   zero or negative and a matched clip is never louder than its original (no clipping, no surprise
 *   volume). The disclosure under the deck says that original levels differ.
 * - Two wells share one colour scale only when their analysis settings are equal (`specsMatch`);
 *   otherwise the deck says so and rescales neither.
 * - Clips are played together only when they have the same length (`durationsMatch`, the same
 *   10 ms tolerance as the audio engine); nothing is stretched.
 */

/** Same tolerance as the audio engine (resampling rounding), in seconds. */
export const LENGTH_TOLERANCE_S = 0.01;

/** The quietest a well gets as the mix moves away from it (UI-SPEC "Motion", Crossfade). */
export const DIMMED_OPACITY = 0.45;

const MINUS = '−';

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * dB gains that bring each clip down to the quietest clip's RMS level: `target - rms`, rounded to
 * 0.1 dB, so the quietest is exactly 0 and the others are 0 or negative. The input is the manifest's
 * `rms_dbfs` (dB re full scale, uncalibrated).
 */
export function levelMatchGains(rmsDbfs: number[]): number[] {
  if (rmsDbfs.length === 0) return [];
  const target = Math.min(...rmsDbfs);
  // `+ 0` turns a rounded -0 into +0.
  return rmsDbfs.map((rms) => round1(target - rms) + 0);
}

/** A level in dB as an amplitude factor (20 log10). */
export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

/**
 * Opacity of a well for a crossfader position `mix` in [0, 1] (0 is all A, 1 is all B). The well the
 * mix moves away from dims from 1 at the middle to 0.45 at its end; the other stays at 1. Under
 * reduced motion the dim has no ramp: it switches at the 50% point (UI-SPEC "Motion").
 */
export function wellOpacity(mix: number, side: 'a' | 'b', reduced: boolean): number {
  const x = Number.isFinite(mix) ? clamp01(mix) : 0.5;
  const away = side === 'a' ? x - 0.5 : 0.5 - x;
  if (away <= 0) return 1;
  if (reduced) return DIMMED_OPACITY;
  const amount = away / 0.5;
  return Math.round((1 - (1 - DIMMED_OPACITY) * amount) * 1000) / 1000;
}

type SpecFields = Pick<SpectrogramMatrix, 'fftSize' | 'hop' | 'dbMin' | 'dbMax' | 'sampleRate'>;

/** True when two wells were computed with the same analysis settings, so one colour scale is true for both. */
export function specsMatch(a: SpecFields, b: SpecFields): boolean {
  return a.fftSize === b.fftSize && a.hop === b.hop && a.dbMin === b.dbMin && a.dbMax === b.dbMax && a.sampleRate === b.sampleRate;
}

/** True when every duration is within the engine's tolerance of the others (also true for none or one). */
export function durationsMatch(durationsS: number[]): boolean {
  if (durationsS.length < 2) return true;
  return Math.max(...durationsS) - Math.min(...durationsS) <= LENGTH_TOLERANCE_S;
}

/** The crossfader's words: "30% A, 70% B" for position `x` in [0, 1]. */
export function formatMix(x: number): string {
  const b = Math.round(clamp01(Number.isFinite(x) ? x : 0.5) * 100);
  return `${100 - b}% A, ${b}% B`;
}

/** A gain in dB for the level line: a true minus, a plus for a boost, one decimal ("−5.2", "0.0"). */
export function formatGain(db: number): string {
  const rounded = round1(db) + 0;
  if (rounded === 0) return '0.0';
  return `${rounded < 0 ? MINUS : '+'}${Math.abs(rounded).toFixed(1)}`;
}
