# Phase 1: Truth & Reproducibility — Discussion Log

**Date:** 2026-09-30 · **Mode:** `--auto` (recommended option auto-selected for every question; owner may override any item)

[--auto] Selected all gray areas: Source recovery, Real audio replacement, Model truth, Legacy-UI copy & visualization, Citations, Baselines & CI.

| Area | Question | Options considered | Selected |
|---|---|---|---|
| Source recovery | How to restore uncommitted gallery/samples code and drifted `/samples` Lambda? | (a) Pull deployed Lambda zips + reconstruct frontend from deployed bundle & callers; (b) rewrite from scratch; (c) wait for owner's local files | (a), prefer owner files if supplied |
| Source recovery | How to prevent future drift? | (a) Scripted deploy + drift-check script; (b) manual discipline | (a) |
| Real audio | Source of replacement clips? | (a) MARRS figshare excerpts for reference sites with documented manifest; (b) ReefSet clips; (c) keep current until Phase 7 | (a) |
| Real audio | Sample rate / normalization? | (a) Native 16 kHz, no normalization, gain recorded; (b) upsample to 32 kHz + peak normalize (current) | (a) |
| Real audio | Missing Location Compare files? | (a) Remove entries without real audio; (b) leave 404s | (a) |
| Model truth | If synthetic-trained class is deployed? | (a) Interim real-only retrain (possibly 3-class), disclosed; (b) mask class + renormalize at serve; (c) leave until Phase 12 | (a) — (b) would modify probabilities; (c) violates Core Value |
| Model truth | Region adjustment? | (a) Remove multipliers; report region separately with true training countries; (b) keep | (a) |
| Legacy copy | Embedding scatter? | (a) Remove now, honest projection later; (b) relabel | (a) |
| Legacy copy | Processing messages / analyze polling? | (a) Real `/status` stages; (b) keep scripted | (a) |
| Legacy copy | Disturbance-type labels (Bora-Bora), Irma, SanctSound? | (a) Status `unknown` + original label/definition/source shown; (b) keep "degraded"/"healthy" | (a) |
| Citations | Where citations live? | (a) One canonical file consumed by docs and UI; (b) fix in place | (a) |
| Baselines & CI | Test stack? | (a) Vitest + Playwright (Docker screenshots) + axe + pytest/moto, GitHub Actions; (b) Storybook-first | (a) |
| Baselines & CI | When to capture baselines? | (a) First, before any change; (b) after fixes | (a) |

## Claude's discretion
Clip choices within manifest rules, script language, test layout and fixture format.

## Deferred
Level matching (Phase 7), honest projection (Phases 2/9), timezone verification (Phase 8), grouped eval/full retrain (Phases 5/12), scheduled OIDC drift check.
