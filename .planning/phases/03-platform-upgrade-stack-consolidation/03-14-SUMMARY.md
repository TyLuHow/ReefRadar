---
phase: 03-platform-upgrade-stack-consolidation
plan: 14
subsystem: visual-review
tags: [visual-baseline, review-page, playwright, ci, plat-01, ds-07]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-13 head (all Phase 3 UI changes in place) and the 33 Phase 1 Linux baselines at 1c74f86
provides:
  - scripts/build-visual-review.mjs (Node built-ins only): sha256 before/after comparison, review markdown with preserved owner decisions, static HTML with a CSS difference view, --check mode
  - tests/e2e/review.spec.ts and playwright.review.config.ts: six unhidden 1440px captures plus meta.json (WebGL2 and map engine per page)
  - CI before_ref dispatch input and a review job (snapshot dispatch only) that captures the head and before_ref trees and uploads review-captures-after and review-captures-before
affects: [03-15]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Review page is generated from committed baselines by sha256; no image-diff library, the difference view is CSS mix-blend-mode"
    - "Dispatch inputs reach CI only through actions/checkout ref, never a shell step"

key-files:
  created:
    - scripts/build-visual-review.mjs
    - dashboard-next/tests/unit/visual-review.test.ts
    - dashboard-next/tests/e2e/review.spec.ts
    - dashboard-next/playwright.review.config.ts
  modified:
    - dashboard-next/playwright.config.ts
    - dashboard-next/.gitignore
    - .github/workflows/ci.yml

key-decisions:
  - "Any row that is not identical (changed, added or missing) needs a cause; the plan named changed rows only, the stricter rule keeps added/missing rows from slipping through unexplained"
  - "Identical rows show decision n/a; changed, added and missing rows start pending and keep a recorded decision only while the row is still the same kind of difference"
  - "The Owner sign-off section of an existing markdown, the run URL and capture decisions are preserved on re-run (03-15 writes the sign-off wording there)"
  - "The review config launches Chromium with --use-angle=swiftshader and --enable-unsafe-swiftshader so the single snapshot dispatch has the best chance of rendering real maps (research assumption A1); meta.json records what actually happened"
  - "The review job has needs: web, like the visual job, so a broken build never spends a capture run"

requirements-completed: []

coverage:
  - id: C1
    description: "Generator statuses by sha256 (identical/changed/added/missing), one row per state and width, cause and decision columns, refuses with exit 1 and writes nothing when a non-identical row has no cause"
    requirement: PLAT-01
    verification:
      - kind: unit
        ref: "tests/unit/visual-review.test.ts (statuses and gating: 4 tests)"
        status: pass
    human_judgment: false
  - id: C2
    description: "HTML has the mix-blend-mode: difference view, escapes every inserted string (a <script> cause is neutralised, the page has no script element), copies images only for non-identical rows and captures"
    requirement: PLAT-01
    verification:
      - kind: unit
        ref: "tests/unit/visual-review.test.ts (HTML page and copied images: 2 tests)"
        status: pass
    human_judgment: false
  - id: C3
    description: "Owner decisions and the sign-off section survive re-runs; --check writes nothing and exits 0 only when rows, statuses and causes match"
    requirement: PLAT-01
    verification:
      - kind: unit
        ref: "tests/unit/visual-review.test.ts (decisions: 2 tests, --check: 3 tests, captures: 2 tests, git ref: 2 tests)"
        status: pass
    human_judgment: false
  - id: C4
    description: "Local proof: the review config writes six PNGs and meta.json, and the generator over the real 33 baselines at the default before ref reads all 33 identical and lists the six captures"
    requirement: PLAT-01
    verification:
      - kind: command
        ref: "REVIEW_OUT=<scratch> npx playwright test -c playwright.review.config.ts: 6 passed, exit 0; node scripts/build-visual-review.mjs --review-after <scratch> --out <scratch>: 33 rows, 0 not identical, 6 captures"
        status: pass
    human_judgment: false
  - id: C5
    description: "The e2e project never lists review.spec.ts; the CI workflow parses with the before_ref input and a review job gated on workflow_dispatch plus update_snapshots"
    requirement: PLAT-01
    verification:
      - kind: command
        ref: "playwright test --project=e2e --list: 68 tests in 11 files, grep -c review.spec prints 0; grep counts: review-captures-before 1, before_ref 3; yaml.safe_load lists jobs web, e2e, python, citations, visual, review, live-smoke"
        status: pass
      - kind: ci
        ref: "run 37142798821 (https://github.com/TyLuHow/ReefRadar/actions/runs/37142798821) at 65ad87f: review job skipped on push"
        status: pass
    human_judgment: false
  - id: C6
    description: "Vitality removal and map port are reviewable even though the gating baseline hides canvases and maps: unhidden captures exist for both refs and feed the review page"
    requirement: DS-07
    verification:
      - kind: other
        ref: "head captures proven locally (maplibre rendered on sites, map and analyze; WebGL2 true). The before-tree capture and the owner sign-off happen in the 03-15 dispatch, so this stays a backstop until then"
        status: pass
    human_judgment: true

duration: 45min
completed: 2026-10-03
status: complete
---

# Phase 3 Plan 14: Visual Review Tooling Summary

**A dependency-free generator turns the 33 committed baselines (read at 1c74f86 with git show) and unhidden review captures into the owner's before/after page with a CSS difference view, and the existing snapshot dispatch now also captures the head and before trees in a new review job.**

## Task 1 (tracer): generator, capture spec, config

- Unit test written first (15 tests, node environment, temp dirs, byte buffers as PNG stand-ins, a throwaway git repo for the `git show` path). The first run found one test bug (a decision cannot reset when only the image bytes change, because decisions are keyed by state, width and status as the plan says); the test now changes the row's kind of difference instead.
- `scripts/build-visual-review.mjs` options as planned plus `--repo` (read the before ref from a different repository, used by the git-path test) and `--run-url`. The ref is validated as a plain ref name or SHA before it reaches `git`, and git is run through `execFileSync` with no shell.
- `review.spec.ts`: six states at 1440x900 (landing, experience, experience-compare, sites, map, analyze through the mocked flow to a completed result), tiles blocked with the transparent PNG, networkidle plus 1.5 s settle, full-page screenshot with animations disabled, `meta.json` entries `{state, webgl2, engines, canvases}` rewritten per state so a rerun cannot inherit stale data.
- Local proof (head, Windows, Chromium): 6 passed in 33 s. meta.json: WebGL2 true on all six; maplibre rendered on sites, map and analyze; none on landing, experience, experience-compare (no maps there). The analyze capture shows the completed result with the MapLibre mini map and its two markers and attribution. Generator over the real baselines at the default before ref: 33 rows, all `identical`, 0 not identical, six captures listed (before side reads "no capture" because only the head was captured locally). `git status --porcelain` showed no PNG or generated page in the repository.
- Tracer gate (auto mode): verify (visual-review.test.ts, 15 tests), typecheck, lint (0 errors, 19 pre-existing warnings) all green before Task 2. Commit `192a4b3`.

## Task 2: CI wiring

- `playwright.config.ts`: `review\.spec\.ts` added to the e2e project's testIgnore; the visual project's testMatch is unchanged. `--project=e2e --list` reports 68 tests in 11 files and no review.spec line.
- `ci.yml`: `before_ref` string input (default 1c74f86...), and a `review` job (`if` workflow_dispatch and update_snapshots, `needs: web`, same Playwright image as visual): checkout head, checkout `inputs.before_ref` into `before/`, setup-node 22 with both lockfiles cached, `npm ci` and the review config in the head tree, copy the spec and config into `before/dashboard-next`, `npm ci` and the same capture there, two upload-artifact steps (`review-captures-after`, `review-captures-before`, `if: always()`, 14 days). The before tree uses the same container image and the same pinned Playwright 1.63.0 that its own lockfile carries. `before_ref` appears only in `actions/checkout`'s `ref:`; no shell step reads an input; workflow permissions stay `contents: read`.
- Full unit suite 37 files / 501 tests green; `check-citations --scope all` clean.

## CI

Run 37142798821 (https://github.com/TyLuHow/ReefRadar/actions/runs/37142798821) at 65ad87f: web, e2e, python, citations success; review skipped (as designed on push); visual failed only on the declared `experience-compare @ 390` (32 passed).

## Deviations from Plan

### Auto-fixed Issues

None.

### Interpretation notes

- **Cause required for added and missing rows too.** The plan says "every changed row"; a row that exists on only one side is a stronger anomaly, so it needs a cause as well. With the real data (33 rows both sides) this never triggers.
- **`dashboard-next/.gitignore` gained `/review-captures/`** (not in the plan's file list) so a local or CI capture directory can never be staged by accident.
- **SwiftShader flags in the review config only.** The plan says "Desktop Chrome"; the flags are additive for the one dispatch (research A1 recommended them as a fallback; one dispatch leaves no room to retry). Gating projects are untouched.
- **RED phase:** the test and script were written in the same pass and first run together, so there is no separate failing-run record; the first run did fail one test (the test bug above).

**Total deviations:** 0 auto-fixes, 4 interpretation notes. **Impact:** none on scope.

## Known Stubs

None.

## Open items for 03-15

- The before-tree capture (Next 14, Leaflet, deck.gl, vitality) has not been run anywhere; the first time it runs is the single dispatch. If it fails to build or capture, the artifact will simply be empty (`if-no-files-found: warn`) and the page lists "no capture" on the before side.
- Whether WebGL2 is available in the Linux image is still unknown; meta.json from the dispatch answers assumption A1.
- The default run of the generator now reports all rows identical because baselines have not been regenerated; after 03-15 commits new baselines the default `--check` needs `--causes docs/deploy/phase-3-visual-review/causes.json`.
- PLAT-01 and DS-07 are not marked complete: this plan delivers tooling, the baselines, the review page and the owner's sign-off arrive in 03-15.

## Threat Flags

None beyond the plan's threat model (T-03-14-01 through 04 are mitigated as described above: ref only in checkout, HTML escaped and unit-tested with a script payload, decisions preserved and unit-tested, captures use mockApi fixtures and blocked tiles).

## Self-Check: PASSED

- Created files present: build-visual-review.mjs, visual-review.test.ts, review.spec.ts, playwright.review.config.ts
- Commits `192a4b3` (feat) and `65ad87f` (ci) in git log; CI run 37142798821 reviewed
- Acceptance: unit test, typecheck, lint, local capture and generator proof, e2e list (0 review.spec lines), grep counts, CI jobs all as stated
