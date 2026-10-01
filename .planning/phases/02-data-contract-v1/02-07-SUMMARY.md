---
phase: 02-data-contract-v1
plan: 07
subsystem: web-contract-module
tags: [zod, tanstack-query, sha256, crypto-subtle, legacy-adapter, playwright-mock, parity]

requires:
  - phase: 02-data-contract-v1
    provides: schemas, v1 bundle, fixtures, latest-v1/v2 pointers and the 483-entry parity corpus (02-01, 02-03); CloudFront domain in infrastructure/resources.json (02-02)
provides:
  - dashboard-next/src/features/contract/ (config, errors, schema, client, hooks, legacy, index): the only contract fetch path in the web app
  - useContract, useReferenceSites, useModelVersion, useCoverage, useLegacySitesResponse and typed errors as one public surface
  - /dashboard reading its site data only through useLegacySitesResponse (no visible change)
  - mockContract() installed by mockApi(): every e2e and visual spec is served the contract from contracts/ on disk
  - tests/unit/support/contract-fetch.ts offline fetch harness for later plans
  - Zod mirror of all seven JSON Schemas, held to Python's verdicts and to the same property/required/pattern sets
affects: [02-08, 02-09, 02-10, every later UI phase]

actuals:
  tokens: 21000
  tasks: 3
  commits: 3

tech-stack:
  added: ["zod@4.4.3 (runtime, exact pin)"]
  patterns:
    - "Every contract fetch resolves latest.json -> contract/vN.json -> artifact, checks the sha256 of each response with crypto.subtle (fail closed when crypto.subtle is unavailable) and Zod-parses it; failures are typed errors that carry the version and path, never a body"
    - "Versioned TanStack keys ['contract', N, ...] with staleTime and gcTime Infinity; the pointer is ['contract','latest'] with a 60 s refetch; isLoading is computed as 'no data and no error' across the dependent chain"
    - "Artifact uris are validated against the relative-uri pattern and the resolved href must start with the base URL before any request"
    - "Zod objects are z.looseObject (or an object with a catchall); each *Base export is compared structurally with its JSON Schema node via z.toJSONSchema"

key-files:
  created:
    - dashboard-next/src/features/contract/config.ts
    - dashboard-next/src/features/contract/errors.ts
    - dashboard-next/src/features/contract/schema.ts
    - dashboard-next/src/features/contract/client.ts
    - dashboard-next/src/features/contract/hooks.ts
    - dashboard-next/src/features/contract/legacy.ts
    - dashboard-next/src/features/contract/index.ts
    - dashboard-next/tests/unit/support/contract-fetch.ts
    - dashboard-next/tests/unit/contract-legacy-adapter.test.ts
    - dashboard-next/tests/unit/contract-client.test.ts
    - dashboard-next/tests/unit/contract-schema-parity.test.ts
    - dashboard-next/tests/e2e/contract-dashboard.spec.ts
    - .planning/phases/02-data-contract-v1/deferred-items.md
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/src/app/dashboard/page.tsx
    - dashboard-next/tests/e2e/support/mock-api.ts
    - contracts/README.md

key-decisions:
  - "Zod 4.4.3 accepted on the owner's standing approval: the Phase 2 discuss (2026-10-01, 02-CONTEXT 'Schema and versioning') locked a hand-mirrored Zod schema, and the standing approval of 2026-10-01 covers new packages. npm evidence recorded below."
  - "Errors live in their own errors.ts (the plan listed no such file) so config.ts and client.ts do not import each other; ContractUriError is a sixth typed error for a bad artifact uri (the plan named the behaviour but no class)."
  - "Pinned versions fetch the manifest with no expected hash (there is no pointer to vouch for it); the artifact hashes inside it are still verified. The pointer's own manifest_uri must equal contract/v<contract_version>.json or it is rejected."
  - "Retries only for ContractFetchError (5xx or network); 403/404, integrity and schema failures surface immediately instead of retrying for several seconds."
  - "mockApi() now returns the ContractMockController (it returned void), so a spec can read contract.requests or call setLatest; existing call sites ignore the return value."

patterns-established:
  - "Application code imports from '@/features/contract' only; tests may import the internal files"
  - "The offline harness refuses any request outside the contract base URL, so a unit test cannot reach a real host"

requirements-completed: []

coverage:
  - id: D1
    description: "One module, one fetch path: latest -> manifest -> artifact with sha256 verification and Zod parsing; hash mismatch, 403/404, schema failure, bad uri and version mismatch are typed errors"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-client.test.ts#a one-byte change to the served sites.json raises ContractIntegrityError"
        status: pass
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-client.test.ts#artifact uri ../x is rejected before any request"
        status: pass
    human_judgment: false
  - id: D2
    description: "/dashboard reads its data only through useLegacySitesResponse and shows the same sentence and counts as before"
    requirement: "CONTRACT-01"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/contract-dashboard.spec.ts#shows 54 reference sites from latest -> manifest -> sites"
        status: pass
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-legacy-adapter.test.ts#deep-equals the frozen API fixture sites, minus synthetic and plus location, in the same order"
        status: pass
    human_judgment: true
    rationale: "The 33 Linux visual baselines can only be compared in the Playwright Docker image on CI; the local Windows run skips them"
  - id: D3
    description: "Zod mirror gives Python's verdict for all 483 corpus entries and has the same property, required and pattern sets as every JSON Schema node"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-schema-parity.test.ts#returns the corpus verdict for every entry"
        status: pass
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-schema-parity.test.ts#$name: property and required sets are equal"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every e2e and visual spec is served the contract from committed files; no test reaches a real CloudFront host; default base URL equals the recorded CloudFront domain"
    requirement: "CONTRACT-05"
    verification:
      - kind: e2e
        ref: "npx playwright test --project=e2e (40 passed, every spec through mockApi())"
        status: pass
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-schema-parity.test.ts#equals the CloudFront domain recorded in infrastructure/resources.json"
        status: pass
    human_judgment: false
  - id: D5
    description: "useModelVersion resolves v1 model_version (interim-real-only) and useCoverage returns the manifest coverage block"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-schema-parity.test.ts#useModelVersion resolves the v1 model_version.json verified against the manifest"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-01
status: complete
---

# Phase 2 Plan 07: Web Contract Module and Zod Parity Summary

**`dashboard-next/src/features/contract/` is now the web app's only contract path: it follows latest.json to the manifest to each artifact, checks every response's sha256 with `crypto.subtle`, Zod-parses it (z.looseObject mirrors of all seven JSON Schemas, equal to Python's verdict on all 483 corpus entries), serves it through version-keyed TanStack hooks, and feeds the unchanged `/dashboard` page through a legacy adapter, while every Playwright spec is served the contract from committed files on disk.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 3 (human-verify gate, tracer, auto)
- **Commits:** 3 task commits (RED tests, tracer, expansion)
- **Files:** 17 changed, 1,651 insertions, 8 deletions (excluding the lockfile and this plan's docs)

## Task 1 checkpoint: zod@4.4.3 package legitimacy

Resolved by the orchestrator's instruction on the owner's standing approval; recorded here as the plan requires.

- `npm view zod@4.4.3`: version 4.4.3, repository `git+https://github.com/colinhacks/zod.git`, published 2026-05-04T07:06:40Z, tarball integrity `sha512-ytENFjIJ...cHJyTQ==`, license MIT, no dependencies.
- No `preinstall`, `install` or `postinstall` script. The only scripts it publishes (`build`, `postbuild`, `clean`, `prepublishOnly`, `test`) do not run on install.
- `npm view zod dist-tags`: latest is 4.6.5 (published 2026-09-13, under 30 days old, which is why the research audit flagged it); 4.4.3 is an older, mature release, which is the intended pin.
- `npm install --save-exact zod@4.4.3` added one package and a 10-line lockfile entry; `package.json` carries `"zod": "4.4.3"`.
- Approval basis: owner accepted Zod in the Phase 2 discuss (2026-10-01, 02-CONTEXT "Schema and versioning", "Accept all") plus the standing owner approval of new packages (DRIVING-QUESTIONS "Standing owner approvals (2026-10-01)").
- The npm install printed an `allow-scripts` warning about `unrs-resolver@1.11.1`. That is a transitive dev dependency already in the lockfile, unrelated to zod.

## Accomplishments

- **Verified fetch.** `loadLatestPointer`, `loadManifest(version, expectedSha256 | null)`, `loadArtifact` and `loadContractSites` use one `fetchVerified` path: `fetch(url, {credentials: 'omit'})` with no custom headers (no preflight), 403/404 to `ContractNotFoundError`, other statuses and network failures to `ContractFetchError`, bytes read once, sha256 compared before JSON parsing, then a Zod parse. A manifest for a different `contract_version`, a pointer whose `manifest_uri` disagrees with its version, and a site count that disagrees with the manifest are `ContractIntegrityError`.
- **URL safety.** `resolveArtifactUrl` accepts only the relative-uri pattern and requires the resolved href to start with the base URL; `../x`, `/v1/sites.json`, `https://example.com/...`, `v1/../v2/...` and a backslash path all raise `ContractUriError` before `fetch` is called (asserted by request count). `contractBaseUrl()` accepts only https or http on localhost/127.0.0.1, refuses credentials, query strings and fragments, and normalises to one trailing slash.
- **Hooks.** `useContract(version?)`, `useReferenceSites`, `useModelVersion`, `useCoverage`; keys `['contract','latest']` (60 s) and `['contract', N, 'manifest' | 'sites' | 'model_version']` (Infinity). A pinned version never requests the pointer (asserted: the only request is `contract/v2.json`). `isLoading` is "no data and no error" across the whole chain; a recorded-render test confirms no render is ever "not loading, no data, no error". A missing version surfaces as `ContractNotFoundError` with `isLoading` false and no data.
- **Legacy adapter and /dashboard.** `toLegacySitesResponse(sites).sites` `toStrictEqual`s the frozen API fixture's sites with `synthetic` dropped and `location` added (from `legacy-site-coordinates.json`, `Florida Keys, USA` for `irma_eastern_sambo`), 54 sites in the same order, 48 with embeddings. The page now calls `useLegacySitesResponse()`; markup and `deriveSiteStats` are untouched.
- **Zod parity.** For all 483 parity-corpus entries `safeParse(...).success` equals the Python verdict, with no disagreements and no change needed on the Zod side (research assumption A10 did not bite). 23 object nodes (manifest, coverage, artifacts, present/absent/embeddings/projection artifacts, dataset, pointer, site and its projection, model version with training/architecture/embedding_model/predecessor, preprocessing spec with resampling/serving/known gap, projection and coordinate, stamp) have equal property and required sets, and every regex pattern is the same text, via `z.toJSONSchema`. A deliberate mutation of the mirror (a boolean `synthetic`, a 63-digit hash pattern, an optional `status_basis`) made 10 of the tests fail, so the comparison has teeth.
- **Offline browser tests.** `mockContract(page, {latest})` routes any `https://*.cloudfront.net/` request to `contracts/bucket` and `contracts/fixtures` (latest from `latest-v<n>.json`, `v2.json` from the fixture bucket, absent key answers 403), with `access-control-allow-origin: *` and the production Cache-Control (latest 60 s, everything else immutable). `mockApi()` installs it first, so all 40 e2e specs and the visual specs inherit it with no spec edits. A new spec asserts `/dashboard` requests exactly `contract/latest.json`, `contract/v1.json`, `v1/sites.json` and never calls the legacy `/sites` API.

## Task Commits

1. **Task 1 (checkpoint):** package legitimacy gate resolved as above; no commit of its own (the pin lands with the RED commit).
2. **Task 2 (tracer): committed contract to verified fetch to hooks to adapter to /dashboard** - RED `72a38fb` (test, with the zod pin and the fetch harness), GREEN `b4fb3cd` (feat). Tracer feedback gate (auto mode): the tracer `<verify>` chain (adapter and client vitest files, typecheck, lint) and `playwright test --project=e2e` were green on the committed tree before expanding.
3. **Task 3: complete Zod mirror, parity test, model and coverage hooks, base-URL sync** - `8358265` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Verification

- `npm test` (vitest, whole unit suite): 14 files, 156 tests passed (33 in the adapter and client files, 52 in the parity file)
- `npm run typecheck`: clean. `npm run lint`: no errors (one existing `react-hooks/exhaustive-deps` warning in `LocationCompare.tsx`, not touched)
- `npm run build`: succeeded (run by the Playwright web server for each of three e2e runs)
- `npx playwright test --project=e2e` against a fresh build: 40 passed (39 existing specs plus the new contract-dashboard spec)
- `grep -c useLegacySitesResponse src/app/dashboard/page.tsx` prints 2; `grep -c '"zod": "4.4.3"' package.json` prints 1
- `node scripts/check-citations.mjs --scope docs`: OK (275 files)
- The 33 Linux visual baselines were not run locally (they self-skip off Linux). CI (Playwright Docker, `PW_VISUAL=1`) is the check; see the CI line in the final report.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Target-less tsconfig rejected a spread over a Set**
- **Found during:** Task 3 typecheck
- **Issue:** `[...required]` over a `Set<string>` in the parity test fails under the project's default ES5 target.
- **Fix:** `Array.from(required)`.
- **Commit:** `8358265`

### Plan wording adjusted

- **errors.ts added; ContractUriError added.** The plan listed six module files and named the "raises before fetch" behaviour for bad uris without a class. A separate `errors.ts` avoids a config/client import cycle (`ContractConfigError` is also re-exported from `config.ts`).
- **No spec edits, but one new spec.** Existing specs are untouched, as planned. `tests/e2e/contract-dashboard.spec.ts` was added because the existing route smoke only proves the page loads without errors, not that it reads the contract; it is the observable evidence for the tracer.
- **mockApi() return type.** It now returns the contract mock controller instead of `void`; every existing call site ignores the value.
- **Hook tests live in the parity test file.** The plan lists `contract-schema-parity.test.ts` as Task 3's only test file, so the `useModelVersion`/`useCoverage` tests are there.
- **Stale local server.** A `next start -p 3100` left from 15:11 was holding the Playwright port and would have served an old build with `reuseExistingServer`. It was left running (not mine); the e2e runs used a temporary, untracked config on port 3101 with its own build, deleted afterwards. A fresh CI run has no such server.

**Total deviations:** 1 auto-fixed (Rule 3) plus 5 wording adjustments. No impact on the delivered state; every must-have truth holds.

## Authentication Gates

None. No AWS call, no credential, token file or presigned URL was read or printed. Live CloudFront was never contacted (the contract is not published until 02-06; tests use fixtures only).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-02-07-01 (sha256 on every response, tamper tests), -02 (uri resolution tests), -03 (no `dangerouslySetInnerHTML`, no contract URLs rendered), -04 (`credentials: 'omit'`, no custom headers, asserted per fetch call), -05 (base-URL allow-list and recorded-domain test) and -SC (checkpoint above) are mitigated.

## Issues Encountered

- The first e2e assertion on the `/dashboard` stat counter failed because `AnimatedCounter` renders 0 forever (its effect cleanup cancels the animation frame it just scheduled). The committed Linux baselines already show "0" for all three counters, so this predates the plan and the baselines stay valid. The spec asserts the contract-derived sentence ("Browse 54 reference sites across 7 countries") instead, and the defect is recorded in `.planning/phases/02-data-contract-v1/deferred-items.md`.

## Next Phase Readiness

- 02-08 can import `useContract(version?)` and the `?cv=` pin source can feed its `version` argument; `mockContract(page, {latest: 2})` (called after `mockApi`, later route wins) or `controller.setLatest(2)` flips the pointer; `installContractFetch` does the same in unit tests.
- 02-09 and 02-10 can read model, coverage and sites through the barrel; `loadArtifact(manifest, key, schema)` is the generic verified loader for further artifacts (embeddings and projection need only a binary or JSON schema added to `schema.ts`).
- Live fetches still return 403 until 02-06 publishes the contract; nothing here depends on that.
- CONTRACT-01 and CONTRACT-05 are intentionally not marked complete: they complete after the live publish and phase verification.

## Self-Check: PASSED

- Files present: dashboard-next/src/features/contract/{config,errors,schema,client,hooks,legacy,index}.ts, dashboard-next/tests/unit/support/contract-fetch.ts, dashboard-next/tests/unit/{contract-legacy-adapter,contract-client,contract-schema-parity}.test.ts, dashboard-next/tests/e2e/contract-dashboard.spec.ts, .planning/phases/02-data-contract-v1/deferred-items.md
- Commits present: 72a38fb, b4fb3cd, 8358265
