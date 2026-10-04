// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bandMeanDb, parseWavPcm16, rmsDbfs, windowLevelsDb } from '@/features/instrument/dsp';
import { CLIP_IDS, readClipBuffer, readManifestExcerpts } from './support/clips';

/**
 * Level helpers (04-03), checked against the real excerpts and the manifest rms_dbfs. The 0.5
 * amplitude square and the silent buffer are maths vectors only, never rendered or played.
 */

const manifest = new Map(readManifestExcerpts().map((e) => [e.excerpt_id, e.rms_dbfs]));
const load = (id: string) => parseWavPcm16(readClipBuffer(id));

describe('rmsDbfs', () => {
  it('reads a +/-0.5 square wave as 20 log10(0.5) = -6.02 dB', () => {
    const samples = Float32Array.from({ length: 1000 }, (_, i) => (i % 2 === 0 ? 0.5 : -0.5));
    expect(rmsDbfs(samples)).toBeCloseTo(20 * Math.log10(0.5), 9);
  });

  it('is finite for silence (floored, never -Infinity)', () => {
    expect(Number.isFinite(rmsDbfs(new Float32Array(100)))).toBe(true);
  });

  it('covers all nine excerpts in the manifest', () => {
    expect([...manifest.keys()].sort()).toEqual([...CLIP_IDS].sort());
  });

  it.each(CLIP_IDS)('whole-clip RMS of %s equals the manifest rms_dbfs within 0.1 dB', (id) => {
    const expected = manifest.get(id);
    expect(expected).toBeDefined();
    expect(Math.abs(rmsDbfs(load(id).samples) - (expected as number))).toBeLessThanOrEqual(0.1);
  });
});

describe('windowLevelsDb', () => {
  it.each(['ind_H1_20220830_120000', 'aus_H1_20230208_120000'])(
    '%s gives 6 five-second windows whose energy average equals the whole-clip RMS within 0.1 dB',
    (id) => {
      const wav = load(id);
      const levels = windowLevelsDb(wav.samples, wav.sampleRate);
      expect(levels).toHaveLength(6);
      const meanPower = levels.reduce((sum, db) => sum + 10 ** (db / 10), 0) / levels.length;
      expect(Math.abs(10 * Math.log10(meanPower) - rmsDbfs(wav.samples))).toBeLessThanOrEqual(0.1);
    },
  );

  it('drops a trailing partial window and honours the window length', () => {
    const samples = new Float32Array(16000 * 11).fill(0.1);
    expect(windowLevelsDb(samples, 16000)).toHaveLength(2);
    expect(windowLevelsDb(samples, 16000, 1)).toHaveLength(11);
  });
});

describe('bandMeanDb', () => {
  const bands: Array<[number, number]> = [
    [0, 1000],
    [1000, 4000],
    [4000, 8000],
  ];

  it.each(['ind_H1_20220830_120000', 'ind_D1_20220830_120000'])('is finite in 0-1, 1-4 and 4-8 kHz on %s', (id) => {
    const wav = load(id);
    for (const [low, high] of bands) {
      const value = bandMeanDb(wav.samples, wav.sampleRate, low, high);
      expect(Number.isFinite(value), `${low}-${high} Hz`).toBe(true);
      expect(value).toBeLessThan(0);
    }
  });

  it('reads a bin-centred full-scale sine as the mean power of its band (maths vector)', () => {
    const rate = 16000;
    const hz = 2000; // bin 128
    const samples = Float32Array.from({ length: 8192 }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));
    const inBand = bandMeanDb(samples, rate, 1900, 2100); // bins 122..134 (13 bins), one carries power 1
    expect(inBand).toBeGreaterThan(10 * Math.log10(1 / 13) - 1.5); // the Hann skirt adds a little
    expect(inBand).toBeLessThan(10 * Math.log10(1 / 13) + 1.5);
    const outOfBand = bandMeanDb(samples, rate, 5000, 6000);
    expect(outOfBand).toBeLessThan(-80);
  });

  it('throws for a band that contains no bin', () => {
    const samples = new Float32Array(4096);
    expect(() => bandMeanDb(samples, 16000, 3, 4)).toThrow();
  });
});
