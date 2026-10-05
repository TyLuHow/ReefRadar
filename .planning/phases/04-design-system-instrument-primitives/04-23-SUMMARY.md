---
phase: 04-design-system-instrument-primitives
plan: 23
subsystem: testing
tags: [playwright, visual-regression, fixtures, ci, screenshots, review-page]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: openSection readiness helper and FIXTURE_STATE_MANIFEST (04-22), the /dev/fixtures route and slugs (04-06 to 04-21), the Docker-pinned visual job and legacy baseline hash guard (04-01)
provides:
  - "Playwright project fixtures-shots (own spec, own snapshot directory), excluded from the e2e project"
  - "tests/e2e/fixtures.spec.ts: 184 element screenshots (32 sections x 4 widths in atlas; nocturne and poster representative set at 1440 and 390)"
  - "tests/e2e/support/fixture-shots.ts: SHOT_WIDTHS, ATLAS_SHOTS, ALTERNATE_SHOTS, ALTERNATE_SECTIONS, ALTERNATE_CELLS, SNAPSHOT_SUFFIX, expectedBaselineFiles()"
  - "ci.yml: dispatch-only Update fixtures snapshots step and fixtures-snapshots artifact"
  - "scripts/build-fixtures-review.mjs: owner review page generator and --check"
affects: [04-24]

requirements: [DS-08]
requirements-completed: []

actuals:
  tokens: 6600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A new screenshot spec gets its own Playwright project, spec file and snapshot directory so a baseline regeneration can never touch another suite's files"
    - "Spec and baseline-set guard share one module (fixture-shots.ts) for the expected file names"

key-files:
  created:
    - dashboard-next/tests/e2e/fixtures.spec.ts
    - dashboard-next/tests/e2e/support/fixture-shots.ts
    - dashboard-next/tests/unit/fixtures-shots-config.test.ts
    - scripts/build-fixtures-review.mjs
  modified:
    - dashboard-next/playwright.config.ts
    - .github/workflows/ci.yml

key-decisions:
  - "No fixtures PNG is committed: baselines come only from the CI update_snapshots dispatch (04-24); locally generated images (win32 suffix, different fonts and rasteriser) would be wrong in CI"
  - "The review page points at the committed baselines with relative paths instead of copying 184 images, so the page and the regression suite always show the same pixels"
  - "Only [data-visual=skip] (the WebGL token-probe map) is masked; spectrogram and waveform canvases are captured because a baseline without them proves nothing"
  - "fixtures.spec.ts is excluded from the e2e project with an anchored regex that cannot match the other fixtures-*.spec.ts browser gates"

patterns-established:
  - "Screenshot readiness = openSection (manifest cells, fonts, no -loading, network idle, no stray aria-busy, data-ready) plus two animation frames, with reduced motion emulated at project level"

completed: 2026-10-05
---

# Phase 4 Plan 23: Fixtures screenshot regression wiring Summary

**The /dev/fixtures route is under screenshot regression in its own Playwright project, spec and snapshot directory (184 captures, all skipping with an annotation until 04-24 commits baselines), with a dispatch-only CI regeneration step and an owner review page generator; the 33 legacy baselines and every existing CI job are unchanged.**

## What was built

### Task 1: fixtures-shots project, spec and config guard (commit 4d597c0)

- `playwright.config.ts`: new project `fixtures-shots` (`testMatch` anchored to `fixtures.spec.ts`, the same `{testDir}/{testFilePath}-snapshots/{arg}-{projectName}-{platform}{ext}` template as `visual`, `reducedMotion: 'reduce'`). The e2e project's `testIgnore` gained `(^|[\\/])fixtures\.spec\.ts$`; every earlier alternative is kept. The `visual` project is untouched.
- `support/fixture-shots.ts`: widths 1440/1024/768/390; atlas shots for every `FIXTURE_SLUGS` entry; alternate shots (nocturne, poster at 1440 and 390) for the whole sections `tokens`, `status-palette`, `legend`, `status-band`, `composition-*` (4) and the cells `spectrogram/hero`, `transport/default`, `transport/large`, `probability-bar/default`, `probability-bar/abstain`, `data-table/default`. `expectedBaselineFiles()` returns the exact Linux file names (`{name}-fixtures-shots-linux.png`) so 04-24's baseline-set test needs no name logic of its own.
- `fixtures.spec.ts`: skips unless `PW_VISUAL=1`; while the snapshot directory is missing or empty and `PW_UPDATE !== '1'` it skips with "No fixtures baselines yet; plan 04-24 generates them with the update_snapshots dispatch." (also in CI). Each test sets the viewport, `openSection`, waits two animation frames, then `toHaveScreenshot` on `section#slug` (or the one state cell), `animations: 'disabled'`, mask `[data-visual="skip"]`. `expectNoUnhandledApiCalls` runs afterEach.
- `fixtures-shots-config.test.ts` (10 tests): project wiring (matches `fixtures.spec.ts` with either path separator and nothing else), e2e `testIgnore` (ignores it, keeps the other fixtures gates and every earlier exclusion), legacy `visual` project unchanged, capture-set sanity.

Determinism choices (the spec header repeats them):
- **Readiness**: `openSection` (manifest cells mounted, `document.fonts.ready`, no `-loading` cell, network idle, no stray `aria-busy`, every well `data-ready`), then two nested animation frames so the last paint lands.
- **Motion**: reduced motion is emulated by the project (the kit honours it, 04-22 proves it) and `animations: 'disabled'` freezes any remaining CSS animation. Forced states (12.4 s playhead, hover readout) are fixed props, so no clock is involved.
- **Canvases**: not hidden. Spectrogram and waveform wells are drawn once from committed audio excerpts; hiding them would make the baselines meaningless. Determinism comes from the pinned Docker image.
- **Fonts**: awaited via `document.fonts.ready` and pinned by the Docker image.
- **Mask**: only the WebGL token-probe map (`data-visual="skip"`, an existing marker). Its GPU raster is not reproducible across renderers; the swatches and table beside it carry the same information and are captured. The masked box paints magenta, so the review page and diffs make the mask obvious.

### Task 2: CI wiring and review generator (commit f37a30c)

- `ci.yml` visual job (see "Push versus dispatch" below).
- `scripts/build-fixtures-review.mjs`: reads the committed baselines, groups by direction then section (slug matched against `slugs.ts`, so hyphenated slugs and `slug-state` cell names parse), writes `docs/deploy/phase-4-fixtures-review/index.html` (inline CSS, no script, direction anchors, widths side by side, relative image paths, alt `{slug}, {direction}, {width} px`, cells as `{slug}/{state}`). `--check` exits 1 for an unreferenced PNG or a dangling reference. No PNGs: prints "no fixtures baselines yet", exit 0. Exercised against fake PNGs in a scratch directory: generation, `--check` ok, `--check` failing on one extra and one missing file.

## Push versus dispatch behaviour of ci.yml

Only the `visual` job changed. Parsed old (HEAD before this task) and new YAML and compared:

| Item | Result |
|------|--------|
| top-level keys other than `jobs` (on, concurrency, permissions) | identical |
| jobs `web`, `e2e`, `python`, `citations`, `review`, `live-smoke` | identical |
| `visual` job keys other than `steps` (needs, container, env, defaults) | identical |
| `visual` steps removed or changed | exactly one: `Run visual regression` |
| `visual` steps added | `Update fixtures snapshots`, an `upload-artifact` for `fixtures-snapshots`, and the new `Run visual regression` |

- **Push / pull_request**: `Run visual regression` (condition unchanged: not a snapshot dispatch) now runs `npx playwright test --project=visual --project=fixtures-shots`. The 33 legacy tests run as before. The 184 fixtures tests are enumerated and skip with the annotation because no baselines exist and `PW_UPDATE` is unset. This was verified locally: `--project=fixtures-shots` against a real build reports `184 skipped`; `--project=visual --list` still lists 33 tests; `--project=visual --project=fixtures-shots --list` lists 217 in 2 files. A push therefore stays green exactly as before, with one build serving both projects.
- **Dispatch with `update_snapshots`**: the legacy `Update snapshots` step (`--project=visual --update-snapshots`) and the `visual-snapshots` upload are byte-identical. The two new steps carry the same `if` as them, so they never run on push. `Update fixtures snapshots` sets `PW_UPDATE: "1"` and runs `--project=fixtures-shots --update-snapshots`; the upload of `fixtures-snapshots` (path `dashboard-next/tests/e2e/fixtures.spec.ts-snapshots`, `if-no-files-found: error`) follows. `Run visual regression` is skipped in this mode, as before.
- No step interpolates a workflow input into a shell command (T-04-23-02); `before_ref` remains checkout-only.
- The e2e job still runs `--project=e2e`. The `fixtures.spec.ts` ignore is a no-op there (the spec was not in that project before); the other fixtures-* specs still run (597 passed locally).
- The concurrency group, which already includes the event name, is untouched, so a push run never cancels the dispatch.

## Verification

All from `dashboard-next` in the worktree unless noted.

| Check | Result |
|-------|--------|
| `npx vitest run tests/unit/fixtures-shots-config.test.ts tests/unit/legacy-baselines.test.ts` | pass (12 tests) |
| `npx playwright test --project=fixtures-shots --list` | 184 tests (32 slugs x 4 = 128 atlas, 56 alternate) |
| `npx playwright test --project=e2e --list`, grep `fixtures.spec.ts` | 0 |
| `npm run lint` | 0 errors, 20 warnings (none in the new files; pre-existing) |
| `npm run typecheck` | pass |
| `npm test` | 86 files, 1503 tests pass |
| `npm run build` (flag-less) | pass |
| `check-contract-fence`, `check-feature-fence` | OK |
| `check-dev-fixtures-excluded` on the flag-less build | OK (marker absent, 2 routes 404) |
| e2e project via a local config (port 3206, fresh server, repo config imported so the edit is exercised) | 597 passed |
| fixtures-shots via the local config, `PW_VISUAL` unset | 184 skipped |
| fixtures-shots with `PW_VISUAL=1 PW_UPDATE=1` (throwaway, win32) | 184 passed, 184 images written |
| the same run again against those images, no update | 184 passed: capture is stable on one machine (spectrogram canvases, Plot, fonts) |
| `node scripts/build-fixtures-review.mjs` | "no fixtures baselines yet", exit 0 |
| `node scripts/check-citations.mjs --scope docs` and `--scope all` | OK |
| YAML parse and old/new comparison of `ci.yml` | as above |

The throwaway local images were deleted and never committed; the untracked `playwright.local.config.ts` was deleted. `git status` is clean.

## Deviations from Plan

**1. [Plan wording] State ids.** The plan names `probability-bar/default-disagree`; the section renders that cell as `default` (the manifest agrees), so `ALTERNATE_CELLS` uses `default`. Likewise `transport/` compact default is `default` and the large cell is `large`.

**2. [TDD ordering] Tests written after the implementation.** Task 1 is marked `tdd="true"`, but the config edit and the unit test landed in one commit rather than a failing-test commit first. The test is a guard on static config, was run green, and a mutation was not done; no RED commit exists.

**3. [Extra] Extra exports in `fixture-shots.ts`** (`ATLAS_SHOTS`, `ALTERNATE_SECTIONS`, `ALTERNATE_CELLS`, `SNAPSHOT_SUFFIX`, `expectedBaselineFiles()`, name helpers) beyond `SHOT_WIDTHS` and `ALTERNATE_SHOTS`, so 04-24's baseline-set test and the spec share one source of names. `ALTERNATE_SHOTS` is the fully expanded list (direction x width x section or cell), each entry carrying its screenshot name.

No auth gates, no stubs, no new network or trust surface.

## Known Stubs

None.

## Issues for 04-24

1. **Repository size.** The 184 throwaway images on this Windows machine totalled about 84 MB (largest: `compare-atlas-1440` 5.4 MB, `compare-atlas-768` 4.8 MB, `spectrogram-atlas-*` of similar scale). Linux PNGs will be of the same order. Committing all of them adds roughly that much to git history, and every future regeneration adds it again. Options for 04-24 or the owner: accept it; or reduce the set (for example, drop the 768 width for the largest sections); or tighten PNG compression. Not changed here because the plan fixes the shot set.
2. **The `--update-snapshots` second step rebuilds the app.** The dispatch now builds the app twice (once per Playwright invocation), as the plan specifies; it only costs CI minutes.

## What 04-24 must do next

1. Push the phase commits to `redesign/v2-discovery` and confirm the push CI is green; in the `visual` job the fixtures-shots tests must show as skipped.
2. `gh workflow run CI --ref redesign/v2-discovery -f update_snapshots=true`; push nothing while it runs. When it finishes, download only `fixtures-snapshots` into `dashboard-next/tests/e2e/fixtures.spec.ts-snapshots`, confirm `legacy-baselines.test.ts` is green and the files number `expectedBaselineFiles().length` (184), and commit only that directory.
3. Replace the empty-directory skip in `fixtures.spec.ts` (the `gate()` function) with the fail-closed CI behaviour (`CI` is `true` or `1`: throw; locally skip), add `tests/unit/fixtures-baselines.test.ts` built on `expectedBaselineFiles()`, run `node scripts/build-fixtures-review.mjs` and `--check`, write `docs/deploy/PHASE-4-VISUAL-REVIEW.md`, then the owner decision checkpoint.
4. The unit guard must read file names with the `-fixtures-shots-linux.png` suffix (`SNAPSHOT_SUFFIX`); any win32 file that slips in fails the exact-set assertion.

## Self-Check: PASSED

- Files present: `dashboard-next/tests/e2e/fixtures.spec.ts`, `dashboard-next/tests/e2e/support/fixture-shots.ts`, `dashboard-next/tests/unit/fixtures-shots-config.test.ts`, `scripts/build-fixtures-review.mjs`, modified `dashboard-next/playwright.config.ts` and `.github/workflows/ci.yml`.
- Commits present: 4d597c0, f37a30c.
