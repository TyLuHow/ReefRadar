---
phase: 01-truth-reproducibility
plan: 07
subsystem: dashboard-next
tags: [truth, reproducibility, gallery, next-js, security-patch, bundle-size]

# Dependency graph
requires:
  - phase: 01-01
    provides: Playwright/axe tooling, playwright.config.ts (local e2e project)
  - phase: 01-04
    provides: tests/baseline/README.md (pre-truth baseline directory policy), pre-truth DOM/a11y baseline
provides:
  - "SampleGallery.tsx, lib/samples.ts (FALLBACK_SAMPLES, SAMPLE_STORIES), Sample/SampleStory/SamplesResponse types, api.getSamples() — all recovered from the deployed bundle, restoring a buildable git HEAD"
  - "Gallery parity test (local build vs production, no mocking) proving DOM equivalence"
  - "Pre-truth and post-patch bundle-size baseline (tests/baseline/bundle-sizes.json)"
  - "Next.js patched to 14.2.35 (CVE-2025-55184 fixed), Vercel installs now npm ci (lockfile-exact)"
affects: [01-18, phase-03-redesign]

# Actuals (#2632)
actuals:
  tokens: 8287
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: ["Recovering missing frontend source by reading a deployed Next.js bundle's un-source-mapped minified chunk directly (JSX structure, class names, and string literals survive minification intact)", "Parity test opens local build and production in two separate Playwright browser contexts against the same live API, asserting equal DOM content rather than mocking fixtures"]

key-files:
  created:
    - dashboard-next/src/components/gallery/SampleGallery.tsx
    - dashboard-next/src/lib/samples.ts
    - dashboard-next/tests/e2e/gallery-parity.spec.ts
    - dashboard-next/scripts/record-bundle-sizes.mjs
    - dashboard-next/tests/baseline/bundle-sizes.json
    - dashboard-next/tests/baseline/next-build-output.txt
  modified:
    - dashboard-next/src/types/index.ts
    - dashboard-next/src/lib/api.ts
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/vercel.json

key-decisions:
  - "Recovered SampleGallery.tsx directly from the live deployed chunk (page-2432347ba7caadef.js, same hash the 01-RESEARCH session saw) rather than relying solely on the research doc's reconstruction — fetched and read the actual minified module this session to confirm JSX structure, story order, and string literals byte-for-byte, since the research doc covered samples.ts/api.ts/types in full but not the gallery component's own render logic"
  - "Confirmed SampleCard.tsx is byte-identical to the already-committed git copy (minified bundle text matches 1:1) — no changes needed there"
  - "Patched Next.js to 14.2.35 (not just any later 14.2.x) because nextjs.org's 2025-12-11 advisory explicitly lists 14.2.35 as 'Fixed In' for the 14.x line, and it is also the newest available 14.2.x release (npm view next@14.2 version confirms no newer patch exists)"
  - "Documented residual npm audit findings for `next` in the commit message and here rather than chasing them to zero — the advisory range npm audit reports (up to 16.3.0-preview.10) spans CVEs fixed in 15.x/16.x, not 14.2.x; the official Next.js advisory confirms 14.2.35 fully addresses the two CVEs that actually apply to 14.x. The 15/16 migration is explicitly Phase 3's scope, not this plan's."

requirements-completed: [TRUTH-01, TRUTH-10]

coverage:
  - id: D1
    description: "A fresh clone of the repository installs with npm ci and builds with next build, with no uncommitted local files"
    requirement: "TRUTH-01"
    verification:
      - kind: build
        ref: "cd dashboard-next && npm ci && npm run lint && npx tsc --noEmit && npm run build (all exit 0, run twice — once at 14.2.5 after Task 1/2, once at 14.2.35 after Task 3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The landing page built from git renders the same gallery (story titles, subtitles, card names, order) as the deployed production app"
    requirement: "TRUTH-01"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/gallery-parity.spec.ts (npx playwright test --project=e2e tests/e2e/gallery-parity.spec.ts) — passed before and after the Next.js patch bump"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bundle sizes of the pre-truth app are recorded before any truth change"
    requirement: "TRUTH-10"
    verification:
      - kind: other
        ref: "node -e \"const b=require('./tests/baseline/bundle-sizes.json');const e=b.entries[0];process.exit(e&&e.next_version==='14.2.5'&&Object.keys(e.routes).length>=8?0:1)\" (first entry: next 14.2.5, 9 routes, before Task 3's patch)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The pinned Next.js 14.2 patch level is free of the December 2025 advisories, without migrating to Next 15/16"
    requirement: "TRUTH-01"
    verification:
      - kind: other
        ref: "test \"$(node -p \\\"require('./node_modules/next/package.json').version\\\")\" = \"$(npm view next@14.2 version | tail -n 1 | grep -oE '14\\.2\\.[0-9]+' | tail -n 1)\" — both resolve to 14.2.35"
        status: pass
    human_judgment: false

duration: 38min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 07: Gallery Source Recovery, Bundle Baseline, Next.js Patch Summary

**Recovered SampleGallery.tsx and lib/samples.ts verbatim from the live deployed bundle (confirming SampleCard.tsx was never actually missing), proved DOM parity against production with a live two-context Playwright test, recorded a pre-truth bundle-size baseline, then patched Next.js 14.2.5 -> 14.2.35 (closing CVE-2025-55184) with Vercel installs switched to lockfile-exact `npm ci`.**

## Performance

- **Duration:** ~38 min
- **Started:** 2026-10-01T06:48:55Z (approx, first file read)
- **Completed:** 2026-10-01T07:27:21Z
- **Tasks:** 3
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments

- Fetched the production landing page (`https://dashboard-next-indol-nu.vercel.app/`), located its chunk (`page-2432347ba7caadef.js` — same hash the 01-RESEARCH session saw, confirming no redeploy since), and read the minified module directly to reconstruct `SampleGallery.tsx`'s exact JSX structure: three fixed-order story sections (`healthy_vs_degraded`, `restoration_timeline`, `geographic_diversity`), a "More Samples" section for uncategorized samples, and a "Skip to analyzer →" footer link.
- Restored `lib/samples.ts` (`FALLBACK_SAMPLES`, 8 entries; `SAMPLE_STORIES`, 3 stories) and the `Sample`/`SampleStory`/`SamplesResponse` types, and added `api.getSamples()` — all verbatim from the deployed bundle, matching `01-RESEARCH.md`'s prior reconstruction exactly.
- Confirmed `SampleCard.tsx` was never actually missing — the deployed bundle's minified text for the card component is byte-identical to the already-committed git copy.
- Wrote `tests/e2e/gallery-parity.spec.ts`: opens the local build's "/" and the production URL in two separate browser contexts (both hitting the same live `/samples` endpoint, no mocking), waits for "Loading samples..." to clear on both, and asserts equal story headings, subtitles, card names, and "Analyze This" control counts. Passed both before and after the Next.js patch bump.
- Built `scripts/record-bundle-sizes.mjs` (Node built-ins only): reads `.next/app-build-manifest.json`, sums raw + gzip (zlib level 9) bytes per app route, and appends a baseline entry. Recorded two entries: `"pre-truth (next 14.2.5)"` (9 routes) and `"after next 14.2 patch"` (next 14.2.35, 9 routes).
- Confirmed via `nextjs.org/blog/security-update-2025-12-11` that `14.2.35` is the officially "Fixed In" release for the 14.x line (CVE-2025-55184 DoS; CVE-2025-55183 source exposure does not affect 14.x) and is also the newest available 14.2.x patch. Bumped `next` and `eslint-config-next` to `14.2.35` with `--save-exact`, and set `vercel.json`'s `installCommand` to `"npm ci"` for lockfile-exact deployed installs.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — recover gallery source from the deployed bundle, build from git, and prove DOM parity with production** - `10ad636` (feat)
2. **Task 2: Record the pre-truth bundle-size baseline from the first buildable commit** - `d70190f` (feat)
3. **Task 3: Patch Next.js within 14.2.x and make Vercel installs lockfile-exact** - `e710cdc` (fix)

**Plan metadata:** (this commit, below)

## Files Created/Modified

- `dashboard-next/src/components/gallery/SampleGallery.tsx` - Recovered gallery component (story sections, "More Samples", footer link)
- `dashboard-next/src/lib/samples.ts` - Recovered `FALLBACK_SAMPLES` (8 samples) and `SAMPLE_STORIES` (3 stories), verbatim from the deployed bundle
- `dashboard-next/src/types/index.ts` - Added `Sample`, `SampleStory`, `SamplesResponse` interfaces
- `dashboard-next/src/lib/api.ts` - Added `getSamples()` method and `SamplesResponse` import
- `dashboard-next/tests/e2e/gallery-parity.spec.ts` - Local-vs-production DOM parity spec
- `dashboard-next/scripts/record-bundle-sizes.mjs` - Bundle-size baseline recorder (Node built-ins only)
- `dashboard-next/tests/baseline/bundle-sizes.json` - Two recorded entries (pre-truth, post-patch)
- `dashboard-next/tests/baseline/next-build-output.txt` - Captured `next build` stdout for the pre-truth entry
- `dashboard-next/package.json`, `package-lock.json` - `next` and `eslint-config-next` 14.2.5 -> 14.2.35
- `dashboard-next/vercel.json` - `installCommand` "npm install" -> "npm ci"

## Decisions Made

- Read the live deployed bundle directly this session (rather than trusting only the prior research reconstruction) for `SampleGallery.tsx`'s own render logic, since `01-RESEARCH.md` had fully de-minified `samples.ts`/`api.ts`/types but not the gallery component itself — the chunk hash matched the research session's, confirming the production deployment hadn't changed.
- Pinned Next.js to exactly `14.2.35` (the newest 14.2.x release and the advisory's confirmed "Fixed In" version), not just "a later 14.2.x" — verified both facts independently (`npm view next@14.2 version` and the nextjs.org advisory text) before installing.
- Logged residual `npm audit` findings rather than chasing them — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written for all three tasks; no bugs, missing functionality, or blocking issues were encountered during execution. No checkpoints were triggered (plan carries `autonomous: true` and all tasks are `type="tracer"`/`type="auto"`).

### Noted, not fixed (threat-model-anticipated residual finding)

Per `T-01-07-02`'s mitigation plan ("residual `npm audit` findings for next are recorded in the SUMMARY"): after the 14.2.35 bump, `npm audit` still reports `next` as vulnerable across a range extending to `16.3.0-preview.10`, recommending `next@16.3.8` to clear every listed advisory. Cross-checked against `nextjs.org/blog/security-update-2025-12-11`: of the two CVEs that advisory covers, only CVE-2025-55184 (DoS) applies to the 14.x line and `14.2.35` is confirmed as its fix; CVE-2025-55183 (source exposure) does not affect 14.x at all. The remaining items in npm audit's `next` advisory list are fixed only in 15.x/16.x releases — out of this plan's scope (the 15/16 migration is explicitly reserved for Phase 3). Also present in `npm audit`: unrelated transitive/dev-dependency findings (`ajv`, `baseline-browser-mapping`, `brace-expansion`, `browserslist`, `flatted`, `glob`, `js-yaml`, `lodash`, `maplibre-gl`/`react-map-gl`, `minimatch`, `picomatch`, `postcss`, `postcss-selector-parser`, `protocol-buffers-schema`) — these are not caused by this task's `next`/`eslint-config-next` version bump and are out of scope per the deviation rules' scope boundary; not fixed here.

## Threat Flags

None — all surface touched (recovered frontend source, Next.js patch version, Vercel install command) was already covered by the plan's threat register (`T-01-07-01` through `T-01-07-04`); no new security-relevant surface was introduced.

## Issues Encountered

None.

## User Setup Required

None. Package installs (`next@14.2.35`, `eslint-config-next@14.2.35`) are version bumps of already-present dependencies, not new packages, so the package-legitimacy checkpoint rule did not apply. No other checkpoints were triggered.

## Next Phase Readiness

- The dashboard now builds from a clean `npm ci` + `next build` on git HEAD — `app/page.tsx` and `app/experience/page.tsx` no longer import missing files, closing the gap `01-RESEARCH.md` and `PRODUCT-AUDIT.md` §0.1 identified.
- `FALLBACK_SAMPLES` intentionally restores the deployed (pre-truth) state exactly, including the known-wrong entries (`aus_restored_reef`'s `restored_early`/`restored_mid` mismatch, `phl_degraded_reef`'s nonexistent site) — these are explicitly left for plan 01-18 to correct, per this plan's `<action>`.
- `tests/baseline/bundle-sizes.json` now has both the pre-truth and post-patch entries ready for Phase 3/Phase 16 budget comparisons.
- `vercel.json`'s `npm ci` install command means future Vercel deploys will fail fast on any lockfile drift rather than silently installing mismatched versions.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All created files and all three task commits verified present on disk / in git log:
- `dashboard-next/src/components/gallery/SampleGallery.tsx` — FOUND
- `dashboard-next/src/lib/samples.ts` — FOUND
- `dashboard-next/tests/e2e/gallery-parity.spec.ts` — FOUND
- `dashboard-next/scripts/record-bundle-sizes.mjs` — FOUND
- `dashboard-next/tests/baseline/bundle-sizes.json` — FOUND (2 entries)
- `dashboard-next/tests/baseline/next-build-output.txt` — FOUND
- Commit `10ad636` — FOUND
- Commit `d70190f` — FOUND
- Commit `e710cdc` — FOUND
