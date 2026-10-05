---
phase: 04-design-system-instrument-primitives
plan: 16
subsystem: ui
tags: [compare-deck, crossfader, equal-power, level-matching, clip-card, r-label, spectrogram, integrity, fixtures]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: Spectrogram, ColourBar and useClipSpectrogram (04-13), audio engine, equalPowerGains, UnequalLengthError and useTransport with two synced clips (04-14), Transport medium/compare, useTransport rename (04-15), Slider (04-11), RLabel (04-08), StatusMark (04-04)
provides:
  - "levelMatchGains, dbToLinear, wellOpacity, specsMatch, durationsMatch, formatMix, formatGain (features/instrument/compare-math.ts)"
  - "Crossfader (features/instrument/Crossfader.tsx)"
  - "CompareRow, CompareDeck, levelLine, recordedLine (features/instrument/CompareRow.tsx, CompareDeck.tsx)"
  - "ClipCard, clipCardPlaceLine (features/instrument/ClipCard.tsx)"
  - "useTransport option levelGainsDb (level-matching gains folded into the crossfade gains)"
  - "/dev/fixtures sections compare and clip-card on the real ind_H1, ind_D1 and nine-excerpt data"
affects: [04-21, 04-22, phase-5, phase-6, phase-7]

requirements: [DS-05, DS-06, DS-08]
requirements-completed: []

actuals:
  tokens: 31700
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Level matching is attenuation only: target = the quietest clip's manifest RMS, every gain is 0 or negative, and the gain is folded into the engine's per-clip gain next to the equal-power crossfade gain"
    - "A deck refuses to rescale: specsMatch false renders a different-scales state with no wells; durationsMatch false disables play with an explicit notice (the engine's UnequalLengthError is the backstop)"
    - "The crossfader dims the picture (canvas opacity), not the whole well, so axes and chips keep their contrast"
    - "An ancestor capture handler takes PageUp/PageDown before the kit Slider's own handler, so a consumer can change the page step without editing the Slider"

key-files:
  created:
    - dashboard-next/src/features/instrument/compare-math.ts
    - dashboard-next/src/features/instrument/Crossfader.tsx
    - dashboard-next/src/features/instrument/CompareRow.tsx
    - dashboard-next/src/features/instrument/CompareDeck.tsx
    - dashboard-next/src/features/instrument/ClipCard.tsx
    - dashboard-next/src/features/fixtures/sections/CompareSection.tsx
    - dashboard-next/src/features/fixtures/sections/ClipCardSection.tsx
    - dashboard-next/src/features/fixtures/parts/excerptIdentity.ts
    - dashboard-next/tests/unit/compare-math.test.ts
    - dashboard-next/tests/unit/crossfader.test.tsx
    - dashboard-next/tests/unit/compare-deck.test.tsx
    - dashboard-next/tests/unit/clip-card.test.tsx
    - dashboard-next/tests/e2e/fixtures-compare.spec.ts
  modified:
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/src/features/instrument/useTransport.ts
    - dashboard-next/src/features/instrument/Spectrogram.tsx
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts

key-decisions:
  - "The matched playback level has to reach the audio, so useTransport gained an optional levelGainsDb (dB per clip, multiplied into the clip's gain); without it the disclosure under the deck would have been false"
  - "Spectrogram's dimmed prop now sets opacity on the canvas only (it had no consumer before 04-16); axe flagged chip text on a 0.45-opacity well, so axes, chips and readout stay at full strength"
  - "The slot letter is a toggle button 'Listen to {slot}'. Pressing it marks the listening focus (3 px ink bar, 'Listening to B' in a polite live region) and moves the mix to that clip alone; moving the crossfader afterwards clears the mark"
  - "Crossfader is A/B only: a third row is shown on the same scale and playhead but is not played, and the deck says so"
  - "Row label text is the dataset's own label_original ('Healthy (H)') inside the reference-label rule with its definition and assigner; ClipCard shows the status name (STATUS_LABELS) inside the same rule with 'Assigned by ...'"
  - "'Level matched: {rms} dB RMS, gain {gain} dB' prints the row's own manifest RMS (one decimal, true minus) and its signed gain; a clip with no RMS says 'Level not matched' and the deck says playback is not matched"

patterns-established:
  - "Fixtures helper excerptIdentity turns a manifest excerpt into a CompareRow identity, so no section or test types a label or level by hand"
  - "Static cells of a live deck are real decks with forced props (forcedRowState, forcedPlaying, defaultListening) and say what was forced"

duration: about 3 h
completed: 2026-10-05
---

# Phase 4 Plan 16: CompareRow, CompareDeck and ClipCard Summary

**CompareDeck puts the real ind_H1 and ind_D1 recordings on one fixed -120 to -50 dB colour scale with one shared playhead and an equal-power A/B crossfader, refuses to rescale when analysis settings or lengths differ, matches playback levels by attenuation only from the manifest RMS and says so; ClipCard shows all nine real excerpts with an assigner-named reference label.**

## Accomplishments

- `compare-math.ts`: `levelMatchGains([-61.9, -58.0])` is `[0, -3.9]` (target is the quietest, gains never boost, never `-0`); `wellOpacity` dims the side the mix moves away from from 1 to 0.45 and, under reduced motion, switches at the 50% point; `specsMatch` over fftSize, hop, dbMin, dbMax and sampleRate; `durationsMatch` with the engine's 10 ms tolerance; `formatMix(0.7)` is "30% A, 70% B".
- `Crossfader`: the kit Slider 0 to 100 step 5, named "Mix between A and B", value text "50% A, 50% B", large italic A and B either side (decorative), arrows 5, PageUp and PageDown 20 (an ancestor capture handler, because the Slider's own page step is ten steps), Home and End to the ends.
- `CompareRow`: slot letter, site id (line break after each underscore), the dataset's label with its status mark inside a solid R-LABEL rule, the definition in quotes, "Assigned by ...", "2022-08-30 12:00 on the recorder clock, timezone unverified", the level line, a `compare` Spectrogram with caption (dataset named from the contract). States: loading skeletons and "Loading recording…", disabled ("Recording unavailable", identity kept), empty ("Add a recording" / "Pick a site or a clip to compare." with a secondary button), error ("This recording could not be loaded." with Retry and Remove).
- `CompareDeck`: shared control strip between rows A and B (medium compare Transport "Play both" / "Pause both", crossfader, 140 px horizontal ColourBar), caption "One colour scale for both wells: −120 to −50 dB re full scale, uncalibrated.", the disclosure about matched levels, listening-focus live region. Different analysis settings render "These recordings use different analysis settings, so they cannot share one colour scale." with no wells; different lengths disable play and say "Nothing is stretched to fit."
- `ClipCard`: 150 px thumb, 56 px play button named "Play {site_id}" (Pause while playing), site id (a link only when `href` is given; the card is an article, never a link), status mark 16 plus label inside an R-LABEL, "{place} · {recorded date}".
- Fixtures sections `compare` (live deck plus hover, focus, selected, playing, disabled row, loading, empty slot, error row and different scales, all on the real recordings) and `clip-card` (all nine real excerpts, one plays at a time, plus forced states). No audio starts without a press.

## Task Commits

1. Task 1: comparison maths and Crossfader - `2e54647` (feat; RED confirmed first: 21 of 21 failed before compare-math.ts existed)
2. Task 2: CompareRow, CompareDeck and the compare section - `78706d2` (feat)
3. Fix found by axe in the task 2 deck: dim the picture only - `7b970a3` (fix)
4. Task 3: ClipCard, clip-card section and the e2e spec - `52a0ff3` (feat)

## Verification

- Unit: `npm test` 76 files, 1378 tests passed. compare-math (21), crossfader (7), compare-deck (28) and clip-card (12) each run 5 times in a row with no failure. `semantic-tokens`, `fixtures-registry`, `copy-claims`, `feature-fence`, `transport`, `playhead-clock` and `spectrogram` pass.
- `npm run lint` 0 errors (20 pre-existing warnings, none in new files; one React Compiler memoisation error in the first CompareDeck draft was fixed). `npm run typecheck` clean.
- Flag-less `npm run build` exits 0; `check-dev-fixtures-excluded.mjs` OK against it (fixtures routes 404); `check-feature-fence.mjs` and `check-contract-fence.mjs` OK.
- Playwright e2e project through an untracked track config (own port 3203, never reusing a server; deleted before the final commit), full: 263 passed (235 before plus 28 new). New `fixtures-compare.spec.ts` with `--repeat-each=5`: 140 of 140 passed. `fixtures-route.spec.ts` plus `fixtures-transport.spec.ts` with `--repeat-each=3`: 396 of 396 passed. axe: zero serious or critical violations for compare and clip-card in atlas, nocturne and poster.
- In headless Chromium: Play both moved the status to playing and the readout advanced; the playhead transform is identical in both wells after a seek; the dim reads 0.45 on the far-away well, 1 at the middle, 0.945 one step off the middle with motion and 0.45 under `?reduced=1`; well heights are 230, 200 and 160 px at desktop, tablet and phone widths; the ClipCard play button is 56 px and the thumb 150 px; starting a second card stops the first.
- The gains the engine receives were verified against a recording AudioContext stub: at the middle, A (ind_H1) is cos(pi/4) and B (ind_D1) is that times 10^(-5.2/20); at B alone the live ramp target for B is the matched gain (about 0.55), never above 1.

Not verifiable here: the sound itself. Headless Chromium and the unit stub have no listener, so a human listen on a device is still needed (play both, move the crossfader, check the loudness feels matched and there is no zipper noise) and Safari is untested. The `check-citations.mjs` run reports `docs/CITATIONS.md` out of date only because this Windows checkout has `core.autocrlf=true` (working copy CRLF, index LF); nothing in this plan touches citations. Docker-pinned visual baselines are not part of this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The dimmed well failed colour contrast**
- **Found during:** Task 3 (axe in the e2e spec, all three directions)
- **Issue:** `Spectrogram`'s `dimmed` set opacity on the whole well, so the chip text over a well dimmed to 0.45 fell below 4.5:1 (`color-contrast`, serious).
- **Fix:** `dimmed` now sets opacity on the canvas only (the prop had no other consumer); the axes, chips and readout stay at full strength. The row's CSS transition moved to the canvas. Unit test asserts the well and chips carry no opacity.
- **Files modified:** dashboard-next/src/features/instrument/Spectrogram.tsx, CompareRow.tsx, tests/unit/compare-deck.test.tsx
- **Commit:** `7b970a3`

**2. [Rule 2 - Missing critical functionality] Matched levels never reached the audio**
- **Found during:** Task 2
- **Issue:** `useTransport.setMix` produced equal-power gains only, so the row text "Level matched: ... gain -5.2 dB" and the disclosure would have been false.
- **Fix:** an optional `levelGainsDb` option on `useTransport` (dB per clip, multiplied into the clip's gain, only attenuation expected). A deck test proves the engine's gains (ratio 10^(-5.2/20) at the middle, never above the original level).
- **Files modified:** dashboard-next/src/features/instrument/useTransport.ts
- **Commit:** `78706d2`

### Additions beyond files_modified (supporting files)

- `dashboard-next/src/features/fixtures/parts/excerptIdentity.ts`: one mapping from a manifest excerpt to a CompareRow identity, shared by the compare and clip-card sections and their tests.
- `dashboard-next/tests/unit/crossfader.test.tsx` and `dashboard-next/tests/e2e/fixtures-compare.spec.ts`: Crossfader keys on their own, and the real-browser checks the plan's verification asks for (kept out of fixtures-route.spec.ts as instructed).
- `dashboard-next/src/features/instrument/Spectrogram.tsx` and `useTransport.ts` (the two fixes above).

### Interpretation notes (not rule deviations)

- The UI-SPEC "listening focus" has no stated effect; it moves the mix to that clip alone and is cleared by the next crossfader move. Rows beyond A and B cannot be the listening focus because they are not played.
- A model reading in a row (UI-SPEC: dashed R-LABEL "MODEL READING") is not drawn: Phase 5 has no per-recording model output yet, and `ClipCard` supports `labelKind="model"` for when it does. Every row today shows a reference label only.
- ClipCard's label is the status name (Healthy, Restored (mid)) while CompareRow shows the dataset's own label text; both sit inside the reference-label rule and name the assigner.
- The equal-power ramp time constant is the engine's 15 ms (04-14), not the UI-SPEC's "50 ms" wording; unchanged here.
- TDD: Task 1 RED was run and recorded. For Tasks 2 and 3 the components and their tests were written together and the first test run passed, so there was no separate RED; the axe failure and the level-gain check were found and covered afterwards.
- `/dev/fixtures` static decks are real decks with forced props, so every deck cell is playable; only the forced PLAYING cell's controls do nothing, and it says so.

## Shared append-only edits

- `registry.tsx`: after the last import, `// 04-16` then the imports of `CompareSection` and `ClipCardSection`; in the array, `// 04-16` plus `define(COMPARE_META, CompareSection),` after `define(BAND_TOGGLE_META, BandToggleSection),`, and `// 04-16` plus `define(CLIP_CARD_META, ClipCardSection),` after `define(DATA_TABLE_META, DataTableSection),` (the registry test requires UI-SPEC order, so these two sit in the middle, not at the end).
- `slugs.ts` (one line): `'compare'` inserted after `'band-toggle'` and `'clip-card'` after `'data-table'`.
- `instrument/index.ts`: three `// 04-16` blocks appended at the end (maths and Crossfader; CompareRow and CompareDeck; ClipCard).
- `tests/e2e/fixtures-route.spec.ts` and the other features barrels: untouched.

## Known Stubs

None. The static fixture cells' handlers do nothing by design and are labelled as forced.

## Threat Flags

None. T-04-16-01 (comparison fairness) is mitigated by `specsMatch` with an explicit different-scales state, `durationsMatch`, the disclosure under the deck and reference labels that name their assigner and definition. T-04-16-02 (loud playback) is mitigated: gains are zero or negative, tested against every manifest RMS value and against the engine's received gains. No new network surface: clips load through the existing /audio/ allow-listed loader.

## Next Phase Readiness

Ready for 04-21 and 04-22 (compositions): `CompareDeck` takes `rows` and `clips` built with `excerptIdentity`, and `ClipCard` composes into the Listen board. Open items: a listening pass by ear on a device, the cited per-recording model reading row (Phase 5), a real site-page `href` for ClipCard (Phase 6), and an audio band filter (carried from 04-15).

## Self-Check: PASSED

- Files exist on disk: compare-math.ts, Crossfader.tsx, CompareRow.tsx, CompareDeck.tsx, ClipCard.tsx, CompareSection.tsx, ClipCardSection.tsx, excerptIdentity.ts, the four unit test files and fixtures-compare.spec.ts.
- Commits `2e54647`, `78706d2`, `7b970a3` and `52a0ff3` present in `git log`.
- All task acceptance criteria re-run and green (vitest, flagged build through Playwright, flag-less build, lint, typecheck, fences, full e2e).
