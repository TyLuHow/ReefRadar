/**
 * FIXTURE_STATE_MANIFEST: for each /dev/fixtures section slug, the data-fixture-state ids that the
 * UI-SPEC state tables (as adjusted by 04-CONTEXT "Decisions after research") require a rendered
 * cell for. tests/e2e/fixtures-state-manifest.spec.ts opens each section and asserts every listed
 * cell exists, and that every slug in slugs.ts has an entry.
 *
 * The list is written from the UI-SPEC tables, not read back from the rendered page, so a state
 * that a plan forgot to draw fails the spec. A cell may exist that is not listed here (extra
 * review cells such as a long-label button); the manifest is a floor, not a mirror.
 *
 * Every deliberate difference from a UI-SPEC table is commented where it applies:
 *  - "n/a" rows of a table are omitted (the spec says that state does not exist for the primitive).
 *  - A state the spec expresses as an interaction on a live cell rather than a drawn state is
 *    omitted with the reason.
 *  - Ids follow StateCell: lower case with hyphens, naming the state as the spec eyebrow does.
 *
 * This module holds ids only: no colour, size or copy, and no imports, so it can be read by the
 * e2e specs without pulling any fixture code in.
 */

export const FIXTURE_STATE_MANIFEST: Record<string, string[]> = {
  // Foundation sections: the spec's section 1 to 3 topics.
  tokens: ['type-scale', 'spacing', 'surfaces', 'rules', 'focus', 'motion', 'direction'],
  'status-palette': ['marks', 'cvd', 'contrast'],
  'spectrogram-scale': ['vertical', 'horizontal', 'parameters'],

  // Button: default, hover, focus-visible, pressed, disabled, pending, and the variants.
  button: ['default', 'hover', 'focus', 'pressed', 'disabled', 'pending', 'secondary', 'quiet', 'inverse', 'icon-only', 'link-button'],

  // Dialog: closed, open, scrolling long content, loading, error, phone, plus the alertdialog variant.
  dialog: ['closed', 'open', 'scrolling-long-content', 'loading', 'error', 'phone', 'alertdialog'],

  // Sheet: closed, open right, open bottom, long content scrolling, loading, error.
  sheet: ['closed', 'open-right', 'open-bottom', 'long-content-scrolling', 'loading', 'error'],

  // Listbox: default, hover, focus, selected, disabled item, loading, empty, error, and multiple selection.
  listbox: ['default', 'hover', 'focus', 'selected', 'multiple', 'disabled-item', 'loading', 'empty', 'error'],

  // Table: default, hover row, focus, selected row, disabled row, sorted column. Its loading, empty and
  // error states are omitted here because the spec says "Details in DataTable": data-table owns them.
  table: ['default', 'hover-row', 'focus', 'selected-row', 'disabled-row', 'sorted-column'],

  // Slider and RangeSlider: default, hover, focus, pressed, disabled, loading, empty, error. The default
  // cell uses the label "Playback position" (a fixed shared level range, CONTEXT), not a per-clip one.
  slider: ['default', 'hover', 'focus', 'pressed', 'disabled', 'loading', 'empty', 'error'],

  // ToggleGroup: default, hover, focus, pressed, selected, disabled segment, loading, empty, error, well variant.
  'toggle-group': ['default', 'hover', 'focus', 'pressed', 'selected', 'disabled-segment', 'loading', 'empty', 'error', 'well-variant'],

  // Tooltip: closed, open on hover, open on focus. Loading, empty and error are "not applicable" in the spec.
  tooltip: ['closed', 'open-on-hover', 'open-on-focus'],

  // CommandPalette: closed, open with empty query, results, no results, loading, error.
  'command-palette': ['closed', 'open-empty-query', 'results', 'no-results', 'loading', 'error'],

  // Transport: default, playing, ended, hover, pressed, focus, disabled, loading, empty, error,
  // unsupported, plus the three sizes. "Selected / active" is n/a (play is not a selection).
  transport: ['live', 'default', 'playing', 'ended', 'hover', 'pressed', 'focus', 'disabled', 'loading', 'empty', 'error', 'unsupported', 'medium', 'large'],

  // Spectrogram: the spec's "Default" row is drawn once per variant (panel, hero, compare, thumb), so
  // those four ids stand for default. Hover, selected window, loading, empty, error, unsupported are
  // cells. "Focus" is n/a (the wrapper is not a tab stop: Transport owns the keyboard) and "Disabled"
  // is n/a (a well is drawn or shows another state).
  spectrogram: ['panel', 'hero', 'compare', 'thumb', 'hover', 'selected-window', 'loading', 'empty', 'error', 'unsupported'],

  // WindowStrip: default, hover, focus, selected, playing, disabled, loading, empty, error. CONTEXT
  // ("WindowStrip fixtures"): unclassified and measured-energy cells only, with no illustrative model
  // output until Phase 5. So the spec's "Default (cells coloured by reading)" is drawn as `default`
  // (unclassified) plus `energy`, and the "Abstain" row has no cell. Dense mode is an extra review cell.
  'window-strip': ['live', 'default', 'energy', 'selected', 'playing', 'hover', 'focus', 'disabled', 'loading', 'empty', 'error', 'dense'],

  // BandToggle: default, hover, pressed, focus, selected, disabled, loading, empty, error. The disabled
  // cell is forced (no fixture band lies above the recording's top frequency), so it says so.
  'band-toggle': ['default', 'hover', 'pressed', 'focus', 'selected', 'disabled', 'loading', 'empty', 'error'],

  // CompareRow and CompareDeck: default, hover, focus, selected, playing, disabled, loading, empty slot,
  // error. The disabled and error states are per row, so the ids carry "-row". The spec's recordings with
  // different analysis settings is an extra cell.
  compare: ['default', 'hover', 'focus', 'selected', 'playing', 'disabled-row', 'loading', 'empty-slot', 'error-row', 'different-scales'],

  // ProvenanceChip and Why panel: default, hover, focus, pressed, active (open), loading, empty, error,
  // long text. "Disabled" is n/a (a chip with no provenance renders the missing kind), and the missing
  // kind has its own cell.
  provenance: ['default', 'hover', 'focus', 'pressed', 'active-open', 'missing', 'loading', 'empty', 'error', 'long-text'],

  // StripPlot: default (per variant: strip, paired, scatter), hover, selected, loading, empty, one value,
  // error. "Focus" has no cell: the disclosure button and table carry focus and marks do not, so it is
  // an interaction on the default cell. "Disabled" is n/a (a plot is not a control).
  'strip-plot': ['default', 'paired', 'scatter', 'hover', 'selected', 'loading', 'empty', 'one-value', 'error'],

  // ProbabilityBar: default (differ or agree), abstain, partial classes, loading, empty, error. "Hover,
  // focus, pressed", "Active / selected" and "Disabled" are n/a (read-only). The abstain cell is forced
  // because the current model has no abstain threshold (A7).
  'probability-bar': ['default', 'agree', 'abstain', 'partial-classes', 'loading', 'empty', 'error'],

  // DataTable: default, hover, focus, selected, disabled row, loading, empty, one row, error, long text,
  // and the phone scroll region.
  'data-table': ['default', 'hover', 'focus', 'selected', 'disabled-row', 'one-row', 'long-text', 'phone-scroll', 'loading', 'empty', 'error'],

  // Legend: "Default" is the static legend and the interactive legend; selected, disabled (the interactive
  // zero-count row), loading, empty. Hover and focus of an interactive row are real interactions on the
  // `interactive` cell, not drawn cells. "Error" is n/a (counts come from data already in memory).
  legend: ['static', 'interactive', 'selected', 'disabled-zero-row', 'loading', 'empty'],

  // StatusBand: default, hover, active (selected), loading, empty. "Focus" is the inset ring on the
  // interactive segment, an interaction on `selected`. "Disabled" is n/a (a zero-count segment is omitted
  // instead) and "Error" is the parent's. The phone layout is an extra review cell.
  'status-band': ['default', 'selected', 'hover', 'phone', 'loading', 'empty'],

  // ClipCard: default, hover, focus, playing, loading, error. "Empty" is not applicable.
  'clip-card': ['default', 'hover', 'focus', 'playing', 'loading', 'error'],

  // Empty, Error, Loading state primitives: the spec's anatomy table (empty block and inline, error on
  // load and after an action, loading and its long-wait label).
  states: ['empty-block', 'empty-inline', 'error-on-load', 'error-after-action', 'loading', 'loading-long-wait'],

  // Numerals and AccentBlock, and the band section that carries them.
  numerals: ['stats', 'accent-block', 'band-section'],

  // Motion: the five motions in the spec's Motion table.
  motion: ['selection', 'layout-morph', 'view-transition', 'playhead', 'crossfade'],

  // Compositions and the token wiring probe are one frame each.
  'composition-inspector': ['default'],
  'composition-listen': ['default'],
  'composition-compare': ['default'],
  'composition-explore': ['default'],
  'token-probe': ['default'],
};
