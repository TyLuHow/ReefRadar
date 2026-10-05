---
phase: 04-design-system-instrument-primitives
reviewed: 2026-10-05
depth: standard (tests: quick)
diff_base: 00828f3
files_reviewed: 234
status: issues_found
critical: 2
warning: 38
info: 29
---

# Phase 4 Code Review

Four parallel reviewers, split by area because of the 234-file scope. Totals: 2 critical/blocker, 38 warnings, 29 info. Each part below is the reviewer's report verbatim (frontmatter stripped); finding ids are scoped to their part (A-WR-01, B-WR-01, ...).

## Part A: features/ui, styles, src/app, config, CI, scripts (41 files)

## Phase 4 (part A): Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

### Summary

No BLOCKER-class defects found in this slice. The Tailwind 4 migration of the legacy UI is careful (removed or renamed utilities `flex-shrink-0`, `rounded`, `bg-gradient-to-br` are all converted; the stock palette, line-heights, default border colour, form-control resets and cursor rules are pinned in `legacy.css`). I grepped the legacy tree for the other v3 to v4 renamed utilities (`shadow`, `shadow-sm`, `blur`, `ring`, `outline-none`, `flex-grow`, `*-opacity-*`) and found none left. I also grepped it for class names that collide with the new `tokens.css` utilities (`text-muted`, `bg-panel`, `text-small`, `font-body`, `focus-ring`, ...) and found none. The dev-fixtures exclusion is sound in design: `env` define, the flag check around the dynamic import, `dynamicParams=false`, the marker scan, and the 404 probe. The CI workflow has no workflow-input injection: `before_ref` is consumed only by `actions/checkout` `ref:`, and the boolean inputs appear only in `if:` expressions. A normal push or pull_request still runs web, e2e, python, citations and visual, and skips only review and live-smoke. The LFS pull and cache steps are ordered correctly. The `update_snapshots` conditions are consistent between the update and verify steps.

What was found:

- Six warnings. One is a real portal bug in `Tooltip`. One is an accessibility defect in `LoadingState` that defeats its stated purpose. One is a legacy touch-device behaviour change from Tailwind 4 that the fingerprint tool cannot see. One is a cleanup bug in the exclusion-check script. One is a concurrency-group hole in the CI workflow. One is a missing production guard on the fixtures flag.
- Nine info items.

### Warnings

#### WR-01: Tooltip portals to document.body, outside the instrument surface (wrong font, no reduced-motion scope)

**File:** `dashboard-next/src/features/ui/Tooltip.tsx:42-49`
**Issue:** `Dialog.tsx` and `CommandPalette.tsx` deliberately portal into the instrument surface root (`SurfaceModalOverlay`, `overlayContainer`). The reason, per the Dialog comment, is that the `next/font` variable classes live on a subtree (`app/dev/layout.tsx` puts them on a `<div>` below `<body>`). `Tooltip` renders a bare `RacTooltip`, which portals to `document.body`; I confirmed that `UNSTABLE_portalContainer` exists on RAC `Tooltip` in 1.21.1 and is not passed here.

The `--dir-*` colours still reach a body-level tooltip, because tokens.css also sets them on `html:has(...)`. But `--dir-font-body: var(--font-hanken, system-ui)` is resolved on `<html>`, where `--font-hanken` is not defined, so the tooltip inherits the fallback `system-ui`. A live tooltip therefore renders in system-ui, while `TooltipSurface` (inside the surface) renders in Hanken Grotesk. The fixture screenshots only use `TooltipSurface`, so the baselines will never catch it. The same escape applies to every `[data-surface='instrument'] *` reset (`transition: none`, the focus outline rule), since these only match descendants of the root.
**Fix:** Portal the tooltip into the surface the same way the overlays do, for example with a small `SurfaceTooltip` that holds `overlayContainer()` when open (the same pattern as `SurfaceModalOverlay`), and pass it as the portal container:
```tsx
<RacTooltip UNSTABLE_portalContainer={container} offset={8} placement={placement} className={...}>
```
or wrap the trigger in react-aria's `UNSTABLE_PortalProvider getContainer={overlayContainer}`.

#### WR-02: LoadingState sets aria-busy="true" on its own live region, so the label (and the 8 s long-wait message) may never be announced

**File:** `dashboard-next/src/features/ui/LoadingState.tsx:46`
**Issue:** `<div role="status" aria-busy="true">` is a live region marked busy for its whole life. `aria-busy="true"` tells assistive technology to defer announcing changes until the flag clears. Most screen readers therefore never announce this region's content, and the swap to "This is taking longer than usual." is also suppressed. The component is removed when loading finishes, so the flag never clears. The stated purpose, "a long wait is stated, not hidden", is not met for screen-reader users. This primitive is reused inside `Dialog`, `Listbox`, `Slider` and `CommandPalette` loading states.
**Fix:** Drop `aria-busy` from the live region. If a busy marker is wanted, the caller sets `aria-busy` on the container being loaded, not on the status region.
```tsx
<div role="status" className={clsx('flex flex-col gap-3 text-start', className)}>
```

#### WR-03: Tailwind 4 gates every legacy `hover:` utility behind `@media (hover: hover)`, which changes legacy behaviour on touch devices, and nothing in the proof tooling can see it

**File:** `dashboard-next/src/styles/legacy.css` (no `@custom-variant hover` override); symptom visible in a compiled `src/app/globals.css`
**Issue:** The claim is that the legacy UI is unchanged. I compiled `globals.css` with `scripts/compile-css.mjs`. All 38 legacy `hover:` usages (for example `hover:scale-[1.01]` on the dashboard cards, `hover:bg-ochre/90` on the analyze button, the nav link `hover:text-bone`) are now emitted inside `@media (hover: hover) { ... :hover }`. Under Tailwind 3 they fired on touch tap. On phones and tablets, which CLAUDE.md lists as first-class devices, the tap feedback is gone. The fingerprint diff runs in desktop Chrome, which has hover, and it samples computed style without a hovered element (only the `sites-hover` probe hovers), so this category cannot appear in it. `compile-css --normalize` only proves that the legacy.css move was lossless against the post-migration build, not against Tailwind 3.
**Fix:** To keep the v3 behaviour exactly, add to `legacy.css`:
```css
@custom-variant hover (&:hover);
```
This changes the compiled output, so re-baseline the "identical" proof. Also check that `features/` code does not rely on the media-gated `hover:` (it uses `hover-state:`). If the owner prefers the v4 behaviour, record it as an accepted difference in the plan 04-01/04-02 notes, because the legacy.css header says the look is "carried over unchanged".

#### WR-04: check-dev-fixtures-excluded.mjs skips its cleanup on every failure path, so `next start` can be left running on port 3107

**File:** `scripts/check-dev-fixtures-excluded.mjs:38-41, 87-100, 131-136`
**Issue:** `fail()` calls `process.exit(1)` synchronously. In `checkRoutes()`, `waitForServer(...)` and the catch block both call `fail()` inside the `try`, so the `finally { killTree(child) }` never runs. When the startup times out, or a route fetch throws, the spawned server stays alive. On a developer machine this leaves a stray server on port 3107. The next run then spawns a second `next start`, which dies on EADDRINUSE. `waitForServer` can reach the stale server before the `exit` event of the new child fires, so the 404 probe can hit the old process, which may be a different (flag-enabled) build. This can give a false pass or a false fail. CI runners are disposable, so this is mainly a local-run hazard.
**Fix:** Do not exit from inside the guarded region. Throw or return an error, kill the child, then fail:
```js
let failure = null;
try { ... } catch (error) { failure = error; } finally { killTree(child); }
if (failure) { console.error(log); fail(`could not check routes: ${failure.message}`); }
```
Make `waitForServer` throw instead of calling `fail`, and add `child.on('error', ...)`.

#### WR-05: Concurrency group lets a live-smoke dispatch cancel an in-flight snapshot or review dispatch

**File:** `.github/workflows/ci.yml:27-29`
**Issue:** The group is `ci-<workflow>-<event_name>-<ref>` with `cancel-in-progress: true`. The comment says push and dispatch runs no longer cancel each other, which is true. But all `workflow_dispatch` runs on one ref still share a group. The slow `update_snapshots` dispatch (visual regeneration plus the two-checkout review capture) is cancelled by any later dispatch on the same ref, including a quick `live_smoke` dispatch or a second regeneration. The regenerated baselines and review captures are the only artifacts that run produces, so the loss is silent.
**Fix:** Give each dispatch its own group, for example:
```yaml
group: ci-${{ github.workflow }}-${{ github.event_name == 'workflow_dispatch' && github.run_id || github.ref }}
```
This keeps cancel-on-new-push for push and pull_request runs.

#### WR-06: Nothing stops a production Vercel build with NEXT_PUBLIC_DEV_FIXTURES=1; the exclusion check only covers the CI build

**File:** `dashboard-next/next.config.js:13-15`, `scripts/check-dev-fixtures-excluded.mjs`, `.github/workflows/ci.yml:52`
**Issue:** The core-value constraint is that `/dev/fixtures` must never ship without the flag. The enforcement is the `=== '1'` define plus a convention ("Never set NEXT_PUBLIC_DEV_FIXTURES in Vercel"). The CI proof (`check-dev-fixtures-excluded.mjs`) runs against the CI `web` job build, not against the build Vercel makes from the project's own env vars. If the variable is ever set in the Vercel project, for instance for a preview review of the fixtures page, and applied to Production, the fixtures route and chunk ship. They also carry the instrument styling and synthetic or fixture content, which is the integrity risk. The `X-Robots-Tag: noindex` header limits indexing but does not stop access.
**Fix:** Fail the build when the flag is on in a production deployment:
```js
if (process.env.NEXT_PUBLIC_DEV_FIXTURES === '1' && process.env.VERCEL_ENV === 'production') {
  throw new Error('NEXT_PUBLIC_DEV_FIXTURES=1 must not be set for a production build');
}
```
Optionally run `check-dev-fixtures-excluded.mjs --no-server` as a Vercel `buildCommand` suffix on production.

### Info

#### IN-01: Stale and misleading comments in CI and Playwright config

**File:** `.github/workflows/ci.yml:181-182`, `dashboard-next/playwright.config.ts:64-66`
**Issue:** Both say `fixtures-shots` "skips with an annotation until its baselines are committed". Plan 04-24 committed 184 baselines and made the spec fail closed in CI (see `docs(04-24)` and `test(04-24): fail closed without fixtures baselines in CI`). A reader will think a missing baseline set is tolerated.
**Fix:** Update both comments to say the project fails closed in CI.

#### IN-02: Second checkout in the review job persists the token into a ref the dispatcher chose

**File:** `.github/workflows/ci.yml:209-212`
**Issue:** The `before` checkout leaves the job token in `before/.git/config` (the default `persist-credentials: true`), then runs `npm ci` and Playwright from that tree. The token is `contents: read` and dispatch needs write access, so the risk is small. It is still unnecessary exposure to the install scripts of an arbitrary ref.
**Fix:** Add `persist-credentials: false` to the `before` checkout (and to the head checkout in this job).

#### IN-03: Check script has no positive control for the 404 probe

**File:** `scripts/check-dev-fixtures-excluded.mjs:102-138`
**Issue:** The probe only asserts that `/dev/fixtures/` and `/dev/fixtures/tokens/` return 404. It never checks that a known live route (for example `/about/`) returns 200. A server that 404s everything would pass.
**Fix:** Add `/about/` (or `/`) to the probe with an expected 200.

#### IN-04: `isLargeRadius` accepts any property, not just radii

**File:** `dashboard-next/scripts/style-fingerprint-diff.mjs:84-89`
**Issue:** Any property whose values are all at least 9999px on both sides is classed `serialisation-radius`, for instance a `width` or `height` that changed from 10000px to 99999px. In practice only radius properties hit this, but it is wider than the category describes.
**Fix:** Restrict to `name.endsWith('-radius')` in the call at line 278.

#### IN-05: ToggleGroup writes aria-invalid onto a toolbar

**File:** `dashboard-next/src/features/ui/ToggleGroup.tsx:93-99`
**Issue:** In multiple-selection mode RAC renders `role="toolbar"`. `aria-invalid` is not a supported attribute for `toolbar`, so axe's `aria-allowed-attr` can flag an invalid multiple group. It is valid on `radiogroup`.
**Fix:** Set `aria-invalid` only when `selectionMode !== 'multiple'`, or convey the error through the `helperText` link only.

#### IN-06: CommandPalette empty message with an empty query reads "No results for “”."

**File:** `dashboard-next/src/features/ui/CommandPalette.tsx:233`
**Issue:** When `groups` is empty (no data) and the query is blank, `renderEmptyState` prints `No results for “”.`.
**Fix:** `needle ? \`No results for “${needle}”.\` : 'Nothing to search yet.'`.

#### IN-07: Slider `decimalsOf` ignores decimals in `min` and exponent-form steps

**File:** `dashboard-next/src/features/ui/Slider.tsx:91-102`
**Issue:** The rounding precision comes from `step` only. With `min=0.25, step=0.5`, `toFixed(1)` rounds 0.75 to 0.8, an off-grid value. A step like `1e-7` stringifies as `"1e-7"` and gets 0 decimals. A zero step gives NaN. Edge cases only; current callers use integer steps.
**Fix:** Take `Math.max(decimalsOf(step), decimalsOf(min))` and handle the exponent form (`step.toString().split('e-')`).

#### IN-08: Smaller accessibility and state details

**File:** `dashboard-next/src/features/ui/Dialog.tsx:309` (AlertDialog), `dashboard-next/src/features/ui/ErrorState.tsx:62-70`, `dashboard-next/src/features/ui/Table.tsx:135`
**Issue:**
- AlertDialog's `<p>{body}</p>` is not linked by `aria-describedby`, so the alert description is not announced on open (APG recommends it).
- ErrorState's `copy` state never resets when `requestId` changes, so "Copied" can describe a previous id.
- Table's selected-row bar is `shadow-[inset_3px_0_0_...]`, a physical-left shadow, while the file promises logical (RTL-safe) properties. In RTL the bar stays on the left.
**Fix:**
- Give the body paragraph an id and pass `aria-describedby` on `RacDialog`.
- Reset `copy` in an effect on `requestId`.
- Use a `before:` pseudo-element with `inset-inline-start`, as `ListboxItem` does.

#### IN-09: `countBy` silently drops items with an out-of-range status

**File:** `dashboard-next/src/features/ui/count-by.ts:15-20`
**Issue:** The file says a number on screen is always a count of the data shown. An item whose accessor returns something outside the five statuses is omitted without trace, so the legend counts will not sum to `items.length`. Types prevent this at compile time but not at runtime (accessors reading JSON).
**Fix:** Count the unknown ones into `unknown`, or return `{ counts, dropped }`, so the loss is visible.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part B: features/instrument: DSP, audio engine, transport, compare, probability, provenance (38 files)

## Phase 4 (part B): Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

### Summary

The DSP core, audio engine and playhead clock are in good shape. I traced each of these and they hold:

- The AudioContext is created synchronously, before the first await.
- `decodeAudioData` is given `bytes.slice(0)`.
- Unequal-length clips are rejected at the 10 ms tolerance.
- Gains are equal-power, and level matching is attenuation only.
- The rAF loop is bounded by start, stop and visibility. Reduced motion uses a 1 Hz interval with no frame loop.
- Every listener, observer and interval I looked at has a cleanup, and `dispose` closes the context.
- The WAV parser checks every chunk size against the buffer and always advances the offset, so the chunk loop terminates.
- The spectrogram range is fixed at -120 to -50 dB. I found no per-clip scaling in the spectrogram path.
- `safeHttpsUrl` correctly rejects `javascript:`, `data:`, `http:`, relative and credentialed URLs.

No critical issues. The defects are around the edges of the trusted-input assumption and the honesty guarantees:

- A path guard that can be bypassed (WR-01).
- Degenerate WAVs that the parser accepts but the UI cannot render (WR-02, WR-03).
- ProbabilityBar accepting values that are not probabilities (WR-04, WR-05).
- A WindowStrip shading that is auto-scaled per clip without saying so (WR-06).
- A latent wrong-audio-under-wrong-label path in CompareDeck (WR-07).

### Warnings

#### WR-01: `safeMethodsHref` accepts `/<TAB>/evil.com`, which the browser resolves off-site

**File:** `dashboard-next/src/features/instrument/WhyPanel.tsx:193-196`

**Issue:**
- The path test `/^\/(?!\/)/` only checks that the second character is not a slash.
- WHATWG URL parsing strips tab, CR and LF characters and treats `\` as `/` for https URLs.
- So `"/\t/evil.com"` and `"/\n/evil.com"` pass the guard and navigate to `https://evil.com/`. I confirmed this with `new URL('/\t/evil.com', 'https://reefradar.example/about/')`, which resolves to `https://evil.com/`. A backslash variant, `/\evil.com`, behaves the same way.
- `methodsHref` is a public prop on `ProvenanceChip`, `WhyPanel` and `WhyPanelBody`. Every caller passes a literal today, but the helper is the stated guard (T-04-12-01) and it can be bypassed. The same function feeds the error-state `link` and `MethodsLink`.

**Fix:** Resolve against a fixed base and require the same origin, then emit the normalised path:
```ts
const BASE = 'https://placeholder.invalid';
function safeMethodsHref(href: string): string | undefined {
  if (href.startsWith('/')) {
    try {
      const u = new URL(href, BASE);
      return u.origin === BASE ? `${u.pathname}${u.search}${u.hash}` : undefined;
    } catch { return undefined; }
  }
  return safeHttpsUrl(href);
}
```

#### WR-02: A zero-frame or sub-frame WAV is accepted and then breaks the Spectrogram

**Files:**
- `dashboard-next/src/features/instrument/dsp/wav.ts:66-77`
- `dashboard-next/src/features/instrument/useClipSpectrogram.ts:60-67`
- `dashboard-next/src/features/instrument/Spectrogram.tsx:144-163, 196-201, 247-250`

**Issue:**
- The parser accepts a `data` chunk of size 0 and returns an empty `samples` array.
- Clips shorter than 1024 samples, about 32 ms, give `frameCount() === 0`.
- `fetchAndTransform` does not reject this, so the hook reports `ready` with `matrix.frames === 0`.
- Spectrogram then does three bad things:
  - `imageFor` calls `ctx.createImageData(0, bins)`, which throws `IndexSizeError` inside a ResizeObserver callback. The error is uncaught, the well never becomes ready, and nothing is shown to the user.
  - `readoutText` computes `clamp(…, 0, -1)`, which returns -1, so `dbAt` reads `data[-bins + bin]`. The result is `undefined`, and the readout shows "NaN dB".
  - `TimeAxis` computes `seconds / duration` with `duration` 0, giving `NaN%` offsets.
- The module header says malformed files raise `WavFormatError`, so the contract is that bad input becomes an error state.

**Fix:** Reject it where the data enters:
```ts
// fetchAndTransform, after parseWavPcm16
if (wav.samples.length < SPECTROGRAM_SPEC.fftSize) throw new Error('The recording is too short to analyse.');
```
Alternatively, throw `WavFormatError('No audio frames')` in `parseWavPcm16` when `frames === 0`. Also make `imageFor` return null when `width === 0`.

#### WR-03: The WAV parser has no upper bound on sample rate, and `frequencyTicks` then builds about a million ticks

**Files:**
- `dashboard-next/src/features/instrument/dsp/wav.ts:64-65`
- `dashboard-next/src/features/instrument/playhead.ts:69-77`
- `dashboard-next/src/features/instrument/Spectrogram.tsx:261-281`

**Issue:**
- `sampleRate < 1` is the only check on a field that is a uint32 from untrusted bytes.
- A header declaring 4,294,967,295 Hz gives a Nyquist of about 2.1e9. `frequencyTicks` then loops about 1.07 million times in 2 kHz steps, and `FrequencyAxis` renders a `<span>` for each tick, which hangs the tab.
- Other consumers also take `sampleRate` unchecked, such as `hopSeconds` and the caption.
- The task brief calls out the parser as handling untrusted bytes. Today only first-party files are loaded, but the cap costs nothing.

**Fix:**
```ts
const MIN_RATE = 4_000, MAX_RATE = 384_000;
if (sampleRate < MIN_RATE || sampleRate > MAX_RATE) throw new WavFormatError(`Unsupported sample rate ${sampleRate}`);
```
Also make `frequencyTicks` return early for non-finite or very large `nyquistHz`, for example by capping the tick count at 64.

#### WR-04: ProbabilityBar draws NaN, negative, infinite and all-zero values as if they were a reading

**File:** `dashboard-next/src/features/instrument/ProbabilityBar.tsx:114-129, 199-259`

**Issue:** `buildRows` keeps any `typeof p === 'number'`, including `NaN`, `±Infinity` and negatives, and renormalises by the sum. The product's core rule is "no displayed probability that is not a probability". The failure modes differ by input:
- One `NaN` among valid values makes `sum` NaN, so `toIntegerPercentages` returns all zeros. A class with p = 0.9 is shown as "0%" with no bar, and the sentence "Model's highest probability: X 0%" is printed.
- `Infinity` gives `NaN%` text in the row.
- Negative values give negative percentages and negative bar widths.
- An all-zero input shows three rows at 0% (not summing to 100) and still prints the match or differ verdict against the reference label.
- Dropping a class that is present in the payload but absent from `modelClasses` silently renormalises, so the shown percentages are not the model's output. The header says "as returned".

**Fix:** Validate before building rows, and fall back to the error or empty state when the reading is not a probability distribution:
```ts
const valid = classes.every((s) => { const p = probabilities[s] as number; return Number.isFinite(p) && p >= 0 && p <= 1; });
const total = classes.reduce((a, s) => a + (probabilities[s] as number), 0);
if (!valid || !(total > 0)) -> render the error state ("The model reading could not be shown.")
```
Optionally also flag when `|total - 1| > 0.01`, rather than normalising it away.

#### WR-05: An absent `evaluation` suppresses the "not tested on new sites" limit line

**File:** `dashboard-next/src/features/instrument/ProbabilityBar.tsx:57, 258`

**Issue:**
- The type `unknown | null` collapses to `unknown`.
- The limit line renders only for `modelCard.evaluation === null`, so a model card missing the field (`undefined`), or one passed through from a looser type, shows no limits statement at all.
- The honest default, as the header comment says, is that the model has not been evaluated unless a grouped, site-held-out evaluation is shown to exist.

**Fix:** Use `modelCard.evaluation == null`. Type the field as `evaluation?: object | null` so that `unknown` is not accepted.

#### WR-06: WindowStrip energy shading is auto-scaled per clip and the legend does not say so

**File:** `dashboard-next/src/features/instrument/WindowStrip.tsx:99-103, 141, 342-343`

**Issue:**
- The energy fill is mapped from each clip's own quietest and loudest window onto opacity 0.15 to 0.85.
- A clip whose windows span 1 dB therefore looks as contrasty as one spanning 20 dB, and the quietest window of a loud clip looks identical to the quietest window of a quiet clip.
- The legend (`ENERGY_LEGEND`) says only "Shade is the measured RMS level of each 5 s window". A reader will take the shade as an absolute level, which breaks the instrument's rule that nothing is scaled per clip, so two strips cannot be compared by eye.
- The component's own header documents the per-clip mapping, but the user-facing text omits it.

**Fix:** Either map onto a fixed dB range, for example the same -120 to -50 dBFS range as the spectrogram, so that shades are comparable. Or state the scaling in the legend: "Shade is relative to this clip's quietest and loudest window; strips from different clips are not comparable." Add the min and max dB to the tooltip or legend so the scale is traceable.

#### WR-07: CompareDeck keys clips, gains and engine ids on `siteId`, so two clips from one site collapse into one

**Files:**
- `dashboard-next/src/features/instrument/CompareDeck.tsx:98, 112-116, 166`
- `dashboard-next/src/features/instrument/useTransport.ts:88-92`
- `dashboard-next/src/features/instrument/audio-engine.ts:103, 160, 283`

**Issue:**
- The contract is "clips matched by `id === row.identity.siteId`".
- If rows A and B share a site, which is exactly the "times of day" or "events" comparison in the product vision:
  - `clips.find` returns the first clip for both rows, so the engine plays clip A twice and labels the second one "B".
  - `mixGains` builds `{ [id]: a, [id]: b }`, so one key overwrites the other.
  - `gainBySite` loses one entry, so the "Level matched" line shows the wrong gain on one row.
- This puts the wrong audio under a label, which is the failure the core value forbids. It is latent only because the fixtures pair two different sites.

**Fix:**
- Key by a per-clip id, for example the excerpt id (`ind_H1_20220830_120000`), carried on `CompareRowData` and `TransportClip`, rather than by `siteId`.
- Add a guard in CompareDeck: if the two ids are equal, treat the pair as not ready or throw in development.

#### WR-08: The spectrogram image is one canvas as wide as the frame count, with no cap, unlike the backing store

**File:** `dashboard-next/src/features/instrument/Spectrogram.tsx:144-163`

**Issue:**
- The precomputed image is `frames` pixels wide, and `frames` is the number of samples divided by 256.
- At 32 kHz a 10-minute clip is about 75,000 columns by 513 rows, about 38 million pixels. That exceeds Chrome's 32,767 px dimension limit and Safari's 16.7 million pixel area limit.
- `getContext('2d')` then returns null, or the draw silently fails, and the user sees "This browser cannot draw the spectrogram" for a clip that is simply long.
- `backingStoreSize` already caps the visible canvas for exactly this reason. The offscreen image has no equivalent. WindowStrip's dense mode already anticipates long uploads.

**Fix:** Cap the image width, for example by max-pooling frames into at most 8192 columns when `frames` is larger, with `scrollSourceRect` working in image columns. Or render long clips in tiles. At minimum, show a specific "recording too long to draw" state instead of the browser-unsupported copy.

### Info

#### IN-01: Duplicate length-tolerance constant

**File:** `dashboard-next/src/features/instrument/audio-engine.ts:20` and `dashboard-next/src/features/instrument/compare-math.ts:17`

**Issue:**
- `LENGTH_TOLERANCE_S` is defined twice. The comment says "same tolerance as the audio engine", but nothing enforces it.
- If one drifts, `durationsMatch` could say "ok" while the engine throws `UnequalLengthError`, or the reverse.

**Fix:** Export it from one module, for example `audio-engine.ts`, and import it in `compare-math.ts`.

#### IN-02: The CompareDeck disclosure claims matched levels when nothing is playable

**File:** `dashboard-next/src/features/instrument/CompareDeck.tsx:225-227`

**Issue:** The condition `gainsDb !== undefined || playable.length === 0` prints "Playback levels are matched…" while rows are loading, in error or disabled, and also when lengths differ so playback is off. The claim is not true in those states.

**Fix:** Print `DISCLOSURE` only when `ready && gainsDb !== undefined`. Print `DISCLOSURE_UNMATCHED` only when `ready` and a clip has no RMS. Print nothing otherwise.

#### IN-03: An interrupted or suspended AudioContext leaves the UI "playing" with a frozen playhead

**File:** `dashboard-next/src/features/instrument/audio-engine.ts:128-132, 186-223`

**Issue:**
- The engine never listens to `ctx.onstatechange`.
- If the OS interrupts audio (iOS Safari 'interrupted', or a Chromium suspend), `currentTime` stops advancing and `onended` never fires. The engine stays `playing` and the playhead freezes.
- `play()` also awaits `resume()` with no timeout, so on Safari a resume that never settles leaves the status at `loading` until the user presses again.

**Fix:** Subscribe to `statechange` in the engine and call `pause()` or `finish()` when the state leaves `running` while `playing`. Remove the listener in `dispose`.

#### IN-04: `doiUrl` can throw during render, and it assumes the DOI is bare

**File:** `dashboard-next/src/features/instrument/safe-url.ts:26-33`

**Issue:**
- `encodeURIComponent` throws `URIError` on a lone surrogate. `doiUrl` is called unguarded inside `rowsOf` and `AttributionFooter`, so a malformed DOI string would crash the render. The contract regex protects the contract path, but `WhyPanelData.doi` accepts any string.
- A DOI given as `https://doi.org/10.…` yields `https://doi.org/https%3A//doi.org/…`, which is a dead link.

**Fix:** Wrap the encoding in try/catch and return `undefined`. Strip a leading `https?://(dx\.)?doi\.org/` prefix before encoding.

#### IN-05: The Transport error copy is the same for every failure

**File:** `dashboard-next/src/features/instrument/Transport.tsx:273-284`, `dashboard-next/src/features/instrument/useTransport.ts:201-203`

**Issue:** Any `engine.play` rejection (decode failure, `UnequalLengthError`, no AudioContext) becomes "Audio could not be loaded. Check your connection, then try again." That is wrong advice for a length mismatch or a decode failure. The error object is available but unused.

**Fix:** Pass a message or kind through `TransportProps`. For example, show "These recordings are not the same length." for `UnequalLengthError`, and keep the connection copy for fetch errors only.

#### IN-06: Scrub dragging restarts audio sources on every pointermove

**File:** `dashboard-next/src/features/instrument/Spectrogram.tsx:489-494`, `dashboard-next/src/features/instrument/audio-engine.ts:234-247`

**Issue:** While playing, each pointermove calls `onScrub`, which calls `engine.seek`, which tears down and recreates the BufferSource and GainNode graph. At high pointer rates this produces audible stutter and a lot of node churn. A forced React render also happens each time through `apply(…, true)`.

**Fix:** Throttle scrubbing, for example with rAF coalescing. Alternatively, mute during the drag and seek once on `pointerup`.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part C: features/fixtures, charts, map, contract, audio-manifest, legacy components (80 files)

## Phase 4 (part C): Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 80
**Status:** issues_found

### Summary

Part C covers the fixtures route, StripPlot, the token probe map, the `useProjection` hook, the audio manifest accessor and the Tailwind 4 class renames in 20 legacy components.

Overall the code is careful and the integrity posture holds up. I found no invented numbers, no synthetic audio and no model output presented as a diagnosis. All of the following are in good shape:

- **Dev-fixtures gate.** The section page imports only `slugs.ts`, and every `import('@/features/fixtures')` sits behind the `=== '1'` check. Nothing else statically imports the fixtures barrel or registry. The `slugs.ts` order equals the registry order.
- **State manifest.** Every id in `state-manifest.ts` is rendered by its section.
- **Contract fence.** No `fetch` in any reviewed file.
- **Query parsing.** `query.ts` uses closed allowlists, and token values go only through `style.setProperty`.
- **`useProjection`.** It is a faithful sibling of `useReferenceSites`.

The Tailwind 3 to 4 renames in the legacy components are all correct:

- `flex-shrink-0` to `shrink-0`
- `rounded` to `rounded-sm`
- `shadow-sm` to `shadow-xs`, and bare `shadow` to `shadow-sm` (MiniMap)
- `drop-shadow-sm` to `drop-shadow-xs`
- `backdrop-blur-sm` to `backdrop-blur-xs`
- `outline-none` to `outline-hidden`
- `[var(--x)]` to `(--x)`
- `scrollbar-thin` removed (it was a no-op; the old config had `plugins: []`)

I checked the base commit for leftover v3 `rounded-sm`, `shadow-sm`, `blur-sm` and bare `shadow`/`rounded`/`ring` classes and found none missed. The v4 border-colour default is neutralised in `legacy.css`. `SampleCard`'s trailing `!` is needed because `.glass-panel` is unlayered and now beats layered utilities. `hover:border-opacity-50` in `SiteCard` was already a no-op, because the border colour is inline.

One real defect (an interaction bug in the shipping StripPlot primitive), several wrong or misleading pieces of fixture copy and state, and some duplication.

### Critical Issues

#### CR-01: StripPlot click handler selects the first site when the user clicks blank plot area

**File:** `dashboard-next/src/features/charts/StripPlot.tsx:116-121`
**Issue:** `handleClick` reads `(event.target as Element).querySelector?.('title')`. Plot appends each mark's `<title>` inside its own `<path>` (confirmed in `node_modules/@observablehq/plot/src/style.js applyTitle`). That works only when the click lands exactly on a mark.

When the click lands on the `<svg>` root (empty plot area, margins, gaps between marks) or on the host `<div>`, `querySelector('title')` searches all descendants and returns the first mark's title in document order. `idFromTitle` then yields a real site id, which passes the `spec.table.rows.some(...)` guard. So `onSelect` fires with an arbitrary site (the first dot of the first status) on a blank click.

The consumers (SelectableStrip, CompositionExplore) then show a different site's label and audio than the one the user pointed at. That breaks the "every claim traceable" posture. The guard only protects the paired variant.

**Fix:** only accept a `<title>` that is a direct child of the clicked mark element.
```tsx
function handleClick(event: MouseEvent<HTMLDivElement>) {
  if (!onSelect || !spec) return;
  const mark = (event.target as Element).closest?.('path');
  const title = mark?.querySelector(':scope > title')?.textContent;
  const id = idFromTitle(title);
  if (id !== null && spec.table.rows.some((row) => row[0] === id)) onSelect(id);
}
```
Also add a unit or e2e case that a click on `svg` itself selects nothing.

### Warnings

#### WR-01: Fixture chrome drops the URL hash and the `tok` overrides when navigating

**File:** `dashboard-next/src/features/fixtures/FixturesApp.tsx:174-186`
**Issue:** There are two related losses.
1. `setParam` calls `router.replace(\`${pathname}?${qs}\`)` and never carries `window.location.hash`. Flipping Direction or Reduced motion while viewing `#compare` clears the hash. `SectionLinks` reads the hash through `useSyncExternalStore`, so the current-section highlight (and `aria-current`) is lost and a reload no longer returns to the section.
2. `carried` (used for every section link) copies only `direction` and `reduced`. The comment on `setParam` says tok overrides are kept, but the links drop them. Moving from one section to another silently resets any `?tok=--dir-*` override the reviewer was testing, with no sign that it happened.

**Fix:**
```tsx
router.replace(`${qs === '' ? pathname : `${pathname}?${qs}`}${window.location.hash}`, { scroll: false });
...
for (const [name, value] of tokenOverrides) carried.append('tok', `${name}:${value}`);
```

#### WR-02: `ConditionalShell` hides the app shell for any pathname starting with `/dev`

**File:** `dashboard-next/src/components/layout/ConditionalShell.tsx:14`
**Issue:** `pathname.startsWith('/dev')` also matches `/developers`, `/devices` and any future `/dev*` route. Those pages would lose the Navbar and Footer with no error. It also removes the shell from the production 404 for `/dev/...`, which is cosmetic but unintended. With `trailingSlash: true` the dev paths are `/dev/` and `/dev/fixtures/`.

**Fix:**
```tsx
const isDevRoute = pathname === '/dev' || pathname.startsWith('/dev/');
const isImmersive = pathname.startsWith('/experience') || isDevRoute;
```

#### WR-03: Inconsistent "Window 2" copy (off-by-one) between the Spectrogram and WindowStrip sections

**File:** `dashboard-next/src/features/fixtures/sections/SpectrogramSection.tsx:267-268`, `.../WindowStripSection.tsx:502,509`
**Issue:** WindowStrip defines "Window 2" as the second window, 5 to 10 s (index 1; the file header says so). The Spectrogram `selected-window` cell uses `selectedWindow={2}` and labels it "Window 2 (10 s to 15 s)" (index 2, a zero-based name). A reviewer comparing the two sections sees the same name for two different windows. One of them is mislabelled.

**Fix:** use one convention. Either select index 1 in the Spectrogram cell and keep "Window 2 (5 s to 10 s)", or compute the label from the index:
```tsx
const SELECTED = 2; // window index
note={`Window ${SELECTED + 1} (${SELECTED * 5} s to ${(SELECTED + 1) * 5} s) outlined`}
```

#### WR-04: Compare fixtures draw a spectrogram with no caption while the contract is still loading

**File:** `dashboard-next/src/features/fixtures/parts/useCompareFixture.ts:60-62`, `.../sections/CompareSection.tsx:230-232`
**Issue:** When the clip is `ready` but `useReferenceSites` has not resolved, `row()` returns `{ matrix, caption: undefined }`, because `captionFor` returns undefined when the dataset name is missing. `Spectrogram` then renders the image with no caption. `Spectrogram.tsx:527` shows `captionText` only if `caption` is set, so the well has no site, dataset or recorded-time line (and no `of {site}` in its label).

`useFixtureClip` handles the same condition correctly: `waiting = ... || caption === undefined`, shown as the loading state. MotionSection's CrossfadeCell has no outer gate, so it can show audio-derived imagery without provenance in that window. CompositionCompare is only partly protected (its Body gates on both sites).

**Fix:** in both copies, treat a missing dataset as loading.
```ts
if (clip.status !== 'ready' || datasetOf(excerpt.site_id) === undefined) return { slot, state: 'loading' };
```

#### WR-05: StripPlotSection scatter cell flashes a false "No values to plot" while sites load

**File:** `dashboard-next/src/features/fixtures/sections/StripPlotSection.tsx:125-144,181`
**Issue:** `scatterData` is `[]` until `siteData` arrives, but `scatter` is built as soon as `projectionData` is present, and the cell renders `<StripPlot spec={scatter} />` without the `ready` gate every other cell uses. If the projection resolves first, `scatterSpec` runs with zero sites. `StripPlot` then shows the empty state ("No values to plot. Adjust the selection...") and the caption "No reference sites with projection coordinates." Both are false statements about the data, not a loading state.

**Fix:** require the sites before building the spec:
```tsx
const scatter = useMemo(
  () => (projectionData && siteData ? scatterSpec({ sites: scatterData, ... }) : undefined),
  [scatterData, projectionData, siteData],
);
```

#### WR-06: Fixture copy and constants that should be computed are typed (contradicts "nothing is typed that data could say")

**File:** `dashboard-next/src/features/fixtures/sections/TransportSection.tsx:37,113`, `.../WindowStripSection.tsx:408,442,474`, `.../BandToggleSection.tsx:359`, `.../CompareSection.tsx:282`, `.../ProbabilityBarSection.tsx:415`
**Issue:** the section comments promise that duration, window counts and class counts come from the manifest or contract. Several are literals instead:
- `TransportSection` draws every static cell with `DURATION_S = 30` and the note "12.4 s of 30.0 s". Its header says the cells use "the same recording's real duration", but the value is not read from `FIXTURE_EXCERPT.duration_s`.
- `WindowStrip` passes `expectedCount={6}` three times; it is `floor(duration_s / 5)`.
- `BandToggle` `DISABLED_REASON` hard-codes "8 kHz".
- `CompareSection` writes "12.4 s of 30.0 s".
- `ProbabilityBarSection` says "The model has three classes" instead of using `classes.length`.

If the manifest or model changes, these cells keep saying the old thing while the real controls move. The values are correct today.

**Fix:** derive them. For example `const DURATION_S = FIXTURE_EXCERPT.duration_s`, `const WINDOW_COUNT = Math.floor(FIXTURE_EXCERPT.duration_s / WINDOW_S)`, and `` `${NYQUIST_HZ / 1000} kHz` `` in the reason.

#### WR-07: Compare composition headline states dataset labels as plain facts, with no assigner

**File:** `dashboard-next/src/features/fixtures/parts/compositionCopy.ts:20-22`
**Issue:** `compareHeadline` renders "Healthy and degraded, 0.8 km apart." at display size. The file header says the copy follows "reference label for a dataset's label". The headline does not: it reads as a statement about the reefs, and the assigner appears only further down in the deck rows. The core value (a label always shows who assigned it) is not met by the most prominent sentence on the screen.

**Fix:** qualify the words, for example `` `Labelled ${label(a)} and labelled ${label(b)}, ${km} km apart.` `` or "Reference labels: healthy and degraded, ...". Update `tests/unit/composition-copy.test.ts` to match.

### Info

#### IN-01: Duplicated fixture plumbing that has already diverged

**File:** `sections/CompareSection.tsx:197-254` vs `parts/useCompareFixture.ts`; `captionFor` (4 copies: `ClipCardSection.tsx:48`, `CompareSection.tsx:197`, `useCompareFixture.ts:28`, plus the inline version in `useFixtureClip.ts:55` and `SpectrogramSection.tsx:215`); `describeClip` in `SpectrogramSection.tsx:202` vs `describeFixtureClip`; `BreakableId` in `CompositionExplore.tsx:212` and `CompositionInspector.tsx:70` (and `SiteIdText` in `TableSection.tsx`).
**Issue:** CompareSection keeps a private `useCompareFixture` that duplicates the shared hook in `parts/`, and four `captionFor` variants exist. WR-04 is the first divergence caused by this.
**Fix:** one `captionFor(excerpt, dataset)` in `parts/excerptIdentity.ts`; make CompareSection import the shared hook (add the `coarse` rows on top); export one `BreakableId`.

#### IN-02: Dead anchors in fixture CTAs

**File:** `sections/NumeralsSection.tsx:263`, `sections/CompositionListen.tsx:425` (`href="#place-a-recording"`), `sections/CompositionExplore.tsx:294-299` (`href="#site-${site_id}"`)
**Issue:** no element on the page has these ids, so "Place a recording" and "Open site and sources" are visible, focusable controls that do nothing.
**Fix:** render them as disabled or non-link placeholders with a "Arrives in a later phase" note, or point at a real in-page target.

#### IN-03: NumeralsSection band cell asserts a recording that is not there

**File:** `dashboard-next/src/features/fixtures/sections/NumeralsSection.tsx:275`
**Issue:** the band reads "A real recording · nothing synthetic / This is what a reef sounds like." while its own note says "no recording is attached to this cell". The eyebrow makes a claim about an adjacent recording that is absent.
**Fix:** use neutral placeholder copy in this cell ("Eyebrow text" / "Display headline"), or attach the real clip as the Listen composition does.

#### IN-04: StripPlot swallows the draw exception

**File:** `dashboard-next/src/features/charts/StripPlot.tsx:82-87`
**Issue:** `catch { ... }` discards the error. The visible state becomes "could not be drawn", but nothing reaches `features/monitoring` (client-error reporting), so a systematic Plot failure would be invisible in the Vercel logs.
**Fix:** `catch (error) { reportClientError(error) ... }` using the existing monitoring entry point.

#### IN-05: `projectionCaveat` lives in a module that imports Plot

**File:** `dashboard-next/src/features/charts/strip-plot-specs.ts:343`, imported statically from `dashboard-next/src/features/fixtures/parts/compositionCopy.ts:1` via the charts barrel
**Issue:** the function is pure string formatting but sits next to `import * as Plot`. Any static consumer (compositionCopy today, production pages later) pulls the ~240 KB Plot chunk, against the "load via next/dynamic" guidance in `charts/index.ts`. Also, `scatterSpec` types its own caveat sentence and ignores the contract's `projection.note` (required non-empty in the schema), which is the artifact's own caveat.
**Fix:** move `projectionCaveat` to a Plot-free module and import it from there. Consider showing `projection.note` alongside it.

#### IN-06: Probe map and its e2e hook are exported from the production `features/map` barrel

**File:** `dashboard-next/src/features/map/index.ts:18-22`, `dashboard-next/src/features/map/TokenProbeMap.tsx:141`
**Issue:** `/sites`, `/dashboard/map` and `AnalysisResults` all `import('@/features/map')` dynamically. Without `sideEffects: false`, the bundler may keep every re-export, so the fixture-only probe code and the `__tokenProbeMap` hook string can land in production map chunks. The hook is inert without `NEXT_PUBLIC_E2E_HOOKS=1`, and the dev-fixtures exclusion check looks only for the fixtures marker, so this would not be detected.
**Fix:** drop the TokenProbeMap exports from the barrel and have `TokenProbeSection` import `@/features/map/TokenProbeMap` directly (it is already behind the gated chunk). Or add the probe module name to the exclusion script's needle list.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Part D: Phase 4 tests: unit and e2e (75 files, quick depth)

## Phase 4 Part D: Test Code Review

**Reviewed:** 2026-10-05
**Depth:** quick, plus targeted reads
**Files reviewed:** 75
**Status:** issues_found

### Summary

The suite is mostly well built. Most keyboard and layout assertions are web-first or polled, the
support helper `openSection` is a real settle gate, the two baseline guards are sound
(legacy-baselines pins names and sha256, and I confirmed two of the hashes against `00828f3`;
fixtures-baselines checks the name set from the same module the spec uses), and the three exemptions in
fixtures-targets are keyed on real attributes that exist only on `WindowStrip` and `StatusBand`.

What is weak:

- One unit test cannot fail (CR-01).
- Several e2e specs bypass `openSection` and run assertions or axe against the Suspense fallback
  (an atlas-only, pre-hydration prerender). That is a vacuous gate for the nocturne and poster axe runs
  and for the "ignores bad query" checks.
- Several specs press a key right after a focus-moving interaction without waiting for focus.
- Several assertions pass on an empty set.
- A few fences have gaps.
- The inline-link touch-target exemption is wider than "inline footer links".

No port or config coupling was found: no spec hardcodes a port, and `routes.spec.ts` is outside this
part.

### Critical Issues

#### CR-01: "stops observing after unmount" cannot fail

**File:** `dashboard-next/tests/unit/tokens-bridge.test.ts:153-163`
**Issue:** The test unmounts the hook, mutates the surface, awaits one microtask and asserts
`result.current.version === before`.

After unmount React never renders the hook again, so `result.current` is frozen at its last
rendered value whether or not `observer.disconnect()` ran. A leaked MutationObserver would call
`setState` on an unmounted component, which is a silent no-op, and the assertion would still hold.
A single `await Promise.resolve()` is also not enough to guarantee the MutationObserver callback was
delivered. The cleanup in `useTokens` (`src/features/ui/tokens.ts:141`) is therefore unguarded.

**Fix:** Observe the observer, not the hook result.

```ts
it('disconnects its MutationObserver on unmount', async () => {
  const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
  const surface = mountSurface();
  const { result, unmount } = renderHook(() => useTokens({ current: surface as Element | null }));
  await waitFor(() => expect(result.current.tokens).not.toBeNull());
  unmount();
  expect(disconnect).toHaveBeenCalled();
  disconnect.mockRestore();
});
```

### Warnings

#### WR-01: Negative "ignores anything else" checks run against the pre-hydration Suspense fallback

**File:** `dashboard-next/tests/e2e/fixtures-route.spec.ts:64-65, 72-73, 82-89`
**Issue:** `openFixtures` waits only for `[data-surface="instrument"]`. That element also exists in
`FixturesSurfaceFallback` (`src/features/fixtures/FixturesApp.tsx:240-257`), which always renders
`data-direction="atlas"`, no `data-reduced-motion` and no inline tokens.

- `?direction=evil` -> `toHaveAttribute('data-direction','atlas')` passes on the fallback the moment it
  is first polled.
- `?reduced=yes` -> `not.toHaveAttribute('data-reduced-motion', /.*/)` passes on the fallback.
- `?tok=--dir-x:red` and `?tok=background:url(x)` read `style` once, with no wait.

If the query parser regressed (accepted `evil`, `yes` or an unsafe token), these tests still pass
whenever the assertion lands before hydration. The `?tok=--dir-x:red` and `?tok=background:url(x)`
inline-style checks are the security-relevant ones.

**Fix:** Use the `openReady` pattern that later describes in the same file already define:
`await expect(page.getByRole('radiogroup', { name: 'Direction' })).toBeVisible()` before every negative
assertion. The radiogroup exists only in the hydrated surface. Move `openReady` to the top of the file
and use it here.

#### WR-02: axe-per-direction tests in the route spec never confirm the direction was applied or the page hydrated

**File:** `dashboard-next/tests/e2e/fixtures-route.spec.ts:506-514, 735-747, 1065-1073, 1277-1288`
**Issue:** These loops do `page.goto('/dev/fixtures/<slug>/?direction=<d>')`, wait for the first
`[data-fixture-state]` to be visible and for `-loading` cells to reach count 0, then run axe. The
fallback renders the section's cells in atlas, so for nocturne and poster axe can run on the atlas
prerender. The `-loading` count is also 0 trivially before the client cells mount.

The strip-plot loop at line 1299 does check `data-direction`, which shows the author knew about this.
`fixtures-a11y.spec.ts` covers the same sections properly through `openSection`, so this is a redundant
and weaker copy that can pass vacuously.

**Fix:** Replace the four loops' setup with `openSection(page, slug, { direction })` from
`support/fixtures.ts`, or delete them in favour of fixtures-a11y. At minimum add
`await expect(page.locator(SURFACE)).toHaveAttribute('data-direction', direction)` plus the radiogroup
wait.

#### WR-03: axe runs on partly settled pages in the compare, transport and compositions specs

**File:** `dashboard-next/tests/e2e/fixtures-compare.spec.ts:316-323`, `fixtures-transport.spec.ts:323-335`, `fixtures-compositions.spec.ts:396-404`
**Issue:** These specs use their own `open()` helper, which waits only for the Direction radiogroup,
instead of `openSection`.

- compare axe waits for `[data-ready="false"]` count 0 and for the first ready well. A deck whose
  second well has not mounted yet is invisible to both checks.
- transport axe for `band-toggle` waits for nothing, so it can run while the contract-backed cell still
  shows "Loading bands...". For `window-strip` and `transport` only the `live` cell's well is awaited;
  the `energy` plot and the other cells are not.
- The compositions 390 px overflow test (`:396-404`) awaits only the nav, then polls
  `scrollWidth <= innerWidth + 1`. That is true at the first sample on a half-mounted page, so late
  wide content (plots, the nine-card grid) is never measured. It also loops four navigations under the
  default 30 s test timeout and never checks the headline its title promises.

**Fix:** Use `openSection` (it waits for manifest cells, `-loading`, `networkidle`, `aria-busy` and
`data-ready`). In the overflow test call `settled(page, slug, wells, plot)` before measuring, and add
`test.setTimeout(90_000)`.

#### WR-04: Keypress right after a focus-moving interaction, without waiting for focus

**File:**
- `fixtures-route.spec.ts:398-401` (Escape right after `expect(sheet).toBeVisible()`)
- `fixtures-route.spec.ts:363-370` (Tab sweep after the dialog is visible; focus-inside is not polled first, unlike `fixtures-keyboard.spec.ts:46`)
- `fixtures-route.spec.ts:858-862` (Control+k, `dialog` visible, then `keyboard.type('zzz')` with no `toBeFocused` on the searchbox)
- `fixtures-transport.spec.ts:211-212` (ArrowRight then Space with no focus wait; Space can land on the previous option)
- `fixtures-compositions.spec.ts:275-276` (ArrowDown then Enter; if focus has not moved, Enter reselects `ind_D1` and the poll times out)

**Issue:** This is the CI-flake pattern already seen this phase. React Aria restores or moves focus on
the next frame. Escape is heard only when focus is inside the overlay (the alertdialog test at
`fixtures-route.spec.ts:386-388` documents exactly this). Typed characters are lost if the search input
is not yet focused.

**Fix:** Insert a state wait before each press:

- Sheet and dialog: `await expect.poll(() => sheet.evaluate(n => n.contains(document.activeElement))).toBe(true)`.
- Palette: `await expect(dialog.getByRole('searchbox', { name: 'Search' })).toBeFocused()` before typing.
- Window strip: `await expect(options(live).nth(4)).toBeFocused()` between lines 211 and 212.
- Compositions: poll until the focused or selected option differs from the clicked one before pressing Enter.

#### WR-05: Three tests assert a state equal to the state before the key press, so they pass even if the key is lost

**File:**
- `fixtures-keyboard.spec.ts:274-276` (BandToggle: mid is already `aria-pressed=true` before Space)
- `fixtures-keyboard.spec.ts:232-237` (RangeSlider: after End, min equals max; Home on max asserts equal again)
- `fixtures-route.spec.ts:608-611` (`maximum` already `6000`, Home asserts `6000`)

**Issue:** The "last band cannot be turned off" and "thumbs cannot cross" invariants are asserted by a
web-first check that is already true, so it resolves before the press has any visible effect and cannot
tell "handled and refused" from "never delivered". A broken guard would still be caught only if the
state visibly changed, which is a race.

**Fix:** After the press, wait a settled frame
(`await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`)
and then assert. Better, pair it with a positive control proving the key reaches the control: for
example turn High on first, observe the change, then press Space on the last remaining band.

#### WR-06: Inline-link touch-target exemption is wider than "inline footer links"

**File:** `dashboard-next/tests/e2e/fixtures-targets.spec.ts:99-108`
**Issue:** The exemption is: any `<a>` whose parent element is a `<p>` and whose parent has at least
3 characters of its own text. That covers every fixture page, not just footers. For example
`<p>See <a>docs</a></p>` in any cell is exempt from the 44 px check. The comment says the link "must
still be a real link", but the selector is already `a[href]`, so nothing extra is checked. The strip
(`:90-97`) and segment exemptions are keyed on attributes used only by `WindowStrip` and `StatusBand`,
which is acceptable, but they also exempt any descendant of the listbox, and the dense-strip width floor
is 0.

**Fix:** Scope the link exemption to the real case, for example
`el.closest('footer p, [data-inline-links]')`. Alternatively assert the exempt set explicitly
(`expect(exemptLinks).toEqual([...])`), so a new exempt link fails the test. Likewise record how many
elements each exemption swallowed and cap them.

#### WR-07: Font-scoping checks pass on empty sets and have no positive control

**File:** `fixtures-route.spec.ts:1086-1105`, `fixtures-route.spec.ts:1079-1084`, `legacy-isolation.spec.ts:169-170`
**Issue:** `archivo.every(face => face.status === 'unloaded')` is true when no Archivo FontFace is
registered at all, which is also what happens if the font is renamed or `next/font` drops it. The
`fontRequests` array is collected but never asserted. `NEW_FONT_FAMILY` negative checks on `/about/` and
the legacy routes have no proof that `document.fonts` is populated or that the regexp can match a
registered family. A leftover `console.log('A2 ...')` sits at `:1102`.

**Fix:** Add `expect(archivo.length).toBeGreaterThan(0)` for the atlas case and
`expect(faces.length).toBeGreaterThan(0)` for the legacy routes. Assert that no font request filename
belongs to an Archivo face, or drop `fontRequests`. Remove the console.log.

#### WR-08: Other empty-set assertions

**File:** `fixtures-route.spec.ts:1187-1189`, `fixtures-route.spec.ts:701-707`, `fixtures-route.spec.ts:1034-1040`, `fixtures-route.spec.ts:969-970`
**Issue:** `.every(...)` over `[data-bar-fill]`, `td`, `dd` and `a` is true when the set is empty. The
abstain-hatching check at `:1188` is the clearest: if no `[data-bar-fill]` renders, "neutral hatched
bars" still passes (the `ring` svg assertion that follows is the only backstop).

**Fix:** Capture the nodes first and assert `length > 0` inside the same poll, for example
`nodes.length > 0 && nodes.every(...)`.

#### WR-09: Values captured once outside a poll, and one-shot layout reads

**File:**
- `fixtures-spectrogram.spec.ts:136-142` (pointer readout)
- `fixtures-spectrogram.spec.ts:150-163, 170-175, 182-187` (playhead and window layout, read once)
- `reduced-motion.spec.ts:297, 306`
- `fixtures-compositions.spec.ts:337-342`
- `fixtures-route.spec.ts:501`

**Issue:**

- The plot centre is exactly 15.0 s, but the readout regexp is `15\.\d s`. A one-pixel rounding (14.98 s -> "14.9") flakes. The bounds come from a single `boundingBox()` taken before fonts and layout settle.
- Playhead fractions are read in one `evaluate` straight after `data-ready`. The playhead transform is set by effect, so the read can precede it.
- `before = playhead.style.transform` is read once. If it is `''` before mount and `translateX(0)` after, `not.toBe(before)` passes without a tick (the readout assertion then carries the test).
- The `before` row order in the Motion spec is captured when `length > 1`, before it is known to be final.
- The `document.getAnimations().length` poll at `fixtures-compositions.spec.ts:359` and the one-shot read at `fixtures-route.spec.ts:501` can pass before an animation has started.

**Fix:** Compute and compare inside `expect.poll`. Use `1[45]\.\d` for the time readout, or hover through
`plot.hover()`. Poll the layout fractions.

#### WR-10: `fixtures.spec.ts` screenshot gate silently skips in CI if PW_VISUAL is dropped

**File:** `dashboard-next/tests/e2e/fixtures.spec.ts:392-403`
**Issue:** The fail-closed branch only runs when `PW_VISUAL === '1'`. If the workflow stops setting
`PW_VISUAL` (or the project is selected in a job that never set it), `test.skip(...)` skips all 184
shots and CI is green with zero visual verification. That is the same "silent no-op" the surrounding
comment claims to prevent. `snapshotsExist()` also passes on a single file.

**Fix:** In CI, throw instead of skip:
`if (process.env.PW_VISUAL !== '1') { if (FAIL_WITHOUT_BASELINES) throw new Error('fixtures-shots needs PW_VISUAL=1 in CI'); test.skip(true, ...); }`.
Use the fixtures-baselines name list (or `expectedBaselineFiles()`) for the existence check instead of
"directory non-empty".

#### WR-11: Screenshot tolerance is 1 percent of whole-section pixels

**File:** `dashboard-next/playwright.config.ts` (`expect.toHaveScreenshot.maxDiffPixelRatio: 0.01`), used by `fixtures.spec.ts:424-427, 446-449`
**Issue:** `fixtures.spec.ts` screenshots whole `section#<slug>` elements (up to 1440 px wide and
thousands of px tall). 1 percent of a 1440x3000 capture is about 43,000 pixels, which is a 200x200
block. A swapped status swatch, a missing mark outline or a wrong tone would sit well inside that
tolerance, which defeats the DS-08 gate for exactly the small details the system exists to protect. The
default per-pixel colour threshold (0.2) is also lenient.

**Fix:** Override in the fixtures spec, for example
`toHaveScreenshot(name, { maxDiffPixels: 50, threshold: 0.1, ... })`, or set the project-level
`expect.toHaveScreenshot` for `fixtures-shots` to a much smaller ratio (0.001).

#### WR-12: Numeral assertions use substring matching

**File:** `dashboard-next/tests/e2e/fixtures-route.spec.ts:274-277`
**Issue:** `toContainText(String(siteCount))` and `toContainText(String(countryCount))` match any text
containing the digits (a country count of "7" matches "17" or "57"; a site count of 54 matches "154").
The test claims the numerals are computed from the contract, but a wrong number can pass. It also keys
on the brittle class `p.flex`.

**Fix:** `toHaveText(new RegExp(`^${siteCount}\\s+reference sites`))` (and the same for countries), or
give the paragraphs `data-testid`s.

#### WR-13: Wide-container "no scroll region" is checked before the container has been measured

**File:** `dashboard-next/tests/e2e/fixtures-route.spec.ts:689-694`
**Issue:** The comment at `:740` says the phone cell "measures its container before the region
attributes exist", i.e. the region appears after a client measurement. `toHaveCount(0)` on the wide
cell resolves at the first poll, before that measurement, so a regression that wrongly shows a region
at 1440 px passes.

**Fix:** Wait for the measurement first, for example await that the phone cell has its region
(`phone-scroll` -> `getByRole('region')` count 1, as the axe test does at `:742`), then assert the wide
cell has none.

#### WR-14: token-bridge "never touches the network" filter exempts by substring of the whole URL

**File:** `dashboard-next/tests/e2e/token-bridge.spec.ts:362-365`
**Issue:** `external.filter(url => !/contract|execute-api|amazonaws|cloudfront/.test(url))` tests the
full URL, not the hostname. A tile, glyph or sprite request to any host whose URL merely contains
"contract" (path or query) or "cloudfront"/"amazonaws" passes. That is the exact claim being proven.
(Related, `requireWebGL2` treats any truthy `process.env.CI` as CI, so `CI=false` counts as CI; the
other gate in `fixtures.spec.ts` uses `'true' || '1'`.)

**Fix:** Compare `new URL(url).hostname` to an explicit allowlist (the contract CDN host and the API
host, which `mock-api.ts` already knows), and fail on anything else, or on any request whose
`resourceType()` is `font`, `image` or `fetch` to a non-localhost origin.

#### WR-15: Semantic-token scanner has gaps and skips missing files silently

**File:** `dashboard-next/tests/unit/semantic-tokens.test.ts:52-56, 148-158, 173`
**Issue:** The hex rule is `#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])`. A 4-digit (`#rgba`) or 8-digit
(`#rrggbbaa`) hex fails both alternatives (the lookahead sees another hex digit) and is never reported.
`lab()`, `lch()` and `color()` are missing from the colour-function rule, and named colours are not
covered. `SCAN_DIRS`/`SCAN_FILES` are filtered by `existsSync`, so renaming a scanned file (for example
`StripPlot.tsx`) drops it from the gate without any failure. The only guard is `files.length > 0`.
A same-line `//` inside a string literal blanks the rest of the line, which can hide a violation.

**Fix:** Use `{8}|{6}|{4}|{3}` with `(?![\w-])`, add `lab|lch|color` to the function rule, and assert that
each entry of `SCAN_DIRS` and `SCAN_FILES` exists. Also add a planted-violation case for an 8-digit hex.

#### WR-16: API fetch fence ignores `window.fetch(` / `globalThis.fetch(` and enshrines that in a test

**File:** `dashboard-next/tests/unit/api-client.test.ts:115, 180-186`
**Issue:** `FETCH_CALL = /(?<![\w.$])fetch\s*\(/` excludes any `.fetch(`, and the test
'does not flag ... method-style .fetch( calls' codifies it. `window.fetch(url)`, `globalThis.fetch(url)`
and `self.fetch(url)` therefore bypass the "every fetch( call site is on the allowlist" fence (T-03-01-01).

**Fix:** Exclude only non-global receivers, for example
`/(?<![\w$])(?:(?:window|globalThis|self)\.)?fetch\s*\(/`, and add a planted `window.fetch(` case.

#### WR-17: Missing `test.setTimeout` on heavy, multi-navigation tests

**File:** `fixtures-route.spec.ts:1297-1304` (three `{ timeout: 30_000 }` waits inside a default 30 s test), `fixtures-compare.spec.ts:314-325`, `fixtures-transport.spec.ts:323-335`, `fixtures-compositions.spec.ts:377-406`
**Issue:** The strip-plot setup allows 30 s per cell, but the default test timeout is also 30 s, so the
inner timeouts can never be reached. The axe loops over nine-well pages and the four-navigation overflow
test run at the default timeout, while `fixtures-a11y.spec.ts` sets 90 s for the same pages. These are CI
timing flakes waiting to happen.

**Fix:** Add `test.setTimeout(90_000)` to those tests, as the other specs do.

### Info

#### IN-01: Fixed sleeps in negative "nothing plays by itself" and frame-loop checks
**File:** `fixtures-compare.spec.ts:63, 279`; `fixtures-transport.spec.ts:48`; `reduced-motion.spec.ts:266-268, 304`; `fixtures-route.spec.ts:905`; `tooltip.test.tsx:88` (a real 650 ms sleep to let React Aria's tooltip cooldown expire)
A dwell is the only way to prove a negative, so these are acceptable. Note that `reduced-motion.spec.ts:304-305` asserts zero rAF calls before confirming the tick advanced; swap the order (poll for the readout to advance, then assert zero frames). `fixtures-route.spec.ts:902-908` presses ArrowDown inside an `expect.poll` with a 50 ms sleep, so a delayed first press plus a retry can advance two rows.

#### IN-02: Brittle class-name selectors
**File:** `fixtures-keyboard.spec.ts:394` (`span[class*="border-[3px]"]`), `fixtures-compare.spec.ts:271` (`p.text-muted`), `fixtures-route.spec.ts:274` (`p.flex`, `xpath ... size-5`)
These couple the browser gates to Tailwind class names. Prefer `data-*` hooks the components already expose.

#### IN-03: Misleading comment and unasserted claim in the Inspector spec
**File:** `fixtures-compositions.spec.ts:113-114`
The comment says the reading's bars are "integers that the bar itself says sum to 100", but the assertion that follows checks the absence of "Test fixture, not a real analysis." and nothing about the integers. The sum-to-100 check lives in `fixtures-route.spec.ts:1164-1169`.

#### IN-04: `stack-consolidation` legacy-dir matcher misses relative paths
**File:** `dashboard-next/tests/unit/stack-consolidation.test.ts:45`
The lookbehind `(?<![\w\-./])` excludes `.` and `/`, so `./dashboard/...` and `../dashboard/...` in `ci.yml` or `pytest.ini` are not reported. Extend the matcher to cover those forms or add a planted case.

#### IN-05: Small test-hygiene leaks and weak coverage
**File:** `state-primitives.test.tsx:124,142` (the `navigator.clipboard` defineProperty is never restored); `provenance.test.tsx:344-360` (the matchMedia stub returns `matches: false` for every query, so the "bottom sheet below 640 px" case does not prove that a wide viewport opens a popover).
Restore the clipboard property in `afterEach`, and add the opposing (desktop) assertion.

#### IN-06: Loose cross-file regexes in tokens.test.ts
**File:** `dashboard-next/tests/unit/tokens.test.ts:322, 380-381`
`[\s\S]*?transition: none` and the view-transition patterns can match text from an unrelated rule later in the file. Anchor them within the matching rule's declaration list (use the parsed postcss rule, as the rest of the file does).

#### IN-07: Dead or leftover code
**File:** `fixtures-route.spec.ts:1099-1102` (console.log plus an attachment used for a research note); `stack-consolidation.test.ts:125-126` ("(none yet)" placeholder branch); `legacy-baselines.test.ts:66` (an exported constant in a test file).
Remove or trim.

#### IN-08: Guards check names, not content
**File:** `dashboard-next/tests/unit/fixtures-baselines.test.ts:39-45`
The guard is names-only by design (LFS pointers), which is sound for the set. It would also be cheap to assert that every file is non-empty and starts with either the PNG magic or the `version https://git-lfs.github.com/spec/v1` pointer header, so a zero-byte or corrupt baseline fails in the unit job rather than only in the Docker visual job.

---

### Items checked and found sound

- `legacy-baselines.test.ts`: exact 33 names plus sha256 of each file. Verified `about-1024` and `sites-390` hashes match `git show 00828f3:...`. The legacy snapshots are plain git (not LFS) per `.gitattributes`, so a pointer-file checkout cannot break it.
- `fixtures-baselines.test.ts` plus `support/fixture-shots.ts`: spec and guard share one name generator, and the e2e project regexp (`(^|[\\/])fixtures\.spec\.ts$`) is guarded by `fixtures-shots-config.test.ts`.
- `fixtures-targets.spec.ts`: the three named exemptions are real attributes (`data-dense` on `WindowStrip.tsx:376`, `data-segment` on `StatusBand.tsx:129,144`). The 44 px check probes `elementFromPoint` at the expansion's extremes, and the `checked > 0` guard prevents an empty sweep. Aside from WR-06, no wider exemption exists.
- `fixtures-state-manifest.spec.ts`: the independent `EMPTY_LOADING_ERROR` list means shrinking the manifest cannot quietly drop a state.
- `reduced-motion.spec.ts`, `legacy-isolation.spec.ts`, `reduced-motion` probe-is-live tests: positive controls exist (the legacy 0.15 s rule, transitions with motion allowed, the rAF counter while playing).
- Fake-timer usage in `tooltip.test.tsx`, `playhead-clock.test.ts`, `state-primitives.test.tsx`: restored in `afterEach`. RTL cleanup is registered in `vitest.setup.ts`. `data-table`, `spectrogram`, `compare-deck`, `window-strip`, `clip-spectrogram`, `audio-engine` and `reduced-motion-hook` restore their globals and prototype patches.
- No spec hardcodes a port or base URL. `.skip` / `.fixme` appear only in the guarded CI-aware forms (`fixtures.spec.ts`, `token-bridge.spec.ts`) outside this part's scope (`maps.spec.ts`, `contract-cdn-cors-live.spec.ts`).

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick (targeted deep reads of flagged patterns)_
