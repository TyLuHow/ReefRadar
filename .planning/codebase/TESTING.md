# Testing Patterns

**Analysis Date:** 2026-09-30

## Test Framework

**No unit test framework, e2e framework, or visual-regression framework is configured anywhere in this repository.**

- No `pytest.ini`, `pyproject.toml [tool.pytest]`, `setup.cfg [tool:pytest]`, or `conftest.py` found under `lambdas/` or `scripts/`
- No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`, or `@testing-library/*` dependency found in `dashboard-next/package.json`
- `dashboard-next/package.json` `devDependencies` contain only build/lint tooling (`eslint`, `eslint-config-next`, `typescript`, `autoprefixer`, `postcss`, `tailwindcss`, `@types/*`) — zero test runner, zero assertion library, zero component-testing or snapshot library
- "Testing" in this codebase means ad hoc Python scripts that exercise the deployed AWS API/Lambdas directly, plus manually-authored Markdown reports recording a human/agent's QA pass through the live system

**Run Commands:**
```bash
bash scripts/test-all.sh              # End-to-end smoke test against the live deployed API
python3 scripts/test_inference_lambda.py   # Direct Lambda invocation test (SurfPerch embeddings)
python3 scripts/test_region_detection.py   # Standalone region-detection logic test
bash scripts/status.sh                # Operational status/health check script
```
There is no `npm test`, `pytest`, or `make test` entry point. Nothing in `dashboard-next/package.json`'s `scripts` block runs tests (`dev`, `build`, `start`, `lint` only).

## Test File Organization

**Location:**
- All test-like scripts live in top-level `scripts/`, not co-located with source and not under a `tests/` directory
- Python: `scripts/test_inference_lambda.py`, `scripts/test_region_detection.py` (325 and 160 lines respectively)
- Shell: `scripts/test-all.sh` (157 lines), `scripts/status.sh` (121 lines, operational health check rather than a test)

**Naming:**
- `test_*.py` for Python scripts (pytest-discoverable naming convention is followed even though pytest itself is not installed/configured — these can be run directly with `python3` or picked up by pytest if added later)
- `test-all.sh` (hyphenated) for the shell-based API suite — inconsistent with the Python underscore convention

**Structure:**
```
scripts/
├── test-all.sh              # curl-based black-box API test suite (bash, set -e, PASS/FAIL counters)
├── test_inference_lambda.py # boto3 direct-invoke test of the inference Lambda container
├── test_region_detection.py # pure-logic test of region_detection.py against lat/lon fixtures
└── status.sh                # deployment/operational status check (not a correctness test)
```
No dashboard-next-side test directory exists at all (no `__tests__/`, no `*.test.tsx`, no `*.spec.tsx` anywhere under `dashboard-next/src`).

## Test Structure

**`scripts/test-all.sh` pattern** — bash with manual PASS/FAIL counters, no test framework:
```bash
API_URL="https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"
PASS=0
FAIL=0

echo "TEST 1: Health Check"
HEALTH=$(curl -s "${API_URL}/health")
if echo "$HEALTH" | grep -q '"status": "healthy"'; then
    echo "PASS: Health endpoint responding"
    ((PASS++))
else
    echo "FAIL: Health endpoint not healthy"
    ((FAIL++))
fi
```
This script hits the **real, deployed** AWS API Gateway endpoint (`API_URL` is a hardcoded live URL) — it is an integration/smoke test against production infrastructure, not an isolated unit test. It synthesizes a test WAV file inline via an embedded Python heredoc, uploads it, and polls for classification results.

**`scripts/test_inference_lambda.py` pattern** — boto3 direct Lambda invocation:
```python
INFERENCE_FUNCTION = 'reefradar-2477-inference'
EMBEDDINGS_BUCKET = 'reefradar-2477-embeddings'
AWS_REGION = 'us-east-1'

def create_test_audio():
    # synthesizes a multi-frequency sine-wave signal to mimic reef audio
    ...
```
Also targets live AWS resources by hardcoded name/region — no mocking (no `moto`, no `unittest.mock` observed), no local Lambda emulation (no SAM local, no LocalStack).

**`scripts/test_region_detection.py` pattern** — the closest thing to a true unit test: exercises `lambdas/classifier/region_detection.py` logic against known lat/lon fixtures (Indonesia, Red Sea, Caribbean, USVI) and compares expected vs. actual `region`/`in_dist` values, printed as a PASS/FAIL table — this one does not require live AWS calls since it's pure classification logic over coordinates.

## Mocking

**No mocking framework or library is used anywhere** (no `unittest.mock`, no `moto` for AWS, no `jest.mock`, no `msw`). All Python test scripts invoke real AWS services (S3, Lambda, DynamoDB via `boto3`) using live resource names/ARNs hardcoded at the top of each script. This means:
- Tests require valid AWS credentials and network access to run
- Tests are not hermetic/repeatable in CI without an AWS sandbox account
- Tests may incur real AWS costs (Lambda invocations, S3 storage) each run

**What to mock (recommendation, not current practice):** AWS SDK calls (`boto3.client('s3')`, `boto3.client('lambda')`, `dynamodb.resource('dynamodb')`) should be mocked via `moto` or `unittest.mock.patch` if proper unit tests are added — currently none are.

**What NOT to mock:** `region_detection.py`'s pure coordinate-to-region logic is a good target for direct unit testing without any mocking, matching the existing `test_region_detection.py` approach.

## Fixtures and Factories

**No fixture or factory system exists.** Test data is generated inline, ad hoc, in each script:
- `scripts/test-all.sh` synthesizes a WAV file via an embedded Python heredoc (sine wave at 500Hz, 6 seconds, 32kHz) written to `/tmp/reefradar_test.wav`
- `scripts/test_inference_lambda.py`'s `create_test_audio()` synthesizes a multi-frequency signal (100Hz–5000Hz) plus noise, normalized, to mimic a reef recording — regenerated per run, not stored as a checked-in fixture file
- `scripts/test_region_detection.py` hardcodes known lat/lon coordinate pairs with expected region/distribution labels directly in the script body
- No shared `fixtures/` directory, no factory functions, no seed data files for tests

## Coverage

**Requirements:** None enforced. No coverage tool configured (no `coverage.py`, no `nyc`, no `c8`, no Next.js/Jest coverage threshold).

**View Coverage:** Not applicable — no mechanism exists to measure or report test coverage in this repository.

## Test Types

**Unit Tests:** Effectively none, with the partial exception of `scripts/test_region_detection.py` which unit-tests pure region-detection logic. No unit tests exist for any TypeScript/React code, Lambda handler logic (`handler.py` files), `color-engine.ts`, or `utils.ts`.

**Integration Tests:** `scripts/test-all.sh` and `scripts/test_inference_lambda.py` are integration/smoke tests against live deployed AWS infrastructure (API Gateway, Lambda, S3). They verify the system works end-to-end but are not isolated, fast, or CI-friendly.

**E2E Tests:** Not used. No Playwright, Cypress, or Selenium. The "Experience Layer" and "Living Spectrogram" test reports (see below) document manual/agent-driven click-through verification of the Next.js dashboard, not automated browser-driven E2E tests.

**Visual Regression Tests:** Not used. No Percy, Chromatic, Playwright screenshot-diffing, or similar tool is configured. No baseline screenshots are checked into the repository.

**Accessibility Tests:** Not used. No axe-core, jest-axe, or Lighthouse CI integration found.

## Verification Practices (Markdown Test Reports)

Instead of automated tests, this project relies heavily on **manually/agent-authored Markdown verification reports** checked into `docs/`, documenting point-in-time QA passes:

- `docs/TEST_REPORT.md` — "ReefRadar System Verification Report" (2026-02-21): 35 tests, 30 passed, 2 failed, 2 warnings, 1 blocked (CloudWatch access denied in sandbox). Structured as numbered Phase/Test sections with expected-vs-actual tables for API endpoints (`/health`, `/sites`, `/status/{id}`, etc.)
- `docs/VERIFICATION_REPORT.md` — "ReefRadar Post-Fix Verification Report" (2026-02-21): 16 tests, 15 passed, re-verifies API endpoints and region-detection coordinate accuracy after bug fixes
- `docs/EXPERIENCE_LAYER_TEST_REPORT.md` — (2026-02-22): 74/78 manual UI tests across 9 phases (Build Verification, Landing Page, Dashboard Compare/Map/Analyze, Foundation Components, Navigation, Scientific Accuracy, API Integration) performed by "Automated (Claude Code)" walking through the running dev server. Documents specific stale-content bugs found (e.g., About page showing "6 validated sites" vs. the correct 8) with exact file/line references.
- `docs/LIVING_SPECTROGRAM_TEST_REPORT.md` — (2026-02-23): Next.js build-output verification (route sizes, zero build errors/warnings) plus a route verification checklist.
- `docs/embedding_validation_report.md` — embedding/ML validation report (model output sanity-checking, not a code test).

**Pattern to follow when adding new verification:** these reports use a consistent structure — Date, Environment/Tester header, Summary table (Total/Passed/Failed/Warnings), then numbered Phase/Test sections with expected-vs-actual detail and explicit file:line citations for any bug found. New verification passes should follow this same report format and be added to `docs/` with a `*_TEST_REPORT.md` or `*_VERIFICATION_REPORT.md` suffix rather than introducing a new ad hoc format.

## Coverage Gaps (explicit)

- **No unit tests** for any Lambda handler (`lambdas/classifier/handler.py`, `lambdas/preprocessor/handler.py`, `lambdas/router/handler.py`) — error paths (`InferenceError`, retry/backoff logic, `convert_floats`) are entirely unverified by automated tests.
- **No unit tests** for any TypeScript/React code — `src/lib/utils.ts` (formatting/validation functions), `src/lib/color-engine.ts` (HSL interpolation engine with directional hue logic — a prime candidate for property-based or snapshot unit testing given its pure-function design), and all components in `src/components/` are untested.
- **No e2e tests** — dashboard flows (upload → analyze → results, map interactions, audio comparison/crossfading) are only verified via one-time manual/agent walkthroughs recorded in `docs/*_TEST_REPORT.md`, which go stale as the app evolves (the About page site-count bug found in `EXPERIENCE_LAYER_TEST_REPORT.md` demonstrates this: content drifted out of sync and was only caught by a manual pass).
- **No visual regression tests** — given the heavy use of a dynamic CSS-variable color engine (`color-engine.ts`) driving `--reef-*` tokens across the UI, visual regressions in the vitality color transitions would not be automatically caught.
- **No CI pipeline** found (no `.github/workflows/`, no other CI config) — none of the existing test scripts run automatically on push/PR; they are invoked manually.
- **Tests require live AWS credentials and a deployed stack** — there is no local/offline way to verify Lambda or API behavior, meaning testing is gated on AWS access and incurs real infrastructure cost/risk (tests write to live S3 buckets and invoke live Lambda functions named `reefradar-2477-*`).

---

*Testing analysis: 2026-09-30*
