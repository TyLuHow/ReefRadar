---
phase: 03-platform-upgrade-stack-consolidation
reviewed: 2026-10-03T00:00:00Z
depth: standard
iteration: 3
files_reviewed: 16
files_reviewed_list:
  - .github/workflows/ci.yml
  - dashboard-next/src/features/charts/encodings.ts
  - dashboard-next/src/features/map/MapShell.tsx
  - dashboard-next/src/features/map/MiniMap.tsx
  - dashboard-next/src/features/map/ReefMap.tsx
  - dashboard-next/src/features/map/SiteList.tsx
  - dashboard-next/src/features/map/SitePopup.tsx
  - dashboard-next/src/features/map/WorldMap.tsx
  - dashboard-next/src/features/monitoring/report.ts
  - dashboard-next/src/features/monitoring/scrub.ts
  - dashboard-next/tests/e2e/maps.spec.ts
  - dashboard-next/tests/unit/map-shell.test.tsx
  - dashboard-next/tests/unit/monitoring-report.test.ts
  - dashboard-next/tests/unit/monitoring-scrub.test.ts
  - dashboard-next/tests/unit/plot-figure.test.tsx
  - docs/MONITORING.md
findings:
  critical: 0
  warning: 1
  info: 8
  total: 9
status: clean
---

# Phase 3: Code Review Report (iteration 2 re-review of the fix commits 40b659d..fc0000e)

**Reviewed:** 2026-10-03
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

All seven previous findings are resolved in substance. CR-01 is verified by measurement: the scrubber is linear. WR-01 introduced one new defect. The new `/_next/` URL rule stops dropping the query at the first `:`, so part of a query or fragment survives, and in the worst case that is a full upload URL. That is one Warning. The map error handling, SiteList, SitePopup, CI concurrency group and `requireWebGL2` changes show no Critical or Warning regressions.

## Verification of previous findings

### CR-01 (cubic backtracking): resolved

I copied the committed `scrub.ts` and timed `scrubText`, `scrubStack` and `scrubMessage` on 32 adversarial shapes at 1,000, 2,000, 4,000 and 8,000 characters (best of 5, Node 24.18). The shapes included:

- slash, dot and `?`/`#` runs
- `a@` repeats and `a@` plus a dotted domain
- a 250-character local part before a long domain
- `X-Amz-` repeats
- `http://` repeats
- `/_next/` repeats
- dotted and digit runs
- colon-separated hex
- 23-character token runs

Every shape scaled linearly. The worst case, `X-Amz-` repeats, took about 2.25 ms at 4,000 characters. At 8,000 characters the cost is flat because of the 4,000-character input cap. Slash runs, the original cubic case, took 0.02 ms. The three entry points cost the same. Every other regex is either bounded (email, IPv4, IPv6) or anchored to a scheme (URL, asset URL), and `stripPathQueries` makes one left-to-right pass with an O(1) look-behind. The scaling test in `monitoring-scrub.test.ts` (ceiling plus per-character ratio) is a sound design for noisy CI hardware.

### WR-01 (locating info and fingerprint collisions): resolved functionally, with one new leak (see WR-01 below)

- Same-site `_next` frames keep their path and `:line:col`.
- IPv4 and IPv6 addresses are scrubbed.
- The fingerprint falls back to including the message when the frame has no `line:col`.
- Non-`_next` URLs, signed S3 URLs, `blob:`, `file:` and `wss:` all still become `[url]`.
- `user:pw@host` credentials, userinfo, and `X-Amz-` pairs are dropped.
- The scrubber is idempotent on every case I tried.

### WR-02 to WR-06: resolved

- **WR-02:**
  - `react-maplibre` 8.x reports an init failure as `onError({ target: null })`. maplibre-gl 6.11.2 sets `event.target = this` on every fired event.
  - `AJAXError` carries `url` even for network failures (`makeFetchRequest` wraps them), so the `error.url === styleUrl` check really does catch a failed style fetch.
  - The hooks in `MapShell` are all declared before the early returns.
- **WR-03:** `SiteList`, the dialog role, focus-to-Close, Escape and opener focus-return all behave as described.
- **WR-04:** `.filter()` returns a copy, so `.sort()` does not mutate the caller's array.
- **WR-05:** The group now includes the workflow name and event name, and `cancel-in-progress` is kept. That is correct.
- **WR-06:** `requireWebGL2` fails in CI and skips locally. `CI: "true"` is set on the e2e job.

## Warnings

### WR-01: The `/_next/` exception stops at the first `:`, so part of a query or fragment survives, including nested URLs

**File:** `dashboard-next/src/features/monitoring/scrub.ts:42` (regex), `:89` (use). The same claim appears in `docs/MONITORING.md` ("origin, query and fragment are dropped").

**Issue:** `NEXT_ASSET_URL_PATTERN` is `...(\/_next\/[^\s?#:()]*)(?:[?#][^\s:()]*)?`. Both the path class and the query class exclude `:`, because the trailing `:line:col` has to stay. The consequence is that when a query or fragment contains a `:`, the match ends there and everything after it stays in the text. The URL scheme has already been consumed, so `URL_PATTERN` can no longer replace the remainder. Measured against the committed code:

| Input | Output |
|---|---|
| `at e (https://x.com/_next/image?url=https://bkt.s3.amazonaws.com/uploads/me.wav?X-Amz-Signature=abc&w=64:1:2)` | `at e (/_next/image://bkt.s3.amazonaws.com/uploads/me.wav&w=64:1:2)` |
| `https://h/_next/static/a.js?v=tok:SECRETSECRET` | `/_next/static/a.js:SECRETSECRET` |
| `https://h/_next/a#frag:secret/foo.wav` | `/_next/a:secret/foo.wav` |

The first row is the serious one: a nested URL in a `/_next/...?url=` query, such as the Next image-optimizer form, leaks the bucket host and the upload key (the file name) that the scrubber exists to remove. Before WR-01 the whole URL became `[url]`. `images.unoptimized` is true today, so the image optimizer path is unlikely to be hit now. The leak is real as soon as any `/_next/` URL carries a `:` in its query or fragment. The server runs the same scrubber, so it re-scrubs with the same hole, and the `docs/MONITORING.md` claim is false for those inputs.

**Fix:** Drop everything after the `?` or `#` up to whitespace or a closing paren, and re-attach only a trailing `:line:col`:

```ts
// path stays; query/fragment (any chars, including ':') removed; trailing :line:col kept
const NEXT_ASSET_URL_PATTERN =
  /\bhttps?:\/\/[^\s/?#()]+(\/_next\/[^\s?#:()]*)(?:[?#][^\s()]*?)?((?::\d+){0,2})(?=[\s)]|$)/gi;
// in scrubText: .replace(NEXT_ASSET_URL_PATTERN, '$1$2')
```

The lazy quantifier is anchored by the lookahead, so each match runs to the end of its own token and the pass stays linear. Alternatively, only keep the path when the remainder of the token contains no `:` other than a final `:\d+:\d+`, and otherwise fall through to `[url]`. Add tests for `?url=https://...`, `?v=a:b` and `#x:y/z.wav`, and re-run the timing suite with a `https://h/_next/a?:` repeat.

## Info

### IN-06: IPv4 and IPv6 patterns have false positives (new)

**File:** `dashboard-next/src/features/monitoring/scrub.ts:44-45`

**Issue:** `IPV4_PATTERN` rewrites any four-part dotted number, such as the browser version `120.0.6099.109`, to `[ip]`. `IPV6_PATTERN`'s second alternative matches hex-letter words followed by `::`, such as `Fade::x` or `Dead::beef`. Neither is a safety problem, and over-scrubbing is the safe direction. They do cost some diagnostic value for version strings. Accept, or require at least one group of four hex digits or a digit for IPv6.

### IN-07: `onError` replaces MapLibre's default console logging (new)

**File:** `dashboard-next/src/features/map/MapShell.tsx:212-218`

**Issue:** Once `onError` is passed, `react-maplibre` no longer calls `console.error(e.error)`. During development, tile, sprite and style errors now reach only `reportClientError`, which is silent and capped at 5 per page load. Add a `console.error('[map]', event.error)` (dev only if preferred) to `onMapError`.

### IN-08: Map tile errors share the 5-per-page-load report budget (new)

**File:** `dashboard-next/src/features/map/MapShell.tsx:214` with `report.ts:15,62`

**Issue:** Every non-fatal tile error is reported. A CARTO or OSM tile outage can use up most or all of the 5 report slots before a genuine application error happens, which then gets dropped. The dedupe key usually collapses them, since `AJAXError` frames share `line:col`, so the risk is modest. Consider reporting only the first non-fatal map error per mount.

### IN-09: The site list adds up to 54 Tab stops before the rest of the page (new)

**File:** `dashboard-next/src/features/map/SiteList.tsx:66-92`

**Issue:** Keyboard users must Tab through every site button to get past the map. Use a single roving tabindex with arrow keys, or place a "Skip site list" control first. Also, when a mouse user closes a popup that a keyboard user opened, `opener.focus()` makes the hidden list pop open over the map (`ReefMap.tsx` `handleClosePopup`). Both are minor.

### IN-10: New JSX is not indented to match the render function wrapper (new)

**File:** `dashboard-next/src/features/map/ReefMap.tsx:188-291`, `WorldMap.tsx:133-163`, `MiniMap.tsx:113-168`

**Issue:** The `{(onMapError) => ( <> ... </> )}` wrapper was added without re-indenting the body. `ReefMap` also has a doubled blank line near the `SiteList`. Run the formatter in a dedicated whitespace-only commit.

### Carried forward, untouched since the last review

- **IN-01:** The local `Map` import shadows the global in `ReefMap.tsx:5`, `MiniMap.tsx:4` and `WorldMap.tsx:4`. `SitePopup.tsx:26-31` still has the dead `countryName` ternary (`const countryName = site.country || 'Unknown'`).
- **IN-02:** Popup text contrast (`text-gray-400`, `text-ochre` on white) and the small marker target size in `SiteMarker.tsx`.
- **IN-03:** The `before_ref` checkout in `ci.yml` still lacks `persist-credentials: false`.
- **IN-04:** `scripts/build-visual-review.mjs` does not run `row.state` and `c.name` through `mdEscape`.
- **IN-05:** `docs/MONITORING.md` still says "accepts only same-site JSON posts". A request without an `Origin` header is accepted.

---

_Reviewed: 2026-10-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Resolution after iteration 3 (orchestrator, 2026-10-03)

The single remaining Warning (WR-01 colon-query leak) was fixed in commit ba44795: the whole query/fragment of a same-site `/_next/` asset URL is dropped and only the path plus trailing `:line:col` is kept. Regression tests for the three leaking inputs plus a smuggled second URL pass (41/41 in monitoring-scrub.test.ts) and the linear-scaling suite still passes. Max fix iterations (3) reached; no Critical or Warning findings remain open. Info items IN-01..IN-10 are carried to later phases.
