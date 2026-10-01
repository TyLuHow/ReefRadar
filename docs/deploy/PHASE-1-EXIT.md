# Phase 1 exit evidence: Truth & Reproducibility

Recorded 2026-10-01 by plan 01-20 on branch `redesign/v2-discovery`. Evidence only: public URLs, command lines,
exit codes and ids. No tokens, presigned URLs, account keys or env values appear here.

## Success criterion 1: fresh clone builds; CI runs every suite; baselines stored

| Evidence | Result |
|---|---|
| CI jobs on every push: web (lint, typecheck, unit, build), e2e (routes + axe), python (pytest), citations, visual | all success |
| New in 01-20: banned-claims gate (`dashboard-next/tests/unit/copy-claims.test.ts`, runs inside the web job's `npm test`) | pass |
| New in 01-20: citations `--scope all`, `build_audio_consumers.py --check`, `build_api_fixtures.py --check`, `validate_audio_manifest.py` | wired into CI, pass |
| CI run for the banned-claims commit (f9dde79) | https://github.com/TyLuHow/ReefRadar/actions/runs/36892851866 (success, all jobs) |
| Pre-truth baselines (screenshots, axe, routes) | `dashboard-next/tests/baseline/pre-truth/` |
| Bundle-size baseline | `dashboard-next/tests/baseline/bundle-sizes.json` |
| Phase 1 exit pixel baselines (Linux, Docker-pinned) | see "Phase 1 exit baseline" in `dashboard-next/tests/baseline/README.md` |

Stragglers found by the new banned-claims gate and fixed in place (the gate was red on first run): "AI-powered" health
analysis copy in `src/app/about/page.tsx` (2 places), `src/app/layout.tsx` (metadata, 2 places) and
`src/app/dashboard/analyze/page.tsx` (hero copy); "Real-time processing" quick-fact in
`src/app/dashboard/analyze/page.tsx`; a "Snapping Shrimp" band comment in `src/components/experience/useDemoAudio.ts`;
hard-coded "5 countries" in a `src/components/maps/WorldMap.tsx` comment and "54 sites across 7 countries" in a
`src/types/index.ts` comment.

## Success criterion 2: deployed Lambdas are built from git; drift check green

Command: `py -3.12 scripts/drift-check.py --function all --json`, exit code 0.

| Function | missing | extra | changed |
|---|---|---|---|
| router | none | none | none |
| preprocessor | none | none | none |
| classifier | none | none | none |
| inference (container image) | none | none | none |

Production deploy that produced this state: `docs/deploy/DEPLOY-LOG.md` (attempt 2, commit 1433f08). `/samples` is part
of the router package built from `lambdas/router/handler.py`.

## Success criterion 3: every playable clip is real and cited

| Command | Exit code | Result |
|---|---|---|
| `py -3.12 scripts/check_audio_real.py dashboard-next/public/audio` | 0 | 9 committed WAVs, all 16 kHz, none flagged |
| `py -3.12 scripts/check_audio_real.py --from-live-samples` | 0 | the 9 clips the live `/samples` API serves, none flagged |
| `py -3.12 scripts/verify_live_truth.py` | 0 | `/samples` ids and audio hashes equal `data/audio-manifest.json`; no `phl_D1` |

`check_audio_real.py` previously scanned only the top level of a directory, so `dashboard-next/public/audio` (clips live
in `marrs/`) reported "no WAV files" and exited 2. Directory scanning is now recursive so one command covers every
file the frontend can serve (plan deviation, Rule 1).

## Success criterion 4: classifier version, classes and training data recorded; probabilities are unmodified

Command: `py -3.12 scripts/verify_live_truth.py`, exit code 0, 5 PASS lines, 0 failures. Two real analyses ran
(one at a time, per the Lambda concurrency limit):

| Analysis | id | label | model_version | probability sum | region |
|---|---|---|---|---|---|
| with coordinates | `d855cdd2-a2dc-4731-a1e0-a0784bdcc643` | degraded | interim-real-only | 1.0 | INDONESIA, specific, in training region, 4 training sites |
| without coordinates | `cfcd8093-90b5-499f-a606-79658973faad` | degraded | interim-real-only | 1.0 | UNKNOWN, not in training region |

Model record: `docs/model/DEPLOYED-MODEL-AUDIT.md` and `docs/model/deployed-model.lock.json` (interim 3-class real-only
model; `restored_mid` dropped because it had zero real training rows).

## Success criterion 5: no unmeasured claims; citations consistent; labels show who assigned them

| Evidence | Result |
|---|---|
| Banned-claims gate over all UI source, UI data and served manifests | pass (5 tests), runs in CI on every push |
| `node scripts/check-citations.mjs --scope all` | OK, 310 files scanned, no banned-pattern hits |
| Vercel preview | https://dashboard-next-kykdxk6t6-tyluhows-projects.vercel.app (preview target, Ready) |
| Preview `/about/` served HTML contains the canonical MARRS DOI 10.5522/04/29958062 | confirmed via `vercel curl` (HTTP 200) |
| Preview landing JS chunks contain "assigned by MARRS" | confirmed via `vercel curl` |
| `tests/e2e/preview-truth-live.spec.ts` (landing card shows "assigned by MARRS" and play fetches its audio with 200/206; about shows the DOI; sites shows a Bora-Bora card as Unknown with its original label) | 3 of 3 pass against a production build (`next build` + `next start`) of this commit, live API |

Preview limitation: the Vercel project has Deployment Protection enabled, so an unauthenticated browser (and therefore
Playwright) is redirected to Vercel SSO. The preview was verified over HTTP with `vercel curl` (which bypasses protection
for the CLI user). To run the spec against the preview itself the owner supplies the project's "Protection Bypass for
Automation" secret as `PW_VERCEL_BYPASS_SECRET`; the spec sends it as `x-vercel-protection-bypass` (nothing is committed).

## Production safety (T-01-20-01)

No `vercel deploy --prod`, `vercel promote` or merge to main was run. `vercel ls dashboard-next --prod` lists the same
production deployments before and after this plan (newest `https://dashboard-next-o9uemhjm4-tyluhows-projects.vercel.app`,
age 175 days at the start).

## Residual known issues

- AWS Lambda concurrency limit is 10; the Service Quotas increase to 1000 is pending (request
  `4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5`). Verification was run serially; the inference container may need warming
  before bursts.
- `similar_sites_count` is 0 in both live analyses: the deployed similarity step returns no reference matches. It is
  honest (no fabricated neighbours) but unfinished; all-site similarity is Phase 5.
- Production frontend is still the legacy, pre-truth UI until this branch is merged (owner decision); the preview shows
  the post-truth UI.
- Playwright against the protected preview needs the owner's bypass secret (see above).
- `restored_mid` is not served until real data exists (Phase 12 retrain).
