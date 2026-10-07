/**
 * The one place the fixtures name a 5 s window and count them (C-WR-03, C-WR-06). Windows are
 * numbered from ONE in copy ("Window 1" covers 0 to 5 s), matching WindowStrip's own accessible
 * names, while the `selectedWindow` / `selectedIndex` props are zero-based indices. Every
 * section that writes "Window N" or a window count goes through here, so the two numbering systems
 * cannot drift apart again, and the count comes from the recording's duration, not a typed 6.
 */

/** Seconds per window; the same 5 s as Spectrogram's selected-window outline and windowLevelsDb. */
export const WINDOW_S = 5;

/** The number of whole windows a recording of `durationS` seconds holds. */
export function windowCount(durationS: number): number {
  return Math.floor(durationS / WINDOW_S);
}

/** "Window 3 (10 s to 15 s)" for the zero-based window `index`. */
export function windowLabel(index: number): string {
  return `Window ${index + 1} (${index * WINDOW_S} s to ${(index + 1) * WINDOW_S} s)`;
}
