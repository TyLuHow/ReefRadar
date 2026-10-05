# Phase 4 visual review

Owner review of the design system on real components (plan 04-24, DS-08). Every section of the `/dev/fixtures` route is under screenshot regression; this page records what is being reviewed, how the baselines were produced, the checks that need a person, and the owner decision.

## What you are reviewing

Three directions, each one token block over the same primitives. All three pass the same contrast, status-palette and axe gates and share the status shapes, so choosing between them is a taste decision, not an accessibility one.

| Direction | Character | Captured |
|---|---|---|
| Atlas | The default and the owner's original pick. Light, editorial, indigo accent. | Every section at 1440, 1024, 768 and 390 px |
| Nocturne | Dark-first; the spectrogram is the page. Own dark-ground status palette. | Representative set at 1440 and 390 px |
| Poster | Colour-blocked and loud; up to three block surfaces per screen. | Representative set at 1440 and 390 px |

Where to look:

- Browsable page of every baseline, grouped by direction and section: [phase-4-fixtures-review/index.html](phase-4-fixtures-review/index.html). Open it from a checkout (the images are linked by relative path to the committed baselines, which are stored in Git LFS, so run `git lfs pull` first or the images will be pointer text). It is regenerated with `node scripts/build-fixtures-review.mjs`.
- Live components: `NEXT_PUBLIC_DEV_FIXTURES=1 npm run dev` in `dashboard-next`, then open `/dev/fixtures/?direction=atlas`, `?direction=nocturne` or `?direction=poster`.

The token probe map (WebGL) is masked in the screenshots because its GPU raster is not reproducible; its swatches and table beside it are captured. Judge the map by eye in the live route.

## Status palette

The final status values are darker than the mockup. A status mark has to reach 3:1 against white and against the panel colour, and the mockup's two mid tones do not (restored_early 2.18:1, restored_mid 2.55:1). All five tones moved together, because darkening only the two mid tones left restored_early and restored_mid within 8 CIEDE2000 under deuteranopia. Colour is never the only cue: every mark also has a shape and a text label.

Light-ground palette (Atlas and Poster). Contrast is the ratio of the mark against white, from the status-palette gate.

| Status | Shape | Final | vs white | Mockup | Mockup vs white |
|---|---|---|---|---|---|
| degraded | down triangle | `#914615` | 6.79 | `#B4520F` | 5.05 |
| restored_early | diamond | `#B47F24` | 3.50 | `#E0A458` | 2.18 (fails) |
| restored_mid | square | `#1D77AD` | 4.89 | `#6FA8D6` | 2.55 (fails) |
| healthy | filled circle | `#124068` | 10.72 | `#1F5A99` | 7.05 |
| unknown | hollow ring | `#85888D` | 3.56 | `#7C828C` | 3.87 |

Nocturne ships its own five tones, because the light palette fails on dark panels (healthy is 1.69:1 on `#12161E`). Contrast against the Nocturne panel `#12161E`.

| Status | Nocturne hex | vs `#12161E` |
|---|---|---|
| degraded | `#D77540` | 5.61 |
| restored_early | `#FAC06D` | 11.06 |
| restored_mid | `#2C95CA` | 5.40 |
| healthy | `#95DAF7` | 11.77 |
| unknown | `#A1A5AC` | 7.33 |

Minimum pairwise CIEDE2000 across the five tones is 17.5 (light palette, worst case under deuteranopia) and 15.5 (Nocturne, worst case under deuteranopia); the gate requires at least 15. Margins are small by design; see the status-palette gate test for the live numbers.

## Accent rule

The accent colour stays out of data areas. It is reserved for the current navigation item, text links (underlined), the focus ring, the single accent block per screen (three block surfaces in Poster), and one data-adjacent use: the 3 px selection ring around the selected site on the Explore scatter. It is never a status mark colour, a bar fill or a hover fill, and status colours are never used as accent, text, links or borders. The accent sits in the blue family next to healthy and restored_mid, which is why the rule forbids accent on marks.

## Baselines

- Dispatch: GitHub Actions run 37294867133 (`workflow_dispatch`, `update_snapshots=true`, on commit cf80002). Only the `fixtures-snapshots` artifact was taken; nothing from `visual-snapshots`.
- Files: 184, all named `*-fixtures-shots-linux.png`. That is 4 atlas widths for every registered section plus the representative set for Nocturne and Poster at two widths. `tests/unit/fixtures-baselines.test.ts` asserts this exact set by name.
- Storage: the owner chose to keep the baselines out of plain git history, so they are in Git LFS. `.gitattributes` tracks only `dashboard-next/tests/e2e/fixtures.spec.ts-snapshots/*.png`. The CI `visual` job installs git and git-lfs in its container, lists the LFS objects, caches `.git/lfs` and runs `git lfs pull` before the screenshot run.
- Compression: the orchestrator recompressed the PNGs losslessly before committing, 75.6 MB down to 73.1 MB. The decoded RGBA of every file was verified identical to the artifact. The pixels CI compares against are exactly what the dispatch produced.
- Commits: `f582e54` (LFS tracking and the CI cache and pull steps) and `0adef04` (the 184 PNGs, as LFS pointers, and nothing else).
- Push CI on `0adef04` (run 37296999686) is green on every job. The `visual` job ran 217 tests, all passed: the 33 legacy tests plus the 184 fixtures tests, the fixtures ones compared against the LFS baselines.
- The 33 legacy Linux baselines in `visual.spec.ts-snapshots` are untouched; `legacy-baselines.test.ts` passes.
- The gate now fails closed: in CI, `fixtures.spec.ts` throws when the baseline directory is missing or empty, instead of skipping. Locally it still skips.

## Manual checks

These cannot be asserted by a headless browser. Result is left open until the owner or a device run fills it in.

| Check | Result | Notes |
|---|---|---|
| Play, pause, step and crossfade by ear on a real device | pending | Web Audio output cannot be asserted in CI. Also try level match and band selection; band selection does not filter any audio yet |
| Token probe map by eye, in each direction | pending | WebGL, masked in the screenshots; compare the map swatches to the table beside it in Atlas, Nocturne and Poster |
| Playhead frame pacing on a tablet | pending | Runs on `requestAnimationFrame` on the main thread; look for stutter while a spectrogram is playing |
| Darker status palette against the mockup | pending | Judge on the palette tables above and the `status-palette` section in each direction; the final values are darker because 3:1 on white forces it |
| Safari (16.4 or later) | pending | The Tailwind v4 baseline; check the three directions and the transport on desktop and iPhone/iPad Safari |

## Open questions for the owner

Items raised by earlier plans, listed here so everything is decided in one place.

### Touch targets (from 04-22)

The touch-target gate passes with three exemptions. Decide whether each is acceptable or needs a change.

- WindowStrip cells are 39 px wide on a 390 px phone, and 13 px in the dense strip. Both are under the 44 px target.
- StatusBand segments are sized by count, so the 6-site segment is 34 px wide.
- Inline footer links rely on the WCAG 2.5.8 inline exception (a target inside a sentence is exempt).

### Visual concerns (from 04-21)

- Explore scatter labels overlap in the US, French Polynesia and Mexico cluster, and are cramped at 390 px.
- Poster type is heavy at phone width: the Listen headline runs five lines.
- The Listen grid has an empty cell: 8 cards in 3 columns.
- Nav links wrap at 390 px, and Compare is long on a phone.

### Accent changes (from 04-04)

- Nocturne accent and focus went from `#a5b4fc` to `#96a9ff`. That clears the separation floor by only 0.55; `#89acff` gives more headroom.
- Poster accent went from `#c2005f` to `#bd0047`.

### Needs a device (from 04-15 and 04-16)

- Listening on a real device: play, pause, step, crossfade, level match and band selection (which filters no audio yet).
- Safari.

## Owner decision


**2026-10-05: `keep-atlas`.** Atlas stays the working default for the Phase 6 screens. Nocturne and Poster remain available as token sets and are shown beside the default at later UI gates.

- Status palette: no change requested. The darker values above are not formally signed off.
- Accent changes (04-04): no change requested. Nocturne #96a9ff and Poster #bd0047 stay as they are.
- Open questions (touch targets, visual concerns): no decision given. They stay open and carry into Phase 6 for decision when the real screens are built.
- Manual checks: none reported. All rows in the table above remain pending.
