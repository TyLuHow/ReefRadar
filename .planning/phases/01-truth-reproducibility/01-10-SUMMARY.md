---
phase: 01-truth-reproducibility
plan: 10
subsystem: ml
tags: [classifier, s3, boto3, numpy, audit, training-data, sha256, tdd]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: "Read-only AWS access check for profile reefradar (01-09 Task 1)"
provides:
  - "scripts/audit_deployed_model.py: re-runnable audit (local fixtures or live S3) of the deployed classifier's identity and training-data composition"
  - "docs/model/deployed-model.lock.json: machine-readable identity, per-class real/synthetic row counts, interim decision, training_sites"
  - "docs/model/DEPLOYED-MODEL-AUDIT.md: human-readable audit with 10-item evidence trail"
  - "Confirmed: deployed v2.0 model's restored_mid class has zero real training rows anywhere in S3; interim_required=true, interim_num_classes=3"
  - "5 real training sites (4 Indonesia, 1 Kenya) with country/lat/lon for the region-coverage fix"
affects: [01-11, 01-13, 01-14, 01-15, 01-19]

# Actuals (#2632)
actuals:
  tokens: 11858
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Audit script separates pure functions (sha256, synthetic-row detection, aggregation, decision logic) from I/O (local-dir vs S3 download), tested entirely against in-memory fixtures with zero network calls in the test suite"
    - "A row is synthetic when file_id contains \"_synthetic_\", or (no file_id at all AND site_id/label matches the synthetic generator's hardcoded targets) -- a real file_id on a generator-target site overrides the heuristic"
    - "Weights loaded with allow_pickle=False and hashed from raw bytes before np.load parses them (T-01-10-01)"

key-files:
  created:
    - scripts/audit_deployed_model.py
    - scripts/tests/test_audit_deployed_model.py
    - docs/model/deployed-model.lock.json
    - docs/model/DEPLOYED-MODEL-AUDIT.md
  modified: []

key-decisions:
  - "Local mode mirrors the S3 key layout (DIR/models/*, DIR/training/*.json) so the same core audit function runs identically against fixtures and the live bucket -- no mode-specific audit logic to drift apart"
  - "classes_without_real_rows (and therefore interim_required) is computed the same way whether a class's rows are simply absent from every S3 training file or explicitly marked synthetic -- both mean zero verifiable real rows, matching the plan's instruction to treat a 4-class config with no backing training file as inconclusive-therefore-interim-required, with no special-case branch needed"

requirements-completed: [TRUTH-05]

coverage:
  - id: D1
    description: "The deployed classifier's exact artifacts are identified by sha256, with version, classes and architecture read from the artifacts themselves"
    requirement: TRUTH-05
    verification:
      - kind: unit
        ref: "scripts/tests/test_audit_deployed_model.py::TestArtifactSummary::test_reads_identity_from_artifacts"
        status: pass
      - kind: other
        ref: "py -3.12 scripts/audit_deployed_model.py --s3 (live run, exit 0) -- docs/model/deployed-model.lock.json artifacts.{config_sha256,weights_sha256,version,num_classes,weight_shapes}"
        status: pass
    human_judgment: false
  - id: D2
    description: "The training data behind the deployed model is accounted for by class, site, country and real-vs-synthetic origin, with evidence"
    requirement: TRUTH-05
    verification:
      - kind: unit
        ref: "scripts/tests/test_audit_deployed_model.py::TestAnalyzeTrainingData::test_counts_rows_by_label_and_site"
        status: pass
      - kind: other
        ref: "docs/model/deployed-model.lock.json training_files (3 S3 training/*.json files parsed; restored_mid 0 rows in all of them) and docs/model/DEPLOYED-MODEL-AUDIT.md sections 2-3"
        status: pass
    human_judgment: false
  - id: D3
    description: "A machine-readable decision record states whether any served class was trained on synthetic audio, whether an interim real-only model is required, and how many classes it would have"
    requirement: TRUTH-05
    verification:
      - kind: unit
        ref: "scripts/tests/test_audit_deployed_model.py::TestDecision (3 tests: detected+interim, no-missing-classes, no-training-files-at-all)"
        status: pass
      - kind: other
        ref: "py -3.12 -c \"import json;d=json.load(open('docs/model/deployed-model.lock.json'));assert 'interim_required' in d\" (exit 0); interim_required=true, interim_num_classes=3, matches DEPLOYED-MODEL-AUDIT.md conclusion"
        status: pass
    human_judgment: false
  - id: D4
    description: "The real training sites (ids, countries, coordinates) are recorded for the region-coverage fix"
    requirement: TRUTH-05
    verification:
      - kind: unit
        ref: "scripts/tests/test_audit_deployed_model.py::TestTrainingSites::test_lists_real_sites_with_country_and_coordinates"
        status: pass
      - kind: other
        ref: "py -3.12 -c \"...assert all(s['country'] and s['latitude'] is not None for s in d['training_sites'])\" (exit 0) -- 5 sites: ind_D2, ind_D3, ind_H4, ind_N1, ken_H1"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 10: Deployed Model Audit Summary

**Audited the live reefradar-2477-classifier via S3 and confirmed the deployed v2.0 4-class model's `restored_mid` class has zero real training rows anywhere in S3 (the 40 synthetic-sine rows were never uploaded, only the weights/config were) — an interim 3-class real-only model is required before any truth fix ships.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-10-01T08:16:45Z (approx, STATE.md session start)
- **Completed:** 2026-10-01T08:30:00Z (approx)
- **Tasks:** 2/2
- **Files modified:** 4 (`scripts/audit_deployed_model.py`, `scripts/tests/test_audit_deployed_model.py`, `docs/model/deployed-model.lock.json`, `docs/model/DEPLOYED-MODEL-AUDIT.md` — all new)

## Accomplishments
- Built `scripts/audit_deployed_model.py` with pure, independently-tested functions (synthetic-row detection, per-file/aggregated real-vs-synthetic counting, artifact identity from sha256 + weight shapes, interim decision logic, training-site lookup) plus `--local DIR` and `--s3` entry points
- 13 RED tests written first (ImportError confirmed), then made GREEN — full repo suite (`lambdas scripts/tests`) stayed green at 100 passed
- Ran the real audit against `reefradar-2477-embeddings` (profile `reefradar`, read-only): downloaded `models/model_config.json`, `models/reef_classifier_weights.npz`, and all 3 `training/*.json` keys into the repo's already-gitignored `models/` and `data/training/` directories
- **Confirmed the audit's own hypothesis directly from artifacts:** deployed model is v2.0, 4-class (`degraded, healthy, restored_early, restored_mid`), `claimed_training_samples=140`, `claimed_test_accuracy≈90.48%` — but none of the 3 S3 training files contain a single `restored_mid` row, real or synthetic. `training_with_restored_mid.json` (the file that would contain the 40 synthetic rows) was never uploaded per `add_restored_mid_and_retrain.py:348-366`.
- Wrote `docs/model/deployed-model.lock.json` (machine-readable) and `docs/model/DEPLOYED-MODEL-AUDIT.md` (10-item evidence trail, conclusion, re-run instructions)
- Secret-scanned the lock file and confirmed no downloaded artifact (`.npz`, `data/training/*`) was accidentally staged

## Task Commits

1. **Task 1a (tracer, TDD RED): failing tests for the audit** — `4fa019f` (test)
2. **Task 1b (tracer, TDD GREEN): implement audit_deployed_model.py** — `726b937` (feat)
3. **Task 1c (tracer): run `--s3` against the live bucket, commit deployed-model.lock.json** — `e146c2f` (feat)
4. **Task 2: write DEPLOYED-MODEL-AUDIT.md** — `f52949c` (docs)

Tracer feedback gate: ran the full verify chain (`pytest -x && audit_deployed_model.py --s3 && interim_required/weights_sha256/training_sites assertion`) immediately after committing Task 1's S3 run (autonomous run, `_auto_chain_active: true`) — all green, so Task 2 proceeded without a checkpoint.

**Plan metadata:** this commit.

## Files Created/Modified
- `scripts/audit_deployed_model.py` (new) — audit core (sha256, synthetic-row detection, aggregation, decision, training-site lookup) + `run_local_audit()` / `run_s3_audit()` + CLI
- `scripts/tests/test_audit_deployed_model.py` (new) — 13 tests against in-memory/tmp_path fixtures, no network calls
- `docs/model/deployed-model.lock.json` (new) — this run's output: artifacts, training_files, classes_without_real_rows, interim_required/interim_num_classes/interim_classes, training_sites, evidence
- `docs/model/DEPLOYED-MODEL-AUDIT.md` (new) — human-readable identity, S3 training-data table, 10-item evidence trail, conclusion, training sites, accuracy-meaning section, re-run instructions

## Decisions Made
- Local mode (`--local DIR`) mirrors the S3 key layout (`DIR/models/*`, `DIR/training/*.json`) so one `run_audit()` core function handles both modes identically — no divergent logic to keep in sync.
- `classes_without_real_rows` (and thus `interim_required`) falls out of the single rule "zero real rows across every available training file" with no special case for "no training file exists for this class at all" — that's exactly the real situation found (`restored_mid` has zero rows in any of the 3 S3 files), so the plan's "if evidence is inconclusive... set interim_required true" guidance is satisfied by the normal code path, not a branch.
- A real `file_id` (no `_synthetic_` marker) on a generator-target site/label pair (`ind_R1`/`ind_R2` + `restored_mid`) is treated as real evidence, overriding the site/label heuristic — in practice this case did not occur in the live data (no `restored_mid` rows exist in S3 at all), but it keeps the detector from false-flagging a hypothetical future real recording from those sites.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reverted TRUTH-05 to Pending in REQUIREMENTS.md after `requirements mark-complete`**
- **Found during:** State-update step
- **Issue:** `requirements mark-complete TRUTH-05` (run per this plan's own `requirements:` frontmatter) checked TRUTH-05 off and set it "Complete" in the traceability table. TRUTH-05's full text is "...version, classes and training data are verified and recorded; **any class trained on synthetic audio is removed from the live model until retrained on real data**." This plan only does the first half (verify + record); plans 01-13 (interim retrain) and 01-14 (deploy, removing the synthetic-trained class from the live model) also declare `requirements: [TRUTH-05]` and complete the second half. Leaving TRUTH-05 checked now would have falsely reported the live model as fixed while it still serves the synthetic-trained `restored_mid` class.
- **Fix:** Manually reverted the checkbox (`- [x]` → `- [ ]`) and traceability table row (`Complete` → `Pending`) for TRUTH-05 in `.planning/REQUIREMENTS.md`. It will be correctly marked complete once 01-13/01-14 land.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Verification:** `grep -n "TRUTH-05" .planning/REQUIREMENTS.md` shows `[ ]` and `Pending`
- **Committed in:** this plan-metadata commit

---

**Total deviations:** 1 auto-fixed (1 bug/correctness — requirement-tracking accuracy)
**Impact on plan:** No change to code or audit output; corrects project-tracking state only. No scope creep.

## Issues Encountered
None.

## User Setup Required
None for this plan — used the owner's standing AWS profile `reefradar` (read-only `s3:ListBucket`/`s3:GetObject` on `reefradar-2477-embeddings`), already confirmed working in plan 01-09.

## Next Phase Readiness
- **Plan 01-11** (region-coverage fix): `docs/model/deployed-model.lock.json.training_sites` gives the 5 real training sites (`ind_D2, ind_D3, ind_H4, ind_N1, ken_H1`) with country — `in_training_region` must key on Indonesia/Kenya only.
- **Plan 01-13** (interim real-only retrain): `interim_required: true`, `interim_num_classes: 3`, `interim_classes: [degraded, healthy, restored_early]` — the retrain target is unambiguous; no further audit judgment calls needed.
- **Plans 01-14/01-15/01-19**: `deployed-model.lock.json` artifact hashes and `DEPLOYED-MODEL-AUDIT.md`'s evidence trail are ready to cite from archive-key tracking and Methods/UI copy.
- No blockers for any dependent plan.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 4 created files found on disk (`scripts/audit_deployed_model.py`, `scripts/tests/test_audit_deployed_model.py`, `docs/model/deployed-model.lock.json`, `docs/model/DEPLOYED-MODEL-AUDIT.md`); all 4 commits (`4fa019f`, `726b937`, `e146c2f`, `f52949c`) found in git history.
