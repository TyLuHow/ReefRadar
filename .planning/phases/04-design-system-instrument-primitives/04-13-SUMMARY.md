---
phase: 04-design-system-instrument-primitives
plan: 13
subsystem: ui
tags: [spectrogram, colourbar, waveform, canvas-2d, magma, fixed-range, playhead, scroll-mode, reduced-motion, fixtures, dev-fixtures, e2e, integrity]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: DSP core (parseWavPcm16, computeSpectrogram, MAGMA_LUT, SPECTROGRAM_SPEC, DB_TICKS), token bridge, reduced-motion hook, fixtures registry and chrome, BandSection (04-02, 04-03, 04-07, 04-08)
provides:
  - "Spectrogram, SpectrogramHandle, SpectrogramProps, spectrogramCaption (features/instrument/Spectrogram.tsx)"
  - "ColourBar, formatDb (features/instrument/ColourBar.tsx)"
  - "Waveform, waveformEnvelope, WAVEFORM_RANGE (features/instrument/Waveform.tsx)"
  - "useClipSpectrogram, loadClip, isClipPath, clearClipCache (features/instrument/useClipSpectrogram.ts)"
  - "playheadX, scrollSourceRect, backingStoreSize, frequencyTicks, timeTicks (features/instrument/playhead.ts)"
  - "AudioExcerpt.rms_dbfs optional field"
  - "Fixtures sections spectrogram-scale and spectrogram, registered in UI-SPEC order"
affects: [04-14, 04-15, 04-16, 04-21, 04-22, 04-23, phase-6, phase-7, fixtures, design-system]

actuals:
  tokens: 31800
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "A precomputed magma image is built once per matrix (WeakMap, OffscreenCanvas when available) and drawn onto the visible canvas once per resize; wells that share a clip share one image"
    - "The playhead, selected window and time labels are DOM elements moved by transform from refs through an imperative handle; scroll mode costs one drawImage per playhead update, sweep costs none"
    - "A single in-page measurement per e2e assertion (canvas pixels and CSS box, playhead and plot boxes) so no expected value is computed outside a poll"
    - "A same-origin loader refuses anything but /audio/*.wav before fetch and caches one transform per URL"

key-files:
  created:
    - dashboard-next/src/features/instrument/Spectrogram.tsx
    - dashboard-next/src/features/instrument/ColourBar.tsx
    - dashboard-next/src/features/instrument/Waveform.tsx
    - dashboard-next/src/features/instrument/playhead.ts
    - dashboard-next/src/features/instrument/useClipSpectrogram.ts
    - dashboard-next/src/features/fixtures/sections/SpectrogramScaleSection.tsx
    - dashboard-next/src/features/fixtures/sections/SpectrogramSection.tsx
    - dashboard-next/tests/unit/playhead.test.ts
    - dashboard-next/tests/unit/clip-spectrogram.test.tsx
    - dashboard-next/tests/unit/spectrogram.test.tsx
    - dashboard-next/tests/e2e/fixtures-spectrogram.spec.ts
  modified:
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/src/lib/audio-manifest.ts
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/tests/unit/audio-manifest.test.ts
    - dashboard-next/tests/unit/api-client.test.ts

key-decisions:
  - "In scroll mode the source window is clamped to the image, so the DOM playhead uses the true fraction from scrollSourceRect (22 % away from the clip ends, walking in from the left and out to the right at the ends) instead of pretending to sit at 22 %; playheadX(.., 'scroll') still returns 0.22 x width as specified"
  - "The waveform has one fixed vertical range of +-0.25 of full scale for every clip, stated in its caption; real hydrophone excerpts sit at about -67 to -47 dB re full scale RMS, so most of the picture is a thin line with peaks, and a peak beyond the range is cut off in the picture"
  - "The wrapper's aria-describedby points at the caption and the hidden metadata summary (two ids), so the summary is reachable although a role=img wrapper makes its children presentational"
  - "The thumb variant draws the whole clip (no object-fit crop) and its caption is sr-only; caption parameters (duration, rate, FFT size) are taken from the matrix when one is drawn, so the caption prints what was actually used"
  - "Below 640 px every second time label is hidden by CSS (they stay in the DOM) and the panel's horizontal colourbar fills its width, because 5 s labels and the -60/-50 ticks collide on a phone"

patterns-established:
  - "Static well states (loading, empty, error, unsupported) are the same height as the well they replace, with text in well-ink on well tokens, never an icon"

requirements-completed: []
requirements-advanced: [DS-03, DS-05, DS-08]

coverage:
  - id: D1
    description: "The panel, hero, compare and thumb wells draw the real ind_H1 excerpt in dark wells with the magma scale (non-blank, at least 50 distinct colours) and the canvas backing store equals CSS size times devicePixelRatio (2)"
    requirement: DS-03
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-spectrogram.spec.ts#the panel well draws the real clip: non-blank, and the backing store follows devicePixelRatio, #every variant paints the same real data, non-blank"
        status: pass
      - kind: unit
        ref: "tests/unit/spectrogram.test.tsx#Spectrogram: canvas"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every well uses the fixed -120 to -50 dB range; the caption prints the parameters used and says the level is uncalibrated; the colourbar shows -120, -100, -80, -60, -50 (hero: end labels) with U+2212 minus signs; the hero adds the brighter-is-louder note"
    requirement: DS-03
    verification:
      - kind: unit
        ref: "tests/unit/spectrogram.test.tsx#Spectrogram: name, caption and summary, #ColourBar, #Spectrogram: axes by variant"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-spectrogram.spec.ts#the panel is an image named for the site, range and duration, #panel axes, #hero and compare carry the 8 kHz chips, #Spectrogram scale section"
        status: pass
    human_judgment: false
  - id: D3
    description: "Four variants share one renderer with UI-SPEC heights at desktop, tablet and phone (panel 220/220/160, hero 440/360/240, compare 230/200/160, thumb 150); the colourbar is vertical from 640 px and horizontal under the well on a phone"
    requirement: DS-05
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-spectrogram.spec.ts#well heights at desktop|tablet|phone, #the colourbar is vertical at the right of a panel from 640 px and horizontal under it on a phone"
        status: pass
    human_judgment: false
  - id: D4
    description: "The playhead is a DOM element moved by transform (imperative handle, no canvas repaint in sweep, no per-frame React state); scroll mode pans the image under a playhead at 22 % with one drawImage per update; under reduced motion the scroll mode is forced to sweep; the selected 5 s window spans its seconds"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/spectrogram.test.tsx#Spectrogram: playhead, window, bands and readout, tests/unit/playhead.test.ts"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-spectrogram.spec.ts#the playhead sits at its elapsed fraction, #scroll mode holds the playhead at 22 %, #under reduced motion the scroll cell is a sweep"
        status: pass
    human_judgment: false
  - id: D5
    description: "Loading, empty, error and unsupported states keep the well height and say what happened and what to do; the description holds metadata only (duration, rate, RMS level) and no health, species or behaviour words"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/spectrogram.test.tsx#Spectrogram: states, #never says anything about health, species or behaviour"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-spectrogram.spec.ts#the loading|empty|error|unsupported state keeps the panel well height"
        status: pass
    human_judgment: false
  - id: D6
    description: "The clip loader fetches only same-origin /audio/*.wav paths, shares one transform per URL, keeps the raw bytes and does not cache a failure; the canvas backing store is capped at 8192 wide and 8192 x 2048 pixels"
    requirement: DS-03
    verification:
      - kind: unit
        ref: "tests/unit/clip-spectrogram.test.tsx, tests/unit/playhead.test.ts#backingStoreSize"
        status: pass
    human_judgment: false
  - id: D7
    description: "Both new sections are axe-clean (serious/critical) in all three directions; wells stay dark in every direction; the wells are not tab stops"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-spectrogram.spec.ts#axe: spectrogram-scale|spectrogram has no serious or critical violation in atlas|nocturne|poster, #wells stay dark in atlas|nocturne|poster"
        status: pass
    human_judgment: false
  - id: D8
    description: "The magma ramp reads well in greyscale, labels over the image are legible, and the waveform's fixed +-0.25 range looks right on real clips"
    requirement: DS-03
    human_judgment: true
    rationale: "axe cannot measure canvas pixel contrast. Checked by eye on screenshots of every cell at 1280 and 390 px (no screenshots committed); Docker-pinned visual baselines and the owner's direction review are later plans."

duration: 45min
completed: 2026-10-05
status: complete
---

# Phase 4 Plan 13: Spectrogram, ColourBar and Waveform Summary

**Canvas 2D spectrogram wells (panel, hero, compare, thumb) from a precomputed magma image on the one fixed -120 to -50 dB re full scale range, with a DOM playhead moved by transform, scroll mode at 22 % (none under reduced motion), a dB colourbar and a caption that prints the parameters used and says the level is uncalibrated, plus a min/max waveform, a same-origin clip loader and two fixtures sections drawn from the real ind_H1 MARRS excerpt.**

## What was built

- **Task 1** (RED `59e567c`, GREEN `4808122`): `playhead.ts` with `playheadX`, `scrollSourceRect` (clamped to the image, returning the true playhead fraction), `backingStoreSize` (width at most 8192, area at most 8192 x 2048, aspect kept, missing ratio counts as 1) and the axis tick helpers; `useClipSpectrogram` and `loadClip`, which fetch only paths matching `/audio/...wav` (no `..`, query or fragment), parse with `parseWavPcm16`, transform once per URL in a module Map (concurrent callers share one promise, failures are not cached) and keep the raw `ArrayBuffer` for plan 04-14 (callers must pass `buffer.slice(0)` to `decodeAudioData`); `AudioExcerpt.rms_dbfs` optional field.
- **Task 2** (`24773bf`): `Spectrogram` builds the magma image once per matrix (WeakMap, `OffscreenCanvas` when present) and draws it once per resize onto a canvas sized by `backingStoreSize`; a ResizeObserver plus a window resize listener (zoom changes devicePixelRatio without resizing the box) drive it, and `data-ready="true"` appears after the first draw. The playhead (4 px: 2 px `bg-playhead` between two 1 px `border-well` casings), the selected 5 s window, the dashed band hairlines with labels, the pointer readout ("12.4 s · 3.2 kHz · −47 dB" from `dbAt`), and the pointer-drag `onScrub` are DOM and refs. Panel: frequency column, time labels along the bottom and a vertical colourbar inside the well (horizontal under it on a phone). Hero: three chips, a 24 px time strip and an end-labelled 220 px colourbar on the band. Compare: top and bottom chips. Thumb: no axes. States keep the well height. `ColourBar` is a 12 px strip filled from the magma LUT with the `DB_TICKS`; `Waveform` draws the per-pixel min/max envelope in the `well-ink` token on one fixed vertical range.
- **Task 3** (`32adf17`): `SpectrogramScaleSection` (both colourbars and a parameter table printed from `SPECTROGRAM_SPEC` and `DB_TICKS`) and `SpectrogramSection` (panel, hero on a BandSection, compare, thumb, forced hover, selected window with playhead at 12.4 s, scroll mode, three fixture bands with the "later phase" note, waveform, loading, empty, error, forced unsupported, and the MARRS attribution line), registered in UI-SPEC order. `fixtures-spectrogram.spec.ts` has 32 specs.
- **Fence fix** (`e32fed9`): see deviation 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The fetch( source fence rejected the new clip loader**
- **Found during:** plan-level `npm test` (api-client.test.ts, two failures; the second is the "planted file" test, which lists every non-allowlisted fetch site).
- **Issue:** `tests/unit/api-client.test.ts` keeps a reviewed allowlist of files that may call `fetch(`; `useClipSpectrogram.ts` is a new, required fetch site.
- **Fix:** added it to the allowlist with a comment that `isClipPath` refuses any other path before the call (T-04-13-02). The test file is outside `files_modified`.
- **Commit:** `e32fed9`

**2. [Rule 1 - Bug] Time labels collided on a phone and the hero time strip was not aligned with the full-bleed image**
- **Found during:** visual review of screenshots at 390 px and 1280 px (after the first e2e run, which does not measure label overlap).
- **Issue:** 5 s labels overlapped at about 230 px of plot width; the hero strip sat inside the page gutter while the image ran edge to edge, so the labels did not line up with the time axis; the -60 and -50 ticks of a 220 px horizontal bar touched.
- **Fix:** every second time label is `max-sm:hidden` (kept in the DOM); the hero strip is full-bleed with a 4 px edge inset while the colourbar and caption keep the gutter; the panel's phone colourbar uses `length="fill"` (new `'fill'` option) and the scale section's horizontal bar is 320 px wide.
- **Files modified:** `Spectrogram.tsx`, `ColourBar.tsx`, `SpectrogramScaleSection.tsx`
- **Commit:** `32adf17`

**3. [Rule 1 - Bug] My own first unit test and one e2e assertion were wrong**
- **Found during:** Task 2 and Task 3 runs. A regex for "no hyphen minus in the caption" matched the recorded date; Playwright counts an `sr-only` paragraph as visible (1 px box).
- **Fix:** the unit test checks the part of the caption after "shared range"; the e2e checks the `sr-only` class.
- **Commits:** `24773bf`, `32adf17`

### Plan variations (judgement calls)

- **TDD gate, Task 2:** `spectrogram.test.tsx` was written before the components, but test and implementation went into one commit (`24773bf`), so there is no separate failing-test commit for Task 2 (Task 1 has `59e567c` then `4808122`). Every spec was run red against missing modules while writing.
- **Scroll-mode playhead fraction** (key decision): needed so the playhead points at the real time when the window is clamped at the ends of the clip.
- **Waveform range +-0.25 of full scale** (key decision): the plan gives no vertical range; a shared fixed one is the only choice consistent with "never auto-scale".
- **The panel keeps its colourbar, frequency column and time labels inside the well** (the UI-SPEC says "padding 16 on the well"), so every label sits on a well token and stays legible in all directions.
- **`aria-describedby` has two ids** (caption, then the hidden summary) rather than one.
- **Sweep mode ignores `visibleSeconds`** (always the whole clip); `visibleSeconds` applies to scroll mode only.
- **Extra optional exports** beyond the plan's artifact list: `spectrogramCaption`, `formatDb`, `waveformEnvelope`, `WAVEFORM_RANGE`, `isClipPath`, `loadClip`, `clearClipCache`, `frequencyTicks`, `timeTicks`, `timeTickStep`, `SCROLL_PLAYHEAD_FRACTION`, `ColourBar` `tone` and `length: 'fill'` options.
- **Added tests** the plan's `files_modified` omits: `clip-spectrogram.test.tsx` and an `audio-manifest.test.ts` case for `rms_dbfs`.
- **Time labels use m:ss** ("0:05"), matching the Transport readout convention; the plan names no format.
- **The scale cell's vertical bar** is drawn at 220 px to match a panel well.

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3), 9 judgement calls. **Impact:** none on scope beyond the allowlist line and two added unit test files.

## Verification run

- Task acceptance: `playhead`, `audio-manifest`, `clip-spectrogram`, `spectrogram`, `semantic-tokens`, `copy-claims` and `fixtures-registry` pass; `grep -c "startsWith('/audio/')"` is 1 and `grep -c useImperativeHandle Spectrogram.tsx` is 2; `NEXT_PUBLIC_DEV_FIXTURES=1 npm run build` exits 0.
- Plan level: `npm test` 67 files, 1187 passed (a first run also failed `sites-page` and `monitoring-scrub`, the known timing-sensitive pair, which passed alone and in the rerun; the other two failures were the fence allowlist, fixed in `e32fed9`); `npm run lint` 0 errors, 19 warnings (unchanged); `npm run typecheck` clean; `check-feature-fence` OK (97 files), `check-contract-fence` OK (166 files); flag-less `npm run build` then `check-dev-fixtures-excluded.mjs`: marker absent from 396 built files, `/dev/fixtures/` and `/dev/fixtures/tokens/` both 404.
- Flake discipline: `spectrogram.test.tsx`, `playhead.test.ts` and `clip-spectrogram.test.tsx` 5 of 5 repeats green (66 tests each); the new e2e spec 160 passed at `--repeat-each=5`; the whole `fixtures-route.spec.ts` 276 passed at `--repeat-each=3`; the whole fixture-mocked e2e project 195 passed (axe included) on the final code.
- Process note: the Playwright runs used a throwaway config (not committed, deleted) that skips the rebuild and serves the flagged production build I had just made with the same two flags the repo config sets; the repo config itself was not run in this session.

## Known Stubs

None. The fixture bands are labelled fixture bands with a visible note; the real cited band table is a later phase.

## Threat Flags

None. The only new request surface is the same-origin `/audio/` loader, already in the plan's threat model (T-04-13-02).

## Next Phase Readiness

Ready for 04-14 (Transport and audio engine): `Spectrogram` exposes `setPlayhead(seconds)` for the clock, `useClipSpectrogram` keeps `buffer` (pass `buffer.slice(0)` to `decodeAudioData`), and scroll mode is already forced to sweep under reduced motion (the clock should step 4 times a second there).

## Self-Check: PASSED

All eleven created files exist on disk and commits 59e567c, 4808122, 24773bf, 32adf17, e32fed9 and 0255f74 are in the history; every task acceptance criterion and the plan-level verification were re-run on the final code (see Verification run).
