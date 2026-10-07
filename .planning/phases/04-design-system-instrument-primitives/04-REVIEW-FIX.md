---
phase: 04-design-system-instrument-primitives
fixed_at: 2026-10-07
review_path: .planning/phases/04-design-system-instrument-primitives/04-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 40
fixed: 40
skipped: 0
status: all_fixed
---

# Phase 4 Review Fixes

Four parallel fixers (one per review part), each in its own worktree, merged into redesign/v2-discovery. Merged tree: typecheck clean, lint 0 errors, unit 1588/1588, full e2e 599/599. Fixtures screenshot baselines for the sections whose copy changed are regenerated through the CI snapshot dispatch.

## Part A

## Phase 04 Part A: Code Review Fix Report

Branch `worktree-agent-a2b6b615156ee2cd1`, worktree `C:\Users\TylerLubyHoward\reefradar\.claude\worktrees\agent-a2b6b615156ee2cd1`, base 6005ee6.

### Fixed

#### WR-01 Tooltip portal (0e02575)
Files: `dashboard-next/src/features/ui/Tooltip.tsx`, `dashboard-next/tests/unit/tooltip.test.tsx`.
`SurfaceRacTooltip` reads `TooltipTriggerStateContext` and, once open, passes the instrument surface root (`overlayContainer()` from Dialog.tsx) as `UNSTABLE_portalContainer`, same lookup-on-open pattern as `SurfaceModalOverlay`. Falls back to `document.body` with no surface. Two new tests (inside surface, fallback). Status: fixed.

#### WR-02 LoadingState aria-busy (812fee9)
Files: `LoadingState.tsx`, and the dialog, sheet, listbox, clip-card, state-primitives unit tests.
Dropped `aria-busy` from the `role="status"` region. There is no separate busy content container (the children are aria-hidden skeletons), so no wrapper was added, which keeps the DOM and layout identical. Five existing assertions that required `aria-busy="true"` now assert its absence. Status: fixed.
Note: `features/instrument/Transport.tsx:269` has the same `role="status" aria-busy="true"` pattern. It is outside Part A, so I left it for the Part B fixer. The e2e "no stray aria-busy" fixture check is unaffected, since it only forbids aria-busy outside loading cells.

#### WR-03 Legacy hover on touch (e10e554)
Files: `dashboard-next/src/styles/legacy.css`, `dashboard-next/tests/unit/tailwind-v4-sources.test.ts`.
A plain `@custom-variant hover (&:hover)` would also have removed the media gate from the kit's own `hover:` utilities (ClipCard, CompareRow, AttributionFooter, InstrumentHeader), which use `hover:` and not `hover-state:`, so the variant is scoped:
- outside `[data-surface='instrument']`: `&:where(:not([data-surface='instrument'] *)):hover`, ungated (Tailwind 3 behaviour, so a tap fires hover on touch);
- inside the surface: the v4 `@media (hover: hover)` gate is kept.
`:where()` keeps specificity equal to plain `:hover`. `hover-state:` is a separate variant and is untouched. New unit test compiles globals.css and asserts both forms for `hover:text-bone`.
Legacy baselines: desktop Chromium matches `(hover: hover)`, and static screenshots have no hovered element, so the legacy rules apply identically on desktop and the 33 baselines cannot change. I confirmed with the 04-01 fingerprint tooling (all 11 legacy states at 1440 and 390 px, built before and after): 23 of 24 files identical, 0 unexplained. `dashboard-390` differed once (element count 140 vs 138, a timing-dependent dashboard load); a rerun of that file after the change matched the before dump with 0 unexplained. The Playwright visual project was not run (it is Docker-pinned; CI is the judge).
Status: fixed (requires human verification of touch behaviour on a real device).

#### WR-04 check-dev-fixtures-excluded.mjs cleanup (c5f3c80)
File: `scripts/check-dev-fixtures-excluded.mjs`.
`waitForServer` now throws instead of calling `fail`; the try/catch records the failure, `finally` kills the server, and `fail` runs after. Also added a `child.on('error')` handler, SIGINT/SIGTERM and process-exit kill hooks, and a fail-fast check that nothing already answers on port 3107 (a stale server could otherwise be probed). Verified: with the startup timeout cut to 300 ms the script failed with a clear message and port 3107 was free afterwards. The normal path still prints OK and two 404s. Status: fixed.

#### WR-05 CI concurrency (56fda4d)
File: `.github/workflows/ci.yml`.
Group is now `ci-<workflow>-<event_name>-<run_id for workflow_dispatch, else ref>`. Push and pull_request groups are byte-identical to before. YAML parsed with PyYAML. Status: fixed.

#### WR-06 Production guard (414dd95)
Files: `dashboard-next/next.config.js`, `dashboard-next/tests/unit/next-config-fixtures-guard.test.ts` (new).
`next.config.js` throws when `NEXT_PUBLIC_DEV_FIXTURES === '1'` and `VERCEL_ENV === 'production'`. Previews and local or CI builds are unaffected. Three tests (throws, preview and local allowed, production without flag defines 0). Not added: the optional `--no-server` check as a Vercel buildCommand suffix. Status: fixed.

### Verification (in the worktree dashboard-next, not the main checkout)
- `npm run lint`: 0 errors (20 pre-existing warnings).
- `npm run typecheck`: pass.
- `npm test`: first run 88 files, 1512 tests, all passed. The final rerun had 4 failures in sites-page and monitoring-scrub (the known flaky files); rerun alone, 47 of 47 passed.
- Changed or new tests (tooltip, dialog, sheet, listbox, clip-card, state-primitives, tailwind-v4-sources, next-config-fixtures-guard): each run 5 times, all green.
- Flag-less `npm run build` passed and `scripts/check-dev-fixtures-excluded.mjs` printed OK (marker absent from 486 files, both routes 404).
- Full e2e project run on port 3211: 594 passed, 3 failed (`fixtures-route.spec.ts` Direction switcher URL x2, `fixtures-transport.spec.ts` "Target crashed" on page creation). A rerun of those two spec files was cut short when the machine slept and was not completed, so it is unconfirmed whether the failures are environmental (browser crash, load from parallel fixers) or related. None of these touch the changed code paths directly (URL state of the Direction switcher, a crashed page). The orchestrator's single e2e run on the merged tree is the judge. Per the coordinator's instruction, e2e was not repeated.
- The untracked local Playwright configs were deleted; the working tree is clean.

## Part B

## Phase 4 (Part B): Code Review Fix Report

**Source review:** `.planning/phases/04-design-system-instrument-primitives/04-REVIEW.md`, Part B (WR-01 to WR-08; info items out of scope)
**Branch:** `worktree-agent-ade24f2c4fae983dd` (base 6005ee6)
**Worktree:** `C:\Users\TylerLubyHoward\reefradar\.claude\worktrees\agent-ade24f2c4fae983dd`

### Fixed Issues

#### B WR-01: `safeMethodsHref` accepted `/<TAB>/evil.com`
**Commit:** 4deba9e
**Files:** `dashboard-next/src/features/instrument/WhyPanel.tsx`, `dashboard-next/tests/unit/provenance.test.tsx`
**Fix:** A path is now resolved against `https://placeholder.invalid` and kept only if the origin is unchanged; the normalised path, query and hash are emitted. Tests: tab, LF, CR, backslash and protocol-relative variants all drop the link; a same-site path with query and fragment is kept.

#### B WR-02 and B WR-03: sub-window clips, unbounded sample rate
**Commit:** 49228b9 (one commit for both, they share the loader and the tests)
**Files:** `dsp/wav.ts`, `dsp/index.ts`, `useClipSpectrogram.ts`, `playhead.ts`, `Spectrogram.tsx` (all under `src/features/instrument/`), and tests `wav`, `playhead`, `clip-spectrogram`, `spectrogram`.
**Fix:**
- The parser rejects sample rates outside 8 kHz to 192 kHz with a `WavFormatError`.
- The loader (`fetchAndTransform`) throws a `WavFormatError` when the data is shorter than one FFT window; the hook turns it into the `error` state.
- `Spectrogram` shows its error state for a matrix with no frames or no duration, so it can never reach `createImageData(0, ...)`, "NaN dB" or `NaN%` offsets.
- `frequencyTicks` returns `[0]` for a non-finite or non-positive Nyquist and caps at 64 ticks.
- The parser itself still accepts short data, because existing tests parse 2-frame buffers. The short-data check lives in the loader, as the review suggested.

#### B WR-04 and B WR-05: ProbabilityBar input validation, absent `evaluation`
**Commit:** 6672841 (one commit, same file and test file)
**Files:** `ProbabilityBar.tsx`, `tests/unit/probability-bar.test.tsx`
**Fix:**
- WR-04: `readingOf` validates the reading before any row is built. A non-finite, negative or above-1 value, a class not in `modelClasses`, an all-zero reading, or a total further than 0.02 from 1 renders "The model reading could not be shown." with no percentages, no "highest probability" sentence and no verdict, and never renormalises. The invalid state also takes precedence over abstain. A reading holding only some of the model's classes still draws (no invented zero row).
- WR-05: the limits line uses `evaluation == null`, and the type is `evaluation?: object | null`.
- One existing test sent `restored_mid: 0.5` and expected it to be dropped silently. That is exactly the behaviour WR-04 forbids, so the test now expects the invalid state.
- **Requires human verification:** the 0.02 total tolerance is my choice (the review only said "optionally flag").

#### B WR-06: WindowStrip energy legend
**Commit:** eb83921
**Files:** `WindowStrip.tsx`, `tests/unit/window-strip.test.tsx`, `tests/e2e/fixtures-transport.spec.ts`
**Fix:** The legend now says "Shading is relative within this clip, from its quietest to its loudest window, so strips from different clips cannot be compared by shade (MIN to MAX dB RMS)". The range is computed from the cells. The unit and e2e assertions on the old exact text were updated.
- **Visual baselines:** the Docker-pinned `fixtures-shots` baselines for the window-strip section will differ by this legend sentence. They cannot be regenerated on Windows, so CI will need a baseline update.

#### B WR-07: CompareDeck keyed on `siteId`
**Commit:** 7904b4f
**Files:** `CompareRow.tsx` (new required `identity.clipId`), `CompareDeck.tsx`, `fixtures/parts/excerptIdentity.ts`, `fixtures/parts/useCompareFixture.ts`, `fixtures/sections/CompareSection.tsx`, `tests/unit/compare-deck.test.tsx`
**Fix:**
- Clips, gains and engine ids are keyed on the excerpt id (`clipId`), carried on the row identity. `clips.find` and the gain map use it.
- If slots A and B hold the same recording, the pair is not playable and a `data-notice="same-recording"` status line says so.
- `useTransport` and the audio engine were already keyed on the clip `id` string, so they needed no change.
- Tests: two rows sharing a site keep their own matched gains and play with separate gains; the same recording in both slots is disabled with the notice.

#### B WR-08: spectrogram image width cap
**Commit:** 4f4ee09
**Files:** `dsp/colormap.ts`, `dsp/index.ts`, `Spectrogram.tsx`, `tests/unit/colormap.test.ts`, `tests/unit/spectrogram.test.tsx`
**Fix:**
- `matrixToImageData` takes `maxWidth`, default `MAX_IMAGE_COLUMNS = 8192`. Beyond that, each column holds the max of the run of frames it covers (max-pooling in time, so short events survive). The quantised levels and the fixed -120 to -50 dB range are untouched.
- `Spectrogram` maps frame rectangles to image columns by `image.width / matrix.frames`, so scroll mode still works.
- Tests: pooling geometry and values, the cap, no decimation at or below the cap, a 20,000-frame clip drawing in sweep mode, and scroll-mode pan in columns.
- Max-pooling shows the loudest frame in each column, a display choice that overstates the level slightly for clips longer than about 65 s at 32 kHz. This is noted in the code comment.

### Skipped Issues

None.

### Verification

Run in the isolated worktree `C:\Users\TylerLubyHoward\reefradar\.claude\worktrees\agent-ade24f2c4fae983dd\dashboard-next` (own `npm ci`), not the main checkout.

- `npm run lint`: 0 errors, 20 warnings, all in files this fix did not touch (legacy hooks and components; the `useTransport.ts` warning was already there).
- `npm run typecheck`: clean.
- `npm test`: 87 files, 1553 tests, all pass.
- `npm run build`, flag-less: succeeds.
- Changed and new unit test files run 5 times: 253 tests, all five runs pass.
- e2e, project `e2e` (axe included), via an untracked local config on port 3242 (3212 was already in use by another process); the config is deleted.
  - First full run: 582 passed, 15 failed. Failures were page.goto timeouts, "Target crashed", a client-error spec and similar, while four fixers shared the machine.
  - `--last-failed` rerun: 13 of the 15 passed; the two `fixtures-route` Direction-switcher tests were still failing.
  - A baseline checkout of 6005ee6 (temporary worktree, since removed) failed the Direction-switcher test (line 118) in a full `fixtures-route` run, so it is not caused by these changes.
  - Rerun alone, the five `fixtures-route.spec.ts` tests at lines 118, 136, 155, 204 and 222 all pass (5 passed).
  - Net: no e2e failure attributable to these fixes. The changed e2e assertion (fixtures-transport legend) passes.
- The `visual` and `fixtures-shots` projects were not run (Docker-pinned baselines).

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Part C

## Phase 4 Part C: Code Review Fix Report

Branch: worktree-agent-a7d1e3e87764bb0d4
Worktree: C:\Users\TylerLubyHoward\reefradar\.claude\worktrees\agent-a7d1e3e87764bb0d4
Base: 6005ee6 (fast-forwarded from 4165617)

### Fixed

- C-CR-01 (e8c99f2): StripPlot click resolves the mark with closest('path, circle') and reads only its direct title child; svg root or host click selects nothing. Unit test added in strip-plot.test.tsx.
- C-WR-01 (af434aa, 475e355): setParam appends window.location.hash; carried section links append the validated tok overrides. Two e2e tests added (hash kept, tok kept on single-section nav); 475e355 adds a hydration wait to the hash test.
- C-WR-02 (e33ce68): ConditionalShell matches /dev exactly or /dev/ prefix. New unit test conditional-shell.test.tsx.
- C-WR-03 (039d5ff): new parts/windowCopy.ts (WINDOW_S, windowCount, windowLabel), one-based. Spectrogram selected-window note now "Window 3 (10 s to 15 s)" (index 2 kept, outline unchanged); WindowStrip notes computed from the same helper. Unit test fixtures-window-copy.test.ts. This commit also contains the WindowStrip expectedCount change (WR-06, same file).
- C-WR-04 (8454fde): useCompareFixture (shared) and CompareSection copy treat a missing dataset as loading; CompareSection.ready also requires sites.data. Unit test fixtures-compare-loading.test.tsx.
- C-WR-05 (11c3f84): scatter spec built only when both projection and sites have arrived.
- C-WR-06 (d049a7f): Transport DURATION_S from FIXTURE_EXCERPT.duration_s; Transport and Compare readout notes computed; BandToggle disabled reason from NYQUIST_HZ; ProbabilityBar note uses classes.length (number word). WindowStrip expected count landed in C-WR-03. BandToggle meta `data` string still says "Nyquist 8 kHz" (descriptive source text, left as is).
- C-WR-07 (f9c838f): headline now "Reference labels: healthy and degraded, 0.8 km apart."; subline starts with "Labels assigned by {assigner}." (once if shared, "X and Y" if different), from the contract sites. Tests and fixtures-compositions e2e updated. Judgement call: the assigner is in the line directly under the headline, not in the display-size headline, because MARRS assigner strings are long.

### Verification (dashboard-next, main worktree, run in the foreground)

- npm run lint: 0 errors (20 pre-existing warnings, none in touched files)
- npm run typecheck: pass
- npm test: 1524 tests; first run 6 failures only in the known flaky monitoring-scrub and sites-page; rerun alone: 47/47 pass
- Changed or new unit tests run 5x: 58/58 each time
- Flag-less npm run build: pass; scripts/check-dev-fixtures-excluded.mjs (repo root scripts/): OK, marker absent from 486 files, both dev routes 404
- Full e2e project (local config, port 3213): first run 571 passed, 28 failed, almost all browser crashes or ERR_INSUFFICIENT_RESOURCES from machine load. Re-run of the failures at 2 workers: 26 passed, 2 failed (fixtures-route Direction switcher test, Reduced motion toggle test). Both fail intermittently on the BASE FixturesApp too (confirmed by reverting my change and rerunning: they still failed 1 of 3 and 2 of 3); a click before hydration is not handled. They are pre-existing flakes in tests I did not change. The second e2e run for the hash test timed out in the webServer build (machine slept), so the final form of the hash test (with hydration wait) was not re-run to green; the orchestrator's merged-tree e2e run covers it. Per the coordinator, the full e2e project was skipped after that.

### Fixture sections whose screenshots change (regenerate via CI dispatch)

- spectrogram: the selected-window cell note text ("Window 3 ..." instead of "Window 2 ...")
- window-strip: the playing cell note ("Window 2 (5 s to 10 s) selected and playing ...") and the dense cell note ("The same windows ...")
- composition-compare: headline and subline text (all three directions and viewports that capture it)

No pixel change expected in: transport, compare, band-toggle, probability-bar, strip-plot, motion, chrome (computed copy produces the same text), and the loading-gate and click fixes only affect transient or interaction states.

Untracked playwright.local.config.ts deleted.

## Part D

## Phase 4 Part D: Code Review Fix Report

Branch: `worktree-agent-ac646e46146317276`
Worktree: `C:\Users\TylerLubyHoward\reefradar\.claude\worktrees\agent-ac646e46146317276`
Base: 6005ee6. Commits 432c579..a42bbd5. Only test code, test support helpers and `playwright.config.ts` changed. Nothing under `src/` was touched.

### Fixed

| Finding | Commit | Applied fix |
|---|---|---|
| CR-01 | 432c579 | The unmount test spies `MutationObserver.prototype.disconnect` and asserts it was called once. Mutation-checked: removing `observer.disconnect()` from `tokens.ts` now fails the test. |
| WR-01 | b63c23c | `openFixtures` waits for the Direction radiogroup, which exists only in the hydrated surface. The `?tok=` negatives sit beside a valid override as a positive control. |
| WR-02 | a771182 | The four per-direction axe loops in the route spec use `openSection` and assert `data-direction`. Route spec now registers its mock via `ensureMocked`, so there is no double mock. |
| WR-03 | e8fe38e | Compare, transport and compositions axe runs use `openSection`. The 390 px overflow test settles each page and asserts the heading. |
| WR-04 | e8fe38e (transport, compositions), 1fa458f (route spec) | Focus is awaited before Escape, Tab, Arrow, Space, Enter and typing. |
| WR-05 | c22d3b9 | Added `settleFrames` to `support/fixtures.ts`. The three refused-press checks settle two frames and have positive controls: turn High on, move the lower thumb down. |
| WR-06 | 364a8b9 | The link exemption is scoped to `footer p, [data-inline-links]`. Every exempt element is recorded. Each section asserts the exact exempt links, or caps strip cells (40; 36 live) and segments (4; 2 live). |
| WR-07 | 9d66ea8 | Positive controls: Archivo face exists, new fonts registered, legacy `document.fonts` non-empty. Removed the unused `fontRequests` and the `console.log`. |
| WR-08 | a62f8d8 | `length > 0` inside the same evaluate or poll for the td, dd, `data-bar-fill`, legend-row and href checks. |
| WR-09 | 42ed5d9 | Spectrogram readout is polled with fresh bounds and `1[45]`. Playhead and window fractions are polled. Reduced-motion `before` is captured only once the transform exists, and the readout tick is awaited before the zero-frame assertion. Morph row order is captured once two reads agree. `getAnimations` is read after `settleFrames`. |
| WR-10 | 1f59cc1 | In CI, a missing `PW_VISUAL` throws unless `PW_UPDATE=1`. The baseline check requires the full `expectedBaselineFiles()` set. Verified by running the fixtures-shots project: skipped locally, failed with `CI=true`, skipped with `CI=true PW_UPDATE=1`. |
| WR-11 | 44e3821 | `maxDiffPixelRatio` is 0.001 on the `fixtures-shots` project only. The legacy `visual` project is untouched. See the note below. |
| WR-12 | 3a138e3 | The numeral assertions are anchored regexes (`^\s*54\s*reference sites\s*$`). |
| WR-13 | 3a3f451 | Waits for the phone cell's region (positive control for the measurement) before asserting the wide cell has none. |
| WR-14 | 734246f | Hostname allowlist (`*.cloudfront.net`, `*.execute-api.*.amazonaws.com`) and only fetch/xhr resource types. `requireWebGL2` treats CI as `'true'` or `'1'` only. |
| WR-15 | 4eceaaa | The hex rule covers 3, 4, 6 and 8 digits. Added `lab`, `lch` and `color(<space>)`. Every `SCAN_DIRS`/`SCAN_FILES` entry must exist. Planted cases added. |
| WR-16 | ab20562 | The fetch fence catches `window.`, `globalThis.` and `self.fetch(`; `client.fetch(` stays exempt. The reviewer's suggested regex would have flagged `client.fetch(`, so the lookbehind is `(?<![\w$.])` with the receiver inside the match. Planted cases added. |
| WR-17 | a42bbd5 (StripPlot), plus the 90 s timeouts shipped with WR-02 and WR-03 | StripPlot setup is 120 s. Route axe loops, compare, transport and compositions axe loops and the overflow test are 90 s. |

#### Notes

- WR-11 value: 0.001 is 10x tighter than the 0.01 used elsewhere. That is a few hundred pixels on the smallest (390 px) shot and several thousand on a tall 1440 px shot. It is not a single-swatch detector on a tall shot. I could not validate it against the Linux container: Docker is not available here, and the Windows baselines differ. The basis is that the baselines were generated in the same pinned image (dispatch 37294867133) and four later CI runs were green. If the visual job goes red on noise, raise it to 0.003. A unit test guards the project-only override. `threshold` was left at its default.
- Commit grouping: WR-04's transport and compositions edits and WR-17's compare/transport/compositions timeouts share files with WR-03, so they shipped in e8fe38e. The commit message says so.
- WR-15 same-line `//` inside a string literal was not changed. The review gave no fix for it and it lives in the comment blanker.
- `fixtures.spec.ts` now imports `settleFrames` from `support/fixtures.ts` instead of its own copy.

### Verification (run in the isolated worktree, using a local build served on port 3214; the local config was deleted afterwards)

- `fixtures-route.spec.ts` `--repeat-each=3`: 357 passed.
- `fixtures-compare`, `fixtures-transport`, `fixtures-compositions` and `fixtures-keyboard` `--repeat-each=3`: 375 passed.
- `fixtures-targets`, `fixtures-spectrogram`, `reduced-motion`, `legacy-isolation` and `token-bridge` `--repeat-each=3`: 375 passed.
- Earlier `--repeat-each=5` runs per finding passed: WR-01, WR-04, WR-05, WR-06 (180), WR-07 (75), WR-08, WR-09 (65), CR-01 mutation check.
- `fixtures.spec.ts` (fixtures-shots) was only exercised through its gate logic, since the screenshots need the Linux image.
- `npm test`: 87 files, 1517 tests passed.
- `npm run lint`: 0 errors. 20 warnings, none in files I changed.
- `npm run typecheck`: clean.
- Not run: the full e2e project twice (the orchestrator runs it on the merged tree).
- Load flake: a single 5-worker run, while sibling fixers were building, gave 9 failures in provenance and command-palette tests (a "Worker failed to load" error boundary and a browser process crash). The same tests passed 40/40 at `--workers=2`. This was machine-load related, not a test defect. Verification runs used `--workers=2`.

Remaining skipped: none.

_Fixer: Claude (gsd-code-fixer), Part D, iteration 1_
