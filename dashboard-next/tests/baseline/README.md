# Pre-truth baseline (`tests/baseline/pre-truth/`)

**This directory is referenced, never regenerated — do not regenerate it.**
It is the fixed "before" snapshot of the legacy app, captured once, at the
start of Phase 1, before any legacy-UI, truth, or data change in this
milestone. Re-capturing it would destroy its value as a comparison point. If
a future phase genuinely needs a new baseline, that is an explicit decision —
record it in `.planning/STATE.md` (Decisions) before running the capture
spec again, and keep the old directory under a dated name rather than
overwriting it.

## What was captured

- **States:** 11 route states reachable by URL — `landing` (`/`), `about`
  (`/about/`), `sites` (`/sites/`), `dashboard` (`/dashboard/`), `analyze`
  (`/dashboard/analyze/`), `compare` (`/dashboard/compare/`), `map`
  (`/dashboard/map/`), `experience` (`/experience/`), `experience-demo`
  (`/experience/?mode=demo`), `experience-compare`
  (`/experience/?mode=compare`), `experience-sample`
  (`/experience/?sample=idn_healthy_dawn`).
- **Widths:** 1440x900 (desktop), 1024x768 (tablet), 390x844 (mobile) — 33
  full-page JPEG screenshots (quality 85) total, one per state x width,
  `screenshots/<state>-<width>.jpg`.
- **Accessibility:** one axe-core scan per state at 1440px only, tags
  `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` — `axe/<state>.json` (11 files)
  plus `axe/summary.json`, a per-route list of `serious`/`critical` rule ids
  and node counts, used as the input to the CI accessibility regression gate
  added in plan 01-08.
- **Manifest:** `routes.json` — one entry per captured file: `state`, `path`,
  `width`, `file`, `captured_at` (ISO timestamp), `base_url` (the production
  URL captured), `repo_head` (the git commit this baseline corresponds to),
  and an optional `render_note` if a state failed to settle cleanly (none did
  in this capture — see Known state below).

## From where

- **Production URL:** `https://dashboard-next-indol-nu.vercel.app` (the live,
  already-deployed app — same `PW_LIVE_BASE_URL` default as
  `dashboard-next/playwright.live.config.ts`).
- **Live API:** whatever the deployed app was calling at capture time (API
  Gateway in `us-east-1`, see `ARCHITECTURE.md`) — not mocked, not a fixture.
- **Capture date:** 2026-10-01.
- **Repo HEAD at capture time:** recorded per-file in `routes.json`
  (`repo_head`); this commit **could not build locally** (`SampleGallery.tsx`
  / `lib/samples.ts` are missing from git until plan 01-07 restores them —
  see `.planning/audit/PRODUCT-AUDIT.md` §0.1 and `01-CONTEXT.md` D-02), so
  capturing from `next build && next start` was not possible — the live
  deployment was used instead.

## Why live, not a local build

Per D-02 / D-20: the deployed app is exactly what users see today, and it is
the thing this phase's truth fixes are protecting against regressing. A local
build baseline from a broken HEAD would either fail outright or, once the
gallery is restored in 01-07, capture a HEAD that has already started
changing — missing the point of a "before any legacy-UI change" snapshot. The
bundle-size baseline (the other half of D-20) is recorded separately by plan
01-07 from the first commit that builds, before any truth change, since a
bundle size cannot be measured from a deployment artifact the way DOM/a11y
can.

## Redaction applied

Gallery sample audio elements on the live site are served via presigned S3
URLs carrying temporary credential query parameters
(`X-Amz-Security-Token`, `AWSAccessKeyId=`, etc. — T-01-04-01). Before any
axe report is written, every `html` and `target` string in the result is
scanned for these markers and, if found, the query string from `?` onward is
replaced with `?<redacted-presigned-query>`. The capture script
(`dashboard-next/tests/e2e/baseline-live.spec.ts`) performs this redaction
inline for every state, not just the ones known to render gallery audio, so
no presigned URL or temporary credential token is ever committed to this
archive. Verified: `grep -rl "X-Amz-Security-Token\|AWSAccessKeyId=" axe/`
returns nothing.

## Known state

All 33 screenshots and all 11 axe scans completed without a `render_note` in
`routes.json` — no WebGL/canvas state failed to settle within its wait
window (4000 ms for `map`, which loads deck.gl/maplibre tiles; 2000 ms for
everything else, plus an explicit wait for the "Loading samples..." text to
detach on `landing`). `experience` and `experience-sample` had zero
serious/critical axe findings; every other state has at least one (see
`axe/summary.json`) — these are exactly the kind of legacy-UI defects this
phase's later plans (and the CI a11y gate in 01-08) are scoped to track, not
to fix via this baseline capture itself.

## Rule: referenced, never regenerated

This directory is read by:

- Phase 3 onward, as the visual "before" when reviewing redesign/legacy-UI
  diffs.
- Plan 01-20's exit comparison notes.
- Plan 01-08's CI accessibility regression gate (`axe/summary.json`).

**The CI pixel-diff baseline is a separate artifact:** the Linux Playwright
snapshot set committed at Phase 1 exit by plan 01-20
(`dashboard-next/tests/e2e/visual.spec.ts-snapshots/`, generated inside the
official Playwright Docker image per D-21 to avoid OS rendering diffs). That
set reflects the **post-truth legacy app** (after this phase's data/copy/
backend fixes land, before Phase 3's redesign) and is what CI pixel
assertions compare against going forward. `pre-truth/` in this directory is
the earlier, pre-phase snapshot — useful for human visual review across the
whole phase, not for automated pixel assertions.
