---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-10-01T06:35:43.797Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | scripts/check_audio_real.py |  | Recalibrated spectral thresholds (AND-combined, 0.025/0.85) deviate from plan's literal OR-combined 0.1/0.5 spec to avoid false-flagging real fish-chorus tonality; calibrated against only this plan's 9-excerpt sample | open |  | 2026-10-01T06:35:43.797Z |  |

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
  }
]
````
