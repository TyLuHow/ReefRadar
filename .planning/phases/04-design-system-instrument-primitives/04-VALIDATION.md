---
phase: 4
slug: design-system-instrument-primitives
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 04-RESEARCH.md "Validation Architecture", adjusted to the 24-plan split.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 + Testing Library (+ `@testing-library/user-event` 14.6.7 from plan 04-05) for unit; Playwright 1.63.0 + `@axe-core/playwright` 4.13.0 for e2e, a11y and screenshots; `culori` 4.0.2 (dev, from plan 04-04) for palette maths |
| **Config file** | `dashboard-next/vitest.config.ts`; `dashboard-next/playwright.config.ts` (projects `e2e`, `visual`, and `fixtures-shots` from plan 04-23); `dashboard-next/playwright.fingerprint.config.ts` (plan 04-01, one-off) |
| **Quick run command** | `cd dashboard-next && npx vitest run tests/unit/<file>` |
| **Full suite command** | `cd dashboard-next && npm test && npm run lint && npm run typecheck && npm run build && node ../scripts/check-feature-fence.mjs && node ../scripts/check-contract-fence.mjs`, then `npx playwright test --project=e2e`; in CI also `PW_VISUAL=1 npx playwright test --project=visual --project=fixtures-shots` |
| **Estimated runtime** | quick unit file 5 to 30 s; full unit suite about 60 s; `next build` 2 to 4 min; local e2e project 10 to 20 min |

---

## Sampling Rate

- **After every task commit:** the task's `<automated>` command (a unit test file, usually plus `semantic-tokens.test.ts`); e2e-tagged tasks run their one spec.
- **After every plan:** `npm test && npm run lint && npm run typecheck && npm run build` (plus `NEXT_PUBLIC_DEV_FIXTURES=1 npm run build` from plan 04-06 on).
- **After every pushed plan (orchestrator):** CI `web` (with `check-dev-fixtures-excluded.mjs` from 04-06), `e2e`, `visual` (33 legacy baselines unchanged), `python`, `citations`. Plan 04-01 is a hard gate: nothing else starts until its CI `visual` job is green.
- **Before `/gsd-verify-work`:** full CI green including `fixtures-shots` with committed baselines (plan 04-24).
- **Max feedback latency:** 30 s for unit-level task verification; tasks that need a build or a browser state it in their verify command.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | DS-01 | T-04-01-02 | 33 legacy baselines pinned by sha256 | unit | `npx vitest run tests/unit/legacy-baselines.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 4-01-02 | 01 | 1 | DS-01 | T-04-01-SC, T-04-01-03 | exact pins; baseline and planning rewrites reverted | unit | `npx vitest run tests/unit/tailwind-v4-sources.test.ts tests/unit/platform-versions.test.ts tests/unit/vitality-removed.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | DS-01 | T-04-01-02 | zero unexplained computed-style diffs | script + e2e | `node scripts/style-fingerprint-diff.mjs "$FP_BEFORE" "$FP_AFTER" && npx playwright test --project=e2e tests/e2e/legacy-hover.spec.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 2 | DS-01 | T-04-02-02 | compiled legacy CSS byte-identical | script | `diff "$CSS_BEFORE" "$CSS_AFTER"` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 2 | DS-01, DS-06 | T-04-02-02 | new rules scoped to the instrument surface | unit + build | `npx vitest run tests/unit/legacy-baselines.test.ts tests/unit/tailwind-v4-sources.test.ts` | ✅ | ⬜ pending |
| 4-02-03 | 02 | 2 | DS-01 | T-04-02-01 | JS-visible tokens hex only | unit | `npx vitest run tests/unit/tokens.test.ts tests/unit/tokens-bridge.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | DS-03 | T-04-03-SC, T-04-03-01 | bounded WAV chunk walker | unit | `npx vitest run tests/unit/wav.test.ts tests/unit/stft.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | DS-03 | — | N/A | unit | `npx vitest run tests/unit/colormap.test.ts tests/unit/levels.test.ts tests/unit/stack-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 3 | DS-02 | T-04-04-SC | N/A | unit | `npx vitest run tests/unit/status-palette.test.ts tests/unit/token-contrast.test.ts` | ❌ W0 | ⬜ pending |
| 4-04-02 | 04 | 3 | DS-01 | — | N/A | unit | `npx vitest run tests/unit/semantic-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 4-04-03 | 04 | 3 | DS-02 | — | N/A | unit | `npx vitest run tests/unit/status-mark.test.tsx tests/unit/semantic-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 4-05-01 | 05 | 4 | DS-04 | T-04-05-SC | RAC pinned exactly; SUS too-new verdict recorded | unit | `npx vitest run tests/unit/button.test.tsx tests/unit/semantic-tokens.test.ts tests/unit/stack-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 4-05-02 | 05 | 4 | DS-04 | — | N/A | unit | `npx vitest run tests/unit/toggle-group.test.tsx tests/unit/semantic-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 4-05-03 | 05 | 4 | DS-04 | — | N/A | unit | `npx vitest run tests/unit/tooltip.test.tsx` | ❌ W0 | ⬜ pending |
| 4-06-01 | 06 | 5 | DS-08, DS-01 | T-04-06-04 | fonts self-hosted, /dev only | typecheck + lint | `npm run typecheck && npm run lint` | ✅ | ⬜ pending |
| 4-06-02 | 06 | 5 | DS-08 | T-04-06-02, T-04-06-03 | query allowlist; hex-only token overrides | unit | `npx vitest run tests/unit/fixtures-query.test.ts tests/unit/semantic-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 4-06-03 | 06 | 5 | DS-08 | T-04-06-01 | flag-less build has no fixture marker and 404s | script + e2e | `npm run build && node ../scripts/check-dev-fixtures-excluded.mjs && npx playwright test --project=e2e tests/e2e/fixtures-route.spec.ts` | ❌ W0 | ⬜ pending |
| 4-07-01 | 07 | 6 | DS-08 | T-04-07-01 | unknown section slugs 404 | unit | `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/semantic-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 4-07-02 | 07 | 6 | DS-06, DS-08 | — | N/A | unit | `npx vitest run tests/unit/reduced-motion-hook.test.ts tests/unit/semantic-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 4-07-03 | 07 | 6 | DS-01, DS-02, DS-08 | T-04-07-02 | section pages also excluded from production | script + e2e | `npm run build && node ../scripts/check-dev-fixtures-excluded.mjs && npx playwright test --project=e2e tests/e2e/fixtures-route.spec.ts` | ✅ | ⬜ pending |
| 4-08-01 | 08 | 7 | DS-05 | T-04-08-01 | no error message or stack rendered | unit | `npx vitest run tests/unit/state-primitives.test.tsx tests/unit/semantic-tokens.test.ts tests/unit/copy-claims.test.ts` | ❌ W0 | ⬜ pending |
| 4-08-02 | 08 | 7 | DS-05 | — | N/A | unit | `npx vitest run tests/unit/layout-primitives.test.tsx tests/unit/semantic-tokens.test.ts` | ❌ W0 | ⬜ pending |
| 4-09-01 | 09 | 8 | DS-08, DS-04 | — | N/A | unit | `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/semantic-tokens.test.ts tests/unit/copy-claims.test.ts` | ✅ | ⬜ pending |
| 4-09-02 | 09 | 8 | DS-08, DS-05 | T-04-09-01 | counts from the contract | unit + build | `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/semantic-tokens.test.ts tests/unit/copy-claims.test.ts` | ✅ | ⬜ pending |
| 4-10-01 | 10 | 9 | DS-04 | T-04-10-01 | text-only rendering | unit | `npx vitest run tests/unit/dialog.test.tsx` | ❌ W0 | ⬜ pending |
| 4-10-02 | 10 | 9 | DS-04 | T-04-10-02 | Escape always closes | unit | `npx vitest run tests/unit/sheet.test.tsx` | ❌ W0 | ⬜ pending |
| 4-10-03 | 10 | 9 | DS-04 | — | N/A | unit | `npx vitest run tests/unit/listbox.test.tsx tests/unit/copy-claims.test.ts` | ❌ W0 | ⬜ pending |
| 4-11-01 | 11 | 10 | DS-04 | — | N/A | unit | `npx vitest run tests/unit/slider.test.tsx` | ❌ W0 | ⬜ pending |
| 4-11-02 | 11 | 10 | DS-04 | — | N/A | unit + typecheck | `npx vitest run tests/unit/semantic-tokens.test.ts tests/unit/fixtures-registry.test.ts && npm run typecheck` | ✅ | ⬜ pending |
| 4-11-03 | 11 | 10 | DS-05 | T-04-11-02 | computed counts | unit | `npx vitest run tests/unit/data-table.test.tsx` | ❌ W0 | ⬜ pending |
| 4-12-01 | 12 | 11 | DS-04 | T-04-12-02 | shortcut scoped to the section | unit | `npx vitest run tests/unit/command-palette.test.tsx` | ❌ W0 | ⬜ pending |
| 4-12-02 | 12 | 11 | DS-05 | T-04-12-01 | https-only hrefs | unit | `npx vitest run tests/unit/provenance.test.tsx` | ❌ W0 | ⬜ pending |
| 4-13-01 | 13 | 12 | DS-03 | T-04-13-02 | same-origin /audio/ paths only | unit | `npx vitest run tests/unit/playhead.test.ts tests/unit/audio-manifest.test.ts` | ❌ W0 | ⬜ pending |
| 4-13-02 | 13 | 12 | DS-03, DS-05 | T-04-13-01, T-04-13-03 | capped backing store; metadata-only description | unit | `npx vitest run tests/unit/spectrogram.test.tsx tests/unit/copy-claims.test.ts` | ❌ W0 | ⬜ pending |
| 4-13-03 | 13 | 12 | DS-03, DS-08 | — | N/A | e2e | `npx playwright test --project=e2e tests/e2e/fixtures-spectrogram.spec.ts` | ❌ W0 | ⬜ pending |
| 4-14-01 | 14 | 13 | DS-05 | T-04-14-02 | unequal buffers rejected | unit | `npx vitest run tests/unit/audio-engine.test.ts` | ❌ W0 | ⬜ pending |
| 4-14-02 | 14 | 13 | DS-06 | T-04-14-01 | no idle frame loop; 1 Hz under reduced motion | unit | `npx vitest run tests/unit/playhead-clock.test.ts tests/unit/audio-engine.test.ts` | ❌ W0 | ⬜ pending |
| 4-15-01 | 15 | 14 | DS-05 | — | N/A | unit | `npx vitest run tests/unit/transport.test.tsx` | ❌ W0 | ⬜ pending |
| 4-15-02 | 15 | 14 | DS-05 | T-04-15-01 | no invented model readings in fixtures | unit | `npx vitest run tests/unit/band-toggle.test.tsx tests/unit/window-strip.test.tsx` | ❌ W0 | ⬜ pending |
| 4-16-01 | 16 | 15 | DS-05 | T-04-16-02 | gains only attenuate | unit | `npx vitest run tests/unit/compare-math.test.ts` | ❌ W0 | ⬜ pending |
| 4-16-02 | 16 | 15 | DS-05, DS-06 | T-04-16-01 | shared scale enforced | unit | `npx vitest run tests/unit/compare-deck.test.tsx` | ❌ W0 | ⬜ pending |
| 4-16-03 | 16 | 15 | DS-05 | — | N/A | unit | `npx vitest run tests/unit/clip-card.test.tsx` | ❌ W0 | ⬜ pending |
| 4-17-01 | 17 | 16 | DS-05 | T-04-17-01 | probabilities as returned | unit | `npx vitest run tests/unit/probability-bar.test.tsx tests/unit/copy-claims.test.ts` | ❌ W0 | ⬜ pending |
| 4-17-02 | 17 | 16 | DS-05, DS-02 | T-04-17-01 | counts asserted against sites.json | unit | `npx vitest run tests/unit/legend.test.tsx tests/unit/status-band.test.tsx` | ❌ W0 | ⬜ pending |
| 4-18-01 | 18 | 17 | DS-05 | T-04-18-01 | captured JSON has no URLs | script | `node ../scripts/check-contract-fence.mjs && npm run typecheck` | ✅ | ⬜ pending |
| 4-18-02 | 18 | 17 | DS-08 | T-04-18-02 | every cell states its source | unit | `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/copy-claims.test.ts` | ✅ | ⬜ pending |
| 4-19-01 | 19 | 18 | DS-05 | T-04-19-01 | projection via verified client | unit | `npx vitest run tests/unit/contract-projection.test.tsx tests/unit/strip-plot.test.tsx tests/unit/stack-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 4-19-02 | 19 | 18 | DS-05, DS-02 | T-04-19-02 | caveat printed with the scatter | unit | `npx vitest run tests/unit/strip-plot.test.tsx tests/unit/copy-claims.test.ts` | ✅ | ⬜ pending |
| 4-19-03 | 19 | 18 | DS-08 | — | N/A | unit | `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/stack-consolidation.test.ts` | ✅ | ⬜ pending |
| 4-20-01 | 20 | 19 | DS-01 | T-04-20-02 | hex re-validated before setPaintProperty | unit | `npx vitest run tests/unit/token-style.test.ts tests/unit/map-layers.test.ts` | ❌ W0 | ⬜ pending |
| 4-20-02 | 20 | 19 | DS-01 | T-04-20-01 | test hook only under NEXT_PUBLIC_E2E_HOOKS | e2e | `npx playwright test --project=e2e tests/e2e/token-bridge.spec.ts` | ❌ W0 | ⬜ pending |
| 4-21-01 | 21 | 20 | DS-06, DS-05 | T-04-21-01 | attribution from canonical citations | unit | `npx vitest run tests/unit/geo.test.ts tests/unit/composition-parts.test.tsx tests/unit/copy-claims.test.ts` | ❌ W0 | ⬜ pending |
| 4-21-02 | 21 | 20 | DS-05, DS-08 | T-04-21-01 | computed counts | unit | `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/copy-claims.test.ts` | ✅ | ⬜ pending |
| 4-21-03 | 21 | 20 | DS-05, DS-08 | T-04-21-02 | links via safeHttpsUrl | unit + build | `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/copy-claims.test.ts` | ✅ | ⬜ pending |
| 4-22-01 | 22 | 21 | DS-04 | T-04-22-02 | mocked API only | e2e | `npx playwright test --project=e2e tests/e2e/fixtures-keyboard.spec.ts` | ❌ W0 | ⬜ pending |
| 4-22-02 | 22 | 21 | DS-04 | T-04-22-01 | violations fixed, not suppressed | e2e | `npx playwright test --project=e2e tests/e2e/fixtures-a11y.spec.ts tests/e2e/fixtures-targets.spec.ts` | ❌ W0 | ⬜ pending |
| 4-22-03 | 22 | 21 | DS-06, DS-08, DS-01 | — | N/A | e2e | `npx playwright test --project=e2e tests/e2e/reduced-motion.spec.ts tests/e2e/legacy-isolation.spec.ts tests/e2e/fixtures-state-manifest.spec.ts` | ❌ W0 | ⬜ pending |
| 4-23-01 | 23 | 22 | DS-08 | T-04-23-01 | separate project and snapshot dir | unit | `npx vitest run tests/unit/fixtures-shots-config.test.ts tests/unit/legacy-baselines.test.ts` | ❌ W0 | ⬜ pending |
| 4-23-02 | 23 | 22 | DS-08 | T-04-23-02 | no workflow input interpolated | script | `node scripts/build-fixtures-review.mjs && node scripts/check-citations.mjs --scope docs` | ❌ W0 | ⬜ pending |
| 4-24-01 | 24 | 23 | DS-08 | T-04-24-01 | only fixtures artifact committed | unit (orchestrator checkpoint) | `npx vitest run tests/unit/legacy-baselines.test.ts` | ✅ | ⬜ pending |
| 4-24-02 | 24 | 23 | DS-08 | T-04-24-02 | expected baseline set pinned; CI fails closed | unit + script | `npx vitest run tests/unit/fixtures-baselines.test.ts && node scripts/build-fixtures-review.mjs --check` | ❌ W0 | ⬜ pending |
| 4-24-03 | 24 | 23 | all | T-04-24-03 | owner decision recorded | checkpoint (decision) | `grep -A3 "Owner decision" docs/deploy/PHASE-4-VISUAL-REVIEW.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No separate Wave 0 plan: each test file is created in the task that first needs it (TDD-style `<behavior>` blocks), and 04-01 adds the legacy hash guard before any other change.

- [ ] `tests/unit/legacy-baselines.test.ts` (04-01, first task of the phase)
- [ ] `tests/unit/tailwind-v4-sources.test.ts` replaces `tailwind-content.test.ts`; `platform-versions.test.ts` and `vitality-removed.test.ts` updated (04-01)
- [ ] `tests/unit/tokens.test.ts`, `tokens-bridge.test.ts`, `tests/unit/support/tokens-css.ts` (04-02)
- [ ] `tests/unit/wav.test.ts`, `stft.test.ts`, `colormap.test.ts`, `levels.test.ts` (04-03)
- [ ] `tests/unit/status-palette.test.ts`, `token-contrast.test.ts`, `semantic-tokens.test.ts`, `status-mark.test.tsx`; `culori` installed (04-04)
- [ ] `@testing-library/user-event` installed; primitive unit tests per plan (04-05 to 04-21)
- [ ] `scripts/check-dev-fixtures-excluded.mjs` in the CI `web` job; `NEXT_PUBLIC_DEV_FIXTURES: '1'` in Playwright `webServer.env` (04-06)
- [ ] `tests/e2e/fixtures-route.spec.ts` (04-06, extended in 04-07), `fixtures-spectrogram.spec.ts` (04-13), `token-bridge.spec.ts` (04-20)
- [ ] `tests/e2e/fixtures-keyboard.spec.ts`, `fixtures-a11y.spec.ts`, `fixtures-targets.spec.ts`, `reduced-motion.spec.ts`, `legacy-isolation.spec.ts`, `fixtures-state-manifest.spec.ts` (04-22)
- [ ] `fixtures-shots` Playwright project, `tests/e2e/fixtures.spec.ts`, CI update step and `fixtures-snapshots` artifact (04-23); baselines and `fixtures-baselines.test.ts` (04-24)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Legacy screenshots unchanged after Tailwind 4 | DS-01 | Linux baselines only compare inside the CI Docker image | Orchestrator pushes 04-01 and confirms the CI `visual` job passes with no dispatch; rollback path in the 04-01 objective |
| Play, pause, step and A/B crossfade sound right | DS-05 | Web Audio output cannot be asserted headless | On a desktop and a tablet: live Transport (04-15) and CompareDeck (04-16) cells on `/dev/fixtures`; record in `docs/deploy/PHASE-4-VISUAL-REVIEW.md` |
| Token probe map looks right in each direction | DS-01 | WebGL canvas is excluded from screenshots | Open `/dev/fixtures/token-probe/` in atlas, nocturne and poster, and with `?tok=--dir-hab-healthy:%23B00020` |
| Canvas pixel contrast of spectrograms | DS-03 | axe cannot read canvas pixels | Review wells against the documented magma scale and fixed range in the Spectrogram scale section |
| Playhead frame pacing on real hardware | DS-06 | Only call overhead measured headless | Watch the live Transport and scroll mode on a tablet; note any jank |
| Owner review of Atlas, Nocturne and Poster and the darker palette | DS-01, DS-02, DS-08 | Design judgement | 04-24 Task 3 checkpoint on the review page |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (each created in its task)
- [x] No watch-mode flags
- [ ] Feedback latency < 30 s for unit-level tasks (confirm during execution)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
