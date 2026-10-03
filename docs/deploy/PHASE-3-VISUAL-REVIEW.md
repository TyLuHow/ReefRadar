# Phase 3 visual baseline review

- Before: b780b15c8d32da2f9e2d2a0047ebdd04904b5e61 (committed Linux baselines read with git show)
- After: dashboard-next/tests/e2e/visual.spec.ts-snapshots (current)
- Generated: 2026-10-03
- CI run: https://github.com/TyLuHow/ReefRadar/actions/runs/37148763051

33 states and widths compared by sha256; 1 not identical.
Decision values: pending, accepted, rejected (identical rows need none).

| State | Width | Status | Cause | Owner decision |
|---|---|---|---|---|
| about | 1440 | identical | - | n/a |
| about | 1024 | identical | - | n/a |
| about | 390 | identical | - | n/a |
| analyze | 1440 | identical | - | n/a |
| analyze | 1024 | identical | - | n/a |
| analyze | 390 | identical | - | n/a |
| compare | 1440 | identical | - | n/a |
| compare | 1024 | identical | - | n/a |
| compare | 390 | identical | - | n/a |
| dashboard | 1440 | identical | - | n/a |
| dashboard | 1024 | identical | - | n/a |
| dashboard | 390 | identical | - | n/a |
| experience | 1440 | identical | - | n/a |
| experience | 1024 | identical | - | n/a |
| experience | 390 | identical | - | n/a |
| experience-compare | 1440 | identical | - | n/a |
| experience-compare | 1024 | identical | - | n/a |
| experience-compare | 390 | changed | The crossfader is now a static ochre thumb on a plain grey track instead of a glowing green thumb on a gradient track, and the sentence 'The moving background is decorative, not a spectrogram or a visualisation of these bands.' is gone from the help text because the moving background was removed (page is 60 px shorter). | accepted |
| experience-demo | 1440 | identical | - | n/a |
| experience-demo | 1024 | identical | - | n/a |
| experience-demo | 390 | identical | - | n/a |
| experience-sample | 1440 | identical | - | n/a |
| experience-sample | 1024 | identical | - | n/a |
| experience-sample | 390 | identical | - | n/a |
| landing | 1440 | identical | - | n/a |
| landing | 1024 | identical | - | n/a |
| landing | 390 | identical | - | n/a |
| map | 1440 | identical | - | n/a |
| map | 1024 | identical | - | n/a |
| map | 390 | identical | - | n/a |
| sites | 1440 | identical | - | n/a |
| sites | 1024 | identical | - | n/a |
| sites | 390 | identical | - | n/a |

## Map and canvas changes

Review-only captures at 1440 px with canvases and maps visible (tiles mocked with a transparent PNG). The gating baselines hide canvases and maps, so these are what show the map port and the vitality removal.

| Capture | Before | After | Owner decision |
|---|---|---|---|
| analyze | leaflet, WebGL2 | maplibre, WebGL2 | accepted |
| experience | no map, WebGL2 | no map, WebGL2 | accepted |
| experience-compare | no map, WebGL2 | no map, WebGL2 | accepted |
| landing | no map, WebGL2 | no map, WebGL2 | accepted |
| map | maplibre, WebGL2 | maplibre, WebGL2 | accepted |
| sites | leaflet, WebGL2 | maplibre, WebGL2 | accepted |

## Owner sign-off

Accepted by the owner on 2026-10-03: "accepted" for every item. That covers the 1 changed baseline (experience-compare at 390) and all 6 unhidden before/after captures (analyze, experience, experience-compare, landing, map, sites). The review page was published to the owner for this decision. The owner was told in the review notes that the legend has no Unknown row, that the legend partly covers one marker and sits just above the attribution pill on /sites, that the dark map keeps its CARTO style, and that dense markers are not clustered; these are carried to later phases in PHASE-3-EXIT.md.
