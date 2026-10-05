/**
 * Comparison maths (04-16, DS-05). Pure functions behind CompareDeck: level matching from the
 * manifest RMS (attenuation only), the dim of the quieter-sounding well, the same-scale check and the
 * crossfader's words. The real manifest values are used where a clip is named.
 */
import { describe, expect, it } from 'vitest';
import {
  SPECTROGRAM_SPEC,
  dbToLinear,
  durationsMatch,
  equalPowerGains,
  formatGain,
  formatMix,
  levelMatchGains,
  specsMatch,
  wellOpacity,
  type SpectrogramMatrix,
} from '@/features/instrument';
import { getExcerpt } from '@/lib/audio-manifest';
import { readManifestExcerpts } from './support/clips';

type Spec = Pick<SpectrogramMatrix, 'fftSize' | 'hop' | 'dbMin' | 'dbMax' | 'sampleRate'>;
const SPEC: Spec = { fftSize: SPECTROGRAM_SPEC.fftSize, hop: SPECTROGRAM_SPEC.hop, dbMin: SPECTROGRAM_SPEC.dbMin, dbMax: SPECTROGRAM_SPEC.dbMax, sampleRate: 16000 };

describe('levelMatchGains', () => {
  it('attenuates the louder clip to the quieter one and leaves the quieter at 0', () => {
    expect(levelMatchGains([-61.9, -58.0])).toEqual([0, -3.9]);
    expect(levelMatchGains([-58.0, -61.9])).toEqual([-3.9, 0]);
  });

  it('never boosts: every gain is at most 0, for the real manifest pair and for every manifest clip', () => {
    const h1 = getExcerpt('ind_H1_20220830_120000').rms_dbfs as number;
    const d1 = getExcerpt('ind_D1_20220830_120000').rms_dbfs as number;
    expect(levelMatchGains([h1, d1])).toEqual([0, -5.2]);
    const all = readManifestExcerpts().map((e) => e.rms_dbfs);
    for (const gain of levelMatchGains(all)) expect(gain).toBeLessThanOrEqual(0);
  });

  it('returns +0, never -0, and rounds to 0.1 dB', () => {
    expect(Object.is(levelMatchGains([-50, -50])[0], 0)).toBe(true);
    // 0.04 dB rounds to nothing: the gain is +0, not -0.
    expect(Object.is(levelMatchGains([-50.04, -50])[1], 0)).toBe(true);
    expect(levelMatchGains([-60, -57.26])).toEqual([0, -2.7]);
  });

  it('handles one clip, no clips and ignores nothing else', () => {
    expect(levelMatchGains([-60])).toEqual([0]);
    expect(levelMatchGains([])).toEqual([]);
  });
});

describe('dbToLinear', () => {
  it('converts decibels to an amplitude factor', () => {
    expect(dbToLinear(0)).toBe(1);
    expect(dbToLinear(-20)).toBeCloseTo(0.1, 10);
    expect(dbToLinear(-6.0206)).toBeCloseTo(0.5, 4);
  });

  it('a matched gain times an equal-power gain never exceeds the original level', () => {
    for (let x = 0; x <= 1; x += 0.05) {
      const { a, b } = equalPowerGains(x);
      for (const g of levelMatchGains([-61.9, -58.0])) {
        expect(dbToLinear(g) * a).toBeLessThanOrEqual(1);
        expect(dbToLinear(g) * b).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('wellOpacity', () => {
  it('is 1 for both wells at the middle', () => {
    expect(wellOpacity(0.5, 'a', false)).toBe(1);
    expect(wellOpacity(0.5, 'b', false)).toBe(1);
  });

  it('dims the well the mix moves away from, down to 0.45 at the end', () => {
    expect(wellOpacity(1, 'a', false)).toBe(0.45);
    expect(wellOpacity(0, 'b', false)).toBe(0.45);
    expect(wellOpacity(0, 'a', false)).toBe(1);
    expect(wellOpacity(1, 'b', false)).toBe(1);
  });

  it('ramps continuously between 1 and 0.45', () => {
    const quarter = wellOpacity(0.75, 'a', false);
    expect(quarter).toBeGreaterThan(0.45);
    expect(quarter).toBeLessThan(1);
    expect(quarter).toBeCloseTo(0.725, 3);
    expect(wellOpacity(0.25, 'b', false)).toBeCloseTo(0.725, 3);
    expect(wellOpacity(0.6, 'a', false)).toBeGreaterThan(wellOpacity(0.9, 'a', false));
  });

  it('under reduced motion switches at 50% with no ramp', () => {
    expect(wellOpacity(0.3, 'b', true)).toBe(0.45);
    expect(wellOpacity(0.7, 'b', true)).toBe(1);
    expect(wellOpacity(0.7, 'a', true)).toBe(0.45);
    expect(wellOpacity(0.3, 'a', true)).toBe(1);
    expect(wellOpacity(0.5, 'a', true)).toBe(1);
    expect(wellOpacity(0.5, 'b', true)).toBe(1);
    expect(wellOpacity(0.51, 'a', true)).toBe(0.45);
  });

  it('clamps nonsense into the range', () => {
    expect(wellOpacity(9, 'a', false)).toBe(0.45);
    expect(wellOpacity(-4, 'b', false)).toBe(0.45);
    expect(wellOpacity(Number.NaN, 'a', false)).toBe(1);
  });
});

describe('specsMatch', () => {
  it('is true for equal fftSize, hop, dbMin, dbMax and sampleRate', () => {
    expect(specsMatch(SPEC, { ...SPEC })).toBe(true);
  });

  it.each([
    ['fftSize', { fftSize: 2048 }],
    ['hop', { hop: 512 }],
    ['dbMin', { dbMin: -100 }],
    ['dbMax', { dbMax: -40 }],
    ['sampleRate', { sampleRate: 32000 }],
  ])('is false when %s differs', (_name, change) => {
    expect(specsMatch(SPEC, { ...SPEC, ...change })).toBe(false);
  });
});

describe('durationsMatch', () => {
  it('accepts equal and near-equal lengths and refuses a real difference', () => {
    expect(durationsMatch([30, 30])).toBe(true);
    expect(durationsMatch([30, 30.005])).toBe(true);
    expect(durationsMatch([30, 29])).toBe(false);
    expect(durationsMatch([30])).toBe(true);
    expect(durationsMatch([])).toBe(true);
  });
});

describe('formatMix and formatGain', () => {
  it('writes the mix as percentages of A and B', () => {
    expect(formatMix(0.7)).toBe('30% A, 70% B');
    expect(formatMix(0.5)).toBe('50% A, 50% B');
    expect(formatMix(0)).toBe('100% A, 0% B');
    expect(formatMix(1)).toBe('0% A, 100% B');
  });

  it('rounds and clamps', () => {
    expect(formatMix(0.333)).toBe('67% A, 33% B');
    expect(formatMix(4)).toBe('0% A, 100% B');
    expect(formatMix(-1)).toBe('100% A, 0% B');
  });

  it('writes a gain with a sign and a true minus', () => {
    expect(formatGain(-5.2)).toBe('−5.2');
    expect(formatGain(0)).toBe('0.0');
    expect(formatGain(-0)).toBe('0.0');
    expect(formatGain(1.25)).toBe('+1.3');
  });
});
