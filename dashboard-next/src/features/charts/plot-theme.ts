/**
 * Token Plot theme (04-19, DS-01 and DS-05). The new figures (StripPlot) read the direction tokens
 * through var(--dir-*) strings, never a raw colour: an SVG `fill="var(--dir-hab-healthy)"` follows a
 * live custom-property change with no rebuild, so a direction switch or a `?tok=` override restyles
 * a drawn plot at once. The legacy `encodings.ts` keeps its own dark-theme constants and is not
 * touched; this file is the theme for everything built on the instrument surface.
 */

/** Plot root style: the data face at 12 px, muted ink, a transparent ground, no overflow clipping of labels. */
export const PLOT_TOKEN_STYLE = {
  fontFamily: 'var(--dir-font-data)',
  fontSize: '12px',
  color: 'var(--dir-muted)',
  background: 'transparent',
  overflow: 'visible',
} as const;

/** Hairline rules and zero lines. */
export const RULE = 'var(--dir-rule)';
/** The outline and ring colour. */
export const INK = 'var(--dir-ink)';
/** The one accent use inside a plot: the selected-site ring in the scatter. Never a mark fill. */
export const ACCENT = 'var(--dir-accent)';
/** The panel colour, used as the halo behind labels set over marks. */
export const PANEL = 'var(--dir-panel)';
/** Outline of every status mark. */
export const MARK_OUTLINE = 'var(--dir-mark-outline)';
/** Fill of the hollow unknown ring. */
export const MARK_FILL_UNKNOWN = 'var(--dir-mark-fill-unknown)';
/** Display and data faces for on-plot labels. */
export const FONT_DISPLAY = 'var(--dir-font-display)';
export const FONT_DATA = 'var(--dir-font-data)';
export const DISPLAY_STYLE = 'var(--display-style)';
