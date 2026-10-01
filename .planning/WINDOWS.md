---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-10-01T17:14:45.839Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | scripts/check_audio_real.py |  | Recalibrated spectral thresholds (AND-combined, 0.025/0.85) deviate from plan's literal OR-combined 0.1/0.5 spec to avoid false-flagging real fish-chorus tonality; calibrated against only this plan's 9-excerpt sample | open |  | 2026-10-01T06:35:43.797Z |  |
| 2 | 01 | unrun-verify | dashboard-next/tests/e2e/preview-truth-live.spec.ts |  | preview-truth-live.spec.ts not run against the protected Vercel preview (needs owner PW_VERCEL_BYPASS_SECRET); passed against a local production build and verified via vercel curl | open |  | 2026-10-01T17:14:45.839Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/check_audio_real.py",
    "line": null,
    "description": "Recalibrated spectral thresholds (AND-combined, 0.025/0.85) deviate from plan's literal OR-combined 0.1/0.5 spec to avoid false-flagging real fish-chorus tonality; calibrated against only this plan's 9-excerpt sample",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-01T06:35:43.797Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "dashboard-next/tests/e2e/preview-truth-live.spec.ts",
    "line": null,
    "description": "preview-truth-live.spec.ts not run against the protected Vercel preview (needs owner PW_VERCEL_BYPASS_SECRET); passed against a local production build and verified via vercel curl",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-01T17:14:45.839Z",
    "resolved_at": null
  }
]
````
