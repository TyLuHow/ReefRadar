/**
 * Pure geometry for the spectrogram well (DS-03, 04-13). No DOM: the component applies these numbers
 * to a canvas and to DOM elements, so every rule here is unit-testable.
 *
 * - The playhead is a DOM element moved by transform; `playheadX` says where.
 * - In scroll mode the image pans under a playhead held at 22 % of the width; `scrollSourceRect` says
 *   which frames of the precomputed image are on screen. At the ends of the clip the window stops at
 *   the image edge (the canvas never draws outside the image), so the playhead walks away from 22 %
 *   there: `playheadFraction` is the true position and is what the DOM playhead must use.
 * - The canvas backing store follows devicePixelRatio but is capped (iOS Safari canvas limits).
 */

export type PlayMode = 'sweep' | 'scroll';

/** The playhead's fixed place in scroll mode, as a fraction of the well width. */
export const SCROLL_PLAYHEAD_FRACTION = 0.22;
/** Widest canvas backing store, in device pixels. */
export const MAX_BACKING_WIDTH = 8192;
/** Most device pixels in one canvas backing store (8192 x 2048). */
export const MAX_BACKING_PIXELS = 8192 * 2048;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * Horizontal playhead position in CSS pixels. Sweep: the elapsed fraction of the width. Scroll: 22 %
 * of the width, whatever the time (the image moves, not the playhead).
 */
export function playheadX(seconds: number, duration: number, width: number, mode: PlayMode): number {
  if (mode === 'scroll') return SCROLL_PLAYHEAD_FRACTION * width;
  if (!(duration > 0) || !Number.isFinite(seconds)) return 0;
  return clamp(seconds / duration, 0, 1) * width;
}

export interface SourceRect {
  /** First visible frame (a fraction of a frame is fine for drawImage). */
  x: number;
  /** Visible frames. */
  width: number;
  /** Where `seconds` falls inside the visible frames, 0 to 1 (0.22 away from the clip ends). */
  playheadFraction: number;
}

/**
 * The frames of the image to draw so that `seconds` sits at 22 % of a `visibleSeconds`-long window,
 * clamped to the image. A window as long as the clip (or longer) shows the whole image.
 */
export function scrollSourceRect(frames: number, hopSeconds: number, seconds: number, visibleSeconds: number): SourceRect {
  const visibleFrames = frames > 0 && hopSeconds > 0 && visibleSeconds > 0 ? Math.min(frames, visibleSeconds / hopSeconds) : frames;
  const playFrame = hopSeconds > 0 && Number.isFinite(seconds) ? clamp(seconds / hopSeconds, 0, frames) : 0;
  const x = clamp(playFrame - SCROLL_PLAYHEAD_FRACTION * visibleFrames, 0, Math.max(0, frames - visibleFrames));
  const playheadFraction = visibleFrames > 0 ? clamp((playFrame - x) / visibleFrames, 0, 1) : 0;
  return { x, width: visibleFrames, playheadFraction };
}

/**
 * Canvas backing-store size for a CSS size and a device pixel ratio: multiplied by the ratio, then
 * scaled down together (aspect ratio kept) until the width is at most 8192 and the area at most
 * 8192 x 2048. A missing or non-positive ratio counts as 1; the size is never below 1 x 1.
 */
export function backingStoreSize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number } {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const width = Math.max(1, cssWidth * ratio);
  const height = Math.max(1, cssHeight * ratio);
  const scale = Math.min(1, MAX_BACKING_WIDTH / width, Math.sqrt(MAX_BACKING_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/** Frequency tick values in Hz: every 2 kHz from 0, ending at the Nyquist (a crowded last step is dropped). */
export function frequencyTicks(nyquistHz: number): number[] {
  const step = 2000;
  const ticks: number[] = [];
  for (let hz = 0; hz <= nyquistHz; hz += step) {
    if (nyquistHz - hz === 0 || nyquistHz - hz >= 1000) ticks.push(hz);
  }
  if (ticks[ticks.length - 1] !== nyquistHz) ticks.push(nyquistHz);
  return ticks;
}

/** Seconds between time labels: 5 s for clips up to 90 s, 30 s up to 10 minutes, then 60 s. */
export function timeTickStep(durationSeconds: number): number {
  if (durationSeconds <= 90) return 5;
  if (durationSeconds <= 600) return 30;
  return 60;
}

/** Time tick values in seconds from 0, every `timeTickStep`, not past the duration. */
export function timeTicks(durationSeconds: number): number[] {
  const step = timeTickStep(durationSeconds);
  const ticks: number[] = [];
  for (let t = 0; t <= durationSeconds; t += step) ticks.push(t);
  return ticks.length > 0 ? ticks : [0];
}
