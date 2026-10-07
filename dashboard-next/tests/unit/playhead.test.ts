// @vitest-environment node
/**
 * Pure geometry behind the spectrogram well (04-13, DS-03): where the playhead sits, which part of the
 * precomputed image the canvas shows in scroll mode, and how large the canvas backing store may be.
 * No DOM: the component only applies these numbers.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_BACKING_PIXELS,
  MAX_BACKING_WIDTH,
  SCROLL_PLAYHEAD_FRACTION,
  backingStoreSize,
  frequencyTicks,
  playheadX,
  scrollSourceRect,
  timeTickStep,
  timeTicks,
} from '@/features/instrument/playhead';

describe('playheadX', () => {
  it('sweep mode puts the playhead at the elapsed fraction of the width', () => {
    expect(playheadX(12, 30, 600, 'sweep')).toBe(240);
    expect(playheadX(0, 30, 600, 'sweep')).toBe(0);
    expect(playheadX(30, 30, 600, 'sweep')).toBe(600);
  });

  it('sweep mode clamps to the well and survives a zero duration or a non-finite time', () => {
    expect(playheadX(-4, 30, 600, 'sweep')).toBe(0);
    expect(playheadX(45, 30, 600, 'sweep')).toBe(600);
    expect(playheadX(5, 0, 600, 'sweep')).toBe(0);
    expect(playheadX(Number.NaN, 30, 600, 'sweep')).toBe(0);
  });

  it('scroll mode holds the playhead at 22 % of the width whatever the time', () => {
    expect(SCROLL_PLAYHEAD_FRACTION).toBe(0.22);
    expect(playheadX(12, 30, 600, 'scroll')).toBeCloseTo(0.22 * 600, 9);
    expect(playheadX(0, 30, 600, 'scroll')).toBeCloseTo(132, 9);
    expect(playheadX(29, 30, 1000, 'scroll')).toBeCloseTo(220, 9);
  });
});

describe('scrollSourceRect', () => {
  // The ind_H1 excerpt: 30 s at 16 kHz, hop 256 samples = 0.016 s, 1872 frames.
  const FRAMES = 1872;
  const HOP = 0.016;

  it('puts the time at 22 % of the visible window in the middle of the clip', () => {
    const rect = scrollSourceRect(FRAMES, HOP, 12.4, 10);
    expect(rect.width).toBeCloseTo(625, 6);
    expect(rect.x).toBeCloseTo(12.4 / HOP - 0.22 * 625, 6);
    expect(rect.playheadFraction).toBeCloseTo(0.22, 9);
  });

  it('clamps at the start: the image stops at its left edge and the playhead walks in from the left', () => {
    const rect = scrollSourceRect(FRAMES, HOP, 0, 10);
    expect(rect.x).toBe(0);
    expect(rect.playheadFraction).toBe(0);
    const early = scrollSourceRect(FRAMES, HOP, 1, 10);
    expect(early.x).toBe(0);
    expect(early.playheadFraction).toBeCloseTo(1 / HOP / 625, 6);
  });

  it('clamps at the end: the image stops at its right edge and the playhead walks out to the right', () => {
    const rect = scrollSourceRect(FRAMES, HOP, 29.9, 10);
    expect(rect.x + rect.width).toBeCloseTo(FRAMES, 6);
    expect(rect.playheadFraction).toBeGreaterThan(0.22);
    expect(rect.playheadFraction).toBeLessThanOrEqual(1);
  });

  it('never leaves the image whatever the time', () => {
    for (const seconds of [-5, 0, 3, 14.97, 29.95, 31, 1000]) {
      const rect = scrollSourceRect(FRAMES, HOP, seconds, 10);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(FRAMES + 1e-9);
      expect(rect.playheadFraction).toBeGreaterThanOrEqual(0);
      expect(rect.playheadFraction).toBeLessThanOrEqual(1);
    }
  });

  it('shows the whole image when the window is as long as the clip or longer', () => {
    const rect = scrollSourceRect(FRAMES, HOP, 12.4, 60);
    expect(rect.x).toBe(0);
    expect(rect.width).toBe(FRAMES);
    expect(rect.playheadFraction).toBeCloseTo(12.4 / HOP / FRAMES, 9);
  });
});

describe('backingStoreSize', () => {
  it('multiplies the CSS size by the device pixel ratio', () => {
    expect(backingStoreSize(600, 220, 2)).toEqual({ width: 1200, height: 440 });
    expect(backingStoreSize(600, 220, 1)).toEqual({ width: 600, height: 220 });
    expect(backingStoreSize(600, 220, 1.5)).toEqual({ width: 900, height: 330 });
  });

  it('caps the width at 8192 and keeps the aspect ratio', () => {
    const size = backingStoreSize(5000, 300, 2);
    expect(MAX_BACKING_WIDTH).toBe(8192);
    expect(size.width).toBeLessThanOrEqual(8192);
    expect(size.width).toBe(8192);
    expect(size.width / size.height).toBeCloseTo(5000 / 300, 1);
  });

  it('caps the total pixels at 8192 x 2048 and keeps the aspect ratio', () => {
    const size = backingStoreSize(4000, 2000, 2);
    expect(MAX_BACKING_PIXELS).toBe(8192 * 2048);
    expect(size.width * size.height).toBeLessThanOrEqual(8192 * 2048);
    expect(size.width / size.height).toBeCloseTo(2, 1);
    // Close to the cap, not collapsed far below it.
    expect(size.width * size.height).toBeGreaterThan(0.95 * 8192 * 2048);
  });

  it('treats a missing, zero, negative or non-finite ratio as 1 and never returns a zero size', () => {
    expect(backingStoreSize(600, 220, 0)).toEqual({ width: 600, height: 220 });
    expect(backingStoreSize(600, 220, -2)).toEqual({ width: 600, height: 220 });
    expect(backingStoreSize(600, 220, Number.NaN)).toEqual({ width: 600, height: 220 });
    expect(backingStoreSize(0, 0, 2)).toEqual({ width: 1, height: 1 });
  });
});

describe('axis ticks', () => {
  it('labels an 8 kHz Nyquist every 2 kHz, ending at the Nyquist', () => {
    expect(frequencyTicks(8000)).toEqual([0, 2000, 4000, 6000, 8000]);
  });

  it('adds the Nyquist when it is not a multiple of the step and there is room for the label', () => {
    expect(frequencyTicks(11025)).toEqual([0, 2000, 4000, 6000, 8000, 10000, 11025]);
    expect(frequencyTicks(5000)).toEqual([0, 2000, 4000, 5000]);
  });

  it('never builds an unbounded tick list for a non-finite or absurd Nyquist (B WR-03)', () => {
    expect(frequencyTicks(Number.POSITIVE_INFINITY)).toEqual([0]);
    expect(frequencyTicks(Number.NaN)).toEqual([0]);
    expect(frequencyTicks(0)).toEqual([0]);
    expect(frequencyTicks(-5)).toEqual([0]);
    const huge = frequencyTicks(2.1e9);
    expect(huge.length).toBeLessThanOrEqual(66);
    expect(huge[0]).toBe(0);
    expect(huge[huge.length - 1]).toBe(2.1e9);
    expect(frequencyTicks(96000).length).toBeLessThanOrEqual(50);
  });

  it('drops a step tick that would crowd the Nyquist label', () => {
    expect(frequencyTicks(10500)).toEqual([0, 2000, 4000, 6000, 8000, 10500]);
  });

  it('ticks time every 5 s for a short clip and widens the step for long ones', () => {
    expect(timeTickStep(30)).toBe(5);
    expect(timeTickStep(90)).toBe(5);
    expect(timeTickStep(180)).toBe(30);
    expect(timeTickStep(3600)).toBe(60);
    expect(timeTicks(30)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(timeTicks(28)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(timeTicks(0)).toEqual([0]);
  });
});
