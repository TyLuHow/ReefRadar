---
phase: 01-truth-reproducibility
plan: 20
subsystem: testing
tags: [vitest, playwright, github-actions, vercel-preview, visual-regression, drift-check]

requires:
  - phase: 01-truth-reproducibility
    provides: production deploy (01-14), truthful UI (01-15..01-19), CI harness (01-08), canonical citations (01-02)
provides:
  - Banned-claims gate (TRUTH-07) over UI source, UI data and served manifests, running in CI on every push
  - CI drift gates: citations --scope all, audio-consumer, API-fixture and audio-manifest checks
  - Live truth sweep evidence (drift MATCH x4, verify_live_truth exit 0, every served clip real)
  - Vercel preview of the branch plus a preview truth spec
  - 33 Linux visual baselines committed; CI visual job compares (not skipped) and passes
  - docs/deploy/PHASE-1-EXIT.md mapping evidence to all five Phase 1 success criteria
affects: [phase-2, phase-3, phase-5, phase-17]

actuals:
  tokens: 7000
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Banned-claims test with in-file phrase list and a reasoned allow-list that fails when stale"
    - "Visual baselines hide (visibility:hidden) rather than mask canvases, so page content stays in the baseline"

key-files:
  created:
    - dashboard-next/tests/unit/copy-claims.test.ts
    - dashboard-next/tests/e2e/preview-truth-live.spec.ts
    - dashboard-next/tests/e2e/visual.spec.ts-snapshots/ (33 PNGs)
    - docs/deploy/PHASE-1-EXIT.md
  modified:
    - .github/workflows/ci.yml
    - dashboard-next/tests/e2e/visual.spec.ts
    - dashboard-next/tests/baseline/README.md
    - scripts/check_audio_real.py
    - dashboard-next/src/app/about/page.tsx
    - dashboard-next/src/app/layout.tsx
    - dashboard-next/src/app/dashboard/analyze/page.tsx
    - dashboard-next/src/components/experience/useDemoAudio.ts
    - dashboard-next/src/components/maps/WorldMap.tsx
    - dashboard-next/src/types/index.ts

key-decisions:
  - "Preview verified over HTTP with vercel curl plus a local production build because the project has Deployment Protection on; no protection settings were changed"
  - "Visual baselines hide canvases/maps via addStyleTag instead of masking, since the fixed background canvas mask hid page content"

patterns-established:
  - "Lock claim regressions with a scan test whose exemptions are explicit and self-expiring"

requirements-completed: [TRUTH-01, TRUTH-02, TRUTH-03, TRUTH-07, TRUTH-08, TRUTH-10, PLAT-04]

duration: 100min
completed: 2026-10-01
status: complete
---

# Phase 1 Plan 20: Phase 1 Exit Gate Summary

**Banned-claims CI gate, green live truth sweep (drift MATCH on all four Lambdas), a Vercel preview, and 33 CI-generated Linux visual baselines compared on every push.**

## Accomplishments

- Task 1 (tracer): `copy-claims.test.ts` scans every ts/tsx/json under `dashboard-next/src` plus the compare manifest and audio attribution for 33 banned phrases (species and behaviour claims, bleaching/coral-cover/overfishing, scripted pipeline phrases, confidence-reduction sentence, "real-time processing", context-free accuracy claims, embedding-space and "living spectrogram" titles, "AI-powered", hard-coded site/country counts). The allow-list (two About-page "cannot measure" entries) fails if it goes stale. CI gained citations `--scope all`, `build_audio_consumers.py --check`, `build_api_fixtures.py --check` and `validate_audio_manifest.py`. The tracer was red on first run (6 stragglers) and green after the fixes; CI green (run 36892851866).
- Task 2: `drift-check.py --function all --json` exit 0 (router, preprocessor, classifier, inference all with no missing/extra/changed); `verify_live_truth.py` exit 0 (analyses `d855cdd2-a2dc-4731-a1e0-a0784bdcc643` with coordinates, `cfcd8093-90b5-499f-a606-79658973faad` without; probabilities sum to 1.0, interim-real-only model); `check_audio_real.py` passes for committed and live clips.
- Task 2: preview `https://dashboard-next-kykdxk6t6-tyluhows-projects.vercel.app` (target preview, Ready). Production deployment list unchanged before/after.
- Task 3: 33 Linux PNGs (11 states x 3 widths) from CI run 36896818307; CI run 36897385553 on the head with baselines: visual 33 passed (not skipped), e2e 39, unit 61, pytest 162, all success.

## Task Commits

1. Task 1: `f9dde79` banned-claims gate and CI drift checks
2. Task 2: `66345bf` live truth sweep, preview spec, PHASE-1-EXIT.md
3. Task 3 prerequisites: `85f90ea` and `a05e197` hide canvases instead of masking (two commits: first used a non-existent `style` option, caught by tsc)
4. Task 3: `0605ddd` 33 Linux baselines, README section, exit doc update

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Banned-claims stragglers in earlier plans' files**
- **Found during:** Task 1 (test red on first run); the plan expected none
- **Fix:** "AI-powered" health-analysis copy in about (2), layout metadata (2), analyze hero; "Real-time processing" quick fact; "Snapping Shrimp" band comment in useDemoAudio.ts; "5 countries" comment in WorldMap.tsx; "54 sites across 7 countries" comment in types/index.ts
- **Commit:** f9dde79

**2. [Rule 1 - Bug] check_audio_real.py did not recurse into subdirectories**
- **Found during:** Task 2; `check_audio_real.py dashboard-next/public/audio` exited 2 ("no WAV files") because clips live in `marrs/`
- **Fix:** `glob` to `rglob`; pytest wrapper still passes
- **Commit:** 66345bf

**3. [Rule 1 - Bug] Visual baselines hid page content behind masks**
- **Found during:** Task 3 sample inspection; the `mask: canvas` rectangle painted an opaque magenta block over the top viewport of every page (nav, titles, hero invisible)
- **Fix:** hide canvases/maps with `visibility: hidden` through `page.addStyleTag`; regenerated all 33 baselines in CI and re-inspected
- **Commits:** 85f90ea (introduced a TypeScript error: `style` is not a valid toHaveScreenshot option; that push's CI failed), a05e197 (fix)

**4. [Rule 3 - Blocking] Vercel Deployment Protection prevents Playwright running against the preview**
- **Issue:** unauthenticated requests redirect to Vercel SSO. Protection settings were left untouched.
- **Mitigation:** preview checked with `vercel curl` (HTTP 200; `/about/` HTML has the MARRS DOI and no "AI-powered"; landing chunks contain "assigned by MARRS"), and `preview-truth-live.spec.ts` passed 3 of 3 against `next build` + `next start` of this commit with the live API. The spec accepts `PW_VERCEL_BYPASS_SECRET` for a later run against the preview. Recorded in WINDOWS.md as unrun-verify.
- **Not met as written:** the acceptance command run against the preview URL itself.

`vercel link --yes` created a `.env.local` and appended `.env*` to `dashboard-next/.gitignore`; both were removed/reverted (nothing committed, contents never read). The `.vercel/` link directory is gitignored.

## Owner Action Needed (optional)

Provide a Vercel "Protection Bypass for Automation" secret (project settings) if a Playwright run against the preview itself is wanted: `PW_VERCEL_BYPASS_SECRET=<secret> PW_LIVE_BASE_URL=https://dashboard-next-kykdxk6t6-tyluhows-projects.vercel.app npx playwright test -c playwright.live.config.ts tests/e2e/preview-truth-live.spec.ts`.

## Known Stubs

None.

## Residual Issues

- Lambda concurrency limit 10; Service Quotas request `4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5` (to 1000) pending. Verification ran once, serially.
- `similar_sites_count` is 0 in both live analyses (Phase 5 all-site similarity).
- Production frontend remains the pre-truth legacy UI until the branch is merged (owner decision).

## Threat Flags

None.

## Self-Check: PASSED
