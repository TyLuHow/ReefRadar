/**
 * Window numbering and counts for the fixtures (C-WR-03, C-WR-06): one-based names for zero-based
 * indices, and a window count computed from the recording's duration.
 */
import { describe, expect, it } from 'vitest';
import { getExcerpt } from '@/lib/audio-manifest';
import { WINDOW_S, windowCount, windowLabel } from '@/features/fixtures/parts/windowCopy';

describe('windowCopy', () => {
  it('names zero-based indices one-based, with the seconds the window covers', () => {
    expect(windowLabel(0)).toBe('Window 1 (0 s to 5 s)');
    expect(windowLabel(1)).toBe('Window 2 (5 s to 10 s)');
    expect(windowLabel(2)).toBe('Window 3 (10 s to 15 s)');
  });

  it('counts whole windows from the duration', () => {
    expect(windowCount(30)).toBe(6);
    expect(windowCount(29.9)).toBe(5);
    expect(windowCount(4)).toBe(0);
  });

  it('the committed fixture excerpt holds the windows the WindowStrip cells expect', () => {
    const excerpt = getExcerpt('ind_H1_20220830_120000');
    expect(windowCount(excerpt.duration_s)).toBe(Math.floor(excerpt.duration_s / WINDOW_S));
  });
});
